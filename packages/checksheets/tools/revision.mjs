/**
 * Revisions of a template in data/.
 *
 * A published template is never edited in place. When new content lands on a
 * template code whose file already exists, the content is compared with what
 * is there; if it differs, the new file is revision n+1 and records what it
 * supersedes. The seed (generate.mjs) then inserts it as a new row and marks
 * the old one superseded, so inspections pinned to revision n keep their
 * wording.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';

/** What a revision is: the sheet nodes and the items, nothing about provenance. */
export const contentOf = (t) => JSON.stringify({ sheet: t.sheet ?? null, sheetByClass: t.sheetByClass ?? null, sections: t.sections });
export const contentHash = (t) => createHash('sha256').update(contentOf(t)).digest('hex');

/**
 * Give `next` its revision against the file at `path`.
 * Unchanged content keeps the existing revision and provenance (a re-run is a
 * no-op); changed content becomes revision n+1 with `source.supersedes`.
 */
export function withRevision(path, next, { note } = {}) {
  if (!existsSync(path)) return { ...next, revision: next.revision ?? 1 };
  const prev = JSON.parse(readFileSync(path, 'utf8'));
  if (contentOf(prev) === contentOf(next)) return prev;
  const revision = (prev.revision ?? 1) + 1;
  return {
    ...next,
    revision,
    source: {
      ...next.source,
      supersedes: {
        revision: prev.revision ?? 1,
        contentHash: contentHash(prev),
        workbook: prev.source?.workbook ?? null,
        sheet: prev.source?.sheet ?? null,
        reconciledFrom: prev.source?.reconciledFrom ?? null,
      },
      ...(note ? { revisionNote: note } : {}),
    },
  };
}
