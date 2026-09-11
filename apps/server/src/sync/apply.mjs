/**
 * Apply client events to the database.
 *
 * This is the bridge between the field app's model and the schema. The app
 * identifies a check sheet item by (templateCode, sectionOrdinal, itemOrdinal)
 * — stable across template revisions and meaningful offline — while the
 * database uses item_id. Resolution happens here, once, so neither side has to
 * know the other's keys.
 *
 * Every handler runs inside a savepoint. A rejected event rolls back only
 * itself; the rest of the batch still applies. The rejection carries the
 * regulatory clause so the app can tell the inspector what to fix.
 */

import { explain, isClientError } from './errors.mjs';
import { checkEventRole } from '../roles.mjs';

/**
 * An inspection is pinned to the template revisions it was opened against
 * (inspection_template). Items are resolved inside that pin, so a re-seed
 * that supersedes a revision never splits one inspection's findings across
 * two item rows — which is exactly what happened to the G2 job when rev 2
 * landed. An inspection with no pin for the code falls back to the current
 * revision.
 */
async function resolveItemId(db, inspectionId, templateCode, sectionOrdinal, itemOrdinal) {
  const r = await db.query(
    `SELECT i.id
     FROM checksheet_item i
     JOIN checksheet_section s ON s.id = i.section_id
     JOIN checksheet_template t ON t.id = s.template_id
     LEFT JOIN inspection_template p ON p.template_id = t.id AND p.inspection_id = $1
     WHERE t.code = $2 AND s.ordinal = $3 AND i.ordinal = $4
       AND (p.inspection_id IS NOT NULL OR t.status IN ('current', 'draft'))
     ORDER BY (p.inspection_id IS NOT NULL) DESC, t.revision DESC
     LIMIT 1`,
    [inspectionId ?? null, templateCode, sectionOrdinal, itemOrdinal]
  );
  return r.rows[0]?.id ?? null;
}

