import Anthropic from '@anthropic-ai/sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import type { AnthropicContentBlock } from './AnthropicClient';

const execFileAsync = promisify(execFile);

const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] ?? '';
const ANTHROPIC_MODEL   = process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001';
const MAX_STEPS_DEFAULT = 10;

// ── Tool definitions (plain objects — beta tools aren't in stable TS types) ───

const COMPUTER_TOOL = {
  type:              'computer_20250124',
  name:              'computer',
  display_width_px:  1280,
  display_height_px: 800,
};

const BASH_TOOL = {
  type: 'bash_20250124',
  name: 'bash',
};

const TEXT_EDITOR_TOOL = {
  type: 'text_editor_20250728',
  name: 'str_replace_editor',
};

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeBash(command: string): Promise<string> {
  const WHITELIST = [
    'ls', 'cat', 'pwd', 'echo', 'date', 'df', 'free', 'uptime',
    'ps', 'git log', 'git status', 'git diff', 'git branch',
    'npm run typecheck', 'which', 'whoami', 'uname',
  ];
  const allowed = WHITELIST.some(w => command.trim().startsWith(w));
  if (!allowed) return `[blocked] command not in whitelist: ${command.substring(0, 60)}`;

  try {
    const parts = command.split(/\s+/);
    const [cmd, ...args] = parts;
    const { stdout, stderr } = await execFileAsync(cmd!, args, { timeout: 10_000 });
    return (stdout + stderr).trim().substring(0, 2000);
  } catch (err) {
    return `[error] ${String(err).substring(0, 200)}`;
  }
}

function executeTextEditor(input: Record<string, unknown>): string {
  const cmd       = input['command'] as string | undefined;
  const path      = input['path'] as string | undefined;
  const oldStr    = input['old_str'] as string | undefined;
  const newStr    = input['new_str'] as string | undefined;
  const viewRange = input['view_range'] as [number, number] | undefined;

  if (!path) return '[error] path required';

  if (cmd === 'view') {
    try {
      const content = fs.readFileSync(path, 'utf8');
      if (viewRange) {
        const lines = content.split('\n');
        return lines.slice(viewRange[0] - 1, viewRange[1]).join('\n').substring(0, 2000);
      }
      return content.substring(0, 2000);
    } catch (err) {
      return `[error] ${String(err)}`;
    }
  }

  if (cmd === 'str_replace' && oldStr !== undefined && newStr !== undefined) {
    if (process.env['ENABLE_CODE_WRITE'] !== 'true') {
      return '[blocked] ENABLE_CODE_WRITE not set';
    }
    try {
      const content = fs.readFileSync(path, 'utf8');
      if (!content.includes(oldStr)) return '[error] old_str not found in file';
      fs.writeFileSync(path, content.replace(oldStr, newStr), 'utf8');
      return `[ok] replaced in ${path}`;
    } catch (err) {
      return `[error] ${String(err)}`;
    }
  }

  if (cmd === 'create' && newStr !== undefined) {
    if (process.env['ENABLE_CODE_WRITE'] !== 'true') {
      return '[blocked] ENABLE_CODE_WRITE not set';
    }
    try {
      fs.writeFileSync(path, newStr, 'utf8');
      return `[ok] created ${path}`;
    } catch (err) {
      return `[error] ${String(err)}`;
    }
  }

  return `[error] unknown text_editor command: ${cmd ?? '(none)'}`;
}

// ── Main agentic loop ─────────────────────────────────────────────────────────

export async function runComputerTask(params: {
  task: string;
  systemBlocks?: AnthropicContentBlock[];
  maxSteps?: number;
  soulName?: string;
}): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const { task, systemBlocks = [], maxSteps = MAX_STEPS_DEFAULT, soulName = 'soul' } = params;
  const sdk = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Messages array typed as unknown[] so we can push mixed beta message shapes
  const messages: unknown[] = [
    { role: 'user', content: task },
  ];

  const tools = [BASH_TOOL, TEXT_EDITOR_TOOL];
  if (process.env['ENABLE_BROWSER'] === 'true') {
    tools.unshift(COMPUTER_TOOL);
  }

  process.stdout.write(`[ComputerUseAgent] [${soulName}] starting: "${task.substring(0, 80)}"\n`);

  for (let step = 0; step < maxSteps; step++) {
    try {
      const requestBody: Record<string, unknown> = {
        model:      ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages,
        tools,
        betas:      ['computer-use-2025-01-24'],
      };
      if (systemBlocks.length > 0) requestBody['system'] = systemBlocks;

      // Use beta messages endpoint via SDK internals — cast through unknown
      const response = await (sdk.beta.messages.create as unknown as (p: Record<string, unknown>) => Promise<unknown>)(requestBody);
      const resp = response as {
        stop_reason?: string;
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      };

      process.stdout.write(`[ComputerUseAgent] [${soulName}] step=${step + 1} stop=${resp.stop_reason ?? '?'}\n`);

      // Collect tool_use blocks and final text
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let finalText: string | null = null;

      for (const block of resp.content) {
        if (block.type === 'text') {
          finalText = block.text ?? null;
        } else if (block.type === 'tool_use' && block.id && block.name) {
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input ?? {} });
        }
      }

      // Done — no more tool calls
      if (resp.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        return finalText;
      }

      // Add assistant turn to history
      messages.push({ role: 'assistant', content: resp.content });

      // Execute each tool and collect results
      const toolResults: unknown[] = [];
      for (const toolBlock of toolUseBlocks) {
        let result = '';

        if (toolBlock.name === 'bash') {
          result = await executeBash((toolBlock.input['command'] as string) ?? '');
        } else if (toolBlock.name === 'str_replace_editor') {
          result = executeTextEditor(toolBlock.input);
        } else if (toolBlock.name === 'computer') {
          result = '[computer] screenshot not available in server environment';
        } else {
          result = `[error] unknown tool: ${toolBlock.name}`;
        }

        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolBlock.id,
          content:     result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    } catch (err) {
      process.stderr.write(`[ComputerUseAgent] [${soulName}] error at step ${step + 1}: ${String(err)}\n`);
      return null;
    }
  }

  process.stderr.write(`[ComputerUseAgent] [${soulName}] reached maxSteps (${maxSteps})\n`);
  return null;
}
