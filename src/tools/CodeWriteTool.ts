import { readFile, writeFile } from 'fs/promises';
import { resolve, relative, extname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pgClient';
import type { CodeWriteResult } from '../types';

const execFileAsync  = promisify(execFile);
const ALLOWED_EXTS   = new Set(['.ts', '.js', '.json', '.md', '.sh']);
const TYPECHECK_TIMEOUT = 30_000;

function getCodebasePath(): string {
  return process.env['TOWER_CODEBASE_PATH'] ?? process.cwd();
}

function computeDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const lines: string[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === undefined) {
      lines.push(`+ ${n}`);
    } else if (n === undefined) {
      lines.push(`- ${o}`);
    } else if (o !== n) {
      lines.push(`- ${o}`);
      lines.push(`+ ${n}`);
    }
  }

  return lines.slice(0, 100).join('\n'); // cap diff at 100 lines
}

export async function writeCodebaseFile(
  relPath: string,
  code: string,
  description: string,
  soulId: string,
): Promise<CodeWriteResult | null> {
  if (process.env['ENABLE_CODE_WRITE'] !== 'true') return null;

  const base = getCodebasePath();
  const abs  = resolve(base, relPath);
  const rel  = relative(base, abs);

  if (rel.startsWith('..') || !abs.startsWith(base)) {
    return { filePath: rel, description, success: false, error: 'Path traversal rejected' };
  }

  if (!ALLOWED_EXTS.has(extname(abs))) {
    return { filePath: rel, description, success: false, error: 'Extension not allowed' };
  }

  // Read existing (for diff + revert)
  let original = '';
  try {
    original = (await readFile(abs)).toString('utf8');
  } catch { /* new file */ }

  // Write new content
  await writeFile(abs, code, 'utf8');

  // Run typecheck
  try {
    await execFileAsync('npm', ['run', 'typecheck'], { cwd: base, timeout: TYPECHECK_TIMEOUT });
  } catch {
    // Revert
    await writeFile(abs, original, 'utf8');
    const result: CodeWriteResult = { filePath: rel, description, success: false, error: 'Typecheck failed — reverted' };
    await recordChange(soulId, rel, description, computeDiff(original, code), 'reverted');
    return result;
  }

  const diff = computeDiff(original, code);
  await recordChange(soulId, rel, description, diff, 'applied');

  return { filePath: rel, description, success: true };
}

async function recordChange(
  soulId: string,
  filePath: string,
  description: string,
  diff: string,
  status: string,
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO codebase_changes (id, soul_id, file_path, description, diff, status, ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), soulId, filePath, description, diff, status, Date.now()],
    );
  } catch { /* never throw */ }
}
