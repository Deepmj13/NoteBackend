import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.js';
import syncRoutes from './routes/sync.js';
import { CORS_ORIGINS, PORT } from './lib/config.js';

const app = express();

// Trust Render's proxy so express-rate-limit sees the real client IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin:
      CORS_ORIGINS === '*'
        ? true
        : (origin, cb) => {
            // Allow requests with no Origin header (native apps, curl, tests).
            if (!origin || CORS_ORIGINS.includes(origin)) cb(null, true);
            else cb(null, false);
          },
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/auth', authLimiter, authRoutes);
app.use('/sync', syncLimiter, syncRoutes);

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
