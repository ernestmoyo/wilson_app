import { Request, Response, NextFunction } from 'express';

/**
 * Wraps a sync route handler with error catching and sanitized error responses.
 * Logs the full error server-side, returns a generic message to the client.
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res, next);
    } catch (err) {
      console.error(`[ERROR] ${req.method} ${req.path}:`, err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
