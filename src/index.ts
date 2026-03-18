import 'dotenv/config';
import { getDb } from './db/client';
import { seedSouls } from './db/seed';
import { Soul } from './soul/Soul';
import { runAgentLoop } from './soul/AgentLoop';
import { createWsServer } from './server/wsServer';
import { createHttpServer } from './server/httpServer';

const HTTP_PORT = Number(process.env['PORT']    ?? 3000);
const WS_PORT   = Number(process.env['WS_PORT'] ?? 3001);

async function main(): Promise<void> {
  // Boot DB + schema
  getDb();
  process.stdout.write('[boot] Database ready.\n');

  // Seed souls if none exist
  const soulCount = (getDb().prepare('SELECT COUNT(*) as count FROM souls').get() as { count: number }).count;
  if (soulCount === 0) {
    seedSouls();
    process.stdout.write('[boot] Seeded 5 souls.\n');
  } else {
    process.stdout.write(`[boot] Found ${soulCount} existing souls.\n`);
  }

  // Start servers
  createHttpServer(HTTP_PORT);
  createWsServer(WS_PORT);

  // Load and run all active souls in parallel
  const souls = Soul.loadAll();
  process.stdout.write(`[boot] Starting ${souls.length} agent loop(s)...\n`);

  // Each soul knows who its neighbours are (everyone else by first name)
  const allNames = souls.map(s => s.name.split(' ')[0]);
  await Promise.all(souls.map((soul, i) => {
    const neighbours = allNames.filter((_, j) => j !== i);
    return runAgentLoop(soul, i, neighbours);
  }));
}

// Handle graceful shutdown
process.on('SIGINT',  () => { process.stdout.write('\n[shutdown] Received SIGINT. Exiting.\n'); process.exit(0); });
process.on('SIGTERM', () => { process.stdout.write('[shutdown] Received SIGTERM. Exiting.\n'); process.exit(0); });

main().catch(err => {
  process.stderr.write(`[fatal] ${String(err)}\n`);
  process.exit(1);
});
