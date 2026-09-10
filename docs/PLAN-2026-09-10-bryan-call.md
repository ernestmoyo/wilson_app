# Update plan from the Bryan call, 10 September 2026

Source: Recording (326).m4a, 18 min 44 s, transcribed locally (Whisper large-v3,
English pass plus a Shona-forced pass for the code-switched spans). The English
passages are near-verbatim; the Shona passages are approximate. Everything after
15:32 is unrelated audio (a broadcast, then a new call) and is ignored.

## What was asked for, and by whom

| # | Ask | Who | Evidence in the recording |
|---|---|---|---|
| 1 | Hard copy of the certificate: download and print | Bryan | 0:00 "Can I have a hard copy?" / "you can manually download" |
| 2 | A printable list of non-compliances to send to the client | Bryan | 1:30 "Can I print out a list of non-compliance they send out to me?" |
| 3 | A dashboard on login: live activity, historical jobs loaded, reminders for periodic and ad hoc tasks | Ernest (Bryan agreed) | 2:08 to 2:33 |
| 4 | Audit trail of who entered what; access control on who may do what | Both | 3:07 "audit trail to know who has entered what", 3:26 "access control to know who has the limits to do what" |
| 5 | Other check sheets in the same app: cylinders, tanks / stationary containers, pressure vessels, engineering check sheets, design verification, NDT, "5 or 6 sheets", plus class sheets for industrial chemicals | Bryan | 4:22 to 4:43, 4:52 to 5:06, 6:14 to 6:55 |
| 6 | Name check sheets by what they are, not "6.1.1.1"; pick the right sheet per job | Ernest | 5:58 to 6:13, 8:06 to 8:20 |
| 7 | Click the logo to go home; back must return where you came from; neat navigation; see jobs and certification status at a glance | Ernest | 7:40 to 8:06 |
| 8 | Roles: Bryan is the only compliance certifier (final decision, issues the certificate). Others can upload documents, do document and register reviews, mark compliant / non-compliant with comments, but cannot decide. Use dummy role emails for now | Bryan | 10:37 to 12:39 |
| 9 | Emails tied to the system so automatic sends (certificate to client) go to the right place; test with own emails and a dummy client first | Ernest | 13:28 to 13:51 |
| 10 | Certificate: keep it to confirming compliance for now; a unique Assure Safety watermark on the back is an option, Bryan's call | Both | 13:55 to 14:20, 15:09 "limit the issue of confirming compliance only, for now" |
| 11 | Hosting on DigitalOcean; Bryan can use the platform for a week's assessment first | Ernest | 0:15 to 0:43 (Shona, approximate) |

## The plan, in loops

Each loop is one deploy with tests, in the order that needs the least from Bryan first.

### Loop 1: navigation and dashboard (no input needed)
- Logo tap goes to the jobs board from anywhere; back returns to the screen you came from; the Job / Jobs actions stay.
- Board becomes the dashboard: an activity strip (last 20 events across jobs, who and when, from the event log), reminders (certificate expiry minus 6 months, RFI waiting more than 7 days, corrective actions past due), and the existing job cards.
- Historical jobs: a "Load from workbook" path that reads an existing check sheet workbook into a job, using the extractor already in packages/checksheets. Needs Bryan's past workbooks to test beyond G2.

### Loop 2: paper out (no input needed except an email sender)
- Non-compliance report: one page per job listing every non-compliant item with its reason, corrective action, severity and due date, in the workbook's wording, with the letterhead. Print from the browser or save as PDF.
- Certificate as PDF: same renderer, "Download PDF" on the certificate card.
- Send to client: email the certificate or the non-compliance report to the site manager from a fixed sender. Needs one decision: the sender address (for example certificates@assuresafety.co.nz) and which provider; until then, sends go to dummy addresses in a test client.

### Loop 3: roles and audit (needs Bryan's role names)
- Roles on app_user: certifier (Bryan: everything, the only one who can issue), reviewer (upload documents, document and register review, mark items compliant / non-compliant with comments, raise corrective actions; cannot sign the declaration, cannot issue), viewer (read only, for a client contact later).
- Server enforces it: the issuance route, inspection.sign and job.transition to certificate_issued require the certifier role.
- Audit on screen: the hub's History card shows every event with the person's name, not just stage moves. The hash-chained event log already holds it.
- Sign-in per person: passcodes per user, dummy role addresses now (reviewer@assuresafety.co.nz style), real ones when Bryan confirms.

### Loop 4: more check sheets (needs Bryan's files)
- Bryan sends the cylinder, tank / stationary container, pressure vessel, engineering, design verification and NDT workbooks, and the class sheets for industrial chemicals.
- Each goes through the same extract, reconcile, generate pipeline; each gets a plain name (Cylinders, Stationary containers, Class 2 and 3.1, and so on) and a code.
- New job asks which sheet set applies; the sheet screen already handles any template set.
- Scope stays "confirm compliance" per Bryan; no new decision types.

### Loop 5: DigitalOcean (needs an account decision)
- App Platform for the server, Managed Postgres (Sydney), Spaces with object lock for evidence, nightly backups, a domain under assuresafety.co.nz.
- Move: dump Neon, restore to DO, point DATABASE_URL, copy Blob objects to Spaces, redeploy. The code needs no change; the server runs from `node apps/server/src/index.mjs`.
- Vercel stays as the demo for the week's assessment; the switch is one DNS change when ready.

### Loop 6: certificate polish (Bryan's call)
- Optional watermark on the certificate back; only if Bryan wants it. Everything else on the certificate stays as the workbook has it.

## Questions for Bryan (short)
1. Role names and who fills them, or "reviewer" and "certifier" for now.
2. The check sheet workbooks listed in loop 4.
3. Sender address for automatic emails, and whether a client should receive the non-compliance list directly or only via Bryan.
4. Watermark on the certificate: yes or no.
5. DigitalOcean: region Sydney, and who owns the account.
