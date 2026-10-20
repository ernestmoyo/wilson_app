# Scope choices: where each section sits

`sheet-sets.json` gives a set `choices`, picked at job start. A section listed
under a choice appears only when a choice listing it is picked. A section
listed under no choice always appears. This file records why each section is
where it is, so the owner can check it. Section numbers are the ordinals of
`wks17-class-2-and-3-1-substances` (revision 2).

## Class 2 and 3.1 (`class_2_3`)

The set has no single register entry. Appendix A authorises 2.1.1, 2.1.2 and
3.1 separately, so each choice carries its own entry, and the set counts as
authorised because every choice has one.

| Choice | Register entry | Sections | Why |
|---|---|---|---|
| `2_1_1_gases`: 2.1.1 gases in packages or cylinders, up to 2,000 kg | `location-2-1-1` | 4 permanent gases, 5 liquefiable gases: cylinders, 6 cylinder filling, 23 indoor LPG, propane, butane, isobutane | All four are about 2.1.1 gases. Section 23 (r11.42) is LPG and the like, which are 2.1.1 |
| `2_1_2_aerosols`: aerosols, up to 100,000 L water capacity | `location-2-1-2` | 7 separation of aerosols, 8 up to 10,000 L, 9 10,000 to 100,000 L | The aerosol block (r11.8, 11.23 to 11.26) |
| `3_1_cabinet`: packages in cabinets | `location-3-1` | 12 Storage Cabinet | r11.29(3) |
| `3_1_separate_building`: separate building (types A to D) or external storage, up to 10,000 L | `location-3-1` | 13 building types A to D, 14 packages up to 60 L: separation, 17 packages over 60 L: separation | r11.29(2) building types, and the separation from protected places (r11.34, and section 14's "11.3", probably 11.30 with Excel's trailing zero dropped) that applies to a store outside |
| `3_1_store_in_building`: store inside a building, up to 10,000 L | `location-3-1` | 15 stores inside buildings, 16 Type D with more than two walls in common | r11.31. Section 16 continues section 15's item numbering (item 5, r11.31(3)), so it belongs with it |
| `3_1_retail`: retail shop | `location-3-1` | 22 retail stores 3.1A, B, C | r11.32 and 11.33, the Appendix A wording |
| `3_1_workroom`: workroom or paint mixing room (AS/NZS 4114) | `location-3-1` | 18 (shared with `3_1_use`), 19 Type 1 workroom or paint mixing room, 20 Type 2 or 3 workroom, 21 other building type 11.37(5) | r11.37. Items numbered 2 to 5, continuing section 18 |
| `3_1_use`: used or in open containers in a building | `location-3-1` | 18 used or in open packages, buildings of a certain type | r11.36 |

Always shown (no choice):

- 1 secured, 2 segregated, 3 hazardous areas: these apply to every class 2 and 3.1 location.
- 10 separation of 3.1 transfer points (r11.35): applies to any 3.1 arrangement with a transfer point. It is kept general rather than guessed into one choice; the certifier marks it N/A, with a reason, where there is none.
- 11 "Class 3.1 substances to be held in buildings of a certain type": a heading with no items. It needs no answer.

Not modelled yet: 3.1 in a stationary container system (up to 10,000 L) and use up to 450 L. Each becomes a choice, or adds to one, when its sheet arrives (Q1). Both are in `planned`.

### To check with the owner

1. **Section 18 and the workroom choice.** Section 18 (r11.36: "verify the building type… or AS/NZS 4114.1 compliance") is the gateway to sections 19 to 21: their items are numbered 2 to 5 after its item 1. As modelled, a workroom or paint mixing room job must pick both `3_1_workroom` and `3_1_use` to see it. The alternative is one choice holding 18 to 21. The contract lists them as two.
2. **Section 10 (transfer points)** is always shown. Should it sit under a choice instead?

## Class 5.1.1 and 5.1.2 (`class_5_1`)

