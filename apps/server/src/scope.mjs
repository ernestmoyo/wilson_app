/**
 * Scope choices (scope of work, 19 October 2026: A3, B3, B4).
 *
 * A sheet set may offer choices, e.g. the seven class 3.1 arrangements of
 * Appendix A. The certifier picks the ones that apply at job start; the
 * sections of the choices not picked are not assessed. Sections listed under
 * no choice always apply. `notInScope` sections (work outside the
 * authorisation, C8) are never assessed. Pure functions over the catalogue in
 * packages/checksheets/data/sheet-sets.json, so the rules are testable without
 * a database.
 */

import { readFileSync } from 'fs';
import { assetPath } from './db.mjs';

let catalogue = null;
/** The sheet sets, read once from the same file app.mjs serves. */
export function sheetSet(classKey) {
  catalogue ??= JSON.parse(readFileSync(assetPath('data/sheet-sets.json', 'packages/checksheets/data/sheet-sets.json'), 'utf8'));
  return catalogue.sets.find((x) => x.key === classKey) ?? null;
}

const known = (auth, key) => !!key && auth.authorisations.some((a) => a.key === key);

/** A set is authorised by its own authorisation, or when every choice carries one. */
export function setAuthorised(set, auth) {
  if (known(auth, set.authorisation)) return true;
  const choices = set.choices ?? [];
  return choices.length > 0 && choices.every((c) => known(auth, c.authorisation));
}

/**
 * Check the choices sent with a new job. Returns { choices } (sorted, unique;
 * null for a set without choices) or { error }.
 */
export function validateChoices(set, input) {
  const offered = set.choices ?? [];
  const given = input == null ? [] : input;
  if (!Array.isArray(given)) return { error: 'scopeChoices must be a list' };
  if (!offered.length) {
    return given.length ? { error: `"${set.name ?? set.key}" has no scope choices` } : { choices: null };
  }
  if (!given.length) {
    return { error: `pick at least one scope for "${set.name ?? set.key}": ${offered.map((c) => c.label ?? c.key).join('; ')}` };
  }
  const keys = new Set(offered.map((c) => c.key));
  const bad = given.filter((k) => typeof k !== 'string' || !keys.has(k));
  if (bad.length) return { error: `unknown scope choice: ${bad.map((k) => JSON.stringify(k)).join(', ')}` };
  return { choices: [...new Set(given)].sort() };
}

/**
 * The sections an inspection on this set does not assess: [{ template, ordinal, reason }].
 * choices null means the whole set: every job made before choices existed.
 */
export function excludedSections(set, choices) {
  const chosen = new Set(choices ?? (set.choices ?? []).map((c) => c.key));
  const id = (t, o) => `${t}\u0000${o}`;
  const kept = new Set();
  for (const c of set.choices ?? []) {
    if (!chosen.has(c.key)) continue;
    for (const s of c.sections ?? []) for (const o of s.ordinals ?? []) kept.add(id(s.template, o));
  }
  const out = new Map();
  for (const c of set.choices ?? []) {
    if (chosen.has(c.key)) continue;
    for (const s of c.sections ?? []) {
      for (const o of s.ordinals ?? []) {
        if (!kept.has(id(s.template, o))) out.set(id(s.template, o), { template: s.template, ordinal: o, reason: 'not_chosen' });
      }
    }
  }
  for (const s of set.notInScope ?? []) {
    for (const o of s.ordinals ?? []) out.set(id(s.template, o), { template: s.template, ordinal: o, reason: 'not_in_scope' });
  }
  return [...out.values()];
}
