import { mkdtempSync } from 'fs';
import { join } from 'path';
import os from 'os';

// Must set env vars BEFORE any module imports
process.env.NODE_ENV = 'test';
process.env.AUTH_PASSWORD = 'test-password';
process.env.DATA_DIR = mkdtempSync(join(os.tmpdir(), 'wilson-test-'));
