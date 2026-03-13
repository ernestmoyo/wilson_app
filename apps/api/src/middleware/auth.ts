import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// In-memory session store (cleared on restart — Brian logs in again, which is fine)
const sessions = new Set<string>();

// Read lazily so env vars set in tests take effect
function getAuthPassword() {
  return process.env.AUTH_PASSWORD || 'wilson-compliance-2025';
}
const SESSION_COOKIE = 'wilson_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Public paths that bypass auth
const PUBLIC_PATHS = ['/api/health', '/api/login'];

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for public paths
  if (PUBLIC_PATHS.includes(req.path)) return next();

  // Skip auth for non-API paths (static files, React app)
  if (!req.path.startsWith('/api/')) return next();

  const sessionToken = req.cookies?.[SESSION_COOKIE];
  if (!sessionToken || !sessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

export function loginHandler(req: Request, res: Response) {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Timing-safe comparison
  const inputBuf = Buffer.from(password);
  const expectedBuf = Buffer.from(getAuthPassword());

  if (inputBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(inputBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = crypto.randomUUID();
  sessions.add(token);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });

  res.json({ data: { message: 'Login successful' } });
}

export function logoutHandler(req: Request, res: Response) {
  const sessionToken = req.cookies?.[SESSION_COOKIE];
  if (sessionToken) sessions.delete(sessionToken);

  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ data: { message: 'Logged out' } });
}

export function checkAuthHandler(_req: Request, res: Response) {
  // If we get here, auth middleware already passed
  res.json({ data: { authenticated: true } });
}
