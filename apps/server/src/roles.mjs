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
};

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
  const rule = CERTIFIER_ONLY[type];
  if (rule && rule(payload) && !DECIDER.has(role)) throw roleError(role, describe(type, payload));
}

function describe(type, p) {
  switch (type) {
    case 'inspection.sign': return `signing the ${p?.which === 'scope' ? 'scope of authorisation' : 'declaration'}`;
    case 'interest.declare': return 'the register of interests';
    case 'corrective_action.update': return 'verifying a corrective action';
    case 'job.transition': return 'issuing a certificate';
    default: return type;
  }
}

export const canDecide = (role) => !role || DECIDER.has(role);
export const canRecord = (role) => !role || role !== 'viewer';
