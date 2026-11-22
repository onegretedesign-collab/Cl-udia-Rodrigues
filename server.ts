import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createAdminAuthService } from './src/server/adminAuth.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function startServer(): Promise<void> {
  const app = express();
  const adminAuth = createAdminAuthService(process.env);

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '16kb' }));

  // Prevent caching of sensitive authentication status and tokens
  app.use('/api/admin/auth', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/admin/auth/status', (req, res) => {
    const status = adminAuth.getStatus(req.headers.authorization);
    res.status(200).json(status);
  });

  app.post('/api/admin/auth/setup', (req, res) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    const result = adminAuth.claimInitialCredentials(body.username, body.password);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json({
      token: result.token,
      username: result.username,
      expiresAt: result.expiresAt,
      source: result.source,
    });
  });

  app.post('/api/admin/auth/login', (req, res) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    const result = adminAuth.verifyLogin(body.username, body.password, clientKey);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json({
      token: result.token,
      username: result.username,
      expiresAt: result.expiresAt,
      source: result.source,
    });
  });

  app.post('/api/admin/auth/logout', (req, res) => {
    adminAuth.revokeSession(req.headers.authorization);
    res.status(200).json({ ok: true });
  });

  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
