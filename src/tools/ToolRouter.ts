import { randomUUID } from 'crypto';
import { getPool } from '../db/pgClient';
import { embedText } from '../db/embed';
import { webSearch } from './WebSearchTool';
import { readMultipleFiles } from './CodeReadTool';
import { writeCodebaseFile } from './CodeWriteTool';
import { consultClaude } from './AnthropicClient';
import { shellExec } from './ShellExecTool';
import type { Action, ActionResult, SoulVitals, SoulIdentity } from '../types';
import { ActionType } from '../types';

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function baseVitals(vitals: SoulVitals, energyDelta: number, happinessDelta: number): SoulVitals {
  return {
    ...vitals,
    energy:    clamp(vitals.energy    + energyDelta),
    happiness: clamp(vitals.happiness + happinessDelta),
  };
}

function result(
  action: string,
  vitals_after: SoulVitals,
  description: string,
  overrides: Partial<ActionResult> = {},
): ActionResult {
  return {
    action,
    success:           true,
    description,
    profit_delta:      0,
    social_delta:      0,
    health_delta:      0,
    penalty:           0,
    tos_violation:     false,
    deceptive_content: false,
    metadata:          {},
    ...overrides,
    vitals_after,
  };
}

export class ToolRouter {
  async run(
    action: Action,
    vitals: SoulVitals,
    identity: SoulIdentity,
    soulId: string,
  ): Promise<ActionResult | null> {
    const type = action.type as string;

    switch (type) {
      case ActionType.SEARCH_WEB:    return this.handleSearchWeb(action, vitals, soulId);
      case ActionType.READ_CODEBASE: return this.handleReadCodebase(action, vitals, soulId);
      case ActionType.WRITE_CODE:    return this.handleWriteCode(action, vitals, identity, soulId);
      case ActionType.CONSULT_AI:    return this.handleConsultAI(action, vitals, soulId);
      case ActionType.RUN_COMMAND:   return this.handleRunCommand(action, vitals, soulId);
      default: return null;
    }
  }

  private async handleSearchWeb(action: Action, vitals: SoulVitals, soulId: string): Promise<ActionResult> {
    const query = String(action.payload['searchQuery'] ?? action.payload['query'] ?? '');
    const vitals_after = baseVitals(vitals, -4, +5);

    if (!query) {
      return result(action.type, vitals_after, 'Searched the web (no query specified)');
    }

    const findings = await webSearch(query);

    let description: string;
    if (findings && findings.results.length > 0) {
      const snippets = findings.results
        .map(r => `• ${r.title}: ${r.snippet.substring(0, 100)}`)
        .join('\n');
      description = `Searched "${query}" via ${findings.source}:\n${snippets}`;

      await this.saveKnowledge(soulId, query, description, findings.source, {
        intendedUse: action.payload['intendedUse'],
        resultCount: findings.results.length,
      });
      await this.saveSoulMemory(soulId, 'tool_result', description, { action: action.type, query });
    } else {
      description = `Searched the web for "${query}" but found no results`;
    }

    return result(action.type, vitals_after, description, {
      profit_delta: 3,
      metadata: { query, source: findings?.source ?? 'none', result_count: findings?.results.length ?? 0 },
    });
  }

  private async handleReadCodebase(action: Action, vitals: SoulVitals, soulId: string): Promise<ActionResult> {
    const rawPaths = action.payload['filePaths'];
    const filePaths: string[] = Array.isArray(rawPaths)
      ? rawPaths.map(String)
      : [String(action.payload['filePath'] ?? 'src/types/index.ts')];

    const vitals_after = baseVitals(vitals, -6, +4);
    const reads = await readMultipleFiles(filePaths);

    let description: string;
    if (reads.length > 0) {
      const summary = reads.map(r => `• ${r.filePath} (${r.content.length} chars${r.truncated ? ', truncated' : ''})`).join('\n');
      description = `Read codebase files:\n${summary}`;

      const fullContent = reads.map(r => `=== ${r.filePath} ===\n${r.content}`).join('\n\n');
      await this.saveKnowledge(soulId, filePaths.join(', '), fullContent.substring(0, 2000), 'codebase', {
        reason: action.payload['reason'],
        files: reads.map(r => r.filePath),
      });
      await this.saveSoulMemory(soulId, 'tool_result', description, { action: action.type, files: filePaths });
    } else {
      description = `Attempted to read codebase files but none were accessible: ${filePaths.join(', ')}`;
    }

    return result(action.type, vitals_after, description, {
      profit_delta: 2,
      metadata: { files: reads.map(r => r.filePath) },
    });
  }

