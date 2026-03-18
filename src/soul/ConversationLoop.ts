/**
 * ConversationLoop — manages real-time multi-turn dialogues between souls.
 *
 * When two or more souls meet/socialize, this module runs a rapid back-and-forth
 * conversation loop. Each turn fires an LLM call, broadcasts a SPEECH_BUBBLE event
 * via WebSocket, and stores the full conversation in the DB when done.
 *
 * Conversations are NOT tick-gated — they run on ~5-8s cadence per message,
 * producing a realistic real-time chat experience for the frontend.
 */

import { randomUUID } from 'crypto';
import { getPool } from '../db/pgClient';
import { ollama } from '../llm/OllamaClient';
import { buildConversationTurnPrompt } from '../llm/prompts';
import { worldEvents } from '../world/WorldState';
import { embedText } from '../db/embed';
import { Significance } from '../types';
import type { SoulIdentity, QuirkRecord, ConversationMessage, SpeechBubbleEvent } from '../types';

const log = (tag: string, msg: string) =>
  process.stdout.write(`[${new Date().toISOString()}] [conv:${tag}] ${msg}\n`);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Active conversation tracking ────────────────────────────────────────────

const activeConversations = new Set<string>();

/** Check if a soul is currently in a conversation */
export function isInConversation(soulId: string): boolean {
  return activeConversations.has(soulId);
}

// ─── Participant info needed for prompt building ─────────────────────────────

export interface ConversationParticipant {
  id: string;
  name: string;
  identity: SoulIdentity;
  quirks: QuirkRecord[];
}

// ─── Main conversation runner ────────────────────────────────────────────────

/**
 * Run a real-time conversation between participants.
 * Each participant takes turns speaking. Messages are broadcast immediately
 * via WebSocket SPEECH_BUBBLE events.
 *
 * @param participants - souls involved (2+)
 * @param context - why they're talking (e.g. "casual meetup in the lobby")
 * @param maxTurns - max exchanges before conversation ends naturally (3-8)
 */
