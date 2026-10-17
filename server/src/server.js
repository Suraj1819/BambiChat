import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { setupSockets } from './sockets/index.js';
import { initStore } from './store/index.js';

const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: env.clientOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 15000,
});

setupSockets(io);
app.set('io', io);

async function main() {
  const storeInfo = await initStore();
  httpServer.listen(env.port, () => {
    console.log(`Bambi server on http://localhost:${env.port}`);
    console.log(`  store backend: ${storeInfo.backend}`);
    if (storeInfo.error) console.log(`  store warning: ${storeInfo.error}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
