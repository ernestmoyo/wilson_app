import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/generated/checksheets.g.dart';
import 'package:assure_field/main.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';

import 'fake_server.dart';

/// A store that already holds Bryan's session, so the gate opens on the
/// inspections list rather than the sign-in screen.
SessionStore signedIn() => MemorySessionStore()
  ..save(const Session(
      token: 'test-token',
      userId: 1,
      fullName: 'Bryan Wilson',
      occupation: 'Compliance certifier',
      authorisationNumber: 'TST100250'));

void main() {
  group('generated WKS-17 templates', () {
    test('all three templates load with the expected shape', () {
      expect(kChecksheetTemplates.length, 3);
      final general = kTemplatesByCode['wks17-general']!;
      expect(general.sections.length, 8);
      expect(general.itemCount, 36);
      expect(kTemplatesByCode['wks17-class-6-1a-6-1b-6-1c-8-2a-8']!.itemCount, 18);
      expect(kTemplatesByCode['wks17-class-2-and-3-1-substances']!.itemCount, 44);
    });

    test('item text is the verbatim Performance Standard wording', () {
      final general = kTemplatesByCode['wks17-general']!;
      final signage = general.sections.firstWhere((s) => s.title == 'Signage');
      expect(signage.items.length, 5);
      // Exact wording from the workbook — a paraphrase here is a defect.
      expect(signage.items[2].action,
          'Verify that compliant signage is positioned at all required entrances to the building and land');
      expect(signage.items[2].regulationRefs, contains('2.6(1)'));
    });

    test('class overlay changes regulation refs, base is shared', () {
      final general = kTemplatesByCode['wks17-general']!;
      final item1 = general.sections.first.items.first;

      // Shared base: the reference every class family cites.
      expect(item1.regulationRefs, ['10.34']);

      // Class 6/8 cites four more regulations for the same requirement.
      expect(item1.regulationRefsFor('class_6_8'),
          ['10.34', '10.36', '12.17', '12.42', '13.38']);
      expect(item1.regulationRefsFor('class_2_3'), ['10.34']);

      // An unknown class key must fall back to the base, never throw.
      expect(item1.regulationRefsFor('class_9_9'), ['10.34']);
      expect(item1.regulationRefsFor(null), ['10.34']);
    });

    test('curly apostrophes survive codegen escaping', () {
      final general = kTemplatesByCode['wks17-general']!;
      final training = general.sections.firstWhere(
          (s) => s.title == 'Information, instruction, and training');
      expect(training.items.any((i) => i.records.contains('worker\u2019s')), isTrue);
    });
  });

  group('Inspection — reg 13.39 grant gate', () {
    Inspection build() => Inspection(
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

    test('cannot grant while items are unassessed', () {
      final insp = build();
      expect(insp.totalItems, 54);
      expect(insp.countWhere(FindingStatus.pending), 54);
      expect(insp.canGrant, isFalse);
    });

    test('a single non-compliance blocks the grant', () {
      final insp = build();
      // Assess everything compliant...
      for (final t in insp.templates) {
        for (final s in t.sections) {
          for (final i in s.items) {
            insp.update(insp.findingFor(t, s, i), (f) => f.status = FindingStatus.compliant);
          }
        }
      }
      expect(insp.canGrant, isTrue);

      // ...then fail one item.
      final t = insp.templates.first;
      final s = t.sections.first;
      insp.update(insp.findingFor(t, s, s.items.first),
          (f) => f.status = FindingStatus.nonCompliant);
      expect(insp.canGrant, isFalse);
      expect(insp.countWhere(FindingStatus.nonCompliant), 1);
    });

    test('a non-compliance without a reason is flagged — IPS 21(1)(f)', () {
      final insp = build();
      final t = insp.templates.first;
      final s = t.sections.first;
      final f = insp.findingFor(t, s, s.items.first);

      insp.update(f, (x) => x.status = FindingStatus.nonCompliant);
      expect(f.isIncomplete, isTrue);
      expect(insp.incompleteFindings.length, 1);

      insp.update(f, (x) => x.failureReason = 'No signage at the chiller door');
      expect(f.isIncomplete, isFalse);
      expect(insp.incompleteFindings, isEmpty);
    });

    test('not_applicable is a recorded result, not a blank', () {
      final insp = build();
      final t = insp.templates.first;
      final s = t.sections.first;
      insp.update(insp.findingFor(t, s, s.items.first),
          (f) => f.status = FindingStatus.notApplicable);
      expect(insp.countWhere(FindingStatus.notApplicable), 1);
      expect(insp.assessedCount, 1);
    });
  });

  testWidgets('the board lists the job: client, location, stage, what it needs now', (tester) async {
    final server = FakeServer()..stage = 'site_inspection';
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: server.client_());
    await tester.pumpWidget(AssureFieldApp(
      app: AppSession(store: signedIn(), api: api, outboxStore: InMemoryOutboxStore()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Argenta Manufacturing Limited'), findsOneWidget);
    expect(find.textContaining('G2 Chiller'), findsWidgets);
    expect(find.textContaining('4 · Site inspection'), findsOneWidget);
    expect(find.text('Continue the inspection: 2 of 54 items assessed'), findsOneWidget);
    expect(find.textContaining('2/54'), findsOneWidget);
    // Loop 1: what needs attention, and who did what, above the cards.
    expect(find.byKey(const ValueKey('attention')), findsOneWidget);
    expect(find.textContaining('Corrective action due 2026-09-15'), findsOneWidget);
    expect(find.byKey(const ValueKey('activity')), findsOneWidget);
    expect(find.textContaining('signed the declaration'), findsOneWidget);
  });

  testWidgets('board → hub → check sheet, with verbatim section titles', (tester) async {
    final server = FakeServer()..stage = 'site_inspection';
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: server.client_());
    await tester.pumpWidget(AssureFieldApp(
      app: AppSession(store: signedIn(), api: api, outboxStore: InMemoryOutboxStore()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('job-7')));
    await tester.pumpAndSettle();
    // The hub: context bar and the Now card name the next step.
    expect(find.byKey(const ValueKey('now-card')), findsOneWidget);
    expect(find.text('Continue the inspection: 2 of 54 items assessed'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('open-sheet')));
    await tester.pumpAndSettle();

    // Section 1 is above the fold.
    expect(find.textContaining('Determining which regulations apply'), findsOneWidget);
    expect(find.text('Cannot grant yet'), findsOneWidget);

    // Section 4 is below the fold; a ListView does not build off-screen
    // children, so scroll it into view rather than asserting blindly.
    await tester.scrollUntilVisible(
      find.textContaining('Signage'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Signage'), findsWidgets);

    // The verbatim PS wording must reach the screen, not a paraphrase.
    expect(
      find.textContaining(
          'Verify that compliant signage is positioned at all required entrances'),
      findsOneWidget,
    );

    // The logo goes home from three screens deep.
    await tester.tap(find.byKey(const ValueKey('logo-home')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('job-7')), findsOneWidget);
  });
}
