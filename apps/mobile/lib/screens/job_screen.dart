import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bootstrap.dart' show CurrentUser, itemTotalFor;
import '../generated/checksheets.g.dart' show kSheetSetsByKey;
import '../models/job.dart';
import '../sync/api_client.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';
import '../widgets/job_context_bar.dart';
import '../widgets/ui.dart';

/// Opens a server document in the browser. The token rides as ?token= (see
/// [ApiClient.authedUri]) because a page the browser opens carries no header.
/// Tests replace this to see the URL instead of launching one.
Future<bool> Function(Uri uri) openExternalDocument =
    (uri) => launchUrl(uri, mode: LaunchMode.externalApplication);

/// What became of events sent from this screen.
enum _Sent { sent, queued, refused }

/// The job through the Assure Safety compliance certification process flow.
///
/// The check sheet screen is stage 4. This screen is the rest of the
/// document: where the job sits, the moves the server will allow, the
/// corrective actions of stage 5, the interest declaration and issuance
/// check of stage 6, the certificate of stage 7 and the retention it sets.
/// Nothing here is decided locally; every button asks the server and the
/// screen re-reads the job.
///
/// Layout (UX change graph B7, 19 Oct 2026): the Next step card on top with
/// one primary action, the eight stages as a task list (to the right on a
/// wide screen, under Next step on a phone), and the rest in tabs.
class JobScreen extends StatefulWidget {
  final int jobId;
  final SyncService sync;

  /// Called on a 401: the token died (revoked, expired). The gate then shows
  /// sign-in and brings the person back here afterwards.
  final Future<void> Function()? onUnauthorized;
  const JobScreen({super.key, required this.jobId, required this.sync, this.onUnauthorized});

  @override
  State<JobScreen> createState() => _JobScreenState();
}

class _JobScreenState extends State<JobScreen> with SingleTickerProviderStateMixin {
  JobRecord? _job;
  IssuanceCheck? _check;
  bool _busy = false;

  /// A refusal (with its clause) or a failure the person can act on.
  String? _error;

  /// Information, not a fault: saved offline, showing the last copy.
  String? _note;

  static const _queuedNote = 'Saved on this device; it will send when online';

  late final TabController _tabs;

  ApiClient get api => widget.sync.api;

  @override
  void initState() {
    super.initState();
    // Made here, not lazily: a screen disposed before the job loads must not
    // create a ticker in dispose().
    _tabs = TabController(length: 4, vsync: this)..addListener(_onTab);
    _reload();
  }

  @override
  void dispose() {
    _tabs.removeListener(_onTab);
    _tabs.dispose();
    super.dispose();
  }

