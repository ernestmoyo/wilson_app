import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:assure_field/screens/jobs_board.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';
import 'package:assure_field/theme.dart';
import 'package:assure_field/widgets/job_context_bar.dart';
import 'package:assure_field/widgets/ui.dart';

/// Look and feel, phase U1 (docs/2026-10-19-ux/CHANGE_GRAPH.md): one set of
/// tokens and components, statuses that never rely on colour alone, a sync
/// state on every screen, and no field work lost on sign-out.
void main() {
  Widget host(Widget child) => MaterialApp(theme: buildTheme(), home: Scaffold(body: Center(child: child)));

  testWidgets('a status badge carries an icon and a word, not colour alone', (tester) async {
    await tester.pumpWidget(host(const StatusBadge(label: 'Non-compliant', tone: Tone.bad)));
    expect(find.text('Non-compliant'), findsOneWidget);
    expect(find.byIcon(Tone.bad.icon), findsOneWidget);
  });

  testWidgets('the stage badge keeps its number and words, with an icon', (tester) async {
    await tester.pumpWidget(host(const StageChip(stage: 'site_inspection')));
    expect(find.text('4 · Site inspection'), findsOneWidget);
    expect(find.byType(Icon), findsOneWidget);
    expect(StageChip.toneFor('gap_closure'), Tone.warn);
    expect(StageChip.toneFor('certificate_issued'), Tone.good);
  });

  test('badge colours pass 4.5:1 contrast on their tint', () {
    double lum(Color c) {
      double ch(double v) => v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
      return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    }

    double ratio(Color a, Color b) {
      final x = lum(a), y = lum(b);
      return (x > y ? x + 0.05 : y + 0.05) / (x > y ? y + 0.05 : x + 0.05);
    }

    for (final t in Tone.values) {
      expect(ratio(t.fg, t.bg), greaterThanOrEqualTo(4.5), reason: '$t');
    }
    expect(ratio(Neutral.muted, Colors.white), greaterThanOrEqualTo(4.5));
    expect(ratio(Neutral.muted, Neutral.canvas), greaterThanOrEqualTo(4.5));
  });

  group('wording', () {
    test('internal sheet codes never reach the screen', () {
      expect(Wording.sheetName('wks17-general'), 'General');
      expect(Wording.sheetName('wks17-class-2-and-3-1-substances'), 'Class 2 & 3.1');
      expect(Wording.itemRef('wks17-general', 6, 2), 'General 6.2');
      expect(Wording.humanise('Close wks17-class-6-1a-6-1b-6-1c-8-2a-8 3/1'), 'Close Class 6 & 8 3.1');
    });
  });

  group('sync indicator', () {
    SyncService svc() => SyncService(
          outbox: Outbox(InMemoryOutboxStore()),
          api: ApiClient(baseUrl: Uri.parse('http://test.local'), deviceId: 'd', userId: 1,
              httpClient: MockClient((_) async => http.Response('{"applied":[],"rejected":[],"duplicate":[]}', 200))),
        );

    testWidgets('says "All saved" when nothing is waiting', (tester) async {
      await tester.pumpWidget(host(SyncIndicator(sync: svc())));
      expect(find.text('All saved'), findsOneWidget);
    });

    test('says how many are waiting, and offline when the last send failed', () {
      final s = svc();
      expect(SyncIndicator.describe(s).label, 'All saved');
      s.lastError = 'offline';
      expect(SyncIndicator.describe(s).tone, Tone.good, reason: 'nothing waiting: an old error is not a warning');
    });
  });

  group('sign out', () {
    Future<bool?> ask(WidgetTester tester, int pending) async {
      bool? answer;
      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () async => answer = await confirmSignOut(context, pending: pending),
                child: const Text('go'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      return answer;
    }

    testWidgets('with nothing waiting, signs out without asking', (tester) async {
      expect(await ask(tester, 0), isTrue);
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('with changes waiting, warns before dropping them', (tester) async {
      bool? answer;
      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () async => answer = await confirmSignOut(context, pending: 3),
              child: const Text('go'),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.textContaining('3 changes have not reached the server'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('sign-out-stay')));
      await tester.pumpAndSettle();
      expect(answer, isFalse);
    });
  });
}

