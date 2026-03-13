import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import cookieParser from 'cookie-parser';
import { initSchema } from './db/schema';
import { authMiddleware, loginHandler, logoutHandler, checkAuthHandler } from './middleware/auth';
import db from './db/database';

import usersRouter from './routes/users';
import clientsRouter from './routes/clients';
import enquiriesRouter from './routes/enquiries';
import assessmentsRouter from './routes/assessments';
import certificatesRouter from './routes/certificates';
import inventoryRouter from './routes/inventory';
import sitePlansRouter from './routes/site-plans';
import reportsRouter from './routes/reports';
import evidenceRouter from './routes/evidence';
import auditLogRouter from './routes/audit-log';
import storageAreasRouter from './routes/storage-areas';
import trainingRouter from './routes/training';
import handlerAssessmentsRouter from './routes/handler-assessments';

const app = express();
const PORT = Number(process.env.PORT) || 8000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors({
  origin: IS_PROD ? (process.env.ALLOWED_ORIGIN || false) : 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser() as any);

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Initialise DB schema and seed data
initSchema();

// Auth middleware — applied to all /api/* routes
app.use(authMiddleware);

// Public auth endpoints
app.post('/api/login', loginHandler);
app.post('/api/logout', logoutHandler);
app.get('/api/auth/check', checkAuthHandler);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: 'Wilson Suite API' });
});

// Backup download (auth-protected — middleware already applied)
app.get('/api/backup', (_req: Request, res: Response) => {
  try {
    const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
    const dbPath = path.join(DATA_DIR, 'wilson.sqlite');

    // Force a WAL checkpoint so the backup file is complete
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

    const date = new Date().toISOString().split('T')[0];
    res.download(dbPath, `wilson-backup-${date}.sqlite`);
  } catch (err) {
    console.error('[ERROR] Backup download:', err);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Routes
app.use('/api/users', usersRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/enquiries', enquiriesRouter);
app.use('/api/assessments', assessmentsRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/site-plans', sitePlansRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/audit-log', auditLogRouter);
app.use('/api/storage-areas', storageAreasRouter);
app.use('/api/training', trainingRouter);
app.use('/api/handler-assessments', handlerAssessmentsRouter);

// Serve uploaded evidence files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve built React app in production (single Railway service)
if (IS_PROD) {
  const webDist = path.join(__dirname, '../../../apps/web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// 404 handler (dev only — prod is caught by React Router above)
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler — sanitized response, full server-side log
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[UNHANDLED]', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Only start the server when not imported as a module (i.e., not in tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Wilson Suite API running on http://localhost:${PORT}`);
  });
}

export default app;
