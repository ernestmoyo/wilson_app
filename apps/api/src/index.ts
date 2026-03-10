import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initSchema } from './db/schema';

import usersRouter from './routes/users';
import clientsRouter from './routes/clients';
import assessmentsRouter from './routes/assessments';
import certificatesRouter from './routes/certificates';
import inventoryRouter from './routes/inventory';
import sitePlansRouter from './routes/site-plans';
import reportsRouter from './routes/reports';

const app = express();
const PORT = 8000;

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));
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
app.use('/api/assessments', assessmentsRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/site-plans', sitePlansRouter);
app.use('/api/reports', reportsRouter);

// 404 handler
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
