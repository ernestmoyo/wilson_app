/**
 * File names for a job's evidence, shared by the checksheet PDF (its Evidence
 * Portfolio column) and the ZIP bundle, so the PDF names exactly the files the
 * ZIP holds. Contract C:
 *   appendix_category set → "Appendix <n> - <original name>"
 *   otherwise             → "Item <section>.<item> - <n>.<ext>"
 * Evidence filed against no finding is "Evidence - <n>.<ext>".
 */

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf', 'video/mp4': 'mp4' };

/** Characters Windows, macOS and ZIP tools all accept in a file name. */
export function safeFileName(s, max = 120) {
  const clean = String(s ?? '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  return clean.slice(0, max).trim() || 'file';
}

export function extensionFor(row) {
  const fromKey = String(row.storage_key ?? '').match(/\.([a-z0-9]{1,4})$/i)?.[1];
  return (EXT_BY_MIME[row.mime] ?? fromKey ?? 'bin').toLowerCase();
}

/** "3", "Appendix 3", "appendix-3 ERP" → "3"; anything else is used as written. */
function appendixLabel(category) {
  const m = String(category).match(/\d+/);
  return m ? m[0] : safeFileName(category, 40);
}

/**
 * @param {object[]} rows evidence rows, in filing order, each with
 *   { id, mime, storage_key, original_name, appendix_category, section_label, item_label }
 * @returns {Map<id, string>} evidence id → file name, unique within the job
 */
export function evidenceFileNames(rows) {
  const names = new Map();
  const used = new Set();
  const counters = new Map();
  const next = (k) => { const n = (counters.get(k) ?? 0) + 1; counters.set(k, n); return n; };
  for (const r of rows) {
    const ext = extensionFor(r);
    let name;
    if (r.appendix_category) {
      const a = appendixLabel(r.appendix_category);
      let orig = r.original_name ? safeFileName(r.original_name) : `${next(`a:${a}`)}.${ext}`;
      // The extension follows the stored type, never what was typed: a
      // document filed as "x.html" is still the PDF it was stored as.
      orig = `${orig.replace(/\.[a-z0-9]{1,4}$/i, '')}.${ext}`;
      name = `Appendix ${a} - ${orig}`;
    } else if (r.item_label) {
      name = `Item ${safeFileName(r.item_label, 30)} - ${next(`i:${r.item_label}`)}.${ext}`;
    } else {
      name = `Evidence - ${next('e')}.${ext}`;
    }
    // Two templates can both have an "Item 1.1"; never let one file shadow another.
    let unique = name;
    for (let k = 2; used.has(unique.toLowerCase()); k++) unique = name.replace(/(\.[a-z0-9]{1,4})?$/i, (e) => ` (${k})${e}`);
    used.add(unique.toLowerCase());
    names.set(r.id, unique);
  }
  return names;
}

export const PREVIOUS_VERSIONS = 'Previous versions/';

/**
 * Names when evidence has versions (Q4, 20 Oct 2026). The current version of
 * each file takes the name the file has always had (counted in the order the
 * first version was filed, so a replacement keeps its slot); every earlier
 * version goes under "Previous versions/" with the same name plus " (v1)".
 *
 * @param {object[]} rows evidence rows as for evidenceFileNames, plus
 *   { supersedes_id, version }
 * @returns {Map<id, string>} for every row
 */
export function versionedFileNames(rows) {
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const successor = new Map();
  for (const r of rows) if (r.supersedes_id != null) successor.set(String(r.supersedes_id), r);
  const rootOf = (r) => {
    let x = r;
    for (let guard = 0; x.supersedes_id != null && byId.has(String(x.supersedes_id)) && guard < 1000; guard++) x = byId.get(String(x.supersedes_id));
    return x;
  };
  const headOf = (r) => {
    let x = r;
    for (let guard = 0; successor.has(String(x.id)) && guard < 1000; guard++) x = successor.get(String(x.id));
    return x;
  };
  const order = new Map(rows.map((r, k) => [String(r.id), k]));
  const current = rows
    .filter((r) => !successor.has(String(r.id)))
    .sort((a, b) => order.get(String(rootOf(a).id)) - order.get(String(rootOf(b).id)));
  const names = evidenceFileNames(current);
  for (const r of rows) {
    if (!successor.has(String(r.id))) continue;
    const head = names.get(headOf(r).id);
    names.set(r.id, PREVIOUS_VERSIONS + head.replace(/(\.[a-z0-9]{1,4})?$/i, (e) => ` (v${r.version ?? 1})${e}`));
  }
  return names;
}
