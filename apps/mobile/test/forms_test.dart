import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/screens/checksheet_screen.dart';
import 'package:assure_field/screens/sheet_view.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';
import 'package:assure_field/widgets/subject_editor.dart';

/// The form-shaped sheets Bryan sent on 11 Sep 2026: certified handler
/// assessment (class 6) and cylinder importation (FERN, UNRTDG). They carry
/// a subject block above the items and, for cylinders, one column per unit.
/// Values here are made up; the templates carry no client data.
void main() {
  Inspection handler() => Inspection(
        locationName: 'Handler assessment',
        pcbuName: 'Example Company Limited',
        siteAddress: '1 Example Street',
        certifierName: 'Bryan Wilson',
        classKey: 'handler_6',
        templates: templatesFor('handler_6'),
      );

  Inspection cylinders() => Inspection(
        locationName: 'Shipment 1',
        pcbuName: 'Example Importer Limited',
        siteAddress: '1 Example Street',
        certifierName: 'Bryan Wilson',
        classKey: 'cylinder_fern',
        templates: templatesFor('cylinder_fern'),
      );

  Future<void> pumpWide(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(1400, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
    await tester.pumpAndSettle();
  }

  test('the catalogue resolves the three new sets to their kinds and templates', () {
    expect(kindFor('handler_6'), 'handler');
    expect(kindFor('cylinder_fern'), 'cylinder');
    expect(kindFor('cylinder_un'), 'cylinder');
    expect(kindFor('class_6_8'), 'location');
    expect(templatesFor('handler_6').single.code, 'ch-class-6-handler-assessment');
    expect(templatesFor('handler_6').single.itemCount, 40);
    expect(templatesFor('cylinder_fern').single.itemCount, 6);
    expect(templatesFor('cylinder_un').single.itemCount, 6);
    expect(itemTotalFor('handler_6'), 40);
  });

  group('Handler assessment sheet', () {
    testWidgets('subject block in the workbook labels; a choice for Application type; no Regulation column', (tester) async {
      final insp = handler();
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates.first));

      expect(find.byType(SubjectEditor), findsOneWidget);
      for (final label in ['Name', 'Company', 'DOB', 'Application type', 'Scope of Certification', 'Assessment of answers']) {
        expect(find.text(label), findsWidgets, reason: label);
      }
      // The workbook's sections, after the logged correction "Perfomance" → "Performance".
      expect(find.textContaining('Performance Standard clause 5'), findsWidgets);
      // Column headers come from the sheet, not the location grid.
      expect(find.text('Competence Requirement'), findsOneWidget);
      expect(find.text('Certifier Comments'), findsOneWidget);
      expect(find.text('Regulation'), findsNothing);
      expect(find.text('Records'), findsNothing);

      // Typing a name commits to the inspection's subject on Enter.
      await tester.enterText(find.byKey(const ValueKey('subject-Name')), 'Test Applicant');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(insp.subject['Name'], 'Test Applicant');

      // Application type is one of the workbook's three values.
      await tester.tap(find.byKey(const ValueKey('subject-Application type')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Renewal').last);
      await tester.pumpAndSettle();
      expect(insp.subject['Application type'], 'Renewal');
    });

    testWidgets('the phone list puts the subject block above the items', (tester) async {
      tester.view.physicalSize = const Size(420, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(MaterialApp(home: ChecksheetScreen(inspection: handler())));
      await tester.pumpAndSettle();
      expect(find.byType(SheetView), findsNothing);
      expect(find.byType(SubjectEditor), findsOneWidget);
      expect(find.byType(UnitsEditor), findsNothing);
      expect(find.text('Name'), findsWidgets);
    });
  });

  group('Cylinder importation sheet', () {
    testWidgets('one column per unit: add, fill, remove', (tester) async {
      final insp = cylinders();
      await pumpWide(tester, SheetView(inspection: insp, template: insp.templates.first));

      expect(find.byType(UnitsEditor), findsOneWidget);
      expect(find.text('Full Name of PCBU'), findsWidgets);
      expect(find.text('No units recorded yet. Add one per cylinder batch.'), findsOneWidget);
      // The cylinder sheet keeps a Records column; the location grid's Regulation column is gone.
      expect(find.text('Records'), findsOneWidget);
      expect(find.text('Regulation'), findsNothing);

      await tester.tap(find.byKey(const ValueKey('add-unit')));
      await tester.pumpAndSettle();
      expect(insp.units.length, 1);
      expect(find.text('Unit 1'), findsOneWidget);
      expect(find.text('Country of Manufacturer'), findsOneWidget);

      await tester.enterText(find.byKey(const ValueKey('unit-1-FERN')), 'FERN-TEST-1');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(insp.units.first['FERN'], 'FERN-TEST-1');

      await tester.tap(find.byKey(const ValueKey('add-unit')));
      await tester.pumpAndSettle();
      expect(find.text('Unit 2'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('remove-unit-1')));
      await tester.pumpAndSettle();
      expect(insp.units.length, 1);
      expect(insp.units.first.containsKey('FERN'), isFalse, reason: 'the second unit moved up');
    });
  });

  group('Sync', () {
    test('subject and unit edits queue the job events the server applies', () async {
      final seen = <Map<String, dynamic>>[];
      final client = MockClient((req) async {
        if (req.url.path == '/api/health') return http.Response('{"ok":true}', 200);
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        final applied = [for (final e in body['events'] as List) {'id': e['id'], 'result': {}}];
        seen.addAll((body['events'] as List).cast<Map<String, dynamic>>());
        return http.Response('{"applied":${jsonEncode(applied)},"rejected":[],"duplicate":[]}', 200);
      });
      final svc = SyncService(
        outbox: Outbox(InMemoryOutboxStore()),
        api: ApiClient(baseUrl: Uri.parse('http://test.local'), deviceId: 'ipad-test', userId: 1, httpClient: client),
      );
      final insp = cylinders()..jobId = 9;
      svc.track(insp);

      insp.setSubject('Full Name of PCBU', 'Test Person');
      insp.addUnit();
      insp.setUnitField(1, 'Number of Cylinders', '12');
      insp.removeUnit(1);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await svc.flush();

      expect(seen.map((e) => e['type']).toList(),
          ['job.subject.set', 'job.unit.upsert', 'job.unit.upsert', 'job.unit.remove']);
      expect(seen.first['payload'], {'jobId': 9, 'fields': {'Full Name of PCBU': 'Test Person'}});
      expect(seen[2]['payload'], {'jobId': 9, 'ordinal': 1, 'fields': {'Number of Cylinders': '12'}});
      expect(seen.last['payload'], {'jobId': 9, 'ordinal': 1});
    });
  });
}