  private async handleWriteCode(
    action: Action,
    vitals: SoulVitals,
    _identity: SoulIdentity,
    soulId: string,
  ): Promise<ActionResult> {
    const filePath    = String(action.payload['filePath']    ?? '');
    const code        = String(action.payload['code']        ?? '');
    const description = String(action.payload['description'] ?? '');

    const vitals_after = baseVitals(vitals, -15, +10);

    if (!filePath || !code) {
      return result(action.type, vitals_after, 'Wanted to write code but missing file path or content', { success: false });
    }

    const writeResult = await writeCodebaseFile(filePath, code, description, soulId);

    if (!writeResult) {
      return result(action.type, vitals_after, 'Code writing is disabled (ENABLE_CODE_WRITE not set)', { success: false });
    }

    const desc = writeResult.success
      ? `Wrote code to ${filePath}: ${description}`
      : `Failed to write code to ${filePath}: ${writeResult.error ?? 'unknown error'}`;

    await this.saveSoulMemory(soulId, 'tool_result', desc, { action: action.type, filePath, success: writeResult.success });

    return result(action.type, vitals_after, desc, {
      success:      writeResult.success,
      profit_delta: writeResult.success ? 8 : 0,
      metadata:     { filePath, success: writeResult.success, error: writeResult.error },
    });
  }

  private async handleConsultAI(action: Action, vitals: SoulVitals, soulId: string): Promise<ActionResult> {
    const question = String(action.payload['question'] ?? '');
    const vitals_after = baseVitals(vitals, -5, +6);

    if (!question) {
      return result(action.type, vitals_after, 'Consulted AI (no question formulated)');
    }

    const consultResult = await consultClaude(question);

    let description: string;
    if (consultResult) {
      description = `Asked Claude: "${question.substring(0, 80)}…"\nAnswer: ${consultResult.answer.substring(0, 200)}`;
      await this.saveKnowledge(soulId, question, consultResult.answer, 'claude', {
        model:        consultResult.model,
        input_tokens: consultResult.input_tokens,
      });
      await this.saveSoulMemory(soulId, 'tool_result', description, { action: action.type, question });
    } else {
      description = 'Tried to consult Claude AI but it was unavailable';
    }

    return result(action.type, vitals_after, description, {
      profit_delta: 4,
      metadata: { question, answered: !!consultResult },
    });
  }

  private async handleRunCommand(action: Action, vitals: SoulVitals, soulId: string): Promise<ActionResult> {
    const command = String(action.payload['command'] ?? '');
    const vitals_after = baseVitals(vitals, -3, +3);

    if (!command) {
      return result(action.type, vitals_after, 'Ran a shell command (none specified)');
    }

    const execResult = await shellExec(command);

    let description: string;
    if (!execResult) {
      description = 'Shell execution is disabled (ENABLE_SHELL_EXEC not set)';
    } else if (execResult.exitCode === 0) {
      description = `Ran: ${command}\n${execResult.stdout.substring(0, 200)}`;
      await this.saveKnowledge(soulId, command, execResult.stdout.substring(0, 1000), 'shell', {
        reasoning: action.payload['reasoning'],
        exitCode: 0,
      });
      await this.saveSoulMemory(soulId, 'tool_result', description, { action: action.type, command });
    } else {
      description = `Ran: ${command} — exit ${execResult.exitCode}: ${execResult.stderr.substring(0, 100)}`;
    }

    return result(action.type, vitals_after, description, {
      profit_delta: 1,
      metadata: { command, exitCode: execResult?.exitCode, timedOut: execResult?.timedOut },
    });
  }

  private async saveKnowledge(
    soulId: string,
    query: string,
    findings: string,
    source: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await getPool().query(
        `INSERT INTO soul_knowledge (id, soul_id, query, findings, source, metadata, ts)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), soulId, query, findings.substring(0, 4000), source, metadata, Date.now()],
      );
    } catch { /* never throw */ }
  }

  private async saveSoulMemory(
    soulId: string,
    type: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      const embedding = await embedText(content);
      const vec = embedding ? '[' + embedding.join(',') + ']' : null;
      await getPool().query(
        `INSERT INTO soul_memory (soul_id, type, content, metadata, ts, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [soulId, type, content, metadata, Date.now(), vec],
      );
    } catch { /* never throw */ }
  }
}

export const toolRouter = new ToolRouter();
