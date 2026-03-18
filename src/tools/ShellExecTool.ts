import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ShellExecResult } from '../types';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS    = 10_000;

// Whitelist: binary → allowed args prefix patterns
const WHITELIST: Record<string, RegExp[]> = {
  ls:    [/.*/],
  cat:   [/.*/],
  pwd:   [/.*/],
  echo:  [/.*/],
  date:  [/.*/],
  df:    [/.*/],
  free:  [/.*/],
  uptime:[/.*/],
  ps:    [/.*/],
  git:   [/^(log|status|diff|branch)(\s|$)/],
  npm:   [/^run typecheck$/],
};

function parseCommand(command: string): { bin: string; args: string[] } | null {
  const parts = command.trim().split(/\s+/);
  const bin   = parts[0] ?? '';
  const args  = parts.slice(1);
  return { bin, args };
}

function isWhitelisted(bin: string, args: string[]): boolean {
  const patterns = WHITELIST[bin];
  if (!patterns) return false;

  const argStr = args.join(' ');
  return patterns.some(re => re.test(argStr));
}

export async function shellExec(command: string): Promise<ShellExecResult | null> {
  if (process.env['ENABLE_SHELL_EXEC'] !== 'true') return null;

  const parsed = parseCommand(command);
  if (!parsed) return null;

  const { bin, args } = parsed;

  if (!isWhitelisted(bin, args)) {
    process.stderr.write(`[ShellExecTool] Command not whitelisted: ${command}\n`);
    return {
      command,
      stdout: '',
      stderr: `Command not in whitelist: ${bin}`,
      exitCode: 1,
      timedOut: false,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: TIMEOUT_MS });
    return { command, stdout, stderr, exitCode: 0, timedOut: false };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean; code?: number };
    return {
      command,
      stdout:   e.stdout  ?? '',
      stderr:   e.stderr  ?? String(err),
      exitCode: e.code    ?? 1,
      timedOut: e.killed  ?? false,
    };
  }
}
