/**
 * Vercel entrypoint at the repo root.
 *
 * Vercel only discovers serverless functions under a top-level api/, and the
 * server needs the monorepo's packages/ at build time, so the project is
 * deployed from the repo root and this file forwards to the real handler.
 * Railway is unaffected: it builds from the Dockerfile and never sees this.
 */
export { default } from '../apps/server/api/index.mjs';
