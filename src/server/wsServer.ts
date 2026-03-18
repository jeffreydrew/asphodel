import { WebSocketServer, WebSocket } from 'ws';
import { worldEvents, buildWorldUpdate } from '../world/WorldState';
import { WorldLog } from '../world/WorldLog';

const worldLog = new WorldLog();

export function createWsServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    process.stdout.write(`[WS] WebSocket server listening on port ${port}\n`);
  });

  wss.on('connection', (ws) => {
    process.stdout.write('[WS] Client connected.\n');

    // Send current world state immediately on connect
    sendUpdate(ws);

    ws.on('close', () => {
      process.stdout.write('[WS] Client disconnected.\n');
    });

    ws.on('error', (err) => {
      process.stdout.write(`[WS] Client error: ${String(err)}\n`);
    });
  });

  // Broadcast on every agent tick
  worldEvents.on('update', () => {
    broadcast(wss);
  });

  return wss;
}

function broadcast(wss: WebSocketServer): void {
  if (wss.clients.size === 0) return;
  const recent_log = worldLog.getRecent(20);
  const update     = buildWorldUpdate(recent_log);
  const payload    = JSON.stringify(update);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function sendUpdate(ws: WebSocket): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const recent_log = worldLog.getRecent(20);
  const update     = buildWorldUpdate(recent_log);
  ws.send(JSON.stringify(update));
}
