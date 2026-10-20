// Phase U2 of the look-and-feel change graph (docs/2026-10-19-ux): the
// check sheet. One-tap answers, a slim header with progress, a filter and
// "Next unanswered", the section list, F2 (a finding's text once) and F3 (no
// "Cannot grant yet" once a certificate is issued).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/generated/checksheets.g.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/screens/checksheet_screen.dart';
import 'package:assure_field/screens/item_screen.dart';
import 'package:assure_field/screens/sheet_view.dart';
import 'package:assure_field/widgets/answer_control.dart';

void main() {
  Inspection g2() => Inspection(
        locationName: 'G2 Chiller',
        pcbuName: 'Argenta Manufacturing Limited',
        siteAddress: '2 Sterling Avenue',
        certifierName: 'Bryan Wilson',
        classKey: 'class_6_8',
        templates: [
          kTemplatesByCode['wks17-general']!,
          kTemplatesByCode['wks17-class-6-1a-6-1b-6-1c-8-2a-8']!,
        ],
      );

  Future<void> sized(WidgetTester t, Size size) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
  }

  const ipadLandscape = Size(1180, 820);

  /// Every item of the first [sections] sections of the general sheet answered.
  void answerSections(Inspection insp, int sections, {FindingStatus status = FindingStatus.compliant}) {
    final t = insp.templates.first;
    for (final s in t.sections.take(sections)) {
      for (final i in s.items) {
        insp.update(insp.findingFor(t, s, i), (x) => x.status = status);
      }
    }
  }

  group('one-tap answers', () {
    testWidgets('on the wide sheet one tap writes the finding, and Non-compliant asks for the reason', (t) async {
      await sized(t, const Size(1400, 2400));
      final insp = g2();
      final general = insp.templates.first;
      final s = general.sections.first;
      final f = insp.findingFor(general, s, s.items.first);
      await t.pumpWidget(MaterialApp(home: Scaffold(body: SheetView(inspection: insp, template: general))));
      await t.pumpAndSettle();

      await t.tap(find.byKey(ValueKey('answer-${f.key}-compliant')));
      await t.pumpAndSettle();
      expect(f.status, FindingStatus.compliant);

      await t.tap(find.byKey(ValueKey('answer-${f.key}-non_compliant')));
      await t.pumpAndSettle();
      expect(f.status, FindingStatus.nonCompliant);
      expect(find.text('Reason not met — IPS 21(1)(f)'), findsOneWidget);

      // Each answer is a real touch target, with its word.
      final size = t.getSize(find.byKey(ValueKey('answer-${f.key}-not_applicable')));
      expect(size.height, greaterThanOrEqualTo(44));
      expect(find.descendant(of: find.byKey(ValueKey('answer-${f.key}-not_applicable')), matching: find.text('N/A')),
          findsOneWidget);
    });

    testWidgets('Conditional stays reachable, from the answer menu', (t) async {
      final insp = g2();
      final general = insp.templates.first;
      final s = general.sections.first;
      final f = insp.findingFor(general, s, s.items.first);
      await t.pumpWidget(MaterialApp(
          home: ItemScreen(inspection: insp, template: general, section: s, item: s.items.first, finding: f)));
      await t.pumpAndSettle();
      await t.ensureVisible(find.byKey(const ValueKey('answer-more')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('answer-more')));
      await t.pumpAndSettle();
      await t.tap(find.text('Conditional').last);
      await t.pumpAndSettle();
      expect(f.status, FindingStatus.conditional);
      expect(find.byKey(const ValueKey('answer-conditional')), findsOneWidget, reason: 'shown as a selected answer');
      // ...and the answer can be cleared back to unanswered.
      await t.tap(find.byKey(const ValueKey('answer-more')));
      await t.pumpAndSettle();
      await t.tap(find.text('Clear answer').last);
      await t.pumpAndSettle();
      expect(f.status, FindingStatus.pending);
    });

    testWidgets('on a phone the item tile answers in one tap too', (t) async {
      await sized(t, const Size(400, 1600));
      final insp = g2();
      final general = insp.templates.first;
      final s = general.sections.first;
      final f = insp.findingFor(general, s, s.items.first);
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: insp)));
      await t.pumpAndSettle();
      expect(find.byType(SheetView), findsNothing);
      await t.tap(find.byKey(ValueKey('answer-${f.key}-not_applicable')));
      await t.pumpAndSettle();
      expect(f.status, FindingStatus.notApplicable);
    });
  });

  group('the header', () {
    testWidgets('on an iPad in landscape the sheet starts high: chrome ≤ 130 px, section 1 on the first screen',
        (t) async {
      await sized(t, ipadLandscape);
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: g2())));
      await t.pumpAndSettle();
      expect(find.byType(SheetView), findsOneWidget);
      // Everything above the sheet: the bar, the sheet tabs and the progress strip.
      expect(t.getTopLeft(find.byType(SheetView)).dy, lessThanOrEqualTo(130));
      // The section list puts section 1 near the top; the workbook's own
      // band row for it is on the first screen.
      expect(t.getTopLeft(find.byKey(const ValueKey('jump-1'))).dy, lessThan(200));
      expect(t.getBottomLeft(find.byKey(const ValueKey('section-1'))).dy, lessThan(ipadLandscape.height));
      // Sheet names, never internal codes.
      expect(find.textContaining('General · 36'), findsOneWidget);
      expect(find.textContaining('Class 6 & 8 · 18'), findsOneWidget);
      expect(find.textContaining('wks17-'), findsNothing);
      // The title names the location.
      expect(find.text('G2 Chiller · Check sheet'), findsOneWidget);
    });

    testWidgets('progress strip: answered, findings, to go', (t) async {
      await sized(t, ipadLandscape);
      final insp = g2();
      answerSections(insp, 1); // section 1: 4 items compliant
      final general = insp.templates.first;
      final s2 = general.sections[1];
      insp.update(insp.findingFor(general, s2, s2.items.first), (x) {
        x.status = FindingStatus.nonCompliant;
        x.failureReason = 'x';
      });
      final answered = general.sections.first.items.length + 1;
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: insp)));
      await t.pumpAndSettle();
      expect(find.text('$answered of 36 answered · 1 finding · ${36 - answered} to go'), findsOneWidget);
      expect(find.text('To answer · ${36 - answered}'), findsOneWidget);
      expect(find.text('Findings · 1'), findsOneWidget);
      expect(find.text('Cannot grant yet'), findsOneWidget);
    });
  });

  group('Next unanswered and the filter', () {
    testWidgets('Next unanswered scrolls to the first pending item in scope', (t) async {
      await sized(t, ipadLandscape);
      final insp = g2();
      answerSections(insp, 3);
      final general = insp.templates.first;
      final target = insp.findingFor(general, general.sections[3], general.sections[3].items.first);
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: insp)));
      await t.pumpAndSettle();
      final row = find.byKey(ValueKey('item-${target.key}'));
      expect(t.getTopLeft(row).dy, greaterThan(ipadLandscape.height), reason: 'starts off screen');

      await t.tap(find.byKey(const ValueKey('next-unanswered')));
      await t.pumpAndSettle();
      final y = t.getTopLeft(row).dy;
      expect(y, greaterThanOrEqualTo(0));
      expect(y, lessThan(ipadLandscape.height - 100));
    });

    testWidgets('Next unanswered skips a section outside the scope', (t) async {
      await sized(t, ipadLandscape);
      final insp = g2();
      final general = insp.templates.first;
      // Section 1 left unanswered but out of scope; sections 2–4 answered.
      insp.excludedSections.add('${general.code}/${general.sections.first.ordinal}');
      for (final s in general.sections.skip(1).take(3)) {
        for (final i in s.items) {
          insp.update(insp.findingFor(general, s, i), (x) => x.status = FindingStatus.compliant);
        }
      }
      final target = insp.findingFor(general, general.sections[4], general.sections[4].items.first);
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: insp)));
      await t.pumpAndSettle();
      final row = find.byKey(ValueKey('item-${target.key}'));
      expect(t.getTopLeft(row).dy, greaterThan(ipadLandscape.height));
      await t.tap(find.byKey(const ValueKey('next-unanswered')));
      await t.pumpAndSettle();
      expect(t.getTopLeft(row).dy, lessThan(ipadLandscape.height - 100));
    });

    testWidgets('To answer hides answered items; Findings shows only the non-compliances', (t) async {
      await sized(t, const Size(1400, 2400));
      final insp = g2();
      final general = insp.templates.first;
      final all = [for (final s in general.sections) for (final i in s.items) insp.findingFor(general, s, i)];
      final done = all[0];
      final open = all[1];
      final nc = all[2];
      insp.update(done, (x) => x.status = FindingStatus.compliant);
      insp.update(nc, (x) {
        x.status = FindingStatus.nonCompliant;
        x.failureReason = 'No manifest';
      });
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: insp)));
      await t.pumpAndSettle();
      expect(find.byKey(ValueKey('item-${done.key}')), findsOneWidget);

      await t.tap(find.byKey(const ValueKey('filter-to-answer')));
      await t.pumpAndSettle();
      expect(find.byKey(ValueKey('item-${done.key}')), findsNothing);
      expect(find.byKey(ValueKey('item-${nc.key}')), findsNothing);
      expect(find.byKey(ValueKey('item-${open.key}')), findsOneWidget);

      await t.tap(find.byKey(const ValueKey('filter-findings')));
      await t.pumpAndSettle();
      expect(find.byKey(ValueKey('item-${nc.key}')), findsOneWidget);
      expect(find.byKey(ValueKey('item-${open.key}')), findsNothing);

      await t.tap(find.byKey(const ValueKey('filter-all')));
      await t.pumpAndSettle();
      expect(find.byKey(ValueKey('item-${done.key}')), findsOneWidget);
    });
  });

  group('section list', () {
    testWidgets('each section: number, title, count, and a status icon', (t) async {
      await sized(t, ipadLandscape);
      final insp = g2();
      answerSections(insp, 1);
      final general = insp.templates.first;
      final s2 = general.sections[1];
      insp.update(insp.findingFor(general, s2, s2.items.first), (x) => x.status = FindingStatus.nonCompliant);
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: insp)));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('jump-state-1-complete')), findsOneWidget);
      expect(find.byKey(ValueKey('jump-state-${s2.ordinal}-finding')), findsOneWidget);
      expect(find.byKey(ValueKey('jump-state-${general.sections[2].ordinal}-not-started')), findsOneWidget);
    });
  });

  group('fixes found on the way', () {
    testWidgets('F2: a non-compliance whose reason and comment are the same text shows it once', (t) async {
      await sized(t, const Size(1400, 2400));
      final insp = g2();
      final general = insp.templates.first;
      final s = general.sections.first;
      final f = insp.findingFor(general, s, s.items.first);
      insp.update(f, (x) {
        x.status = FindingStatus.nonCompliant;
        x.comment = 'No signage at the chiller door';
        x.failureReason = 'No signage at the chiller door';
      });
      await t.pumpWidget(MaterialApp(home: Scaffold(body: SheetView(inspection: insp, template: general))));
      await t.pumpAndSettle();
      expect(find.text('No signage at the chiller door'), findsOneWidget);

      // Editing the one field keeps the two in step.
      final field = find.widgetWithText(TextField, 'No signage at the chiller door');
      await t.tap(field);
      await t.enterText(field, 'No signage at the north door');
      FocusManager.instance.primaryFocus?.unfocus();
      await t.pumpAndSettle();
      expect(f.failureReason, 'No signage at the north door');
      expect(f.comment, 'No signage at the north door');
    });

    testWidgets('F2: different reason and comment both show', (t) async {
      await sized(t, const Size(1400, 2400));
      final insp = g2();
      final general = insp.templates.first;
      final s = general.sections.first;
      final f = insp.findingFor(general, s, s.items.first);
      insp.update(f, (x) {
        x.status = FindingStatus.nonCompliant;
        x.comment = 'Sign faded';
        x.failureReason = 'Signage not legible from 10 m';
      });
      await t.pumpWidget(MaterialApp(home: Scaffold(body: SheetView(inspection: insp, template: general))));
      await t.pumpAndSettle();
      expect(find.text('Sign faded'), findsOneWidget);
      expect(find.text('Signage not legible from 10 m'), findsOneWidget);
    });

    testWidgets('F3: once a certificate is issued the sheet says so, not "Cannot grant yet"', (t) async {
      await sized(t, ipadLandscape);
      final insp = g2()
        ..certificateDecision = 'conditional'
        ..conditions = ['Install signage'];
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: insp, stage: 'certificate_issued')));
      await t.pumpAndSettle();
      expect(find.text('Cannot grant yet'), findsNothing);
      expect(find.text('Conditional certificate issued'), findsOneWidget);
    });

    testWidgets('F3: a job in monitoring with no decision loaded still reads as issued', (t) async {
      await sized(t, ipadLandscape);
      await t.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: g2(), stage: 'monitoring')));
      await t.pumpAndSettle();
      expect(find.text('Cannot grant yet'), findsNothing);
      expect(find.text('Certificate issued'), findsOneWidget);
    });
  });

  group('the item screen', () {
    testWidgets('previous and next walk the items in order, saving as they go', (t) async {
      await sized(t, const Size(820, 2000));
      final insp = g2();
      final general = insp.templates.first;
      final s = general.sections.first;
      await t.pumpWidget(MaterialApp(
          home: ItemScreen(
              inspection: insp, template: general, section: s, item: s.items.first,
              finding: insp.findingFor(general, s, s.items.first))));
      await t.pumpAndSettle();
      expect(find.text(s.items.first.action), findsOneWidget);
      final prev = t.widget<OutlinedButton>(find.byKey(const ValueKey('item-prev')));
      expect(prev.onPressed, isNull, reason: 'first item has no previous');

      await t.enterText(find.byKey(const ValueKey('general-comment')), 'Observation on item 1');
      await t.tap(find.byKey(const ValueKey('item-next')));
      await t.pumpAndSettle();
      expect(find.text(s.items[1].action), findsOneWidget);
      expect(insp.findingFor(general, s, s.items.first).generalComment, 'Observation on item 1');
      expect(find.text('Observation on item 1'), findsNothing, reason: 'fields show the new item');

      await t.tap(find.byKey(const ValueKey('item-prev')));
      await t.pumpAndSettle();
      expect(find.text(s.items.first.action), findsOneWidget);
      expect(find.text('Observation on item 1'), findsOneWidget);
    });

    testWidgets('one name for the reason: "Reason not met"', (t) async {
      await sized(t, const Size(820, 2000));
      final insp = g2();
      final general = insp.templates.first;
      final s = general.sections.first;
      final f = insp.findingFor(general, s, s.items.first)..status = FindingStatus.nonCompliant;
      await t.pumpWidget(MaterialApp(
          home: ItemScreen(inspection: insp, template: general, section: s, item: s.items.first, finding: f)));
      await t.pumpAndSettle();
      expect(find.text('Reason not met'), findsOneWidget);
      expect(find.text('Reason for failure'), findsNothing);
      expect(find.byType(AnswerControl), findsOneWidget);
    });
  });
}
