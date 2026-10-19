# UX research: field inspection and compliance platforms (2026-10-19)

**Scope:** what Assure Safety Field can borrow from leading field-inspection, job-pipeline, admin and government design systems. This is web research only and no code has changed. Effort is relative to our Flutter app: **S** is under a day, **M** is 1–3 days, **L** is a week or more.

Screens referenced: **Board** (clients/jobs board), **Job** (stage view), **Sheet** (check sheet table), **Item** (answer + evidence), **Review**, **Issue** (certificate issue/email).

---

## 1. Inspection answering speed

| Pattern | From | Solves | Maps onto us | Effort |
|---|---|---|---|---|
| **Response-set chips, one tap** | SafetyCulture response sets with per-option "flagged" marking ([help 000029](https://help.safetyculture.com/000029)) | Answering takes a picker plus a confirm | Each Sheet row shows three large segmented chips, **C / NC / N/A**, inline. One tap saves. NC is the "flagged" response and opens the Item comment field automatically. | S |
| **Failure prompts follow-up** | Procore: a deficient or failed item prompts you to create an observation ([Procore Android inspections](https://support.procore.com/procore-mobile-android/user-guide/inspections-android)) | Findings lose their corrective action | When an item is NC, open an inline "Corrective action required" card with comment and photo. It feeds the Job's gap-closure stage. | M |
| **Sticky progress plus "next unanswered"** | SafetyCulture inspection header and Fulcrum's required-field navigation | Long sheets, lost place | A sticky Sheet header reads "42 / 118 answered · 3 findings", with a **Next unanswered** button (`N` key on desktop). Each section header shows its own counter. | S |
| **Bulk N/A per section** | Common in SafetyCulture and GoCanvas templates | Whole sections don't apply (wrong class) | The section header menu has "Mark remaining N/A", with an undo snackbar. This sits alongside our class-view filter. | S |
| **Swipe to answer (optional)** | Mail-style swipe on iOS; some GoCanvas forms | Fast one-handed use on a phone | Swipe right for C and left for NC, only at compact width. On iPad keep the chips, because gloves make swipes unreliable. | M |
| **Keyboard-first desktop** | Linear: Cmd/Ctrl+K command menu, single-key actions, `Cmd+/` lists shortcuts ([Linear guide](https://linear.app/enablement/guide/navigating-linear)) | Office review is mouse-heavy | On desktop web: `J`/`K` move between rows, `1`/`2`/`3` set C/NC/N/A, `C` opens the comment, `Ctrl+K` jumps to a job or client. | M |

## 2. Multi-stage process (task list / stepper)

| Pattern | From | Solves | Maps onto us | Effort |
|---|---|---|---|---|
| **Task list with status tags** | GOV.UK "Complete multiple tasks" pattern and task list component. Since Dec 2023 the whole row is clickable, tags are sentence case and hint text is allowed ([GOV.UK task list](https://design-system.service.gov.uk/components/task-list/), [design notes](https://designnotes.blog.gov.uk/2023/12/15/working-as-a-community-to-iterate-the-task-list-pattern/)) | Users can't see where a job stands or what blocks issue | The Job page becomes a task list: Enquiry → Quote → Site inspection → Review → Gap closure → Certificate issue → WorkSafe register. Each row carries a tag (Not started / In progress / Needs action / Done / Cannot start yet) and a one-line hint, for example "3 findings open". | M |
| **Pipeline columns** | Jobber's request → quote → job → invoice flow ([Jobber work](https://help.getjobber.com/hc/en-us/articles/360019766773)) and the ServiceTitan job board | Seeing every job's stage at once | On the Board, add a toggle between "by client" (current) and "by stage" (columns or grouped list). Keep the list as the default on iPad. | M |
| **Check answers before commit** | GOV.UK "Check answers" built on a summary list with per-row Change links ([pattern](https://design-system.service.gov.uk/patterns/check-answers/)) | Issuing a certificate with missing data | The Issue step shows a summary of client, location, classes, quantities, findings closed, reviewer and expiry. Each row has a Change link, and issue stays blocked while any row is red. This mirrors the existing issuance check. | S |

## 3. Status colour that is not colour-only

WCAG 1.4.1 requires that colour not be the only way information is conveyed ([Understanding 1.4.1](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html)). Fulcrum's recent redesign of its record status indicators pairs each status with a label and an icon ([changelog](https://feedback.fulcrumapp.com/changelog/ios-release-260430-1)).

- **Pattern: icon + word + tint.** Compliant uses ✓ and "Compliant" on a green tint. Non-compliant uses ⚠ / ✕ and "Finding" on a red tint. N/A uses a dash and "N/A" on grey. General comment uses a speech-bubble icon on blue. Wherever space allows, use the full word (sheet, review, PDF). Where it doesn't, use the letter plus the icon.
- **Maps to:** Sheet chips, Item header, Review list, the certificate PDF's findings table (which also prints in black and white), and Board job badges.
- **Effort:** S.

## 4. Offline and sync indicators

| Pattern | From | Maps onto us | Effort |
|---|---|---|---|
| **Per-record sync state** (unsynced / draft / failed / attachment issue) | Fulcrum, which auto-syncs on save and launch and keeps unsynced data on clearing ([how syncing works](https://help.fulcrumapp.com/en/articles/8104466-how-does-syncing-on-the-mobile-app-work)) | Each Sheet row and evidence thumbnail gets a small cloud glyph while its sync event is pending, and a red "Not sent, tap to retry" if it was rejected. Rejections already carry a clause, so show that clause. | M |
| **Global connection pill** | Procore and Fulcrum offline modes ([Procore deficiency list](https://www.procore.com/en-ca/project-management/deficiency-list)) | The app bar shows "Offline · 7 changes waiting" or "All changes saved 10:42". Tapping it opens a queue list. It never blocks entry. | S |
| **Upload queue for evidence** | SafetyCulture and Procore media | Photos appear instantly from local storage, with a progress ring until the blob upload completes. | M |

## 5. Evidence capture and annotation

- **Multi-shot camera, annotate before attach.** SafetyCulture's in-app camera takes several photos in a row, and its annotation tools are arrow, oval, rectangle and text ([annotate](https://help.safetyculture.com/003414), [camera setting](https://help.safetyculture.com/en-US/001588/)). For the Item screen, the camera stays open for multiple shots. A thumbnail strip then lets the user tap a photo to annotate it with an arrow, circle or text, with a red default to match "finding". Each photo is stamped with time, job reference and item reference. **M–L**
- **Pin evidence to the item, not the job.** Autodesk Build/PlanGrid ties issues to locations on sheets ([Autodesk Build](https://construction.autodesk.com/products/autodesk-build/)). For us, evidence belongs to a check-sheet item, with job-level "site photos" as a separate group. The Review screen can then show a finding beside its photo. **S**
- **PDF evidence preview inline.** For SDS sheets and Test Certificates, show the first page as a thumbnail rather than a file icon. **S**

## 6. Review and comment threads

- **Threaded comments on the item, with resolve.** Procore keeps a change history on each inspection item, and Vercel and Notion use resolvable comment threads. For Review, the reviewer comments on an item and Bryan replies or changes the answer. The reviewer marks the thread resolved, and the audit trail (sync_event) shows who did what. **M**
- **Review as a filtered queue.** Linear's inbox, Stripe's "needs review" lists. Review opens to "Findings (5) · Comments (12) · Changed since last review (3)". Each opens a list-detail view of the items. **M**
- **Diff "changed since review".** Highlight answers edited after the reviewer last looked. This is high value for a peer-review audit. **M**

## 7. Document preview before send

- **Preview, then send, in one sheet.** This follows Stripe's invoice preview and the GOV.UK check-answers flow. The Issue screen shows the generated certificate PDF on the left, with recipients, subject, message and attachments (certificate plus check sheet) on the right. The primary button names what it does: "Issue and email certificate". A confirmation receipt then shows the certificate number and the 10-year retention date. **M**
- **Draft watermark.** Any PDF rendered before issue carries a "DRAFT – not a certificate" watermark. **S**

## 8. Empty states

Every empty state does three things: it says what goes here, why it's empty, and offers one primary action. Examples are "No jobs for this client yet · New job", "Nothing waiting for review. Nice." and "No evidence yet · Take photo". This approach follows GOV.UK plain language and Stripe's empty tables. **S**

## 9. Dashboard "needs attention"

Stripe and Vercel open with a short list of actionable items before any metrics ([Stripe Dashboard](https://docs.stripe.com/dashboard/basics), [Vercel Geist](https://vercel.com/geist)). The top of our Board would be a "Needs attention" strip with:

- reviews waiting
- findings open longer than 14 days
- certificates expiring within 60 days
- sync failures
- jobs stuck in a stage

Each line shows a count and opens a filtered list. Metrics come below or not at all. **M**

## 10. Navigation: rail and list-detail on iPad

- **Material 3 canonical layouts.** List-detail uses a fixed-width list and a flexible detail pane. Window size classes break at 600 dp and 840 dp, and the rail replaces the bottom bar on wider windows ([Android large screens](https://developer.android.com/design/ui/large-screens), [M3 layout](https://m3.material.io/foundations/layout/canonical-layouts/list-detail)). Flutter has `NavigationRail` built in.
- **Apple HIG sidebars.** A sidebar lists the top-level areas in the primary pane. Apple advises no more than two levels, keeping it visible by default, and using a tab bar on compact widths ([HIG sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)).
- **Maps to:**
  - At 840 dp or wider, a rail holds Clients, Review, People and Settings.
  - On the Board, the client list sits on the left and that client's jobs on the right.
  - In the Sheet, the section list sits on the left (with counters) and that section's items on the right. Tapping an item opens the Item as a side sheet.
  - Under 600 dp, the layout collapses to stacked pages with bottom tabs.
- **Effort:** L overall, but it can be staged (rail first: S).

## 11. Typography and density for regulatory tables

- **Tabular figures and a mono face for references.** Geist pairs a sans for UI with a mono for technical labels ([Geist](https://vercel.com/geist)). For us, regulation clauses ("r 10.30(2)"), LCC numbers and certificate numbers use a mono or tabular face so they align and read as references.
- **Two densities.** Use "Field" density (56 px rows, 48 px targets, for gloves) on iPad, and "Office" density (40 px rows) on desktop, chosen automatically by pointer type and overridable in Settings.
- **Table anatomy.** Each row reads, left to right: reference (mono, muted), requirement text (2-line clamp, tap to expand), answer chips, then comment and evidence indicators. Zebra striping is off, with hairline dividers. Section headers stay sticky.
- **Effort:** M.

## 12. Brand trust signals for a compliance business

These follow GOV.UK and NZGDS restraint: plain language, WCAG 2.1 components and accessibility first ([NZGDS](https://digital.govt.nz/standards-and-guidance/design-and-ux/new-zealand-government-design-system)).

- Show the certifier's credential ("LCC TST100250") in the app footer, on PDFs and in emails.
- Cite regulation names exactly (HSW (Hazardous Substances) Regulations 2017).
- Add an "Issued by / Reviewed by / date" block and a verification line (certificate number with a lookup) on every certificate.
- Use a calm navy primary, with no gradients or stock imagery.
- Cite clauses in plain language: "Why this matters" sits next to the clause.

**Effort:** S.

---

## Recommended design direction

### Principles
1. **One tap in the field, one key in the office.** Every frequent action is a single large target on iPad and a single shortcut on desktop.
2. **Status is a word first, then colour.** Every state has a label and icon, with colour reinforcing it, and it survives a black-and-white print of the PDF.
3. **Never lose, never block.** Saving is local and immediate, sync is visible but quiet, and rejections explain the clause.

### Type scale (Inter or system sans; mono: JetBrains Mono or Geist Mono)
| Token | Size / line | Use |
|---|---|---|
| display | 28/34 semibold | Job title, certificate number |
| title | 20/28 semibold | Screen and section titles |
| heading | 16/24 semibold | Card and group headers |
| body | 15/22 regular | Requirement text, comments |
| body-sm | 13/18 regular | Hints, metadata |
| label | 12/16 medium, +0.2 tracking | Tags, chips, table headers |
| ref-mono | 13/18 mono, tabular | Clause refs, cert/LCC numbers |

### Spacing scale (4-point)
`2, 4, 8, 12, 16, 24, 32, 48, 64`. Row height is 56 (Field) or 40 (Office). The minimum touch target is 48 in Field density (Apple suggests 44 pt, so 48 adds headroom for gloves). Gutters are 16 on phones and 24 on iPad and desktop.

### Colour tokens (light; dark mode mirrors with lifted tints)
| Token | Value | Pairing |
|---|---|---|
| `brand.primary` | #1F3A5F navy | Buttons, rail selection |
| `surface` / `surface.alt` | #FFFFFF / #F6F7F9 | Background / table header |
| `text` / `text.muted` | #14171C / #5B6472 | — |
| `status.compliant` fg/bg | #1E7B3A / #E6F4EA | ✓ "Compliant" |
| `status.finding` fg/bg | #B42318 / #FDECEA | ⚠ "Finding" / "Non-compliant" |
| `status.na` fg/bg | #5B6472 / #EEF0F3 | — "N/A" |
| `status.comment` fg/bg | #1D5FBF / #E8F0FC | speech bubble "General comment" |
| `status.pending` fg/bg | #8A5A00 / #FFF4E0 | clock "In progress" / "Waiting" |
| `sync.offline` | #8A5A00 | cloud-off icon + text |
| `focus.ring` | #1D5FBF, 2 px | Keyboard focus |

The foreground colours are chosen to reach at least 4.5:1 on their tints and on white. Verify this with a contrast checker before shipping.

### The 10 highest-value changes (value ÷ effort)
1. One-tap C / NC / N/A chips inline on every Sheet row (S)
2. Icon + word + colour status everywhere, with tokens as above (S)
3. Sticky Sheet progress with "Next unanswered" and section counters (S)
4. Global sync pill ("Offline · 7 waiting" / "All saved") (S)
5. Job page as a GOV.UK-style task list with status tags and hints (M)
6. "Needs attention" strip on the Board (M)
7. NC auto-opens comment and corrective-action card, feeding gap closure (M)
8. Issue screen: check answers, PDF preview and named send button, with a draft watermark (M)
9. Item-level review threads with resolve and "changed since review" (M)
10. Navigation rail plus list-detail on iPad and desktop, with Field/Office density (L, start with the rail)

### Sources
- [SafetyCulture flagged responses](https://help.safetyculture.com/000029) · [SafetyCulture annotate](https://help.safetyculture.com/003414) · [SafetyCulture camera](https://help.safetyculture.com/en-US/001588/)
- [Procore Android inspections](https://support.procore.com/procore-mobile-android/user-guide/inspections-android) · [Procore deficiency list](https://www.procore.com/en-ca/project-management/deficiency-list)
- [Fulcrum syncing](https://help.fulcrumapp.com/en/articles/8104466-how-does-syncing-on-the-mobile-app-work) · [Fulcrum status indicators](https://feedback.fulcrumapp.com/changelog/ios-release-260430-1)
- [Autodesk Build](https://construction.autodesk.com/products/autodesk-build/) · [Jobber work](https://help.getjobber.com/hc/en-us/articles/360019766773)
- [Linear navigation](https://linear.app/enablement/guide/navigating-linear) · [Vercel Geist](https://vercel.com/geist) · [Stripe Dashboard](https://docs.stripe.com/dashboard/basics)
- [GOV.UK task list](https://design-system.service.gov.uk/components/task-list/) · [GOV.UK task list notes](https://designnotes.blog.gov.uk/2023/12/15/working-as-a-community-to-iterate-the-task-list-pattern/) · [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/)
- [NZ Government Design System](https://digital.govt.nz/standards-and-guidance/design-and-ux/new-zealand-government-design-system)
- [Android large screens](https://developer.android.com/design/ui/large-screens) · [M3 list-detail](https://m3.material.io/foundations/layout/canonical-layouts/list-detail) · [Apple HIG sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) · [WCAG 1.4.1](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html)
