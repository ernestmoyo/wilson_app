/**
 * Who may do what.
 *
 * certifier: everything. The only role that signs (IPS 21(5)), answers the
 *            register of interests (IPS 23), verifies a corrective action
 *            (reg 6.24), decides and issues (IPS 8).
 * reviewer:  records findings and comments, uploads evidence, raises and
 *            resolves corrective actions, records communications, moves a
 *            job between the working stages. Cannot decide.
 * viewer:    reads.
 * admin:     as certifier, for whoever administers the system.
 * peer_reviewer: reads only jobs flagged for a reg 17.91 peer review, and
 *            sends only peer_review.comment and peer_review.decide (Tatenda
 *            Katai, 20 Oct 2026, Q5). The decision is theirs alone.
 *
 * can_administer (a flag, not a role): manages people without deciding, for
 * the reviewer with admin and oversight (Q6).
 *
 * Enforced on the server, per event, so a device cannot promote itself.
 */

const DECIDER = new Set(['certifier', 'admin']);

/** Events (or event shapes) that need a certifier. */
const CERTIFIER_ONLY = {
  'inspection.sign': () => true,
  'interest.declare': () => true,
  'corrective_action.update': (p) => p?.status === 'verified',
  'job.transition': (p) => p?.toStage === 'certificate_issued',
  'client.archive': () => true,
  'condition.verify': () => true,
  'job.peer_review_required': () => true,
};

/** The only events a peer reviewer may send. */
const PEER_REVIEWER_EVENTS = new Set(['peer_review.comment', 'peer_review.decide']);

export function roleError(role, what) {
  const e = new Error(`Role: ${what} needs a compliance certifier; signed in as ${role ?? 'nobody'}`);
  e.code = 'P0001';
  return e;
}

/** Throws when [role] may not send [type] with [payload]. Unknown role passes (tests, header mode). */
export function checkEventRole(type, payload, role) {
  if (!role) return;
  if (role === 'viewer') {
    const e = new Error('Role: a viewer can read but not record');
    e.code = 'P0001';
    throw e;
  }
  if (role === 'peer_reviewer' && !PEER_REVIEWER_EVENTS.has(type)) {
    const e = new Error('Role: a peer reviewer reads the check sheets and evidence, comments and decides the peer review; nothing else');
    e.code = 'P0001';
    throw e;
  }
  if (type === 'peer_review.decide' && role !== 'peer_reviewer') {
    const e = new Error(`Role: the peer review decision is the peer reviewer's; signed in as ${role}`);
    e.code = 'P0001';
    throw e;
  }
  const rule = CERTIFIER_ONLY[type];
  if (rule && rule(payload) && !DECIDER.has(role)) throw roleError(role, describe(type, payload));
}

function describe(type, p) {
  switch (type) {
    case 'inspection.sign': return `signing the ${p?.which === 'scope' ? 'scope of authorisation' : 'declaration'}`;
    case 'interest.declare': return 'the register of interests';
    case 'corrective_action.update': return 'verifying a corrective action';
    case 'job.transition': return 'issuing a certificate';
    case 'client.archive': return 'archiving a client';
    case 'condition.verify': return 'verifying a condition of a conditional certificate';
    case 'job.peer_review_required': return 'changing whether a job needs a peer review';
    default: return type;
  }
}

export const canDecide = (role) => !role || DECIDER.has(role);
export const canRecord = (role) => !role || role !== 'viewer';
/** A peer reviewer reads only flagged jobs and records nothing but the review. */
export const isPeerReviewer = (role) => role === 'peer_reviewer';
