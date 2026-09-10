/**
 * Translate a Postgres rejection into something an inspector can act on.
 *
 * The schema enforces the regulations; the app has to explain them. A raw
 * "check constraint violated" tells a certifier nothing. "IPS 21(1)(f): a
 * non-compliant finding must state why it failed" tells them exactly what to
 * type. Every guard in packages/db either names its clause in the message or
 * has a constraint name listed here — a rejection that reaches the app without
 * a clause is a bug in this file, not in the app.
 */

const BY_CONSTRAINT = {
  non_compliance_needs_reason: {
    clause: 'IPS 21(1)(f)',
    reason: 'A non-compliant finding must state the reason the requirement is not met.',
  },
  supervision_recorded: {
    clause: 'IPS 21(1)(g)',
    reason: 'When someone inspects on behalf of the certifier, whether they were supervised must be recorded.',
  },
  equipment_not_blank: {
    clause: 'IPS 21(1)(d)',
    reason: 'The equipment or facilities used in the inspection must be recorded.',
  },
  ips_21_4_provenance: {
    clause: 'IPS 21(4)',
    reason: 'A photograph used as a record must carry the photographer’s name and occupation, the date, and where it was taken.',
  },
  c2pa_needs_manifest: {
    clause: 'IPS 21(4)',
    reason: 'Evidence marked as C2PA-signed must carry its manifest.',
  },
  conflict_needs_description: {
    clause: 'IPS 23(3)(d)',
    reason: 'A declared conflict of interest must be described.',
  },
  verified_needs_verifier: {
    clause: 'reg 6.24',
    reason: 'A corrective action marked verified must record who re-verified it and when.',
  },
  conditional_needs_conditions: {
    clause: 'reg 6.24',
    reason: 'A conditional certificate must record its conditions.',
  },
  refusal_needs_reasons: {
    clause: 'reg 6.23(2)',
    reason: 'A refusal must state which requirements were not met.',
  },
  has_a_number: {
    clause: 'IPS 8(1)(c)',
    reason: 'A certificate needs a register number or a certificate number.',
  },
  dates_ordered: {
    clause: 'IPS 8(1)(e),(h),(i)',
    reason: 'In-force date must not precede issue date, and expiry must follow in-force.',
  },
  declaration_signature_complete: {
    clause: 'IPS 21(5)',
    reason: 'The declaration must be signed by a named person at a recorded time.',
  },
  scope_confirmation_complete: {
    clause: 'IPS 21(5)',
    reason: 'Scope-of-authorisation confirmation must be signed by a named person at a recorded time.',
  },
  finding_inspection_id_item_id_key: {
    clause: null,
    reason: 'A finding already exists for this item on this inspection; use an update.',
  },
};

// Guards raised from PL/pgSQL put the clause at the front of the message.
const CLAUSE_PREFIX = /^(IPS\s+[\d()a-z.]+|reg\s+[\d.()a-z]+)\s*:\s*(.*)$/i;

/**
 * @param {Error & {code?: string, constraint?: string, detail?: string}} err
 * @returns {{ clause: string|null, reason: string, code: string|undefined }}
 */
export function explain(err) {
  const msg = String(err?.message ?? '');

  if (err?.constraint && BY_CONSTRAINT[err.constraint]) {
    return { ...BY_CONSTRAINT[err.constraint], code: err.code };
  }

  // PGlite and pg surface the constraint name inside the message too.
  for (const [name, info] of Object.entries(BY_CONSTRAINT)) {
    if (msg.includes(`"${name}"`)) return { ...info, code: err.code };
  }

  if (msg.startsWith('Role:')) return { clause: 'Role', reason: msg.slice(5).trim(), code: err.code };
  const m = msg.match(CLAUSE_PREFIX);
  if (m) return { clause: m[1], reason: m[2], code: err.code };

  if (msg.includes('illegal job stage transition')) {
    return { clause: 'Process Flow', reason: msg.split('\n')[0], code: err.code };
  }
  if (msg.includes('immutable')) {
    return { clause: 'IPS 21', reason: msg.split('\n')[0], code: err.code };
  }
  if (msg.includes('append-only')) {
    return { clause: 'IPS 22', reason: msg.split('\n')[0], code: err.code };
  }

  return { clause: null, reason: msg.split('\n')[0] || 'Rejected by the database', code: err.code };
}

/** True for the error classes a client can fix by changing its input. */
export function isClientError(err) {
  const code = err?.code ?? '';
  // 23xxx integrity violations, P0001 raise_exception from our guards
  return code.startsWith('23') || code === 'P0001' || code === '22P02';
}