export async function runConversation(
  participants: ConversationParticipant[],
  context: string,
  maxTurns: number = 6,
): Promise<void> {
  if (participants.length < 2) return;

  const conversationId = randomUUID();
  const participantIds = participants.map(p => p.id);
  const participantNames = participants.map(p => p.name.split(' ')[0] ?? p.name);

  // Mark all participants as in-conversation
  for (const p of participants) activeConversations.add(p.id);

  log(participantNames.join('+'), `Starting conversation: "${context}" (max ${maxTurns} turns)`);

  const messages: ConversationMessage[] = [];
  const pool = getPool();

  // Store conversation start in DB
  await pool.query(
    `INSERT INTO conversations (id, participant_ids, context, messages, status, started_at)
     VALUES ($1, $2, $3, '[]', 'active', $4)`,
    [conversationId, participantIds, context, Date.now()],
  );

  // Log conversation start to world log
  await pool.query(
    `INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      participants[0]!.id,
      Significance.NOTABLE,
      'conversation_start',
      `${participantNames.join(' and ')} started talking: ${context.substring(0, 80)}`,
      { conversation_id: conversationId, participants: participantNames },
      Date.now(),
    ],
  );

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      // Pick whose turn it is (round-robin)
      const speakerIdx = turn % participants.length;
      const speaker = participants[speakerIdx]!;
      const speakerFirstName = participantNames[speakerIdx]!;
      const otherNames = participantNames.filter((_, i) => i !== speakerIdx);

      const prompt = buildConversationTurnPrompt({
        identity: speaker.identity,
        quirks: speaker.quirks,
        otherNames,
        context,
        history: messages,
        turnNumber: turn,
        maxTurns,
      });

      const raw = await ollama.chat(
        [{ role: 'user', content: prompt }],
        { json: true, temperature: 0.85, model: speaker.identity.llm_model },
      );

      let text = '';
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { message?: string; done?: boolean };
          text = parsed.message ?? '';

          // If the LLM says the conversation is naturally done, end early
          if (parsed.done === true && turn >= 2) {
            if (text) {
              const msg: ConversationMessage = {
                soul_id: speaker.id,
                soul_name: speakerFirstName,
                text,
                ts: Date.now(),
              };
              messages.push(msg);
              emitSpeechBubble(speaker.id, speakerFirstName, text, conversationId);
              log(speakerFirstName, `[${turn + 1}/${maxTurns}] "${text.substring(0, 80)}"`);
            }
            log(participantNames.join('+'), 'Conversation ended naturally');
            break;
          }
        } catch {
          // If JSON parse fails, try to use raw text
          text = raw.replace(/^[^"]*"/, '').replace(/"[^"]*$/, '').trim();
        }
      }

      if (!text) {
        // Fallback: generic acknowledgement
        text = turn === 0
          ? `Hey ${otherNames.join(' and ')}, good to see you.`
          : 'Yeah, I hear you.';
      }

      const msg: ConversationMessage = {
        soul_id: speaker.id,
        soul_name: speakerFirstName,
        text,
        ts: Date.now(),
      };
      messages.push(msg);

      // Broadcast immediately via WebSocket
      emitSpeechBubble(speaker.id, speakerFirstName, text, conversationId);
      log(speakerFirstName, `[${turn + 1}/${maxTurns}] "${text.substring(0, 80)}"`);

      // Pause between turns for realistic pacing (3-6 seconds)
      const pauseMs = 3000 + Math.random() * 3000;
      await sleep(pauseMs);
    }
  } catch (err) {
    log(participantNames.join('+'), `Conversation error: ${String(err)}`);
  } finally {
    // Mark conversation ended in DB
    await pool.query(
      `UPDATE conversations SET messages = $1, status = 'ended', ended_at = $2 WHERE id = $3`,
      [JSON.stringify(messages), Date.now(), conversationId],
    );

    // Log conversation end to world log
    const snippet = messages.length > 0
      ? messages[messages.length - 1]!.text.substring(0, 60)
      : '';
    await pool.query(
      `INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        participants[0]!.id,
        Significance.ROUTINE,
        'conversation_end',
        `${participantNames.join(' and ')} finished talking (${messages.length} messages)${snippet ? `: "…${snippet}"` : ''}`,
        { conversation_id: conversationId, message_count: messages.length },
        Date.now(),
      ],
    ).catch(() => {});

    // Store conversation as memory for each participant
    const summaryText = messages.map(m => `${m.soul_name}: ${m.text}`).join('\n');
    for (const p of participants) {
      void saveConversationMemory(p.id, summaryText, {
        conversation_id: conversationId,
        participants: participantNames,
        context,
      }).catch(() => {});
    }

    // Release participants
    for (const p of participants) activeConversations.delete(p.id);
    log(participantNames.join('+'), `Conversation ended (${messages.length} messages)`);
  }
}

// ─── WebSocket emission ──────────────────────────────────────────────────────

function emitSpeechBubble(
  soulId: string,
  soulName: string,
  text: string,
  conversationId: string | null,
): void {
  const event: SpeechBubbleEvent = {
    type: 'SPEECH_BUBBLE',
    soul_id: soulId,
    soul_name: soulName,
    text,
    conversation_id: conversationId,
    ts: Date.now(),
  };
  worldEvents.emit('speech_bubble', event);
}

/**
 * Emit a one-off speech bubble for non-conversation actions
 * (e.g., soul mumbling while working, narrating what they're doing).
 */
export function emitNarrationBubble(
  soulId: string,
  soulName: string,
  text: string,
): void {
  emitSpeechBubble(soulId, soulName, text, null);
}

// ─── Memory storage ──────────────────────────────────────────────────────────

async function saveConversationMemory(
  soulId: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const embedding = await embedText(content);
  const vec = embedding ? '[' + embedding.join(',') + ']' : null;
  await getPool().query(
    `INSERT INTO soul_memory (soul_id, type, content, metadata, ts, embedding)
     VALUES ($1, 'conversation', $2, $3, $4, $5::vector)`,
    [soulId, content.substring(0, 2000), metadata, Date.now(), vec],
  );
}