  void _onTab() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Coming back from the sheet (a route pop) re-reads the job so the
    // counts and the Now card reflect what was just recorded. A dialog
    // closing also lands here, so the re-read keeps any message on screen.
    final route = ModalRoute.of(context);
    if (route != null && route.isCurrent && _job != null && !_busy) _reload(keepError: true);
  }

  Future<void> _reload({bool keepError = false}) async {
    setState(() => _busy = true);
    try {
      final j = JobRecord.fromJson(await api.job(widget.jobId));
      IssuanceCheck? c;
      try {
        c = await api.issuanceCheck(widget.jobId);
      } catch (_) {
        c = null;
      }
      if (!mounted) return;
      setState(() {
        _job = j;
        _check = c;
        if (!keepError) {
          _error = null;
          _note = null;
        }
      });
    } on ApiException catch (e) {
      if (e.status == 401 && widget.onUnauthorized != null) {
        await widget.onUnauthorized!();
        return;
      }
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      // No connection: keep what is on screen and say so; only a job that
      // never loaded is an error.
      if (mounted) {
        setState(() {
          if (_job == null) {
            _error = e.toString();
          } else {
            _note ??= 'Could not refresh: showing what was last loaded';
          }
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Send events that belong together in one flush; the server applies each
  /// in its own savepoint, so a refused one is reported with its clause. An
  /// event that could not leave the device stays queued and is said so, as
  /// information, not as a failure. Then re-read the job.
  Future<_Sent> _sendAll(List<(String, Map<String, dynamic>)> events) async {
    setState(() {
      _busy = true;
      _error = null;
      _note = null;
    });
    final ids = <String>[];
    for (final (type, payload) in events) {
      ids.add((await widget.sync.outbox.enqueue(type, payload)).id);
    }
    await widget.sync.flush();
    final refused = <String>[];
    for (final r in widget.sync.rejected.where((r) => ids.contains(r.id)).toList()) {
      final o = r.outcome;
      refused.add([if (o?.clause != null) o!.clause, o?.reason ?? 'rejected'].join(': '));
      await widget.sync.dismissRejected(r.id);
    }
    final outcome = refused.isNotEmpty
        ? _Sent.refused
        : widget.sync.outbox.pending.any((e) => ids.contains(e.id))
            ? _Sent.queued
            : _Sent.sent;
    if (mounted) {
      setState(() {
        if (outcome == _Sent.refused) _error = refused.join('\n');
        if (outcome == _Sent.queued) _note = _queuedNote;
      });
    }
    await _reload(keepError: outcome != _Sent.sent);
    return outcome;
  }

  /// One event; [done] confirms it once the server has taken it.
  Future<void> _send(String type, Map<String, dynamic> payload, {String? done}) async {
    final r = await _sendAll([(type, payload)]);
    if (r == _Sent.sent && done != null && mounted) showDone(context, done);
  }

  Future<void> _syncNow() async {
    await widget.sync.flush();
    if (mounted) await _reload();
  }

  // ── Formatting ────────────────────────────────────────────────────────────

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /// "1 Oct 2026": a date people read, not a database value.
  static String _d(DateTime? d) {
    if (d == null) return '';
    final l = d.toLocal();
    return '${l.day} ${_months[l.month - 1]} ${l.year}';
  }

  /// "2026-10-01": what the server takes.
  static String _iso(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String _ref(JobFinding f) => Wording.itemRef(f.templateCode, f.sectionOrdinal, f.itemOrdinal);

  static String? _setName(JobRecord j) => kSheetSetsByKey[j.classKey]?.name;

  // ── Screen ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final j = _job;
    return Scaffold(
      appBar: BrandBar(
        title: j == null ? 'Job' : j.locationName,
        subtitle: j?.clientName,
        // The title names the location and the subtitle the client; the
        // line under it carries what they do not.
        bottom: j == null
            ? null
            : JobContextBar(
                clientName: j.clientName,
                locationName: j.locationName,
                address: j.address,
                stage: j.stage,
                showNames: false,
                detail: _setName(j),
                trailing: 'Job ${j.id}',
              ),
        actions: [
          SyncIndicator(sync: widget.sync, onTap: _busy ? null : _syncNow),
          // On a phone the words give their room to the job's name.
          if (MediaQuery.sizeOf(context).width < 600)
            IconButton(
              key: const ValueKey('to-jobs'),
              tooltip: 'Clients',
              onPressed: () => context.go('/'),
              icon: const Icon(Icons.view_list_outlined),
            )
          else
            TextButton.icon(
              key: const ValueKey('to-jobs'),
              onPressed: () => context.go('/'),
              icon: const Icon(Icons.view_list_outlined, size: 18),
              label: const Text('Clients'),
            ),
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
            onPressed: _busy ? null : _reload,
          ),
        ],
      ),
      body: j == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(padding: const EdgeInsets.all(Space.xl), child: Notice(_error!)),
            )
          : LayoutBuilder(builder: (context, box) {
              final wide = box.maxWidth >= 900;
              final column = Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_error != null) Notice(_error!, onClose: () => setState(() => _error = null)),
                  if (_note != null)
                    Notice(_note!, tone: Tone.info, icon: Icons.cloud_queue, onClose: () => setState(() => _note = null)),
                  _nowCard(j),
                  if (!wide) _processCard(j),
                  _tabBar(j),
                  const SizedBox(height: Space.sm),
                  ..._tabContent(j),
                ],
              );
              return Column(
                children: [
                  SizedBox(height: 2, child: _busy ? const LinearProgressIndicator(minHeight: 2) : null),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.xxl + Space.lg),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 1280),
                          child: wide
                              ? Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(child: column),
                                    const SizedBox(width: Space.lg),
                                    SizedBox(width: box.maxWidth >= 1100 ? 340 : 300, child: _processCard(j)),
                                  ],
                                )
                              : column,
                        ),
                      ),
                    ),
                  ),
                ],
              );
            }),
    );
  }

  // ── Next step: the one thing this job needs, and the button that does it ─

  Widget _nowCard(JobRecord j) {
    final t = Theme.of(context).textTheme;
    final total = j.inspectionId == null ? 0 : (j.itemsInScope ?? itemTotalFor(j.classKey));
    final text = ProcessStage.nextAction(
      j.stage,
      kind: j.kind,
      itemTotal: total,
      assessed: j.assessedCount,
      nonCompliant: j.nonCompliances.length,
      interestDeclared: j.interestDeclared,
      openActions: j.openActions,
      unactioned: j.nonCompliances.where((f) => j.actionsFor(f.id).isEmpty).length,
      certificateDecision: j.certificate?.decision,
    );
    final n = ProcessStage.numberOf(j.stage);

    // The one primary action for where the job sits.
    final Widget? primary = switch (j.stage) {
      'document_review' => FilledButton.icon(
          key: const ValueKey('send-rfi'),
          onPressed: _busy ? null : _sendRfi,
          icon: const Icon(Icons.help_outline, size: 18),
          label: const Text('Request further information'),
        ),
      'rfi' => FilledButton.icon(
          key: const ValueKey('rfi-answered'),
          onPressed: _busy ? null : _rfiAnswered,
          icon: const Icon(Icons.mark_email_read_outlined, size: 18),
          label: const Text('Information received'),
        ),
      'final_validation' when j.certificate == null && CurrentUser.canDecide => FilledButton.icon(
          key: const ValueKey('issue-certificate'),
          onPressed: _busy ? null : _issue,
          icon: const Icon(Icons.verified_outlined, size: 18),
          label: const Text('Issue certificate'),
        ),
      'certificate_issued' when j.certificate != null && CurrentUser.canDecide => _certSendButton(filled: true),
      'compliance_evaluation' || 'gap_closure' when j.nonCompliances.isNotEmpty => FilledButton.icon(
          key: const ValueKey('now-findings'),
          onPressed: () => _tabs.animateTo(1),
          icon: const Icon(Icons.rule, size: 18),
          label: const Text('Go to findings'),
        ),
      _ => null,
    };

    final showSheet = n <= 4 || j.inspectionId != null;
    final sheetIsPrimary = primary == null && n >= 1 && n <= 4;
    final sheetLabel = j.inspectionId == null
        ? switch (j.kind) { 'handler' => 'Start assessment', 'cylinder' => 'Start cylinder inspection', _ => 'Start site inspection' }
        : n >= 1 && n <= 4
            ? 'Continue ${Wording.checkSheet.toLowerCase()}'
            : 'Open ${Wording.checkSheet.toLowerCase()}';

    Widget sheetButton({required bool filled}) {
      final onPressed = _busy || n == 0 ? null : _openSheet;
      const icon = Icon(Icons.fact_check_outlined, size: 18);
      final b = filled
          ? FilledButton.icon(key: const ValueKey('open-sheet'), onPressed: onPressed, icon: icon, label: Text(sheetLabel))
          : OutlinedButton.icon(key: const ValueKey('open-sheet'), onPressed: onPressed, icon: icon, label: Text(sheetLabel));
      // A disabled button says why.
      return n == 0 ? Tooltip(message: 'The job is closed', child: b) : b;
    }

    final secondary = <Widget>[
      if (showSheet && !sheetIsPrimary) sheetButton(filled: false),
      // Exports: anyone signed in, a viewer included, may download.
      if (j.inspectionId != null) ...[
        OutlinedButton.icon(
          key: const ValueKey('checksheet-pdf'),
          onPressed: () => openExternalDocument(api.authedUri('/api/jobs/${j.id}/checksheet.pdf')),
          icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
          label: const Text('Checksheet (PDF)'),
        ),
        OutlinedButton.icon(
          key: const ValueKey('bundle-zip'),
          // GET twin of POST /bundle: streams the ZIP on disk, or
          // redirects to the stored copy's presigned link on Blob/Spaces.
          onPressed: () => openExternalDocument(api.authedUri('/api/jobs/${j.id}/bundle.zip')),
          icon: const Icon(Icons.folder_zip_outlined, size: 18),
          label: const Text('Download all (ZIP)'),
        ),
      ],
      if (j.certificate != null)
        OutlinedButton.icon(
          key: const ValueKey('open-certificate'),
          onPressed: () => openExternalDocument(api.authedUri('/api/jobs/${j.id}/certificate.html')),
          icon: const Icon(Icons.open_in_new, size: 18),
          label: const Text('Open certificate'),
        ),
    ];

    return Container(
      key: const ValueKey('now-card'),
      margin: const EdgeInsets.symmetric(vertical: Space.sm),
      padding: const EdgeInsets.all(Space.lg + 4),
      decoration: BoxDecoration(
        color: Neutral.tint,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: Brand.ribbon.withValues(alpha: .25)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('NEXT STEP', style: t.labelSmall?.copyWith(color: Brand.ribbon, letterSpacing: 1, fontWeight: FontWeight.w700)),
        const SizedBox(height: Space.xs),
        Text(text, style: t.titleLarge),
        const SizedBox(height: Space.lg),
        if (primary != null || sheetIsPrimary) ...[
          primary ?? sheetButton(filled: true),
          if (secondary.isNotEmpty) const SizedBox(height: Space.md),
        ],
        if (secondary.isNotEmpty) Wrap(spacing: Space.sm, runSpacing: Space.sm, children: secondary),
      ]),
    );
  }

  Future<void> _openSheet() async {
    context.go('/jobs/${widget.jobId}/sheet');
  }

  // ── 1 to 8: the process as a task list, and the legal next moves ─────────

  /// The furthest numbered stage a closed or referred job reached.
  static int _reached(JobRecord j) {
    var r = 0;
    for (final t in j.transitions) {
      for (final s in [t.from, t.to]) {
        if (s == null) continue;
        final n = ProcessStage.numberOf(s);
        if (n > r) r = n;
      }
    }
    return r;
  }

  Widget _processCard(JobRecord j) {
    final t = Theme.of(context).textTheme;
    final current = ProcessStage.numberOf(j.stage);
    final waiting = j.stage == 'rfi' || j.stage == 'gap_closure';
    final reached = current > 0 ? current : _reached(j);
    final moves = j.allowedNext.where((n) => n != 'certificate_issued').toList();
    return SectionCard(
      key: const ValueKey('process-card'),
      title: 'Process',
      subtitle: current == 0 ? ProcessStage.label(j.stage) : 'Assure Safety certification process flow',
      padding: const EdgeInsets.fromLTRB(Space.md, Space.lg, Space.md, Space.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final s in ProcessStage.flow)
            _taskRow(
              s,
              status: current == 0
                  ? (s.number <= reached ? 'Done' : 'Not started')
                  : s.number < current
                      ? 'Done'
                      : s.number > current
                          ? 'Not started'
                          : waiting
                              ? 'Waiting on client'
                              : 'Now',
              current: s.number == current,
              sub: s.number == current && j.stage != s.key ? ProcessStage.label(j.stage) : null,
            ),
          const Divider(height: Space.xl),
          Text('Move to', style: t.labelMedium),
          const SizedBox(height: Space.sm),
          if (moves.isEmpty)
            Text('No moves from here.', style: t.bodySmall)
          else
            Wrap(
              spacing: Space.sm,
              runSpacing: Space.sm,
              children: [
                for (final next in moves)
                  OutlinedButton(
                    key: ValueKey('move-$next'),
                    onPressed: _busy ? null : () => _move(next),
                    child: Text(ProcessStage.moveLabel(j.stage, next)),
                  ),
              ],
            ),
          const SizedBox(height: Space.sm),
          Text('Only the moves the process flow allows from here are offered. The server enforces the same table.',
              style: t.bodySmall),
        ],
      ),
    );
  }

  Widget _taskRow(ProcessStage s, {required String status, required bool current, String? sub}) {
    final t = Theme.of(context).textTheme;
    final (IconData icon, Tone tone) = switch (status) {
      'Done' => (Icons.check_circle, Tone.good),
      'Now' => (Icons.play_circle_fill, Tone.info),
      'Waiting on client' => (Icons.hourglass_bottom, Tone.warn),
      _ => (Icons.radio_button_unchecked, Tone.neutral),
    };
    final notStarted = status == 'Not started';
    return Container(
      key: ValueKey('task-${s.number}'),
      margin: const EdgeInsets.symmetric(vertical: 1),
      padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.sm),
      decoration: current
          ? BoxDecoration(color: Neutral.tint, borderRadius: BorderRadius.circular(Radii.sm))
          : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: notStarted ? Neutral.faint : tone.fg),
          const SizedBox(width: Space.sm),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 18, child: Text('${s.number}', style: t.labelSmall?.copyWith(height: 1.6))),
                Expanded(
                  child: Text(s.title,
                      style: current ? t.titleSmall : t.bodyMedium?.copyWith(color: notStarted ? Neutral.muted : null)),
                ),
              ]),
              // The current stage has the room: its status sits under the
              // title, with what the loop is waiting for.
              if (current)
                Padding(
                  padding: const EdgeInsets.only(left: 18, top: Space.xs),
                  child: StatusBadge(label: status, tone: tone, icon: icon, dense: true),
                ),
              if (sub != null)
                Padding(
                  padding: const EdgeInsets.only(left: 18, top: Space.xs),
                  child: Text(sub, style: t.bodySmall?.copyWith(color: Tone.warn.fg)),
                ),
            ]),
          ),
          if (!current) ...[
            const SizedBox(width: Space.sm),
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(status, style: t.labelSmall?.copyWith(color: notStarted ? Neutral.muted : tone.fg)),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _move(String next) async {
    final reason = await _askText(
      title: ProcessStage.moveLabel(_job?.stage ?? '', next),
      label: 'Reason (recorded against the move)',
      hint: 'e.g. Site visit completed 10 Sep 2026',
    );
    if (reason == null) return;
    await _send('job.transition', {'jobId': widget.jobId, 'toStage': next, if (reason.isNotEmpty) 'reason': reason},
        done: 'Moved to ${ProcessStage.short(next)}');
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  Widget _tabBar(JobRecord j) {
    final nc = j.nonCompliances.length;
    final needsWork = j.openActions > 0 || j.nonCompliances.any((f) => j.actionsFor(f.id).isEmpty);
    final tone = needsWork ? Tone.bad : Tone.neutral;
    return Padding(
      padding: const EdgeInsets.only(top: Space.md),
      // Four equal tabs when they fit; a phone scrolls them.
      child: LayoutBuilder(builder: (context, box) {
        final scroll = box.maxWidth < 560;
        return TabBar(
          controller: _tabs,
          isScrollable: scroll,
          tabAlignment: scroll ? TabAlignment.start : TabAlignment.fill,
          labelPadding: const EdgeInsets.symmetric(horizontal: Space.md),
          tabs: [
            const Tab(key: ValueKey('tab-overview'), text: 'Overview'),
            Tab(
              key: const ValueKey('tab-findings'),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Flexible(child: Text('Findings', maxLines: 1, overflow: TextOverflow.ellipsis)),
                if (nc > 0) ...[
                  const SizedBox(width: 6),
                  Semantics(
                    label: '$nc non-compliance${nc == 1 ? '' : 's'}',
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                      decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(Radii.pill)),
                      child: Text('$nc', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: tone.fg)),
                    ),
                  ),
                ],
              ]),
            ),
            const Tab(key: ValueKey('tab-communications'), text: 'Communications'),
            const Tab(key: ValueKey('tab-history'), text: 'History'),
          ],
        );
      }),
    );
  }

  List<Widget> _tabContent(JobRecord j) => switch (_tabs.index) {
        1 => [_findingsCard(j)],
        2 => [_communicationsCard(j)],
        3 => [_historyCard(j)],
        _ => [
            if (j.certificate != null) _certificateCard(j),
            _issuanceCard(j),
            _interestCard(j),
            if (j.certificate == null) _certificateCard(j),
            if (j.substances.isNotEmpty) _substancesCard(j),
            _siteCard(j),
          ],
      };

  // ── Overview: substances, site and scope ─────────────────────────────────

  /// HSLocation → Substance, as entered on New job: the names print on the
  /// site block (row 13) and, for a handler, on the certificate's table.
  Widget _substancesCard(JobRecord j) => SectionCard(
        title: 'Substances',
        subtitle: switch (j.kind) {
          'handler' => 'What the applicant is certified to handle: class and lifecycles',
          'cylinder' => 'Gas in the cylinders',
          _ => 'Hazardous substances at this location',
        },
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (final x in j.substances)
            KeyValueRow(x.name, [x.hazardClass, if ((x.lifecycles ?? '').isNotEmpty) x.lifecycles!].join('  ·  ')),
        ]),
      );

  Widget _siteCard(JobRecord j) {
    final total = j.inspectionId == null ? 0 : (j.itemsInScope ?? itemTotalFor(j.classKey));
    return SectionCard(
      title: 'Site and scope',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if ((j.address ?? '').isNotEmpty) KeyValueRow('Address', j.address!),
        if (_setName(j) != null) KeyValueRow('Assessed against', _setName(j)!),
        KeyValueRow('Items assessed', j.inspectionId == null ? 'Inspection not started' : '${j.assessedCount} of $total'),
        if (j.managerEmail != null) KeyValueRow('Site contact', j.managerEmail!),
      ]),
    );
  }

  // ── Communications: stages 1 to 3 ────────────────────────────────────────

  /// The two email templates at the end of the process flow document, as
  /// prefilled summaries. The body stays with the email; the record is the
  /// fact, the date and what it was about (IPS 21(2)(a)).
  static const _templates = <String, (String, String)>{
    'Enquiry acknowledged (email template 1)':
        ('outbound', 'Acknowledged enquiry; asked for business name, site, contact, certificate type, substances, urgency'),
    'Application pack sent (email template 2)':
        ('outbound', 'Sent application form, required documents checklist, terms and fee estimate'),
    'Application accepted':
        ('inbound', 'Completed application form and acceptance of quote received'),
    'Site visit confirmed':
        ('outbound', 'Confirmed visit date, time and who needs to be present'),
    'Certificate sent':
        ('outbound', 'Sent certificate with cover letter: what was assessed, conditions, renewal date'),
  };

  Widget _communicationsCard(JobRecord j) {
    final t = Theme.of(context).textTheme;
    return SectionCard(
      title: 'Communications',
      subtitle: 'IPS clause 21(2)(a). Stages 1 to 3: enquiry, application pack, request for further information.',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (j.communications.isEmpty)
          const EmptyState(
            icon: Icons.mail_outline,
            title: 'No communications recorded',
            message: 'Record each enquiry, application pack and request for information here.',
          )
        else
          for (final c in j.communications)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Tooltip(
                    message: c.direction == 'inbound' ? 'Received from the client' : 'Sent to the client',
                    child: Icon(c.direction == 'inbound' ? Icons.call_received : Icons.call_made,
                        size: 18, color: c.direction == 'inbound' ? Tone.good.fg : Brand.ribbon),
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(c.summary, style: t.bodyMedium),
                      Text([_d(c.at), c.medium, c.party].where((s) => s.isNotEmpty).join(' · '), style: t.bodySmall),
                      if ((c.body ?? '').isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(c.body!, style: t.bodyMedium?.copyWith(color: Neutral.body)),
                        ),
                    ]),
                  ),
                ],
              ),
            ),
        const SizedBox(height: Space.sm),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            key: const ValueKey('record-communication'),
            onPressed: _busy ? null : _recordCommunication,
            icon: const Icon(Icons.mail_outline, size: 18),
            label: const Text('Record communication'),
          ),
        ),
      ]),
    );
  }

  Future<void> _recordCommunication() async {
    var direction = 'outbound';
    var medium = 'email';
    final form = GlobalKey<FormState>();
    final party = TextEditingController(text: _job?.clientName ?? '');
    final summary = TextEditingController();
    final body = TextEditingController();
    const gap = SizedBox(height: Space.md);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Record a communication'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: Form(
                key: form,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Template (optional)'),
                    items: [
                      for (final e in _templates.entries) DropdownMenuItem(value: e.key, child: Text(e.key)),
                    ],
                    onChanged: (v) {
                      if (v == null) return;
                      setD(() {
                        direction = _templates[v]!.$1;
                        summary.text = _templates[v]!.$2;
                      });
                    },
                  ),
                  gap,
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: direction,
                    decoration: const InputDecoration(labelText: 'Direction'),
                    items: const [
                      DropdownMenuItem(value: 'outbound', child: Text('Sent to the client')),
                      DropdownMenuItem(value: 'inbound', child: Text('Received from the client')),
                    ],
                    onChanged: (v) => setD(() => direction = v ?? direction),
                  ),
                  gap,
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: medium,
                    decoration: const InputDecoration(labelText: 'Medium'),
                    items: const [
                      DropdownMenuItem(value: 'email', child: Text('Email')),
                      DropdownMenuItem(value: 'phone', child: Text('Phone')),
                      DropdownMenuItem(value: 'meeting', child: Text('Meeting')),
                      DropdownMenuItem(value: 'letter', child: Text('Letter')),
                      DropdownMenuItem(value: 'other', child: Text('Other')),
                    ],
                    onChanged: (v) => setD(() => medium = v ?? medium),
                  ),
                  gap,
                  TextFormField(controller: party, decoration: const InputDecoration(labelText: 'With whom')),
                  gap,
                  TextFormField(
                    controller: summary,
                    key: const ValueKey('comm-summary'),
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'What it was about'),
                    validator: (v) => (v ?? '').trim().isEmpty ? 'Say what it was about' : null,
                  ),
                  gap,
                  TextFormField(controller: body, maxLines: 3, decoration: const InputDecoration(labelText: 'Detail (optional)')),
                ]),
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              key: const ValueKey('comm-save'),
              onPressed: () {
                if (form.currentState?.validate() ?? false) Navigator.pop(ctx, true);
              },
              child: const Text('Record'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || summary.text.trim().isEmpty) return;
    await _send(
      'communication.record',
      {
        'jobId': widget.jobId,
        'direction': direction,
        'medium': medium,
        'party': party.text.trim(),
        'summary': summary.text.trim(),
        if (body.text.trim().isNotEmpty) 'body': body.text.trim(),
      },
      done: 'Communication recorded',
    );
  }

  /// Stage 3: "issue Request for Further Information with a clear list of
  /// gaps". The list is the record; the stage moves to RFI in the same batch.
  Future<void> _sendRfi() async {
    final gaps = await _askText(
      title: 'Request for further information',
      label: 'Gaps, one per line',
      hint: 'e.g. Current SDS for Abamectin\nEmergency response plan',
      lines: 5,
    );
    if (gaps == null || gaps.isEmpty) return;
    final r = await _sendAll([
      ('communication.record', {
        'jobId': widget.jobId,
        'direction': 'outbound',
        'medium': 'email',
        'party': _job?.clientName ?? '',
        'summary': 'Request for further information',
        'body': gaps,
      }),
      ('job.transition', {'jobId': widget.jobId, 'toStage': 'rfi', 'reason': 'RFI issued'}),
    ]);
    if (r == _Sent.sent && mounted) showDone(context, 'Request for further information sent');
  }

  Future<void> _rfiAnswered() async {
    final note = await _askText(
      title: 'Information received',
      label: 'What was received',
      hint: 'e.g. SDS and ERP received by email',
    );
    if (note == null) return;
    final r = await _sendAll([
      ('communication.record', {
        'jobId': widget.jobId,
        'direction': 'inbound',
        'medium': 'email',
        'party': _job?.clientName ?? '',
        'summary': note.isEmpty ? 'Further information received' : note,
      }),
      ('job.transition', {'jobId': widget.jobId, 'toStage': 'document_review', 'reason': 'RFI answered'}),
    ]);
    if (r == _Sent.sent && mounted) showDone(context, 'Recorded; back to document review');
  }

  // ── IPS 23: the conflict-of-interest question ────────────────────────────

  Widget _interestCard(JobRecord j) {
    final t = Theme.of(context).textTheme;
    final conflict = j.conflictFound == true;
    return SectionCard(
      title: 'Register of interests',
      subtitle: 'IPS clause 23. A certificate cannot issue until this is answered.',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (j.interestDeclared)
          Row(children: [
            Icon(conflict ? Tone.warn.icon : Tone.good.icon, size: 20, color: conflict ? Tone.warn.fg : Tone.good.fg),
            const SizedBox(width: Space.sm),
            Text(conflict ? 'Conflict declared' : 'No conflict of interest declared', style: t.titleSmall),
          ])
        else if (!CurrentUser.canDecide)
          Text('Answered by the compliance certifier.', style: t.bodySmall)
        else
          Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
            FilledButton(
              key: const ValueKey('declare-none'),
              onPressed: _busy
                  ? null
                  : () => _send('interest.declare', {'jobId': widget.jobId, 'conflictFound': false},
                      done: 'Declaration recorded'),
              child: const Text('No conflict of interest'),
            ),
            OutlinedButton(
              onPressed: _busy ? null : _declareConflict,
              child: const Text('Declare a conflict'),
            ),
          ]),
      ]),
    );
  }

  Future<void> _declareConflict() async {
    final d = await _askText(
      title: 'Declare a conflict of interest',
      label: 'Describe the interest (IPS 23(3)(d))',
      hint: 'e.g. Previously advised this client on the ERP',
    );
    if (d == null || d.isEmpty) return;
    await _send('interest.declare', {'jobId': widget.jobId, 'conflictFound': true, 'description': d},
        done: 'Conflict declared');
  }

  // ── Findings: stage 5 non-compliances and their corrective actions ───────

  static (String, Tone) _severity(String s) => switch (s) {
        'critical' => ('Critical', Tone.bad),
        'major' => ('Major', Tone.warn),
        'minor' => ('Minor', Tone.neutral),
        _ => (s, Tone.neutral),
      };

  static (String, Tone) _status(CorrectiveAction ca) {
    if (ca.isVerified) return ('Verified', Tone.good);
    if (ca.status == 'resolved') return ('Resolved', Tone.info);
    final due = ca.dueDate;
    final now = DateTime.now();
    if (due != null && due.isBefore(DateTime(now.year, now.month, now.day))) return ('Overdue', Tone.bad);
    return switch (ca.status) {
      'open' => ('Open', Tone.warn),
      'in_progress' => ('In progress', Tone.warn),
      final s => (s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1).replaceAll('_', ' ')}', Tone.neutral),
    };
  }

  Widget _findingsCard(JobRecord j) {
    final nc = j.nonCompliances;
    return SectionCard(
      title: 'Non-compliances and corrective actions',
      subtitle: 'Stage 5. Each non-compliance needs an action, verified by a named person before issue.',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (nc.isEmpty)
          const EmptyState(
            icon: Icons.check_circle_outline,
            title: 'No non-compliances recorded',
            message: 'Items marked not compliant on the check sheet appear here.',
          )
        else
          for (final (i, f) in nc.indexed) ...[
            if (i > 0) const Divider(height: Space.xl),
            _findingBlock(j, f),
          ],
        if (nc.isNotEmpty) ...[
          const SizedBox(height: Space.lg),
          Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
            OutlinedButton.icon(
              key: const ValueKey('nc-report'),
              onPressed: () => openExternalDocument(api.authedUri('/api/jobs/${j.id}/non-compliance.html')),
              icon: const Icon(Icons.print_outlined, size: 18),
              label: const Text('Non-compliance report'),
            ),
            if (CurrentUser.canRecord)
              OutlinedButton.icon(
                key: const ValueKey('nc-send'),
                onPressed: _busy ? null : () => _sendDocument('non_compliance', 'the non-compliance report'),
                icon: const Icon(Icons.mail_outline, size: 18),
                label: const Text('Email to client'),
              ),
          ]),
        ],
      ]),
    );
  }

  Widget _findingBlock(JobRecord j, JobFinding f) {
    final t = Theme.of(context).textTheme;
    final actions = j.actionsFor(f.id);
    return Container(
      padding: const EdgeInsets.only(left: Space.md),
      decoration: BoxDecoration(border: Border(left: BorderSide(color: Tone.bad.fg, width: 3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_ref(f), style: t.titleSmall),
                if ((f.failureReason ?? '').isNotEmpty) Text(Wording.humanise(f.failureReason!), style: t.bodyMedium),
                if (actions.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text('No corrective action yet', style: t.bodySmall?.copyWith(color: Tone.warn.fg)),
                  ),
              ]),
            ),
            TextButton.icon(
              key: ValueKey('raise-${f.id}'),
              onPressed: _busy ? null : () => _raise(f),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add action'),
            ),
          ],
        ),
        for (final ca in actions) _actionRow(ca),
      ]),
    );
  }

  Widget _actionRow(CorrectiveAction ca) {
    final t = Theme.of(context).textTheme;
    final (sevLabel, sevTone) = _severity(ca.severity);
    final (stLabel, stTone) = _status(ca);
    return Container(
      margin: const EdgeInsets.only(top: Space.sm),
      padding: const EdgeInsets.all(Space.md),
      decoration: BoxDecoration(color: Neutral.canvas, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ca.description, style: t.bodyMedium),
              const SizedBox(height: Space.xs),
              Wrap(
                spacing: Space.sm,
                runSpacing: Space.xs,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  StatusBadge(label: sevLabel, tone: sevTone, dense: true),
                  StatusBadge(label: stLabel, tone: stTone, dense: true),
                  if (ca.dueDate != null) Text('Due ${_d(ca.dueDate)}', style: t.bodySmall),
                  if (ca.isVerified)
                    Text('Verified ${_d(ca.reverifiedAt)} by ${ca.reverifiedByName ?? 'compliance certifier'}',
                        style: t.bodySmall),
                ],
              ),
            ]),
          ),
          if (!ca.isVerified) ...[
            if (ca.status != 'resolved')
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _send('corrective_action.update', {'correctiveActionId': ca.id, 'status': 'resolved'},
                        done: 'Marked resolved'),
                child: const Text('Resolved'),
              ),
            if (CurrentUser.canDecide)
              TextButton(
                key: ValueKey('verify-${ca.id}'),
                onPressed: _busy
                    ? null
                    : () => _send('corrective_action.update', {'correctiveActionId': ca.id, 'status': 'verified'},
                        done: 'Corrective action verified'),
                child: const Text('Verify'),
              ),
          ],
        ],
      ),
    );
  }

  Future<void> _raise(JobFinding f) async {
    var severity = 'major';
    DateTime? due;
    final form = GlobalKey<FormState>();
    final desc = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text('Corrective action for ${_ref(f)}'),
          content: SizedBox(
            width: 480,
            child: Form(
              key: form,
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: severity,
                  decoration: const InputDecoration(labelText: 'Severity (process flow stage 5)'),
                  items: const [
                    DropdownMenuItem(value: 'critical', child: Text('Critical')),
                    DropdownMenuItem(value: 'major', child: Text('Major')),
                    DropdownMenuItem(value: 'minor', child: Text('Minor')),
                  ],
                  onChanged: (v) => setD(() => severity = v ?? 'major'),
                ),
                const SizedBox(height: Space.md),
                TextFormField(
                  controller: desc,
                  key: const ValueKey('ca-description'),
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'What must change'),
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Say what must change' : null,
                ),
                const SizedBox(height: Space.md),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const ValueKey('ca-due'),
                      onPressed: () async {
                        final now = DateTime.now();
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: due ?? now.add(const Duration(days: 14)),
                          firstDate: DateTime(now.year - 1),
                          lastDate: DateTime(now.year + 5),
                          helpText: 'Corrective action due',
                        );
                        if (picked != null) setD(() => due = picked);
                      },
                      icon: const Icon(Icons.event_outlined, size: 18),
                      label: Text(due == null ? 'Due date (optional)' : 'Due ${_d(due)}'),
                    ),
                  ),
                  if (due != null)
                    IconButton(
                      tooltip: 'Clear the due date',
                      icon: const Icon(Icons.close),
                      onPressed: () => setD(() => due = null),
                    ),
                ]),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              key: const ValueKey('ca-save'),
              onPressed: () {
                if (form.currentState?.validate() ?? false) Navigator.pop(ctx, true);
              },
              child: const Text('Raise'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || desc.text.trim().isEmpty) return;
    await _send(
      'corrective_action.raise',
      {
        'findingId': f.id,
        'severity': severity,
        'description': desc.text.trim(),
        if (due != null) 'dueDate': _iso(due!),
      },
      done: 'Corrective action raised',
    );
  }

  /// Email a rendered document to the client; the server records it.
  Future<void> _sendDocument(String document, String label) async {
    final to = await _askText(
      title: 'Email $label',
      label: 'Recipient email',
      hint: _job?.managerEmail ?? 'name@client.co.nz',
      initial: _job?.managerEmail,
    );
    if (to == null || to.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    var ok = false;
    try {
      final r = await api.sendDocument(widget.jobId, document: document, to: to);
      ok = true;
      if (mounted) showDone(context, '${r['summary'] ?? 'Recorded'}');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'Not sent: $e');
    } finally {
      await _reload(keepError: !ok);
    }
  }

  // ── Stage 6: the issuance dry-run ────────────────────────────────────────

  Widget _issuanceCard(JobRecord j) {
    final t = Theme.of(context).textTheme;
    final c = _check;
    final tone = c == null
        ? Tone.neutral
        : c.canGrant
            ? Tone.good
            : c.canIssueConditional
                ? Tone.warn
                : Tone.bad;
    return SectionCard(
      title: 'Issuance check',
      subtitle: 'Stage 6. The same rule the database applies when the certificate is written.',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (c == null)
          Text('Not available.', style: t.bodySmall)
        else ...[
          Row(children: [
            Icon(c.canGrant ? Icons.check_circle : Icons.block, color: tone.fg, size: 20),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Text(
                c.canGrant
                    ? 'Can grant'
                    : c.canIssueConditional
                        ? 'Conditional certificate or refusal only'
                        : 'Cannot issue',
                style: t.titleSmall?.copyWith(color: tone.fg),
              ),
            ),
          ]),
          const SizedBox(height: Space.xs),
          Text(
            [
              '${c.unresolvedNonCompliances} unresolved non-compliance(s)',
              '${j.pendingCount} item(s) still pending',
            ].join(' · '),
            style: t.bodySmall,
          ),
          for (final b in c.blockers)
            Padding(
              padding: const EdgeInsets.only(top: Space.sm),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Tone.warn.icon, size: 18, color: Tone.warn.fg),
                const SizedBox(width: Space.sm),
                Expanded(
                  child: Text(Wording.humanise('${b.clause ?? ''}: ${b.reason}'.replaceFirst(RegExp(r'^: '), '')),
                      style: t.bodyMedium),
                ),
              ]),
            ),
        ],
      ]),
    );
  }

  // ── Stage 7: the certificate ─────────────────────────────────────────────

  static String _decision(String d) => switch (d) {
        'granted' => 'Granted',
        'conditional' => 'Granted subject to conditions',
        'refused' => 'Refused',
        _ => d,
      };

  Widget _certSendButton({required bool filled}) {
    final onPressed = _busy ? null : () => _sendDocument('certificate', 'the certificate');
    const icon = Icon(Icons.mail_outline, size: 18);
    const label = Text('Email certificate to client');
    return filled
        ? FilledButton.icon(key: const ValueKey('cert-send'), onPressed: onPressed, icon: icon, label: label)
        : OutlinedButton.icon(key: const ValueKey('cert-send'), onPressed: onPressed, icon: icon, label: label);
  }

  Widget _certificateCard(JobRecord j) {
    final t = Theme.of(context).textTheme;
    final c = j.certificate;
    return SectionCard(
      title: 'Certificate',
      subtitle: 'Stage 7. Issued from the job record in the workbook layout; retention set on issue (IPS 21(6)).',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (c == null && !CurrentUser.canDecide)
          Text('Issued by the compliance certifier.', style: t.bodySmall)
        else if (c == null)
          Text(
            j.stage == 'final_validation'
                ? 'Not issued yet. Issue it from Next step above.'
                : 'Not issued yet. Available once the job reaches Final Validation.',
            style: t.bodySmall,
          )
        else ...[
          KeyValueRow('Decision', _decision(c.decision)),
          KeyValueRow('Certificate number', c.certificateNumber ?? ''),
          if (c.registerNumber != null) KeyValueRow('Register number', c.registerNumber!),
          KeyValueRow('Issue date', _d(c.issueDate)),
          KeyValueRow('In force', _d(c.inForceDate)),
          KeyValueRow('Expiry', _d(c.expiryDate)),
          if (c.conditions.isNotEmpty) KeyValueRow('Conditions', c.conditions.join('; ')),
          if (c.requirementsNotMet.isNotEmpty) KeyValueRow('Requirements not met', c.requirementsNotMet.join('; ')),
          KeyValueRow('WorkSafe register due', _d(c.worksafeRegisterDue)),
          KeyValueRow('Retain records until', _d(j.retainUntil)),
          // At stage 7 the send is the Next step; afterwards it lives here.
          if (CurrentUser.canDecide && j.stage != 'certificate_issued') ...[
            const SizedBox(height: Space.md),
            Align(alignment: Alignment.centerLeft, child: _certSendButton(filled: false)),
          ],
        ],
      ]),
    );
  }

  Future<void> _issue() async {
    final j = _job!;
    final today = DateTime.now();
    var decision = _check?.canGrant == true ? 'granted' : 'conditional';
    var issueDate = DateTime(today.year, today.month, today.day);
    var expiry = DateTime(today.year + 1, today.month, today.day);
    final number = TextEditingController(text: '${CurrentUser.authorisationNumber}-${today.year}-${j.id.toString().padLeft(4, '0')}');
    final issuedTo = TextEditingController(
        text: '${j.subject['Name'] ?? j.subject['Full Name of PCBU'] ?? j.clientName}');
    final appliesTo = TextEditingController(
        text: '${j.subject['Company'] ?? j.subject['Company/Legal Entity'] ?? j.address ?? j.locationName}');
    final lines = TextEditingController();

    Widget heading(BuildContext ctx, String text) => Padding(
          padding: const EdgeInsets.only(top: Space.lg, bottom: Space.sm),
          child: Text(text, style: Theme.of(ctx).textTheme.titleSmall),
        );

    Future<DateTime?> pick(BuildContext ctx, DateTime initial, String help) => showDatePicker(
          context: ctx,
          initialDate: initial,
          firstDate: DateTime(today.year - 1),
          lastDate: DateTime(today.year + 10),
          helpText: help,
        );

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Issue certificate'),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Decision', style: Theme.of(ctx).textTheme.titleSmall),
                const SizedBox(height: Space.sm),
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: decision,
                  items: const [
                    DropdownMenuItem(value: 'granted', child: Text('Granted')),
                    DropdownMenuItem(value: 'conditional', child: Text('Granted subject to conditions (reg 6.24)')),
                    DropdownMenuItem(value: 'refused', child: Text('Refused (reg 6.23)')),
                  ],
                  onChanged: (v) => setD(() => decision = v ?? decision),
                ),
                if (decision != 'granted') ...[
                  const SizedBox(height: Space.md),
                  TextField(
                    controller: lines,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: decision == 'conditional' ? 'Conditions, one per line' : 'Requirements not met, one per line',
                    ),
                  ),
                ],
                heading(ctx, 'Certificate details'),
                TextField(controller: number, decoration: const InputDecoration(labelText: 'Certificate number (IPS 8(1)(c))')),
                const SizedBox(height: Space.md),
                TextField(controller: issuedTo, decoration: const InputDecoration(labelText: 'Issued to')),
                const SizedBox(height: Space.md),
                TextField(controller: appliesTo, decoration: const InputDecoration(labelText: 'Applies to (location)')),
                heading(ctx, 'Dates'),
                Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                  OutlinedButton.icon(
                    key: const ValueKey('issue-date'),
                    onPressed: () async {
                      final d = await pick(ctx, issueDate, 'Issue date');
                      if (d != null) setD(() => issueDate = d);
                    },
                    icon: const Icon(Icons.event_outlined, size: 18),
                    label: Text('Issued ${_d(issueDate)}'),
                  ),
                  OutlinedButton.icon(
                    key: const ValueKey('expiry-date'),
                    onPressed: () async {
                      final d = await pick(ctx, expiry, 'Expiry date');
                      if (d != null) setD(() => expiry = d);
                    },
                    icon: const Icon(Icons.event_busy_outlined, size: 18),
                    label: Text('Expires ${_d(expiry)}'),
                  ),
                ]),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
                key: const ValueKey('issue-confirm'),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Issue')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final list = lines.text.split('\n').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await api.issueCertificate(j.id, {
        'inspectionId': j.inspectionId,
        'decision': decision,
        'certificateNumber': number.text.trim(),
        'issuedTo': issuedTo.text.trim(),
        'appliesTo': appliesTo.text.trim(),
        'issueDate': _iso(issueDate),
        'expiryDate': _iso(expiry),
        if (decision == 'conditional') 'conditions': list,
        if (decision == 'refused') 'requirementsNotMet': list,
      });
      await _reload();
      if (mounted) showDone(context, 'Certificate issued and recorded');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
      await _reload(keepError: true);
    } catch (e) {
      if (mounted) setState(() => _error = 'Not issued: $e');
      await _reload(keepError: true);
    }
  }

  // ── History: every move, who and when ────────────────────────────────────

  /// IPS 22: who did what on this job, newest first, refusals included.
  Widget _historyCard(JobRecord j) {
    final t = Theme.of(context).textTheme;
    return SectionCard(
      title: 'History',
      subtitle: 'Every record on this job, by person. Refusals stay on the record with their clause.',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (j.events.isEmpty && j.transitions.isEmpty)
          const EmptyState(icon: Icons.history, title: 'Nothing recorded yet')
        else if (j.events.isEmpty)
          for (final tr in j.transitions)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.xs),
              child: Text(
                '${_d(tr.at)}  ${tr.from == null ? '' : '${ProcessStage.label(tr.from!)} → '}${ProcessStage.label(tr.to)}'
                '${(tr.reason ?? '').isEmpty ? '' : '  (${tr.reason})'}',
                style: t.bodyMedium,
              ),
            )
        else
          for (final e in j.events.take(40))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.xs),
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: '${_d(e.at)}  ', style: const TextStyle(color: Neutral.muted)),
                  TextSpan(text: e.userName ?? 'Unknown device', style: const TextStyle(fontWeight: FontWeight.w600)),
                  TextSpan(text: ' ${Wording.humanise(e.verb)}'),
                  if (e.outcome == 'rejected')
                    TextSpan(
                        text: '  refused${e.clause != null ? ' (${e.clause})' : ''}',
                        style: TextStyle(color: Tone.bad.fg, fontWeight: FontWeight.w600)),
                ]),
                style: t.bodyMedium,
              ),
            ),
      ]),
    );
  }

  Future<String?> _askText({required String title, required String label, String? hint, int lines = 2, String? initial}) async {
    final c = TextEditingController(text: initial ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 480,
          child: TextField(
            controller: c,
            key: const ValueKey('ask-text'),
            autofocus: true,
            maxLines: lines,
            decoration: InputDecoration(labelText: label, hintText: hint),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
              key: const ValueKey('ask-ok'),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('OK')),
        ],
      ),
    );
    return ok == true ? c.text.trim() : null;
  }
}
