import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:assure_field/app.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/generated/checksheets.g.dart';
import 'package:assure_field/models/dashboard.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/screens/item_screen.dart';
import 'package:assure_field/screens/sheet_view.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';

import 'fake_server.dart';

/// Scope of work, 19 October 2026 (docs/20261019/CHANGE_GRAPH.md): results
/// follow the workbooks (general comment in blue, optional N/A reason), scope
/// choices picked at job start, and sections outside the job's scope hidden
/// and left out of every count.
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

  group('excluded sections', () {
    test('are left out of the item count and the pending count', () {
      final insp = g2();
      final general = insp.templates.first;
      final s1 = general.sections.first;
      final before = insp.totalItems;
      insp.excludedSections.add('${general.code}/${s1.ordinal}');
      expect(insp.totalItems, before - s1.items.length);
      expect(insp.countWhere(FindingStatus.pending), insp.totalItems);
      // A finding left on an excluded section does not count as assessed.
      insp.update(insp.findingFor(general, s1, s1.items.first), (x) => x.status = FindingStatus.compliant);
      expect(insp.assessedCount, 0);
    });

    testWidgets('are not shown on the sheet, nor in its jump bar', (tester) async {
      tester.view.physicalSize = const Size(1400, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      final insp = g2();
      final general = insp.templates.first;
      final s1 = general.sections.first;
      insp.excludedSections.add('${general.code}/${s1.ordinal}');
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: SheetView(inspection: insp, template: general))));
      await tester.pumpAndSettle();
      expect(find.byKey(ValueKey('jump-${s1.ordinal}')), findsNothing);
      expect(find.byKey(ValueKey('jump-${general.sections[1].ordinal}')), findsOneWidget);
    });
  });

  testWidgets('on the wide sheet, a rebuild while typing does not wipe the text being typed', (tester) async {
    tester.view.physicalSize = const Size(1400, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    final insp = g2();
    final general = insp.templates.first;
    final s1 = general.sections.first;
    final changed = <Finding>[];
    insp.onFindingChanged = changed.add;
    // The checksheet screen rebuilds the sheet on every model change; so does this.
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ListenableBuilder(
        listenable: insp, builder: (_, _) => SheetView(inspection: insp, template: general)))));
    await tester.pumpAndSettle();
    final hint = find.widgetWithText(TextField, 'General comment').first;
    await tester.tap(hint);
    await tester.pump();
    await tester.enterText(hint, 'PCBU to keep the cabinet key with the site manager');
    // Something else changes the model mid-typing (a sync pull, another field).
    insp.update(insp.findingFor(general, s1, s1.items[1]), (x) => x.status = FindingStatus.compliant);
    await tester.pump();
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    expect(insp.findingFor(general, s1, s1.items.first).generalComment, 'PCBU to keep the cabinet key with the site manager');
  });

  group('the item: general comment and N/A reason', () {
    Future<Inspection> openItem(WidgetTester tester, {FindingStatus status = FindingStatus.compliant}) async {
      final insp = g2();
      final t = insp.templates.first;
      final s = t.sections.first;
      final i = s.items.first;
      final f = insp.findingFor(t, s, i)..status = status;
      await tester.pumpWidget(MaterialApp(home: ItemScreen(inspection: insp, template: t, section: s, item: i, finding: f)));
      await tester.pumpAndSettle();
      return insp;
    }

    testWidgets('a general comment is recorded on the finding when the field is left', (tester) async {
      final insp = await openItem(tester);
      final changed = <Finding>[];
      insp.onFindingChanged = changed.add;
      await tester.enterText(find.byKey(const ValueKey('general-comment')), 'PCBU to make the hatch pattern denser');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(changed.last.generalComment, 'PCBU to make the hatch pattern denser');
    });

    testWidgets('the N/A reason is offered only for N/A, and is optional', (tester) async {
      await openItem(tester);
      expect(find.byKey(const ValueKey('na-reason')), findsNothing);
      await tester.tap(find.text('N/A'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('na-reason')), findsOneWidget);
      expect(find.text('Optional'), findsOneWidget);
    });
  });

  test('the sync payload carries the general comment, and the N/A reason only for N/A', () async {
    final svc = SyncService(
      outbox: Outbox(InMemoryOutboxStore()),
      api: ApiClient(baseUrl: Uri.parse('http://test.local'), deviceId: 'd', userId: 1,
          httpClient: MockClient((_) async => http.Response('{"applied":[],"rejected":[],"duplicate":[]}', 200))),
    );
    final insp = g2()..inspectionId = 42;
    svc.track(insp);
    final t = insp.templates.first;
    final s = t.sections.first;
    insp.update(insp.findingFor(t, s, s.items.first), (x) {
      x.status = FindingStatus.notApplicable;
      x.naReason = 'No cylinders on site';
      x.generalComment = 'Observation';
    });
    insp.update(insp.findingFor(t, s, s.items[1]), (x) {
      x.status = FindingStatus.compliant;
      x.naReason = 'stale';
    });
    await Future<void>.delayed(Duration.zero);
    final payloads = [for (final e in svc.outbox.all) e.payload];
    expect(payloads[0]['generalComment'], 'Observation');
    expect(payloads[0]['naReason'], 'No cylinders on site');
    expect(payloads[1]['naReason'], isNull);
  });

  test('the activity strip names a certificate issue and a send', () {
    expect(describeEvent('certificate.issue', {'decision': 'granted'}), 'issued the certificate');
    expect(describeEvent('certificate.issue', {'decision': 'conditional'}), 'issued a conditional certificate');
    expect(describeEvent('document.send', {'document': 'certificate', 'to': 'a@b.nz', 'sent': true}), 'emailed the certificate to a@b.nz');
    expect(describeEvent('document.send', {'document': 'non_compliance', 'to': 'a@b.nz', 'sent': false}),
        'prepared the non-compliance report for a@b.nz (not sent)');
  });

  group('New job: scope choices', () {
    Future<FakeServer> openBoard(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1400, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      final s = FakeServer()
        ..stage = 'site_inspection'
        ..class23WithChoices = true;
      final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: s.client_());
      final store = MemorySessionStore()
        ..save(Session(token: 't', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', authorisationNumber: 'TST100250', role: 'certifier'));
      await tester.pumpWidget(AssureFieldApp(app: AppSession(store: store, api: api, outboxStore: InMemoryOutboxStore())));
      await tester.pumpAndSettle();
      return s;
    }

    testWidgets('a set with choices asks for at least one, and sends what was picked', (tester) async {
      final s = await openBoard(tester);
      await tester.tap(find.byKey(const ValueKey('new-job')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('nj-choices')), findsNothing, reason: 'class 6/8 has no choices');
      await tester.tap(find.text('Location: classes 6 or 8').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Location: classes 2 and 3.1').last);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('nj-choices')), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('nj-legal')), 'Choice Test Limited');
      await tester.enterText(find.byKey(const ValueKey('nj-address')), '1 Choice Road');
      await tester.enterText(find.byKey(const ValueKey('nj-location')), 'Paint store');
      await tester.pumpAndSettle();
      final create = tester.widget<FilledButton>(find.byKey(const ValueKey('nj-create')));
      expect(create.onPressed, isNull, reason: 'Create must wait for a scope choice');
      await tester.tap(find.byKey(const ValueKey('nj-choice-3_1_cabinet')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('nj-create')));
      await tester.pumpAndSettle();
      expect(s.created.single['classKey'], 'class_2_3');
      expect(s.created.single['scopeChoices'], ['3_1_cabinet']);
    });
  });
}