There are no choices. Every section applies. Register entry: `location-5-1-1`.

## Classes 3.2 and 4 (`class_3_2_4`)

From the "Class 3.2 and 4" tab of `Argenta Class 2 and 3 location checksheets
with feedback.xlsx` (Tatenda, 20 Oct 2026: the general sheet for 3.2, 4.1.1
and 4.1.2A to F; the example assessed a 4.1.1 substance). Template
`wks17-class-3-2-and-4` revision 1: 4 sections, 15 items (3, 2, 7, 3).
Wording and regulation references are as in the workbook. The Argenta
answers (sodium lauryl sulphate, 4.1.1) are kept out of the template; they are
in `argenta-…--wks17-class-3-2-and-4.instance.json` for reference only.

There are no choices. Register entry: `location-4-1-1`, the only one of these
classes on Appendix A (≤ 2,000 kg or L). The set is offered on that entry, and
the New job form says so: "Authorised for 4.1.1 only (Appendix A). 3.2 and
4.1.2 substances: not yet authorised." Certificate wording cites reg 10.36.

The workbook's general tab differs for this class, so `wks17-general` has a
`class_3_2_4` view (revision 4): item 1 cites 10.36; notification 10.26(2);
secondary containment 13.3 (as written, see below), 10.31 to 10.33 and 10.30;
site plan 10.26(4)(b) (LCC PS Schedule 1 item 8: 10.26(4)(b) for class
2/3/4); that tab's title, banner and declaration (10.36). The other classes'
views are unchanged.

Corrected at extraction, with provenance (extractor 1.1.1):

- Title "Class **3.4** and 4" → "Class 3.2 and 4": there is no class 3.4; the
  tab is named "Class 3.2 and 4", the same workbook's general tab is titled
  "Class 3.2 and 4", and the sheet's sections name class 3.2.
- Scope of Authorisation text was copied from the class 6/8 sheet ("classes 6
  or 8 … Regulation 13.38"): now "classes 3.2 or 4 … Regulation 10.36", from
  the sheet's own declaration, as for the 2/3.1 and 5.1 sheets (B5).
- Footer "Section 2/2" (blank in the source).

### To check with the owner

1. **Authorisation for 3.2 and 4.1.2A to F.** Appendix A lists 4.1.1 only.
   Until the register covers them, a 3.2 or 4.1.2 substance is outside scope
   (reg 6.22(1)); today the app only warns.
2. **General sheet, secondary containment item 1 cites "13.3"** for class
   3.2/4. Reg 13.3 is about class 6 application records; 13.30 (the dropped-zero
   reading used for class 6/8) is the class 6/8 secondary containment
   regulation, which does not apply to 3.2/4 either. The class 2/3.1 sheet
   cites 10.34(1)(h). Kept as written; which regulation is meant?
3. **General sheet, notification cites 10.26(2)** for class 3.2/4, where the
   class 2/3.1 sheet cites 10.34(1)(a). For 5.1 and 6/8 the notification and
   site-plan items cite neighbouring subclauses (12.8(4) and 12.8(5)(b); 13.34(4)
   and 13.34(5)(b)), which would put class 3.2/4 notification at 10.26(3) or
   similar. Kept as written; please confirm.
4. **Section 1 (temperature control plans, r10.22(2))** was answered "not
   applicable: this regulation applies to a class 4.1.2" in the Argenta
   example, as were 3.3 to 3.6 and 4.2. If 4.1.1 jobs never need them, they
   could become a 4.1.2 choice (as class 2/3.1 has) once 4.1.2 is authorised.
5. **Section numbering**: only section 2 carries a number in the workbook
   (sections 1, 3 and 4 have none). Kept as written.

## Not in scope

No supplied sheet in this set holds excluded work, so there are no `notInScope` entries yet. The SAT 201 stationary container sheet does (design, construction, fabricator and repair rows, C8). It is not extracted yet; see `planned`.
