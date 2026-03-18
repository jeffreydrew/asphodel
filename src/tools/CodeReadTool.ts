import { readFile } from 'fs/promises';
import { resolve, relative, extname } from 'path';
import type { CodeReadResult } from '../types';

const ALLOWED_EXTENSIONS = new Set(['.ts', '.js', '.json', '.md', '.txt', '.sh', '.sql']);
const BLACKLIST_PATTERNS = [
  /\.env/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /node_modules/,
  /\.git\//,
  /dist\//,
];
const MAX_FILE_SIZE = 50_000; // 50 KB

function getCodebasePath(): string {
  return process.env['TOWER_CODEBASE_PATH'] ?? process.cwd();
}

function isSafe(filePath: string): boolean {
  if (BLACKLIST_PATTERNS.some(re => re.test(filePath))) return false;
  const ext = extname(filePath);
  return ALLOWED_EXTENSIONS.has(ext);
}

export async function readCodebaseFile(relPath: string): Promise<CodeReadResult | null> {
  const base     = getCodebasePath();
  const abs      = resolve(base, relPath);
  const rel      = relative(base, abs);

  // path traversal guard
  if (rel.startsWith('..') || !abs.startsWith(base)) {
    process.stderr.write(`[CodeReadTool] Path traversal rejected: ${relPath}\n`);
    return null;
  }

  if (!isSafe(abs)) {
    process.stderr.write(`[CodeReadTool] Blacklisted path rejected: ${abs}\n`);
    return null;
  }

  try {
    const buf = await readFile(abs);
    if (buf.length > MAX_FILE_SIZE) {
      return { filePath: rel, content: buf.toString('utf8', 0, MAX_FILE_SIZE) + '\n[truncated]', truncated: true };
    }
    return { filePath: rel, content: buf.toString('utf8'), truncated: false };
  } catch (err) {
    process.stderr.write(`[CodeReadTool] Cannot read ${rel}: ${String(err)}\n`);
    return null;
  }
}

export async function readMultipleFiles(relPaths: string[]): Promise<CodeReadResult[]> {
  const results: CodeReadResult[] = [];
  for (const p of relPaths.slice(0, 5)) { // cap at 5
    const r = await readCodebaseFile(p);
    if (r) results.push(r);
  }
  return results;
}
