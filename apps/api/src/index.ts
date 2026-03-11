import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { initSchema } from './db/schema';

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

const app = express();
const PORT = Number(process.env.PORT) || 8000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors({
  origin: IS_PROD ? true : 'http://localhost:3000',
}));
app.use(express.json());

// Initialise DB schema and seed data
initSchema();

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: 'Wilson Suite API' });
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

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Wilson Suite API running on http://localhost:${PORT}`);
});

export default app;
