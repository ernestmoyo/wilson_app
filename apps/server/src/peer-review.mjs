/**
 * Peer review (reg 17.91 report on an existing stationary container system)
 * and the certificate holder.
 *
 * Tatenda Katai, 20 Oct 2026 (CHANGE_GRAPH.md §10):
 *   Q5  the peer reviewer sees only the final check sheets and evidence,
 *       comments, and formally approves. An approval is of the job as it
 *       stood: its snapshot hash. An edit afterwards lapses it.
 *   Q6  every certificate is in Bryan Wilson's name (TST100250), whoever of
 *       the two certifiers presses Issue.
 *
 * Shared by the sync handlers (the decision records the hash) and the routes
 * (the issue gate, the issuance check, the job payload).
 */

import { createHash } from 'crypto';

/**
 * sha256 over what the peer reviewer looked at: every finding (item, status,
 * comment, general comment, reasons) and the current evidence (bytes hash,
 * review state). Evidence a later version replaced is left out. Columns that
 * an older schema lacks (review_state, supersedes_id) read as null, so the
 * hash is stable on either side of the evidence-review migration.
 */
export async function jobSnapshotHash(db, jobId) {
  const f = await db.query(
    `SELECT f.inspection_id, t.code, s.ordinal AS s, i.ordinal AS i, f.status, f.comment,
            f.general_comment, f.failure_reason, f.na_reason
     FROM finding f
     JOIN inspection ins ON ins.id = f.inspection_id
     JOIN checksheet_item i ON i.id = f.item_id
     JOIN checksheet_section s ON s.id = i.section_id
     JOIN checksheet_template t ON t.id = s.template_id
     WHERE ins.job_id = $1
     ORDER BY f.inspection_id, t.code, s.ordinal, i.ordinal`, [jobId]);
  const e = await db.query(`SELECT * FROM evidence WHERE job_id = $1 ORDER BY id`, [jobId]);
  const replaced = new Set(e.rows.map((r) => r.supersedes_id).filter((x) => x != null).map(Number));
  const snapshot = {
    findings: f.rows.map((r) => [Number(r.inspection_id), r.code, r.s, r.i, r.status, r.comment ?? null,
      r.general_comment ?? null, r.failure_reason ?? null, r.na_reason ?? null]),
    evidence: e.rows.filter((r) => !replaced.has(Number(r.id))).map((r) => [r.sha256, r.review_state ?? null]),
  };
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

/**
 * Where a job's peer review stands:
 *   not_required       the job is not flagged
 *   not_requested      flagged, no decision yet
 *   changes_requested  the latest decision asks for changes
 *   approved           the latest decision approves the job as it stands
 *   lapsed             approved, then something changed (hash differs)
 */
export async function peerReviewState(db, jobId) {
  const j = await db.query(`SELECT peer_review_required FROM job WHERE id = $1`, [jobId]);
  const required = j.rows[0]?.peer_review_required === true;
  const latest = (await db.query(
    `SELECT id, decision, snapshot_hash FROM peer_review WHERE job_id = $1 ORDER BY id DESC LIMIT 1`, [jobId])).rows[0] ?? null;
  const currentHash = latest ? await jobSnapshotHash(db, jobId) : null;
  let state;
  if (!required) state = 'not_required';
  else if (!latest) state = 'not_requested';
  else if (latest.decision === 'changes_requested') state = 'changes_requested';
  else state = String(latest.snapshot_hash).trim() === currentHash ? 'approved' : 'lapsed';
  return { required, state, latest, currentHash };
}

/** What the issue gate and the issuance check say for a state that blocks. */
export function peerReviewBlocker(state) {
  if (state === 'approved' || state === 'not_required') return null;
  const reason = {
    not_requested: 'Peer review: not approved. The peer reviewer has not yet approved this job (reg 17.91 report).',
    changes_requested: 'Peer review: not approved. The peer reviewer asked for changes.',
    lapsed: 'Peer review: lapsed. The check sheets or evidence changed after the approval; the peer reviewer must approve again.',
  }[state] ?? 'Peer review: not approved.';
  return { clause: 'reg 17.91 peer review', reason };
}

/**
 * The person every certificate names: the flagged holder; else the one
 * person holding [authorisationNumber] (a database seeded after migration
 * 016 ran); else [fallback] (the signed-in certifier, as before phase 2).
 */
export async function certificateHolderId(db, { authorisationNumber = 'TST100250', fallback = null } = {}) {
  const h = await db.query(`SELECT id FROM app_user WHERE is_certificate_holder ORDER BY id LIMIT 1`);
  if (h.rows.length) return Number(h.rows[0].id);
  const t = await db.query(`SELECT id FROM app_user WHERE authorisation_number = $1`, [authorisationNumber]);
  if (t.rows.length === 1) return Number(t.rows[0].id);
  return fallback;
}
