import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/generated/checksheets.g.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/models/site_block.dart';
import 'package:assure_field/screens/checksheet_screen.dart';
import 'package:assure_field/screens/sheet_view.dart';

/// The wide layout must reproduce the workbook's nodes in the workbook's words.
/// Each assertion here is one row of docs/ALIGNMENT.md.
void main() {
  Inspection g2() => Inspection(
        locationName: 'G2 Chiller',
        pcbuName: 'Argenta Manufacturing Limited',
        siteAddress: '2 Sterling Avenue, Manurewa East, Auckland 2102',
        certifierName: 'Bryan Wilson',
        classKey: 'class_6_8',
        templates: [
          kTemplatesByCode['wks17-general']!,
          kTemplatesByCode['wks17-class-6-1a-6-1b-6-1c-8-2a-8']!,
        ],
      )..siteBlock = const SiteBlock(
          legalEntityName: 'Argenta Manufacturing Limited',
          tradingAsName: 'Argenta Manufacturing Limited',
          siteAddress: '2 Sterling Avenue, Manurewa East, Auckland 2102',
          postalAddress: 'Po Box 75340, Manurewa 2243, Auckland, 2243',
          businessPhone: '64 9 2503100',
          website: 'www.argentaglobal.com',
          nzbn: '9429033971360',
          managerName: 'Jesh Chandra',
          directDial: '0226787761',
          substanceNames: ['Abamectin', 'Eprinomectin', 'Ivermectin', 'Moxidectin'],
          hsLocation: 'G2 Chiller Argenta Manufacturing Limited 2 Sterling Avenue',
          summary: 'G2 Chiller is a dedicated storage area for Class 6.1B and 6.1C',
        );

  Future<void> pumpWide(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(1400, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
    await tester.pumpAndSettle();
  }

  group('SheetView — general sheet mirrors the workbook', () {
    testWidgets('title, site block rows 2–14, banner, column headers', (tester) async {
      final insp = g2();
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates.first));

      // Row 1 — class-conditional title and the Evidence Portfolio column label.
      expect(find.text('Check sheet Location Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'), findsOneWidget);
      expect(find.text('Evidence Portfolio'), findsWidgets); // source spelt it "Portifolio"; corrected + logged

      // Rows 2–14 fold behind a one-line summary so the checklist starts on
      // the first screen; open them, then check every label in the sheet's words.
      expect(find.text('Show site details'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('site-block-toggle')));
      await tester.pumpAndSettle();
      // Rows 2–14 — every label, in the sheet's words.
      for (final label in [
        'Legal Entity Name', 'Trading as Name', 'Site / Location Address', 'Postal Address',
        'Business Phone Number', 'Business Website', 'NZBN', 'Description of Business Type / Industry',
        'Manager Name', 'Date of Inspection/Site Visit', 'Status of Inspection',
        'Direct Dial Number and/or Mobile Number', 'Hazardous substance name',
        'Hazardous Substance Location', 'Brief location summary',
      ]) {
        expect(find.text(label), findsOneWidget, reason: label);
      }
      expect(find.text('9429033971360'), findsOneWidget);
      expect(find.text('Jesh Chandra'), findsOneWidget);
      expect(find.text('Abamectin, Eprinomectin, Ivermectin, Moxidectin'), findsOneWidget);

      // Row 15 — banner (class 6/8 only).
      expect(find.text('General location requirements specific to Class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'),
          findsOneWidget);

      // Row 16 — column headers.
      for (final h in ['Item', 'Regulation', 'Action', 'Records', 'Comments']) {
        expect(find.text(h), findsOneWidget, reason: h);
      }

      // Section 1 and item 1 with the class 6/8 regulation overlay.
      expect(find.text('Determining which regulations apply'), findsOneWidget);
      expect(find.text('13.38'), findsOneWidget);
    });

    testWidgets('trailing blocks: NB note, declaration, footer — and no Decision on the general sheet',
        (tester) async {
      final insp = g2();
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates.first));
      await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -6000));
      await tester.pumpAndSettle();

      expect(find.text('NB: Non compliances are in red'), findsOneWidget);
      expect(find.textContaining('Declaration: I verify that I have examined the evidence'), findsOneWidget);
      expect(find.textContaining('Regulation 13.38'), findsWidgets); // class 6/8 wording, not 17.91
      expect(find.textContaining('Regulation 17.91'), findsNothing);
      expect(find.text('Section 1/2'), findsOneWidget); // source said 1/1 on sheet 1 of 2; corrected + logged
      expect(find.textContaining('Decision:'), findsNothing);
    });
  });

  group('SheetView — class sheet', () {
    testWidgets('unnumbered section 1, Decision row, Document Control, Scope, Reference, footer',
        (tester) async {
      final insp = g2();
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates[1]));

      expect(find.text('Requirements specific to class 6.1A, 6.1B, 6.1C, 8.2A, and 8.2B substances'),
          findsOneWidget);

      await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -6000));
      await tester.pumpAndSettle();

      expect(find.textContaining('Decision: Compliance certificate cannot be issued'), findsOneWidget);
      expect(find.text('Document Control'), findsOneWidget);
      for (final k in ['Owner', 'Revision', 'Status', 'Date of last revision', 'Frequency of revision']) {
        expect(find.text(k), findsOneWidget, reason: k);
      }
      expect(find.text('BW'), findsOneWidget);
      expect(find.text('less than 12 months'), findsOneWidget);
      expect(find.text('Scope of Authorisation'), findsOneWidget);
      expect(find.textContaining('I can confirm that I have checked'), findsOneWidget);
      expect(find.text('Reference:'), findsOneWidget);
      expect(find.textContaining('Performance Standard HSW (HS) Regulations of 2017'), findsOneWidget);
      expect(find.text('Section 2/2'), findsOneWidget);
    });

    testWidgets('a refused certificate renders the Decision row in the workbook phrasing', (tester) async {
      final insp = g2()
        ..certificateDecision = 'refused'
        ..requirementsNotMet = [
          'Important compliance documents are still in draft form (SOPs and ERP)',
          'Signage to meet requirements of regulation 2.6 (5)(ii)',
        ];
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates[1]));
      await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -6000));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Decision: Compliance certificate refused to be issued with the following conditions: '
            '1. Important compliance documents are still in draft form (SOPs and ERP) '
            '2. Signage to meet requirements of regulation 2.6 (5)(ii)'),
        findsOneWidget,
      );
    });
  });

  group('SheetView — editing', () {
    testWidgets('status picker and inline comment write through to the finding', (tester) async {
      final insp = g2();
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates.first));

      final t = insp.templates.first;
      final s = t.sections.first;
      final f = insp.findingFor(t, s, s.items.first);
      expect(f.status, FindingStatus.pending);

      // First status dropdown on the page belongs to item 1.
      await tester.tap(find.byType(DropdownButton<FindingStatus>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('NC').last);
      await tester.pumpAndSettle();
      expect(f.status, FindingStatus.nonCompliant);

      // Non-compliant reveals the reason field (IPS 21(1)(f)) beside the comment.
      expect(find.text('Reason not met — IPS 21(1)(f)'), findsOneWidget);
    });
  });

  group('SheetView — navigation', () {
    testWidgets('section chips show progress; a chip jumps; a band row folds its items', (tester) async {
      final insp = g2();
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates.first));
      final general = insp.templates.first;
      final signage = general.sections.firstWhere((x) => x.title == 'Signage');

      // A chip per section, with done/total.
      expect(find.byKey(ValueKey('jump-${signage.ordinal}')), findsOneWidget);
      expect(find.textContaining('Signage  0/5'), findsOneWidget);

      // Folding hides the items; the band row keeps the count.
      await tester.tap(find.byKey(const ValueKey('section-1')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Verify that the hazardous substances are present'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('section-1')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Verify that the hazardous substances are present'), findsOneWidget);

      // Jumping brings the section's band row into view.
      await tester.tap(find.byKey(ValueKey('jump-${signage.ordinal}')));
      await tester.pumpAndSettle();
      expect(find.byKey(ValueKey('section-${signage.ordinal}')), findsOneWidget);
      expect(find.textContaining('Verify that compliant signage is positioned'), findsOneWidget);
    });
  });

  testWidgets('ChecksheetScreen switches to the sheet layout at ≥ 900 px', (tester) async {
    tester.view.physicalSize = const Size(1400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: g2())));
    await tester.pumpAndSettle();
    expect(find.byType(SheetView), findsOneWidget);
  });
}