const handlers = {
  /** Open an inspection against a location, pinned to named template codes. */
  async 'inspection.open'(db, p, ctx) {
    const r = await db.query(
      `INSERT INTO inspection
         (job_id, hs_location_id, certifier_id, conducted_by_id, supervised,
          inspected_at, equipment_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [p.jobId, p.hsLocationId, p.certifierId ?? ctx.userId,
       p.conductedById ?? null, p.supervised ?? null,
       p.inspectedAt ?? new Date().toISOString(), p.equipmentUsed]
    );
    const inspectionId = r.rows[0].id;

    if (Array.isArray(p.templateCodes) && p.templateCodes.length) {
      await db.query(
        `INSERT INTO inspection_template (inspection_id, template_id)
         SELECT $1, id FROM checksheet_template
         WHERE code = ANY($2::text[]) AND status IN ('current','draft')
         ON CONFLICT DO NOTHING`,
        [inspectionId, p.templateCodes]
      );
    }
    return { inspectionId };
  },

  /** Record or update the result against one item. IPS 21(1)(c),(e),(f). */
  async 'finding.upsert'(db, p, ctx) {
    const itemId = p.itemId ?? (await resolveItemId(db, p.inspectionId, p.templateCode, p.sectionOrdinal, p.itemOrdinal));
    if (!itemId) {
      const e = new Error(`no check sheet item for ${p.templateCode} s${p.sectionOrdinal}/i${p.itemOrdinal}`);
      e.code = '22P02';
      throw e;
    }
    const r = await db.query(
      `INSERT INTO finding
         (inspection_id, item_id, status, comment, verification_method, failure_reason,
          decided_by, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (inspection_id, item_id) DO UPDATE SET
         status              = EXCLUDED.status,
         comment             = EXCLUDED.comment,
         verification_method = EXCLUDED.verification_method,
         failure_reason      = EXCLUDED.failure_reason,
         decided_by          = EXCLUDED.decided_by,
         decided_at          = EXCLUDED.decided_at,
         updated_at          = now()
       RETURNING id, status`,
      [p.inspectionId, itemId, p.status ?? 'pending',
       p.comment ?? null, p.verificationMethod ?? null, p.failureReason ?? null,
       ctx.userId ?? null, p.decidedAt ?? new Date().toISOString()]
    );
    return { findingId: r.rows[0].id, itemId, status: r.rows[0].status };
  },

  /** Attach captured evidence. IPS 21(4) provenance is enforced by the schema. */
  async 'evidence.attach'(db, p, ctx) {
    let findingId = p.findingId ?? null;
    if (!findingId && p.templateCode && p.inspectionId) {
      const itemId = await resolveItemId(db, p.inspectionId, p.templateCode, p.sectionOrdinal, p.itemOrdinal);
      if (itemId) {
        const f = await db.query(
          `SELECT id FROM finding WHERE inspection_id = $1 AND item_id = $2`,
          [p.inspectionId, itemId]
        );
        findingId = f.rows[0]?.id ?? null;
      }
    }
    const r = await db.query(
      `INSERT INTO evidence
         (job_id, inspection_id, finding_id, kind, sha256, storage_key, mime, bytes,
          captured_by_name, captured_by_occupation, captured_at, captured_where,
          gps_lat, gps_lon, device_info, provenance, appendix_category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [p.jobId, p.inspectionId ?? null, findingId,
       p.kind ?? 'photo', p.sha256, p.storageKey ?? p.sha256, p.mime, p.bytes,
       p.capturedByName ?? null, p.capturedByOccupation ?? null,
       p.capturedAt ?? null, p.capturedWhere ?? null,
       p.gpsLat ?? null, p.gpsLon ?? null, p.deviceInfo ?? ctx.deviceId ?? null,
       p.provenance ?? 'app', p.appendixCategory ?? null]
    );
    return { evidenceId: r.rows[0].id, findingId };
  },

  /** Move a job through the process flow. The DB trigger enforces legality. */
  async 'job.transition'(db, p, ctx) {
    await db.query(`UPDATE job SET stage = $2 WHERE id = $1`, [p.jobId, p.toStage]);
    if (p.reason || ctx.userId) {
      await db.query(
        `UPDATE job_stage_transition SET actor_id = $2, reason = $3
         WHERE id = (SELECT max(id) FROM job_stage_transition WHERE job_id = $1)`,
        [p.jobId, ctx.userId ?? null, p.reason ?? null]
      );
    }
    return { jobId: p.jobId, stage: p.toStage };
  },

  /** IPS 23: declare (or deny) a conflict of interest for a job. */
  async 'interest.declare'(db, p, ctx) {
    const r = await db.query(
      `INSERT INTO interest_declaration (job_id, certifier_id, conflict_found, description, mitigation)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (job_id, certifier_id) DO UPDATE SET
         conflict_found = EXCLUDED.conflict_found,
         description    = EXCLUDED.description,
         mitigation     = EXCLUDED.mitigation,
         declared_at    = now()
       RETURNING id`,
      [p.jobId, p.certifierId ?? ctx.userId, !!p.conflictFound, p.description ?? null, p.mitigation ?? null]
    );
    return { declarationId: r.rows[0].id };
  },

  /**
   * IPS 21(5): sign the sheet's declaration, or confirm scope of authorisation.
   * A signature is a (who, when) pair; the who is the authenticated user, never
   * a payload field, so a device cannot sign as someone else.
   */
  async 'inspection.sign'(db, p, ctx) {
    const which = p.which === 'scope' ? 'scope' : 'declaration';
    if (!ctx.userId) {
      const e = new Error('IPS 21(5): a signature needs an authenticated signer');
      e.code = 'P0001';
      throw e;
    }
    const col = which === 'scope' ? 'scope_confirmed' : 'declaration_signed';
    const r = await db.query(
      `UPDATE inspection
         SET ${col}_at = $2, ${col}_by = $3
       WHERE id = $1
       RETURNING id, ${col}_at AS signed_at, ${col}_by AS signed_by`,
      [p.inspectionId, p.signedAt ?? new Date().toISOString(), ctx.userId]
    );
    if (!r.rows.length) {
      const e = new Error(`inspection ${p.inspectionId} not found`);
      e.code = '22P02';
      throw e;
    }
    return { inspectionId: r.rows[0].id, which, signedAt: r.rows[0].signed_at, signedBy: r.rows[0].signed_by };
  },

  /**
   * Process flow stage 5: a non-compliance becomes a corrective action with a
   * severity (critical / major / minor, the flow's own words), a description
   * of what must change, and a due date. Addressed by finding id, or by the
   * same (inspection, sheet, section, item) key the app uses for findings.
   */
  async 'corrective_action.raise'(db, p, ctx) {
    let findingId = p.findingId ?? null;
    if (!findingId && p.inspectionId && p.templateCode) {
      const itemId = await resolveItemId(db, p.inspectionId, p.templateCode, p.sectionOrdinal, p.itemOrdinal);
      if (itemId) {
        const f = await db.query(`SELECT id FROM finding WHERE inspection_id = $1 AND item_id = $2`,
          [p.inspectionId, itemId]);
        findingId = f.rows[0]?.id ?? null;
      }
    }
    if (!findingId) {
      const e = new Error('a corrective action must name the finding it addresses');
      e.code = '22P02';
      throw e;
    }
    const r = await db.query(
      `INSERT INTO corrective_action (finding_id, severity, description, due_date, status)
       VALUES ($1,$2,$3,$4,'open') RETURNING id`,
      [findingId, p.severity, p.description, p.dueDate ?? null]
    );
    return { correctiveActionId: r.rows[0].id, findingId };
  },

  /**
   * Move a corrective action through open → in_progress → resolved → verified.
   * 'verified' is a claim that a named person re-checked the control (reg
   * 6.24, process flow stage 6), so the verifier is the authenticated user.
   */
  async 'corrective_action.update'(db, p, ctx) {
    const status = p.status;
    if (status === 'verified' && !ctx.userId) {
      const e = new Error('reg 6.24: verifying a corrective action needs an authenticated verifier');
      e.code = 'P0001';
      throw e;
    }
    const r = await db.query(
      `UPDATE corrective_action
         SET status        = $2,
             description   = COALESCE($3, description),
             due_date      = COALESCE($4, due_date),
             reverified_by = CASE WHEN $2 = 'verified' THEN $5 ELSE reverified_by END,
             reverified_at = CASE WHEN $2 = 'verified' THEN COALESCE($6, now()) ELSE reverified_at END
       WHERE id = $1
       RETURNING id, status`,
      [p.correctiveActionId, status, p.description ?? null, p.dueDate ?? null,
       ctx.userId ?? null, p.verifiedAt ?? null]
    );
    if (!r.rows.length) {
      const e = new Error(`corrective action ${p.correctiveActionId} not found`);
      e.code = '22P02';
      throw e;
    }
    return { correctiveActionId: r.rows[0].id, status: r.rows[0].status };
  },

  /**
   * The subject block of a form sheet (applicant, PCBU): label → value,
   * merged so a device that edited one field does not blank the others.
   */
  async 'job.subject.set'(db, p, ctx) {
    const r = await db.query(
      `UPDATE job SET subject = subject || $2::jsonb WHERE id = $1 RETURNING subject`,
      [p.jobId, JSON.stringify(p.fields ?? {})]
    );
    if (!r.rows.length) { const e = new Error(`job ${p.jobId} not found`); e.code = '22P02'; throw e; }
    return { jobId: p.jobId, subject: r.rows[0].subject };
  },

  /** One unit of a job (a cylinder batch), by ordinal; fields label → value. */
  async 'job.unit.upsert'(db, p, ctx) {
    const r = await db.query(
      `INSERT INTO job_unit (job_id, ordinal, fields) VALUES ($1,$2,$3::jsonb)
       ON CONFLICT (job_id, ordinal) DO UPDATE SET fields = job_unit.fields || EXCLUDED.fields, updated_at = now()
       RETURNING id, ordinal, fields`,
      [p.jobId, p.ordinal, JSON.stringify(p.fields ?? {})]
    );
    return { unitId: r.rows[0].id, ordinal: r.rows[0].ordinal };
  },

  /**
   * Removing a unit closes the gap: the units after it move up one, as they
   * do in the app's list, so the next edit to "unit 2" lands on the same
   * batch on both sides. Two steps because (job_id, ordinal) is unique.
   */
  async 'job.unit.remove'(db, p, ctx) {
    const r = await db.query(`DELETE FROM job_unit WHERE job_id = $1 AND ordinal = $2`, [p.jobId, p.ordinal]);
    await db.query(`UPDATE job_unit SET ordinal = -ordinal WHERE job_id = $1 AND ordinal > $2`, [p.jobId, p.ordinal]);
    await db.query(`UPDATE job_unit SET ordinal = -ordinal - 1, updated_at = now() WHERE job_id = $1 AND ordinal < 0`, [p.jobId]);
    return { jobId: p.jobId, ordinal: p.ordinal, removed: r.rowCount };
  },

  /** IPS 21(2)(a): a communication with the applicant is a statutory record. */
  async 'communication.record'(db, p, ctx) {
    const r = await db.query(
      `INSERT INTO communication (job_id, direction, medium, party, summary, body, occurred_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [p.jobId, p.direction, p.medium, p.party, p.summary, p.body ?? null,
       p.occurredAt ?? new Date().toISOString(), ctx.userId ?? null]
    );
    return { communicationId: r.rows[0].id };
  },
};

export const EVENT_TYPES = Object.keys(handlers);

/**
 * Apply a batch of client events idempotently.
 *
 * @param db      pg Pool/Client or PGlite — anything with query(sql, params)
 * @param ctx     { deviceId, userId }
 * @param events  [{ id, type, payload, occurredAt }]
 * @returns       { applied: [...], rejected: [...], duplicate: [...] }
 */
export async function applyEvents(db, ctx, events) {
  const applied = [];
  const rejected = [];
  const duplicate = [];

  await db.query(
    `INSERT INTO device (id, user_id, last_seen_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET last_seen_at = now(), user_id = COALESCE(EXCLUDED.user_id, device.user_id)`,
    [ctx.deviceId, ctx.userId ?? null]
  );

  for (const ev of events) {
    // Idempotency: the client UUID is the primary key. A replay is a no-op.
    const seen = await db.query(
      `SELECT outcome, reject_clause, reject_reason FROM sync_event WHERE id = $1`, [ev.id]);
    if (seen.rows.length) {
      const s = seen.rows[0];
      // A replay of a rejected event is still rejected, and the app still
      // needs the clause. Only the outcome label changes.
      duplicate.push({
        id: ev.id,
        previousOutcome: s.outcome,
        ...(s.outcome === 'rejected' ? { clause: s.reject_clause, reason: s.reject_reason } : {}),
      });
      continue;
    }

    const handler = handlers[ev.type];
    if (!handler) {
      rejected.push({ id: ev.id, clause: null, reason: `unknown event type "${ev.type}"` });
      await recordSync(db, ev, ctx, 'rejected', null, `unknown event type "${ev.type}"`);
      continue;
    }

    await db.query('SAVEPOINT ev');
    try {
      // Role first: a reviewer's signature must never reach the database.
      checkEventRole(ev.type, ev.payload ?? {}, ctx.role);
      const result = await handler(db, ev.payload ?? {}, ctx);
      await db.query('RELEASE SAVEPOINT ev');
      await recordSync(db, ev, ctx, 'applied');
      applied.push({ id: ev.id, type: ev.type, result });
    } catch (err) {
      await db.query('ROLLBACK TO SAVEPOINT ev');
      const why = explain(err);
      if (!isClientError(err)) {
        // Not the client's fault — surface it, don't bury it as a rejection.
        throw Object.assign(new Error(`event ${ev.id} (${ev.type}): ${why.reason}`), { cause: err });
      }
      await recordSync(db, ev, ctx, 'rejected', why.clause, why.reason);
      rejected.push({ id: ev.id, type: ev.type, clause: why.clause, reason: why.reason });
    }
  }

  return { applied, rejected, duplicate };
}

async function recordSync(db, ev, ctx, outcome, clause = null, reason = null) {
  await db.query(
    `INSERT INTO sync_event (id, device_id, user_id, type, payload, occurred_at, outcome, reject_clause, reject_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [ev.id, ctx.deviceId, ctx.userId ?? null, ev.type, JSON.stringify(ev.payload ?? {}),
     ev.occurredAt ?? new Date().toISOString(), outcome, clause, reason]
  );
}
