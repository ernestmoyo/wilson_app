-- GENERATED FILE — DO NOT EDIT.
-- Source:    packages/checksheets/data/*.template.json
-- Generator: packages/checksheets/tools/generate.mjs
-- Regenerate with: npm run gen -w packages/checksheets

-- Template layer only. Templates are immutable once status = 'current';
-- a Performance Standard revision inserts a NEW revision rather than updating
-- an existing row, so an inspection can always name the exact revision it was
-- conducted under (IPS cl. 21, and the question every auditor asks at year 9).

CREATE TABLE IF NOT EXISTS checksheet_template (
  id              bigserial PRIMARY KEY,
  code            text        NOT NULL,
  revision        integer     NOT NULL DEFAULT 1,
  title           text        NOT NULL,
  ps_reference    text,
  class_scope     text[]      NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','current','superseded')),
  effective_from  date,
  superseded_by   bigint      REFERENCES checksheet_template(id),
  -- Sheet-level nodes (title, banner, note, declaration, document control,
  -- scope of authorisation, reference, footer) and their per-class overlay.
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, revision)
);
-- Databases created before meta existed get the column added in place.
ALTER TABLE checksheet_template ADD COLUMN IF NOT EXISTS meta jsonb;

CREATE TABLE IF NOT EXISTS checksheet_section (
  id           bigserial PRIMARY KEY,
  template_id  bigint  NOT NULL REFERENCES checksheet_template(id) ON DELETE CASCADE,
  ordinal      integer NOT NULL,
  number       text,
  title        text    NOT NULL,
  UNIQUE (template_id, ordinal)
);

CREATE TABLE IF NOT EXISTS checksheet_item (
  id                        bigserial PRIMARY KEY,
  section_id                bigint  NOT NULL REFERENCES checksheet_section(id) ON DELETE CASCADE,
  ordinal                   integer NOT NULL,
  number                    text,
  regulation_refs           text[]  NOT NULL DEFAULT '{}',
  -- sparse; only the items whose applicable regulations are class-scoped
  regulation_refs_by_class  jsonb,
  regulation_raw            text,
  guidance_url              text,
  action                    text    NOT NULL,
  records                   text    NOT NULL,
  evidence_required         boolean NOT NULL DEFAULT false,
  UNIQUE (section_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_checksheet_item_refs
  ON checksheet_item USING gin (regulation_refs);


-- ── seed ──────────────────────────────────────────────────────────────

BEGIN;

-- wks17-class-2-and-3-1-substances — 23 sections, 44 items — content 530b2db794ee
INSERT INTO checksheet_template (code, revision, title, ps_reference, class_scope, status, meta)
SELECT 'wks17-class-2-and-3-1-substances',
       COALESCE((SELECT max(revision) FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances'), 0) + 1,
       'Check sheet Location Class 2 and 3.1 substances', 'Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard', '{}', 'current', '{"contentHash":"530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8","sheet":{"title":"Check sheet Location Class 2 and 3.1 substances","evidenceColumnLabel":"Evidence Portfolio","banner":"Requirements specific to class 2 and 3.1 substances","columnHeaders":["Item","Regulation","Action","Records","Comments"],"note":"NB: Non compliances are in red","declaration":"Declaration: I verify that I have examined the evidence and conducted the compliance audit as per Regulation 17.91 of the Health and Safety at Work (Hazardous Substances) Regulations 2017. All photographs in the report were personally taken by me at the specified site on the date of the report, unless stated otherwise within the report (IPS Clause 21(4)).Please note that this audit utilized an iPad and tape measure, with appropriate personal protective equipment worn on-site (IPS Clause 21(1)(d)). The issuance of a compliance certificate has been validated through inquiry, inspection, assessment, or examination, as detailed in this report (IPS Clause 21(1)(e)). In accordance with r.6.22(2) and IPS Clause 23(1), I affirm that I have assessed and found no conflict of interest or reasonably foreseeable conflict of interest in performing my duties as a compliance certifier/proxy. Site Assessor confirmation (Digital signature) IPS Clause 21(5)","documentControl":{"Owner":"BW","Revision":"1","Status":"Current","Date of last revision":"2024-04-25","Frequency of revision":"less than 12 months"},"scopeOfAuthorisation":{"heading":"Scope of Authorisation","text":"Locations where classes 2 or 3.1 substances are present [Regulation 17.91, Health and Safety at Work (Hazardous Substances) Regulations 2017] Conditions:","confirmation":"I can confirm that I have checked that the certification process has been carried within my scope of authorisation. Site Assessor confirmation (Digital signature) IPS Clause 21(5)"},"reference":"Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard HSW (HS) Regulations of 2017","footer":"Section 2/2"},"sheetByClass":null}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
);
UPDATE checksheet_template
   SET status = 'superseded',
       superseded_by = (SELECT id FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8')
 WHERE code = 'wks17-class-2-and-3-1-substances' AND (meta->>'contentHash') IS DISTINCT FROM '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND status <> 'superseded';

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 1, '1', 'Class 2 and 3.1 substances to be secured'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['10.4(1)']::text[], NULL, '10.4(1)', NULL, 'Determine whether the substances must be secured Verify that the requirements relating to security are met', 'A record of the quantities present, as compared to the threshold quantities A record of the means by which the substances are secured', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 1
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 2, '2', 'Class 2 and 3.1 substances to be segregated from incompatible substances'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['10.5']::text[], NULL, '10.5', NULL, 'Verify that incompatible substances are segregated', 'A record identifying the incompatible substances and the means of segregation', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 3, '3', 'Hazardous areas for class 2.1.1, 2.1.2, 3.1A, 3.1B, or 3.1.C substances'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['10.6(1)(a)']::text[], NULL, '10.6(1)(a))', NULL, 'Verify whether the hazardous area is delineated in accordance with AS/NZS 60079.10.1:2009', 'A note as to whether the hazardous area is compliant', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['10.26(4)(b)']::text[], NULL, '10.26(4)(b)', NULL, 'Verify that— (a) the hazardous substances are not in contact with incompatible substances; and (b) containers of incompatible substances are stored separately', 'Verify that the hazardous area is delineated, classified, and depicted on a site plan Verify sample elements of the plan to ensure it is correct', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['10.26(4)(c)']::text[], NULL, '10.26(4)(c)', NULL, 'Verify that the hazardous area is maintained', 'A reference to the electrical dossier A copy (or date and identifier) of electrical certificate(s) A note or record of representative samples of procedures and/or equipment', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 4, '4', 'Separation of class 2.1.1 permanent gases'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.19(2)']::text[], NULL, '11.19(2)', NULL, 'Verify that the prescribed separation distance between the vehicle fill points and storage of permanent gas is met', 'A record that confirms the minimum distance is complied with', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['11.19(3)']::text[], NULL, '11.19(3)', NULL, 'Verify that the prescribed separation distances are met', 'A record that confirms the minimum distances are complied with', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['11.19(5)']::text[], NULL, '11.19(5)', NULL, 'Verify that the prescribed separation distances are met', 'A record that confirms the minimum distances are complied with', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 5, NULL, 'Separation of class 2.1.1 liquefiable gases: cylinders'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.2']::text[], NULL, '11.2', NULL, 'Determine which subclause(s) (if any) of regulation 11.20 apply to the hazardous substance location', 'A record of the determination and the quantities of class 2.1.1 liquefiable gas present', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['11.20(1)']::text[], NULL, '11.20(1)', NULL, 'Verify that the separation distances are met', 'A record of the basis for the verification', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['11.20(2)']::text[], NULL, '11.20(2)', NULL, 'Verify that if the cylinders contain up to 100 kg, the requirements relating to the proximity of buildings and openings are met', 'A record of the basis for the verification', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['11.20(3)']::text[], NULL, '11.20(3)', NULL, 'Verify that the cylinders are not located within 1 m of an opening to a drain', 'A record of the basis for the verification', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 5, '5', ARRAY['11.20(4)']::text[], NULL, '11.20(4)', NULL, 'Verify that if the cylinders contain more than 100 kg and up to 300 kg, the requirements relating to the proximity of buildings and openings are met', 'A record of the basis of the verification, including the nature of fire-resistant materials, separation distance, and openings', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 6, '6', ARRAY['11.20(5)']::text[], NULL, '11.20(5)', NULL, 'Verify that if the cylinders contain more than 300 kg and up to 1000 kg, the requirements relating to the proximity of buildings and openings are met and the wall of the building is vapour tight', 'A record of the basis of the verification, including the nature of the FRR materials, separation distance, and openings', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 6, NULL, 'Separation of class 2.1.1 liquefiable gases: cylinder filling'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.22(1)']::text[], NULL, '11.22(1)', NULL, 'Verify that the separation distances are met for the cylinder filling station', 'A record of the following: (a) the quantity of liquefiable gas at the hazardous substance location: (b) confirmation that the relevant minimum prescribed distance is met: (c) the point on the cylinder filling station that the separation distance is measure from', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 7, NULL, 'Separation of class 2.1.2 aerosols'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.8']::text[], NULL, '11.8', NULL, 'Establish the quantity of aerosols present and', 'A record of the quantities and separation distances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '1', ARRAY['11.23']::text[], NULL, '11.23', NULL, 'Confirm the aggregate water capacity exceeds 3,000 L Determine the nature of any neighbouring property and verify the separation distance Determine which subclauses apply', 'A record of the quantities and separation distances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 8, NULL, 'Hazardous substance location holding not more than 10,000 L aggregate water capacity'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '2', ARRAY['11.24(1)(a)', '11.24(1)(b)']::text[], NULL, '11.24(1)(a) 11.24(1)(b)', NULL, 'Verify the construction details of the room or building including details of the walls, ceiling, doors, and fittings as well as the fire protection', 'Records of the building layout, building construction, FRR, and building elements including suppliers'' tags for doors and windows', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 8
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '3', ARRAY['11.24(1)(c)', '11.24(1)(d)']::text[], NULL, '11.24(1)(c) 11.24(1)(d)', NULL, 'Verify that the general purpose warehouse used for receiving, storing, and distributing mixed goods (including flammable aerosols)— (a) is not a warehouse for the primary purpose of storing hazardous substances; and (b) is not accessible by the general public; and (c) has the flammable aerosols in the warehouse separated from the rest of the warehouse in accordance with the prescribed requirements and has prescribed fire protection', 'Records of the building layout, building construction, FRR, and building elements including suppliers'' tags for doors and windows', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 8
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 9, NULL, 'Hazardous substance location holding more than 10,000 L but not more than 100,000 L aggregate water capacity of flammable aerosols'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '4', ARRAY['11.25(1)(a)', '11.25(1)(b)']::text[], NULL, '11.25(1)(a) 11.25(1)(b)', NULL, 'Verify the construction details and the fire protection of the building or the room', 'Records of the building layout, building construction, FRR, building details, and fire protection A record of building details is to include a record of tags of the building elements', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 9
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '5', ARRAY['11.25(1)(c)', '11.25(1)(d)']::text[], NULL, '11.25(1)(c) 11.25(1)(d)', NULL, 'Verify the location that is in a general purpose warehouse for receiving, storing, and distributing mixed goods (including flammable aerosols)— (a) is not a warehouse for the primary purpose of storing hazardous substances; and (b) is not accessible by the general public Verify the construction details and the fire protection of the building or the room', 'A record confirming that the warehouse is a general purpose warehouse and is not accessible by the public Records of the building layout, building construction, FRR, building details, and fire protection A record of building details is to include a record of tags of the building elements', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 9
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '6', ARRAY['11.26(a)', '11.26(b)']::text[], NULL, '11.26(a) 11.26(b)', NULL, 'Verify the construction details and the fire protection of the building or the room', 'A record confirming that the warehouse is a general purpose warehouse and is not accessible by the public Records of the building layout, building construction, FRR,building details, and fire protection A record of building details is to include a record of tags of the building elements', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 9
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '7', ARRAY['11.26(c)', '11.26(d)']::text[], NULL, '11.26(c) 11.26(d)', NULL, 'Verify that the location— (a) is in a general purpose warehouse used for receiving, storing, and distributing mixed goods (including flammable aerosols); and (b) is not a warehouse for the primary purpose of storing hazardous substances; and (c) is not accessible by the general public Verify the flammable aerosols in the warehouse are separated from the rest of the warehouse Verify the construction details and the fire protection of the building or the room', 'A record confirming that the warehouse is a general purpose warehouse and is not accessible by the public Records of the building layout, building construction, FRR, building details, and fire protection A record of building details is to include a record of tags of the building elements', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 9
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 10, NULL, 'Separation of class 3.1 substances: transfer points to protected places'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.35']::text[], NULL, '11.35', NULL, 'Verify that the separation distance to a protected place is met', 'A record that includes— (a) the substances contained; and (b) confirmation that the prescribed separation distance is met; and (c) the type of transfer point', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 10
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 11, NULL, 'Class 3.1 substances to be held in buildings of a certain type'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 12, NULL, 'Storage Cabinet'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.29(3)']::text[], NULL, '11.29(3)', NULL, 'Verify— (a) the quantity of substances and their hazard classifications; and (b) the standard to which the cabinet is constructed; and (c) where more than one cabinet is located within a building, the aggregate capacity of the cabinets and the separation of the cabinets; and (d) for AS 1940 cabinets, the exclusion of sources of ignition around the cabinet', 'A record of— (a) the plate on the cabinet or the standard the cabinet is constructed to; and (b) the location of the cabinet; and (c) the separation distance between the cabinets (if applicable); and (d) exclusion of ignition sources', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 12
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 13, NULL, 'Building types A, B, C, and D storage'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '2', ARRAY['11.29(2)']::text[], NULL, '11.29(2)', NULL, 'Verify— (a) the building type; and (b) compliance with the building type in all aspects i.e. walls, roof, doors, and windows; and (c) the classification of the substance; and (d) the package sizes; and (e) the prescribed separation distances; and (f) the actual separation distances', 'A record of— (a) the quantity and hazard classes of the substances stored; and (b) the building type; and (c) the details of the FRR building elements, including suppliers'' tags for doors and windows; and (d) the actual separation distances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 13
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 14, NULL, 'Storage of packages holding up to 60 litres of class 3.1 substances: separation from protected place'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.3']::text[], NULL, '11.3', NULL, 'Verify that the separation distance to a protected place is met', 'A record that includes— (a) the substances contained; and (b) confirmation that the prescribed separation distance is met', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 14
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 15, NULL, 'Storage of packages holding class 3.1 substances in stores inside buildings'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.31']::text[], NULL, '11.31', NULL, 'Determine which provisions of regulation 11.31 apply', 'A record of the determination and the quantities of class 3 substances present', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 15
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['11.31(1)(a)']::text[], NULL, '11.31(1)(a)', NULL, 'Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building, including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations; and (d) if applicable, the requirements for when a door is opening into a building', 'A record of— (a) the quantity of flammable substances; and (b) the FRR elements, including suppliers'' tags for doors and windows; and (c) details of compliance with prescribed requirements for a door opening into a building', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 15
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['11.31(1)(b)']::text[], NULL, '11.31(1)(b)', NULL, 'Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations; and (d) if applicable, the requirements for when a door is opening into a building', 'A record of— (a) the quantity of flammable substances; and (b) the FRR elements, including suppliers'' tags for doors and windows; and (c) details of compliance with prescribed requirements for a door opening into a building', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 15
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['11.31(1)(c)']::text[], NULL, '11.31(1)(c)', NULL, 'Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations; and (d) if applicable, the requirements for when a door is opening into a building', 'A record of— (a) the quantity of flammable substances; and (b) the FRR elements, including suppliers'' tags for doors and windows; and (c) details of compliance with prescribed requirements for a door opening into a building', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 15
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 16, NULL, 'Type D storage with more than two walls in common with another building'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '5', ARRAY['11.31(3)']::text[], NULL, '11.31(3)', NULL, 'Verify— (a) that the stored substances are within the prescribed maximum; and (b) the construction details of the building including details of the walls, ceiling, and doors; and (c) the prescribed quantity and package size limitations', 'A record of— (a) the quantity of flammable substances and package sizes; and (b) the FRR elements, including suppliers'' tags for doors and windows', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 16
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 17, NULL, 'Storage of packages holding more than 60 litres of class 3.1 substances: separation from protected place'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.34']::text[], NULL, '11.34', NULL, 'Verify that the separation distance to a protected place is met', 'A record that includes— (a) the substances contained; and (b) confirmation that the prescribed separation distance is met', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 17
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 18, NULL, 'Class 3.1 substances used or in open packages or containers to be held in buildings of a certain type'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.36']::text[], NULL, '11.36', NULL, 'Verify the building type and the construction details of the building Determine which regulations apply', 'A record of— (a) the building FRR details including suppliers'' tags for doors and windows; or (b) details of compliance with AS/NZS 4114.1:2003 e.g. a record of the plate or the supplier''s verification', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 18
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 19, NULL, 'Type 1 workroom or a paint mixing room'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '2', ARRAY['11.37(2)(a)']::text[], NULL, '11.37(2)(a)', NULL, 'Verify— (a) that the workroom/paint mixing room holds no more than the prescribed quantity or container size; and (b) the location of the building', 'A record of container sizes, aggregate quantities, and the location of the building', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 19
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 20, NULL, 'Type 2 or Type 3 workroom'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '3', ARRAY['11.37(2)(b)']::text[], NULL, '11.37(2)(b)', NULL, 'Verify that the building holds no more than the prescribed quantity', 'A record of hazardous substance classes and aggregate quantities', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 20
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '4', ARRAY['11.37(4)']::text[], NULL, '11.37(4)', NULL, 'Verify that the separation distances meet or exceed the prescribed separation distances', 'A record of the actual and prescribed separation distances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 20
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 21, NULL, 'Other building type - regulation 11.37(5)'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '5', ARRAY['11.37(5)']::text[], NULL, '11.37(5)', NULL, 'Verify— (a) the quantity of hazardous substances; and (b) that the quantity of class 3.1 substances is not more than the specified maximum; and (c) the occupancy of the building; and (d) the construction details of that part of the building; and (e) the controls on prohibiting ignition sources', 'A record of— (a) the quantities; and (b) the building details in the vicinity of the flammable substances; and (c) the occupational details of the building', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 21
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 22, NULL, 'Storage of packages holding class 3.1A, 3.1B, or 3.1C substances in retail stores'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.32(1)', '11.33(1)']::text[], NULL, '11.32(1) 11.33(1)', NULL, 'Determine whether regulation 11.32 or 11.33 applies', 'A record of the business type and container details', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 22
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['11.32(1)(b)']::text[], NULL, '11.32(1)(b)', NULL, 'Verify that the quantities of class 3.1 substances are not more than the maximum', 'A record of the quantities', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 22
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['11.33(2)(b)']::text[], NULL, '11.33(2)(b)', NULL, 'Verify that requirements for separation are compliant', 'A record of the separation details', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 22
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['11.33(2)(c)']::text[], NULL, '11.33(2)(c)', NULL, 'Verify that the retail store complies with section 3.4 (General Requirements for Retail Storage) of AS/NZS 3833:2007', 'A record of the building elements', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 22
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 5, '5', ARRAY['11.33(1)(d)', '11.33(1)']::text[], NULL, '11.33(1)(d) 11.33(1)€', NULL, 'Verify that the building is compliant', 'A record of the separation distances Where there is an intervening wall, a record of the FRR elements of the wall', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 22
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 23, NULL, 'Indoor storage or use of LPG, propane, butane, or isobutane'
FROM checksheet_template WHERE code = 'wks17-class-2-and-3-1-substances' AND meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['11.42(1)']::text[], NULL, '11.42(1)', NULL, 'Verify that the quantities of LPG, propane, butane, or isobutane are not more than the maximum', 'A record of the quantities', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-2-and-3-1-substances' AND t.meta->>'contentHash' = '530b2db794ee35eced38815d450606fab9e0e5af39b7d8fddaa8833be11bc2d8' AND sec.ordinal = 23
ON CONFLICT (section_id, ordinal) DO NOTHING;

-- wks17-class-6-1a-6-1b-6-1c-8-2a-8 — 9 sections, 18 items — content c5a51934b786
INSERT INTO checksheet_template (code, revision, title, ps_reference, class_scope, status, meta)
SELECT 'wks17-class-6-1a-6-1b-6-1c-8-2a-8',
       COALESCE((SELECT max(revision) FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'), 0) + 1,
       'Check sheet Location Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances', 'Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard', '{}', 'current', '{"contentHash":"c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191","sheet":{"title":"Check sheet Location Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances","evidenceColumnLabel":"Evidence Portfolio","banner":null,"columnHeaders":["Item","Regulation","Action","Records","Comments"],"note":"NB: Non compliances are in red","declaration":"Declaration: I verify that I have examined the evidence and conducted the compliance audit as per Regulation 13.38 of the Health and Safety at Work (Hazardous Substances) Regulations 2017. All photographs in the report were personally taken by me at the specified site on the date of the report, unless stated otherwise within the report (IPS Clause 21(4)).Please note that this audit utilized an iPad and tape measure, with appropriate personal protective equipment worn on-site (IPS Clause 21(1)(d)). The issuance of a compliance certificate has been validated through inquiry, inspection, assessment, or examination, as detailed in this report (IPS Clause 21(1)(e)). In accordance with r.6.22(2) and IPS Clause 23(1), I affirm that I have assessed and found no conflict of interest or reasonably foreseeable conflict of interest in performing my duties as a compliance certifier/proxy. Site Assessor confirmation (Digital signature) IPS Clause 21(5)","documentControl":{"Owner":"BW","Revision":"1","Status":"Current","Date of last revision":"2025-04-25","Frequency of revision":"less than 12 months"},"scopeOfAuthorisation":{"heading":"Scope of Authorisation","text":"Locations where classes 6 or 8 substances are present [Regulation 13.38, Health and Safety at Work (Hazardous Substances) Regulations 2017] Conditions:","confirmation":"I can confirm that I have checked that the certification process has been carried within my scope of authorisation. Site Assessor confirmation (Digital signature) IPS Clause 21(5)"},"reference":"Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard HSW (HS) Regulations of 2017","footer":"Section 2/2"},"sheetByClass":null}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
);
UPDATE checksheet_template
   SET status = 'superseded',
       superseded_by = (SELECT id FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191')
 WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND (meta->>'contentHash') IS DISTINCT FROM 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND status <> 'superseded';

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 1, NULL, 'Requirements specific to class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.9(1)(a)', '13.9(2)', '14.3', '14.4']::text[], NULL, '13.9(1)(a) 13.9(2) 14.3 14.4', NULL, 'If there is a class 6.1A or 6.1B substance or any class 6.1 substance that requires a controlled substance licence, verify that— (a) the substance is under the personal control of a certified handler; or (b) if being applied by aerial application, a pilot with a chemical rating is present; or (c) if the substance is handled by another person who is not a certified handler, the certified handler— (i) is present at the place where the substance is being handled; and (ii) has provided guidance to the person in respect of the handling; and (iii) is available at all times to provide assistance to the person while the substance is being handled by the person; or (d) is secure', 'A record of the following: (a) confirmation of the need for a controlled substance licence: (b) the names of the certified handlers and their certificate numbers: (c) the certificate expiry dates: (d) the procedure(s) and the guidance that have been provided: (e) details of the secure containment', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 1
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 2, '2', 'Separation of class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '2', ARRAY['13.4']::text[], NULL, '13.4', NULL, 'For class 6.1A, 6.1B, or 6.1C substances, verify that if an intervening wall is utilised, the requirements prescribed in regulation 13.40 are complied with', 'A record of— (a) the height of the wall in relation to the place being protected and the containers in the store; and (b) the marking indicating the maximum storage height; and (c) the wall FRR', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '3', ARRAY['13.41']::text[], NULL, '13.41', NULL, 'For class 6.1A, 6.1B, or 6.1C substances, verify that the substances and stores meet the prescribed separation distances from protected places', 'A record of the following: (a) the actual and prescribed separation distances: (b) in a retail store, that the containers are closed and do not include class 6.1A substances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '4', ARRAY['13.42']::text[], NULL, '13.42', NULL, 'Minimum separation between public places and hazardous substance locations containing packaged class 6.1 substance. For class 6.1A, 6.1B, or 6.1C substances, verify that— (a) the substances and stores meet the prescribed separation distances from public places; and (b) in a retail store that holds class 6.1B or 6.1C substances for retail sale and the packages remain closed, the minimum separation distance from and within the building is zero', '', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '5', ARRAY['13.43']::text[], NULL, '13.43', NULL, 'Minimum separation between protected places and hazardous substance locations containing packaged class 8.2A or 8.2B substances. For class 8.2A or 8.2B substances, verify that: (a) the substances and stores meet the minimum prescribed separation distances for— (i) stores where containers are opened; and (ii) stores where the containers remain closed; and (b) in any retail store to which the public has access to class 8.2A or 8.2B substances for retail sale, the packages remain closed', 'A record of the following: (a) the actual and prescribed separation distances: (b) in a retail store, that the containers are closed: (c) whether the protected place is on-site and integral: (d) the measures taken to control hazards and minimise risk', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 5, '6', ARRAY['17.28']::text[], NULL, '17.28', NULL, 'Verify that a tank containing a class 6.1A, 6.2B, or 6.1C substance (but not a 6.1D substance for the purposes of this performance standard) that does not have a 2.1.1, 2.1.2, or 3.1 classification meets the minimum prescribed separation distances from a protected place and a public place', 'A record of— (a) the capacity of the tank; and (b) actual and prescribed separation distances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 6, '7', ARRAY['17.29']::text[], NULL, '17.29', NULL, 'Verify that a tank containing a class 8.2A or 8.2B substance that does not have a 2.1.1, 2.1.2, 3.1, 6.1A, 6.2B, or 6.1C classification meets the prescribed separation distances from a protected place or public place', 'A record of— (a) the capacity of the tank; and (b) actual and prescribed separation distances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 3, '3', 'Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances to be segregated from incompatible substances or material'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.29(2)']::text[], NULL, '13.29(2)', NULL, 'Verify whether any substances or materials specified in Schedule 15 of the Regulations which are incompatible with class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances are present', 'A record of the substances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['13.29(1)', '13.29(3)']::text[], NULL, '13.29(1) 13.29(3)', NULL, 'Verify that— (a) the hazardous substances are not in contact with incompatible substances; and (b) containers of incompatible substances are stored separately', 'A record of the means of compliance', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 4, '4', 'Stores for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.35(1)']::text[], NULL, '13.35(1) https://www.worksafe.govt.nz/laws-and-regulations/operational-policy-framework/operational-policies/policy-clarification-class-6-and-8/', 'https://www.worksafe.govt.nz/laws-and-regulations/operational-policy-framework/operational-policies/policy-clarification-class-6-and-8/', 'Verify that a store containing a class 6 or 8', 'A record of— (a) the floor area of the store; and (b) the access for emergency services; and (c) the details of the store; and (d) the number of exits; and (e) any authorisation from WorkSafe; and (f) secondary containment details; and (g) ventilation details; and (h) procedures to minimise stack collapse or damage; and (i) the security; and (j) segregation details; and (k) any sources of heat', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['13.35(1)']::text[], NULL, '13.35(1)', NULL, 'Verify that a store containing a class 6 or 8 substance (or both) and which is opened is also compliant with the additional prescribed requirements', 'A record of— (a) shower and eyewash facilities, including the name plate; and (b) shower and eyewash facilities having been tested; and (c) hand-washing facilities', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 5, '5', 'Indoor storage cabinets for class 6.1A, 6.1B, and 6.1C substances'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.36(1)']::text[], NULL, '13.36(1)', NULL, 'For each hazardous substance location that is an indoor storage cabinet for class 6.1A, 6.1B, or 6.1C substances referred to in regulation 13.34(1), verify that the cabinet is— (a) compliant; and (b) located in accordance with the prescribed requirements; and (c) marked as prescribed', 'A record of— (a) the location of the cabinet; and (b) the plate of the cabinet; and (c) the markings of the cabinet; and (d) the quantities in the cabinet', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['13.36(1)']::text[], NULL, '13.36(1)', NULL, 'Verify that— (a) there are no incompatibles inside the cabinet; and (b) there is a nearby source of water for hand-washing', 'A confirmatory record', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 6, '6', 'Indoor storage cabinets for class 8.2A and 8.2B substances'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.37(1)']::text[], NULL, '13.37(1)', NULL, 'For each hazardous substance location that is an indoor storage cabinet for a class 8.2A or 8.2B substance (or both) referred to in regulation 13.34(1), verify that the maximum quantity of hazardous substance is not exceeded, and the cabinet is— (a) compliant; and (b) located in accordance with the prescribed requirements; and (c) marked as prescribed', 'A record of— (a) the location of the cabinet; and (b) the plate of the cabinet; and (c) the markings of the cabinet; and (d) the quantities in the cabinet', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['13.37(1)']::text[], NULL, '13.37(1)', NULL, 'Verify that— (a) there are no incompatibles inside the cabinet; and (b) there is a nearby source of water for hand-washing', 'A confirmatory record', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 7, '7', 'Fixed structures to be compatible'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.39(g)']::text[], NULL, '13.39(g)', NULL, 'Verify that any fixed structure or installed equipment is constructed of compatible material and is not an ignition source', 'A record of the general nature of the structures or installed equipment', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 8, '8', 'Equipment and PPE for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.7']::text[], NULL, '13.7', NULL, 'Verify that when a class 6 or 8 substance is being used at a hazardous substance location— (a) the equipment used to handle the substance is compliant; and (b) the equipment is accompanied by documentation covering the use and maintenance of the equipment; and (c) the documentation is readily available and understandable; and (d) the workplace has the facilities that are specified in a safe work instrument (if applicable)', 'A record of— (a) the equipment and the state of it; and (b) either the documentation or a note referencing the documentation; and (c) the use and maintenance of the equipment; and (d) the facilities', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 8
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 9, '9', 'Clean-up materials and equipment for class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'
FROM checksheet_template WHERE code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.45']::text[], NULL, '13.45', NULL, 'Verify that equipment, materials, and chemicals are available', 'Records of— (a) the nature of the equipment, materials, and chemicals; and (b) where they are located', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-class-6-1a-6-1b-6-1c-8-2a-8' AND t.meta->>'contentHash' = 'c5a51934b786b6adef9de2c1ab0301a02d2d5acbcfe86ce0ea214f98dcd25191' AND sec.ordinal = 9
ON CONFLICT (section_id, ordinal) DO NOTHING;

-- wks17-general — 8 sections, 36 items — content e0ba9e091125
INSERT INTO checksheet_template (code, revision, title, ps_reference, class_scope, status, meta)
SELECT 'wks17-general',
       COALESCE((SELECT max(revision) FROM checksheet_template WHERE code = 'wks17-general'), 0) + 1,
       'General location requirements', 'Health and Safety at Work (Hazardous Substances—Location Compliance Certification for Classes 2 to 6, and 8) Performance Standard', '{}', 'current', '{"contentHash":"e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452","sheet":{"title":null,"evidenceColumnLabel":"Evidence Portfolio","banner":null,"columnHeaders":["Item","Regulation","Action","Records","Comments"],"note":"NB: Non compliances are in red","declaration":null,"documentControl":null,"scopeOfAuthorisation":null,"reference":null,"footer":"Section 1/2"},"sheetByClass":{"class_6_8":{"title":"Check sheet Location Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances","banner":"General location requirements specific to Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances","declaration":"Declaration: I verify that I have examined the evidence and conducted the compliance audit as per Regulation 13.38 of the Health and Safety at Work (Hazardous Substances) Regulations 2017. All photographs in the report were personally taken by me at the specified site on the date of the report, unless stated otherwise within the report (IPS Clause 21(4)).Please note that this audit utilized an iPad and tape measure, with appropriate personal protective equipment worn on-site (IPS Clause 21(1)(d)). The issuance of a compliance certificate has been validated through inquiry, inspection, assessment, or examination, as detailed in this report (IPS Clause 21(1)(e)). In accordance with r.6.22(2) and IPS Clause 23(1), I affirm that I have assessed and found no conflict of interest or reasonably foreseeable conflict of interest in performing my duties as a compliance certifier/proxy. Site Assessor confirmation (Digital signature) IPS Clause 21(5)"},"class_2_3":{"title":"Requirements for Class 2 and 3.1","banner":null,"declaration":"Declaration: I verify that I have examined the evidence and conducted the compliance audit as per Regulation 17.91 of the Health and Safety at Work (Hazardous Substances) Regulations 2017. All photographs in the report were personally taken by me at the specified site on the date of the report, unless stated otherwise within the report (IPS Clause 21(4)).Please note that this audit utilized an iPad and tape measure, with appropriate personal protective equipment worn on-site (IPS Clause 21(1)(d)). The issuance of a compliance certificate has been validated through inquiry, inspection, assessment, or examination, as detailed in this report (IPS Clause 21(1)(e)). In accordance with r.6.22(2) and IPS Clause 23(1), I affirm that I have assessed and found no conflict of interest or reasonably foreseeable conflict of interest in performing my duties as a compliance certifier/proxy. Site Assessor confirmation (Digital signature) IPS Clause 21(5)"}}}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
);
UPDATE checksheet_template
   SET status = 'superseded',
       superseded_by = (SELECT id FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452')
 WHERE code = 'wks17-general' AND (meta->>'contentHash') IS DISTINCT FROM 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND status <> 'superseded';

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 1, '1', 'Determining which regulations apply'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['10.34']::text[], '{"class_6_8":["10.34","10.36","12.17","12.42","13.38"],"class_2_3":["10.34"]}'::jsonb, '10.34 10.36 12.17 12.42 13.38', NULL, 'Verify that the hazardous substances are present at the site— (a) in quantities exceeding the threshold quantities specified in the Regulations for the hazardous substances; and (b) for periods of time that trigger the relevant requirement to establish a hazardous substance location under the Regulations', 'A record of— (a) the maximum quantities of the hazardous substances, identified by subclass; and (b) the thresholds that are exceeded', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 1
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', '{}', NULL, 'All', NULL, 'Ascertain— (a) whether the PCBU has been granted any exemption or approval that is relevant to the hazardous substance location; and (b) the extent of the exemption or approval including any conditions; and (c) whether any provisions of Schedule 1 (Transitional, Savings, and related provisions) of the Regulations apply', 'A copy of the exemption or approval A note recording the provisions of Schedule 1 of the Regulations that apply (if any)', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 1
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 2, '2', 'Notification requirements'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.34(4)']::text[], NULL, '13.34(4)', NULL, 'Verify— (a) either— (i) the notification that has been made; or (ii) the most recent location compliance certificate; and (b) the details of the notification or the most recent location compliance certificate including: (i) the name of the company and the PCBU; and (ii) the street address of the workplace; and (c) either— (i) that the maximum quantity and classification of hazardous substances held are consistent with the notification or most recent location compliance certificate; or (ii) if the quantity of hazardous substances held exceeds the quantity notified or set out in the location compliance certificate, that a new notification has been made', 'A record of— (a) either— (i) the notification; or (ii) the location compliance certificate; or (iii) a unique reference to identify the notification or certificate; and (b) the quantities notified for each relevant class of substance; and (c) the quantities present', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 2
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 3, '3', 'Information, instruction, and training'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['4.5']::text[], NULL, '4.5', NULL, 'Verify that there is a process for each worker to receive relevant information and training', 'A record of the process', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['4.5(2)']::text[], NULL, '4.5(2)', NULL, 'Verify that the requirement to provide information to workers is met', 'A sample record of the worker’s instruction and training or a reference to the worker’s instruction and training', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['4.5(5)']::text[], NULL, '4.5(5)', NULL, 'Verify that there is a record of the training and instruction referred to in regulation 4.5(3) for each worker and that this record is available for inspection', 'A sample record of the worker’s instruction and training or a reference to the worker’s instruction and training', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['4.5(6)']::text[], NULL, '4.5(6)', NULL, 'Verify that where information, instruction, and training were not required for a worker, the PCBU can demonstrate that the worker’s previous experience is equivalent', 'A record of the process the PCBU followed, a sample of one of the records obtained from the PCBU, or a reference to the process or record', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 3
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 4, '4', 'Signage'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['2.5(1)']::text[], NULL, '2.5(1)', NULL, 'Determine whether signs are required', 'A record of the quantities present, as compared to the threshold quantities', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['2.5(2)']::text[], NULL, '2.5(2)', NULL, 'Verify that the signs are compliant', 'Photographs of the signs', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['2.6(1)']::text[], NULL, '2.6(1)', NULL, 'Verify that compliant signage is positioned at all required entrances to the building and land', 'A record of required entrances to the building and land or marked up plan Photographs of the signs if practical. The photographs must include sufficient landscape details to confirm the location. If photographs are not practical, a note confirming compliance', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['2.6(3)']::text[], NULL, '2.6(3)', NULL, 'Verify that compliant signage is displayed at each required room or compartment entrance', 'A list of all rooms or a marked-up plan Photographs of the signs if practical If photographs are not practical, a note confirming compliance', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 5, '5', ARRAY['2.6(4)']::text[], NULL, '2.6(4)', NULL, 'Verify that compliant signage is displayed immediately next to each outdoor area', 'A list of all outdoor areas or a marked-up plan Photographs of the signs if practical If photographs are not practical, a note confirming compliance', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 4
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 5, '5', 'Fire extinguishers'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['5.3(1)']::text[], NULL, '5.3(1)', NULL, 'Determine whether fire extinguishers are required', 'A record of the quantities present, as compared to the threshold quantities', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['5.3(1)']::text[], NULL, '5.3(1)', NULL, 'Verify that the correct numbers of fire extinguishers are present', 'A record of the following: (a) the required extinguishers: (b) confirmation that the extinguishers are in place by marking up the plan, making a note, or similar: (c) the test dates of all required extinguishers', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['5.4(1)']::text[], NULL, '5.4(1)', NULL, 'Verify that the fire extinguishers are clearly visible and readily accessible in an emergency', 'A record of proximity, visibility, and accessibility of fire extinguishers to the hazardous substance location', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['5.5']::text[], NULL, '5.5', NULL, 'Verify the capability of the fire extinguishers', 'A record of the ratings of sample extinguishers or hose diameter of a hydrant system', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 5
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 6, '6', 'Emergency response plans (ERP)'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['5.6(1)']::text[], NULL, '5.6(1)', NULL, 'Determine whether an ERP is required', 'A record of the quantities present, as compared to the threshold quantities', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['5.7(2)']::text[], NULL, '5.7(2)', NULL, 'Verify that the ERP describes all emergencies that are reasonably foreseeable', 'A copy of the ERP or sections of it', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['5.7(3)(a)']::text[], NULL, '5.7(3)(a)', NULL, 'Verify that the ERP describes the actions to be taken', 'A copy of the ERP, sections of it, or a reference to it', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['5.7(3)(b)']::text[], NULL, '5.7(3)(b)', NULL, 'Verify that the ERP identifies each person with responsibility and gives the required information', 'A copy of the ERP, sections of it, or a reference to it', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 5, '5', ARRAY['5.7(3)(c)']::text[], NULL, '5.7(3)(c)', NULL, 'Verify that the ERP specifies the prescribed actions', 'A copy of the ERP, sections of it, or a reference to it', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 6, '6', ARRAY['5.7(3)(d)']::text[], NULL, '5.7(3)(d)', NULL, 'Verify that the ERP provides an inventory and compliant site plan', 'A copy of the ERP, sections of it, or a reference to it', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 7, '7', ARRAY['5.7(4)']::text[], NULL, '5.7(4)', NULL, 'Verify that the ERP— (a) specifies the required extra information for emergencies involving a fire; and (b) provides for retention of liquid or liquid oxidising substance or organic peroxide present', 'A copy of the ERP, sections of it, or a reference to it', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 8, '8', ARRAY['5.8']::text[], NULL, '5.8', NULL, 'The ERP is implemented in the event of an emergency', 'A record of the implementation of it for events during the previous 12 months (if applicable)', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 9, '9', ARRAY['5.9']::text[], NULL, '5.9', NULL, 'Verify that all equipment, materials, and responsible people are available within the times specified in the ERP', 'A note of the sampling or a record of the tests carried out', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 10, '10', ARRAY['5.10']::text[], NULL, '5.10', NULL, 'Verify that the PCBU is able to confirm the plan is available to every person responsible for executing any part of the plan and emergency service providers identified in the plan', 'A note recording how the plan has been made available A reference to its location', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 11, '11', ARRAY['5.11']::text[], NULL, '5.11', NULL, 'Verify that if Fire and Emergency New Zealand (FENZ) has been given the opportunity to review the ERP, any recommendations have been given consideration by the PCBU', 'A record of advice to FENZ and a note of any recommendations from FENZ', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 12, '12', ARRAY['5.12']::text[], NULL, '5.12', NULL, 'Verify the ERP has been tested, that new persons are competent, that new procedures are workable, and that records of the tests are held', 'A reference to the tests and actions taken A record of the PCBU records', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 6
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 7, '7', 'Secondary containment'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.3']::text[], NULL, '13.3', NULL, 'Determine whether secondary containment is required', 'A record of— (a) the quantities present as compared to the threshold quantities; and (b) the minimum time periods the substances are present', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['10.31', '10.32', '10.33']::text[], '{"class_6_8":["10.31","10.32","10.33","12.14","12.15","12.16","12.39","12.40","12.41","13.31","13.32","13.33","17.100","17.101"],"class_2_3":["10.31","10.32","10.33"]}'::jsonb, '10.31 10.32 10.33 12.14 12.15 12.16 12.39 12.40 12.41 13.31 13.32 13.33 17.100 17.101', NULL, 'Verify that— (a) the capacity of the secondary containment system is at least as great as the prescribed minimum; and (b) the capacity of the secondary containment system for stationary tanks and process containers is based on the water capacity of the tank or process container; and (c) the secondary containment will contain the substance without leakage and will enable recovery of the substance; and (d) there are controls to prevent contamination by incompatible substances or material For class 6 and 8 substances, verify that there are controls to prevent people from being directly exposed to any toxic or biological corrosive substances contained in the secondary containment system', 'A record of— (a) the maximum pooling capacity; and (b) the prescribed capacity of the secondary containment; and (c) the actual capacity of the secondary containment; and (d) the nature of the construction; and (e) the impervious nature of the secondary containment system, including tests and inspections undertaken on it; and (f) the process to recover the substances; and (g) for class 3, 4, or 5 substances, controls that prevent ignition; and (h) for toxic or biological corrosive substances, controls that prevent people from being directly exposed e.g. signage, site induction instructions; and (i) controls that prevent the substance from being contaminated with incompatible substances', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 3, '3', ARRAY['10.30', '12.13', '12.38', '13.30']::text[], NULL, '10.30 12.13 12.38 13.30', NULL, 'If containers of different capacities are held at the place, verify that the secondary containment system has a capacity of at least the sum of each individual container category', 'A record to confirm that either— (a) containers of different sizes are not held at one place; or (b) if they are held, the secondary containment capacity is at least the sum of each individual container capacity', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 4, '4', ARRAY['10.30', '12.13', '12.38', '13.30']::text[], NULL, '10.30 12.13 12.38 13.30', NULL, 'Verify that the secondary containment is able to contain the leaked hazardous substance', 'A record of one of the results of the verification. This can include: (a) for an above ground tank with integral secondary containment, no evidence of leakage into or from the interstitial space: (b) for a below ground tank with secondary containment, no evidence of leakage into or from the interstitial space: (c) for a below ground tank, no evidence of losses from the stock reconciliation records: (d) for a single skin above ground tank with a capacity of 250,000 L or greater, evidence of flood test: (e) for a single skin above ground tank with a capacity of up to 250,000 L, either the results of a technical inspection or a flood test: (f) the distance between the tank and the inside of the bund wall, including whether the distance is sufficient to enable leaks to fall inside the bund', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 5, '6', ARRAY['17.102(4)', '17.102(5)']::text[], NULL, '17.102(4) 17.102(5)', NULL, 'Verify that the aggregate capacity of any group of stationary tanks does not exceed 25,000,000 L unless a greater amount is approved by WorkSafe', 'A record of the quantity in each group of tanks and a reference to any approval by WorkSafe', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 6, '7', ARRAY['17.102(6)', '17.102(7)']::text[], NULL, '17.102(6)) 17.102(7)', NULL, 'Verify that any intermediate secondary containment system is compliant', 'A record of the details of the secondary containment system', false
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 7
ON CONFLICT (section_id, ordinal) DO NOTHING;

INSERT INTO checksheet_section (template_id, ordinal, number, title)
SELECT id, 8, '8', 'Site Plan'
FROM checksheet_template WHERE code = 'wks17-general' AND meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452'
ON CONFLICT (template_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 1, '1', ARRAY['13.34(5)(b)']::text[], NULL, '13.34(5)(b)', NULL, 'Verify that the site plan— (a) is of the relevant place and is specific to that place; and (b) is accurate and includes all prescribed information', 'A copy of the site plan, including: (a) the dimensions in relation to the site boundary: (b) a north point accurately orientated: (c) hazardous substance locations: (d) hazardous areas: (e) separation distances from protected places and public places, if prescribed: (f) relevant controlled zone distances', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 8
ON CONFLICT (section_id, ordinal) DO NOTHING;
INSERT INTO checksheet_item (section_id, ordinal, number, regulation_refs, regulation_refs_by_class, regulation_raw, guidance_url, action, records, evidence_required)
SELECT sec.id, 2, '2', ARRAY['13.34(5)(b)']::text[], NULL, '13.34(5)(b)', NULL, 'Verify that the site plan has sufficient detail to determine its purpose', 'A copy of the site plan, including: (a) the scale that enables the plan to meet its purpose: (b) where relevant, elevation drawings: (c) where relevant, a legend or key that defines colours, shaded areas, symbols, abbreviations, etc.: (d) if relevant, and the scale and complexity of the workplace so demand, separate drawings provided to meet the purpose', true
FROM checksheet_section sec
JOIN checksheet_template t ON t.id = sec.template_id
WHERE t.code = 'wks17-general' AND t.meta->>'contentHash' = 'e0ba9e091125f1203f1db7197244e43ab2914db1343ea5b7172358b550617452' AND sec.ordinal = 8
ON CONFLICT (section_id, ordinal) DO NOTHING;

COMMIT;