import { WebSocketServer, WebSocket } from 'ws';
import { worldEvents, buildWorldUpdate } from '../world/WorldState';
import { WorldLog } from '../world/WorldLog';
import type { SpeechBubbleEvent } from '../types';

const worldLog = new WorldLog();

export function createWsServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    process.stdout.write(`[WS] WebSocket server listening on port ${port}\n`);
  });

  wss.on('connection', (ws) => {
    process.stdout.write('[WS] Client connected.\n');

    sendUpdate(ws).catch(err =>
      process.stderr.write(`[WS] sendUpdate error: ${String(err)}\n`),
    );

    ws.on('close', () => {
      process.stdout.write('[WS] Client disconnected.\n');
    });

    ws.on('error', (err) => {
      process.stdout.write(`[WS] Client error: ${String(err)}\n`);
    });
  });

  worldEvents.on('update', () => {
    broadcast(wss).catch(err =>
      process.stderr.write(`[WS] broadcast error: ${String(err)}\n`),
    );
  });

  // Real-time speech bubble events — sent immediately, not batched
  worldEvents.on('speech_bubble', (event: SpeechBubbleEvent) => {
    broadcastSpeechBubble(wss, event);
  });

  return wss;
}

function broadcastSpeechBubble(wss: WebSocketServer, event: SpeechBubbleEvent): void {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

async function broadcast(wss: WebSocketServer): Promise<void> {
  if (wss.clients.size === 0) return;
  const recent_log = await worldLog.getRecent(20);
  const update     = await buildWorldUpdate(recent_log);
  const payload    = JSON.stringify(update);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

async function sendUpdate(ws: WebSocket): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return;
  const recent_log = await worldLog.getRecent(20);
  const update     = await buildWorldUpdate(recent_log);
  ws.send(JSON.stringify(update));
}
