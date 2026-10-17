import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import friendsRouter from './routes/friends.js';
import discoveryRouter from './routes/discovery.js';
import blocksRouter from './routes/blocks.js';
import conversationsRouter from './routes/conversations.js';
import keysRouter from './routes/keys.js';
import attachmentsRouter from './routes/attachments.js';
import groupsRouter from './routes/groups.js';
import reactionsRouter from './routes/reactions.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (env.isDev) {
  app.use(morgan('dev'));
}

app.get('/health', async (_req, res) => {
  let database = 'memory';
  try {
    const { env } = await import('./config/env.js');
    if (env.usePostgres) {
      const { testConnection } = await import('./db/pool.js');
      const probe = await testConnection();
      database = probe.ok ? 'postgres' : `postgres-error: ${probe.reason}`;
    }
  } catch (e) {
    database = `error: ${e.message}`;
  }
  res.json({
    status: 'ok',
    service: 'bambi-server',
    stage: 8,
    encryption: 'bambi-e2ee-v1',
    realtime: 'socket.io',
    database,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'Bambi API',
    version: '1.0.0',
    stage: 'release',
    protocol: 'bambi-e2ee-v1',
  });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/me', meRouter);
app.use('/api/v1/friends', friendsRouter);
app.use('/api/v1/search', discoveryRouter);
app.use('/api/v1/blocks', blocksRouter);
app.use('/api/v1/conversations', conversationsRouter);
app.use('/api/v1/keys', keysRouter);
app.use('/api/v1/attachments', attachmentsRouter);
app.use('/api/v1/groups', groupsRouter);
app.use('/api/v1/conversations', reactionsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
