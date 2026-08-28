import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.js';
import syncRoutes from './routes/sync.js';
import { PORT } from './lib/config.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/auth', authLimiter, authRoutes);
app.use('/sync', syncRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 404 for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler: zod validation errors and unknown errors
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Note server listening on http://localhost:${PORT}`);
});
