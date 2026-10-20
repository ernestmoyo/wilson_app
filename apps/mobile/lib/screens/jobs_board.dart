import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../auth/session.dart';
import '../bootstrap.dart';
import '../models/dashboard.dart';
import '../models/job.dart';
import '../sync/api_client.dart';
import '../sync/outbox.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/app_shell.dart';
import '../widgets/brand_bar.dart';
import '../widgets/job_context_bar.dart';
import '../widgets/ui.dart';

// Sign-out's guard moved to the shell with the Sign out button; kept
// importable from here.
export '../widgets/app_shell.dart' show confirmSignOut;

/// The landing: Brian's active clients. One row per client (grouped by the
/// client's id, so two clients that share a name stay two), its open jobs
/// under it with stage and what each needs now. Needs attention shows only
/// when something does; recent activity sits last. A certifier archives a
/// client that is not real work; it leaves the list and the reminders but
/// keeps its records (16 October 2026).
class JobsBoard extends StatefulWidget {
  final ApiClient api;
  final SyncService sync;
  final Session session;
  final Future<void> Function() onSignOut;

  /// 'clients' (By client) or 'jobs' (All jobs); the app keeps the choice
  /// while it is open.
  final String initialView;
  final ValueChanged<String>? onViewChanged;
  const JobsBoard({
    super.key,
    required this.api,
    required this.sync,
    required this.session,
    required this.onSignOut,
    this.initialView = 'clients',
    this.onViewChanged,
  });

  /// "Good morning" until noon, "Good afternoon" until five, then evening.
  static String greeting(DateTime now) => now.hour >= 5 && now.hour < 12
      ? 'Good morning'
      : now.hour >= 12 && now.hour < 17
          ? 'Good afternoon'
          : 'Good evening';

  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June', //
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /// "20 October 2026".
  static String longDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  @override
  State<JobsBoard> createState() => _JobsBoardState();
}

/// Where an open job stands, for the All jobs filters and order: Bryan's
/// move, the client's move, or certified and being looked after.
enum _Bucket {
  inProgress('in-progress', 'In progress'),
  waiting('waiting', 'Waiting on client'),
  issued('issued', 'Issued');

  final String key;
  final String label;
  const _Bucket(this.key, this.label);

  static _Bucket of(String stage) => switch (stage) {
        'rfi' || 'gap_closure' => waiting,
        'certificate_issued' || 'monitoring' => issued,
        _ => inProgress,
      };
}

class _JobsBoardState extends State<JobsBoard> {
  late String _view = widget.initialView == 'jobs' ? 'jobs' : 'clients';

  /// The All jobs filter: null for all.
  _Bucket? _bucket;

  List<JobSummary>? _jobs;
  DashboardData? _dash;
  List<SheetSet>? _sets;
  bool _busy = false;
  String? _error;

  /// Archived clients, read only when Brian asks for them.
  List<JobSummary>? _archivedJobs;
  bool _showArchived = false;

  /// Clients with nothing open (every job closed or referred), shown on request.
  bool _showPast = false;

  /// The board search: client, trading name, location, applicant, address.
  final _search = TextEditingController();
  String _query = '';

  /// The attention tile whose list is open: null for the first with
  /// something in it, empty for none.
  String? _attentionGroup;

  /// The empty board offers the G2 workbook job only in a demo build
  /// (--dart-define=DEMO=true), so a demo is never seeded on production.
  static const _demoBuild = bool.fromEnvironment('DEMO');

  /// Open work: anything not closed or referred. A monitoring job is a
  /// certified client Brian still looks after.
  static bool _isOpen(JobSummary j) => !const {'closed', 'referred'}.contains(j.stage);

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      final rows = (await widget.api.getJson('/api/jobs') as List).cast<Map<String, dynamic>>();
      final archived = _showArchived
          ? (await widget.api.getJson('/api/jobs?archived=1') as List).cast<Map<String, dynamic>>()
          : null;
      DashboardData? dash;
      try {
        dash = await widget.api.dashboard();
      } catch (_) {
        dash = null;
      }
      if (!mounted) return;
      setState(() {
        _jobs = rows.map(JobSummary.fromJson).toList();
        _archivedJobs = archived?.map(JobSummary.fromJson).toList();
        _dash = dash;
        _error = null;
      });
    } on ApiException catch (e) {
      if (e.status == 401) {
        await widget.onSignOut();
        return;
      }
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not reach the server: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(int jobId) async {
    context.go('/jobs/$jobId');
  }

  Future<void> _createDemo() async {
    setState(() => _busy = true);
    try {
      final job = await ensureG2Job(widget.api);
      await _reload();
      if (mounted) await _open(job.jobId);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _newJob() async {
    _sets ??= await widget.api.sheetSets().catchError((_) => <SheetSet>[]);
    final sets = (_sets ?? const <SheetSet>[]).isEmpty
        ? const [SheetSet(key: 'class_6_8', name: 'Location: classes 6 or 8', templates: [], authorised: true)]
        : _sets!;
    if (!mounted) return;
    final legal = TextEditingController();
    final trading = TextEditingController();
    final address = TextEditingController();
    final location = TextEditingController();
    final manager = TextEditingController();
    final phone = TextEditingController();
    // One row per substance: name, hazard class, lifecycles (handler only).
    final substances = <(TextEditingController, TextEditingController, TextEditingController)>[
      (TextEditingController(), TextEditingController(), TextEditingController()),
    ];
    var classKey = 'class_6_8';
    // Q5 (20 Oct 2026): an existing stationary container system on a reg
    // 17.91 report needs a peer review before the certificate issues.
    var peerReview = false;
    // The set's scope choices picked for this job (e.g. which 3.1 arrangements).
    final chosen = <String>{};
    List<ScopeChoice> choicesOf(String key) => sets.firstWhere((x) => x.key == key, orElse: () => sets.first).choices;
    // An existing client picked from the suggestions: the job goes under it
    // instead of making a second client with the same name.
    final clients = _groups(_jobs ?? const []);
    _ClientGroup? picked;
    final legalFocus = FocusNode();
    String kindOf(String key) => sets.firstWhere((x) => x.key == key, orElse: () => sets.first).kind;
    // Inline validation (UX U3/U4): Create with a required field empty shows
    // what is missing instead of closing with nothing made.
    var showErrors = false;
    String? need(TextEditingController c, String message) => showErrors && c.text.trim().isEmpty ? message : null;
    bool missing() => [legal, address, location].any((c) => c.text.trim().isEmpty);
    final t = Theme.of(context).textTheme;
    Widget section(String label) => Padding(
          key: ValueKey('nj-section-$label'),
          padding: const EdgeInsets.only(top: Space.sm),
          child: Text(label, style: t.titleSmall?.copyWith(color: Brand.ribbon)),
        );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) {
          void recheck(String _) {
            if (showErrors) setD(() {});
          }
          return AlertDialog(
          title: const Text('New job'),
          // A fixed reading width: the scope chips wrap inside it instead of
          // stretching the dialog across the screen.
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 10, children: [
              section('Scope'),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: classKey,
                decoration: const InputDecoration(labelText: 'Check sheets'),
                items: [
                  for (final x in sets)
                    DropdownMenuItem(
                      value: x.key,
                      enabled: x.authorised,
                      child: Text(x.authorised ? x.name : '${x.name} (outside authorisation)',
                          style: TextStyle(color: x.authorised ? null : Neutral.muted)),
                    ),
                ],
                onChanged: (v) => setD(() {
                  classKey = v ?? classKey;
                  chosen.clear();
                }),
              ),
              if (choicesOf(classKey).isNotEmpty)
                Column(
                  key: const ValueKey('nj-choices'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(chosen.isEmpty ? 'Pick what this location is (one or more)' : 'What this location is',
                        style: t.labelMedium?.copyWith(color: chosen.isEmpty ? Tone.bad.fg : Neutral.body)),
                    const SizedBox(height: 6),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final c in choicesOf(classKey))
                        FilterChip(
                          key: ValueKey('nj-choice-${c.key}'),
                          label: Text(c.label),
                          selected: chosen.contains(c.key),
                          onSelected: (on) => setD(() => on ? chosen.add(c.key) : chosen.remove(c.key)),
                        ),
                    ]),
                  ],
                ),
              if (sets.any((x) => x.key == classKey && x.regulation != null))
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(sets.firstWhere((x) => x.key == classKey).regulation!, style: t.bodySmall),
                ),
              // Appendix A authorises 4.1.1 only; 3.2 and 4.1.2 are an open question (phase 2, E).
              if (classKey == 'class_3_2_4')
                Text('Authorised for 4.1.1 only (Appendix A). 3.2 and 4.1.2 substances: not yet authorised.',
                    key: const ValueKey('nj-set-note'), style: t.bodySmall?.copyWith(color: Tone.warn.fg)),
              section('Client'),
              RawAutocomplete<_ClientGroup>(
                textEditingController: legal,
                focusNode: legalFocus,
                displayStringForOption: (c) => c.name,
                optionsBuilder: (v) {
                  final q = v.text.trim().toLowerCase();
                  if (q.length < 2) return const Iterable<_ClientGroup>.empty();
                  return clients.where((c) => c.name.toLowerCase().contains(q) || (c.trading ?? '').toLowerCase().contains(q)).take(6);
                },
                onSelected: (c) => setD(() => picked = c),
                fieldViewBuilder: (ctx, controller, focus, onSubmit) => TextField(
                  controller: controller,
                  focusNode: focus,
                  key: const ValueKey('nj-legal'),
                  decoration: InputDecoration(
                    labelText: 'Client (legal entity name)',
                    helperText: picked != null ? 'Existing client: this job is added under it' : null,
                    errorText: need(legal, 'Enter the client\'s legal name'),
                  ),
                  // Editing the name after picking means a different client.
                  onChanged: (text) {
                    final p = picked;
                    if (p != null && text != p.name) setD(() => picked = null);
                    recheck(text);
                  },
                ),
                optionsViewBuilder: (ctx, onSelect, options) => Align(
                  alignment: Alignment.topLeft,
                  child: Material(
                    elevation: 4,
                    borderRadius: BorderRadius.circular(Radii.sm),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 260, maxWidth: 420),
                      child: ListView(padding: EdgeInsets.zero, shrinkWrap: true, children: [
                        for (final c in options)
                          ListTile(
                            key: ValueKey('nj-client-${c.id}'),
                            dense: true,
                            title: Text(c.name),
                            subtitle: Text(c.jobs.first.address ?? c.jobs.first.locationName, maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: () => onSelect(c),
                          ),
                      ]),
                    ),
                  ),
                ),
              ),
              TextField(controller: trading, decoration: const InputDecoration(labelText: 'Trading as (optional)')),
              section('Site'),
              TextField(
                controller: address,
                key: const ValueKey('nj-address'),
                onChanged: recheck,
                decoration: InputDecoration(labelText: 'Site address', errorText: need(address, 'Enter the site address')),
              ),
              Row(children: [
                Expanded(child: TextField(controller: manager, decoration: const InputDecoration(labelText: 'Site manager (optional)'))),
                const SizedBox(width: Space.sm),
                Expanded(child: TextField(controller: phone, decoration: const InputDecoration(labelText: 'Manager phone (optional)'))),
              ]),
              section('Location'),
              TextField(
                controller: location,
                key: const ValueKey('nj-location'),
                onChanged: recheck,
                decoration: InputDecoration(
                  labelText: switch (kindOf(classKey)) {
                    'handler' => 'Applicant (full name)',
                    'cylinder' => 'Shipment or batch reference',
                    _ => 'Hazardous substance location, e.g. G2 Chiller',
                  },
                  errorText: need(location, switch (kindOf(classKey)) {
                    'handler' => 'Enter the applicant\'s full name',
                    'cylinder' => 'Enter the shipment or batch reference',
                    _ => 'Enter the location',
                  }),
                ),
              ),
              section('Substances'),
              Text(
                switch (kindOf(classKey)) {
                  'handler' => 'Substances the applicant will handle',
                  'cylinder' => 'Gas in the cylinders (optional)',
                  _ => 'Hazardous substances at the location',
                },
                style: t.bodySmall,
              ),
              for (var k = 0; k < substances.length; k++) ...[
                Row(children: [
                  Expanded(
                    flex: 5,
                    child: TextField(
                      controller: substances[k].$1,
                      key: ValueKey('nj-sub-$k-name'),
                      decoration: const InputDecoration(labelText: 'Substance'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 3,
                    child: TextField(
                      controller: substances[k].$2,
                      key: ValueKey('nj-sub-$k-class'),
                      decoration: const InputDecoration(labelText: 'Class, e.g. 6.1B'),
                    ),
                  ),
                ]),
                if (kindOf(classKey) == 'handler')
                  TextField(
                    controller: substances[k].$3,
                    key: ValueKey('nj-sub-$k-lifecycles'),
                    decoration: const InputDecoration(labelText: 'Lifecycles, e.g. use, storage'),
                  ),
              ],
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const ValueKey('nj-add-substance'),
                  onPressed: () => setD(() => substances.add((TextEditingController(), TextEditingController(), TextEditingController()))),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add substance'),
                ),
              ),
              if (kindOf(classKey) == 'location') ...[
                section('Peer review'),
                CheckboxListTile(
                  key: const ValueKey('nj-peer-review'),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: peerReview,
                  onChanged: (v) => setD(() => peerReview = v ?? false),
                  title: const Text('Existing stationary container system — 17.91 report (needs peer review)'),
                ),
              ],
            ]),
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
                key: const ValueKey('nj-create'),
                onPressed: choicesOf(classKey).isNotEmpty && chosen.isEmpty
                    ? null
                    : () => missing() ? setD(() => showErrors = true) : Navigator.pop(ctx, true),
                child: const Text('Create')),
          ],
          );
        },
      ),
    );
    if (ok != true || legal.text.trim().isEmpty || address.text.trim().isEmpty || location.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final created = await widget.api.postJson('/api/jobs', {
        'client': {
          if (picked != null && picked!.id != null && picked!.name == legal.text.trim()) 'id': picked!.id,
          'legalName': legal.text.trim(),
          'tradingName': trading.text.trim().isEmpty ? null : trading.text.trim(),
        },
        'site': {'address': address.text.trim()},
        'location': {'name': location.text.trim()},
        'classKey': classKey,
        if (choicesOf(classKey).isNotEmpty) 'scopeChoices': chosen.toList(),
        if (peerReview && kindOf(classKey) == 'location') 'peerReviewRequired': true,
        // Form sheets: what was typed becomes the first subject field, so the
        // sheet opens with it filled in the template's own label.
        if (kindOf(classKey) != 'location')
          'subject': kindOf(classKey) == 'handler'
              ? {'Name': location.text.trim(), 'Company': legal.text.trim(), 'Address': address.text.trim()}
              : {'Company/Legal Entity': legal.text.trim(), 'Physical Address': address.text.trim()},
        if (manager.text.trim().isNotEmpty)
          'contacts': [
            {'name': manager.text.trim(), 'role': 'Site manager', 'phone': phone.text.trim(), 'isSiteManager': true}
          ],
        // HSLocation → Substance: a row counts when it has a name and a class.
        'substances': [
          for (final x in substances)
            if (x.$1.text.trim().isNotEmpty && x.$2.text.trim().isNotEmpty)
              {
                'name': x.$1.text.trim(),
                'hazardClass': x.$2.text.trim(),
                if (x.$3.text.trim().isNotEmpty) 'lifecycles': x.$3.text.trim(),
              },
        ],
      }) as Map<String, dynamic>;
      await _reload();
      if (mounted) await _open(toInt(created['jobId']));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _ago(DateTime? d) {
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} h ago';
    if (diff.inDays < 7) return '${diff.inDays} d ago';
    final l = d.toLocal();
    return '${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year}';
  }

  /// Jobs grouped by client id, in the order the server sorted them (latest
  /// activity first), so a client sits where its freshest job would.
  static List<_ClientGroup> _groups(List<JobSummary> jobs) {
    final byKey = <Object, _ClientGroup>{};
    for (final j in jobs) {
      final key = j.clientId ?? 'name:${j.clientName}';
      byKey.putIfAbsent(key, () => _ClientGroup(id: j.clientId, name: j.clientName, trading: j.tradingName)).jobs.add(j);
    }
    return byKey.values.toList();
  }

  /// Archive (or bring back) a client through the event log, so the trail
  /// names who did it. Sent straight to the server, not through the offline
  /// queue: it is a desk action, and the answer decides what the list shows.
  /// Returns the refusal or network problem, or null when it applied.
  static Future<String?> _sendArchive(ApiClient api, int clientId, bool archived) async {
    final ev = SyncEvent(type: 'client.archive', payload: {'clientId': clientId, 'archived': archived});
    try {
      final o = (await api.sync([ev]))[ev.id];
      if (o == null) return 'No answer from the server; try again.';
      if (o.isRejected) return [if (o.clause != null) o.clause!, o.reason ?? 'refused'].join(': ');
      return null;
    } catch (e) {
      return 'Not archived: could not reach the server ($e).';
    }
  }

  Future<void> _setArchived(_ClientGroup c, bool archived) async {
    final id = c.id;
    if (id == null) return;
    // Undo can be pressed after Brian has left the board: the request still
    // goes, only the screen updates are skipped.
    final api = widget.api;
    final messenger = ScaffoldMessenger.of(context);
    if (mounted) setState(() => _busy = true);
    final problem = await _sendArchive(api, id, archived);
    if (!mounted) return;
    await _reload();
    if (!mounted) return;
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(archived ? '${c.name} archived' : '${c.name} is back on the list'),
        duration: const Duration(seconds: 6),
        persist: false,
        action: archived
            ? SnackBarAction(
                label: 'Undo',
                onPressed: () => mounted ? _setArchived(c, false) : _sendArchive(api, id, false),
              )
            : null,
      ));
  }

  Future<void> _toggleArchived() async {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    setState(() {
      _showArchived = !_showArchived;
      _showPast = false;
    });
    await _reload();
  }

  /// Search: a client matches on its names; otherwise only its jobs whose
  /// location, applicant or address match are kept under it.
  List<_ClientGroup> _filter(List<_ClientGroup> groups) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return groups;
    bool has(String? s) => (s ?? '').toLowerCase().contains(q);
    final out = <_ClientGroup>[];
    for (final c in groups) {
      if (has(c.name) || has(c.trading)) {
        out.add(c);
        continue;
      }
      final jobs = c.jobs.where((j) => has(j.locationName) || has(j.subjectLine) || has(j.address)).toList();
      if (jobs.isNotEmpty) out.add(_ClientGroup(id: c.id, name: c.name, trading: c.trading)..jobs.addAll(jobs));
    }
    return out;
  }

  /// Legal names carried by more than one client record (F4): a hint only,
  /// never a merge.
  static Set<String> _sharedNames(Iterable<_ClientGroup> groups) {
    final ids = <String, Set<Object>>{};
    for (final c in groups) {
      ids.putIfAbsent(c.name.trim().toLowerCase(), () => {}).add(c.id ?? c.name);
    }
    return {for (final e in ids.entries) if (e.value.length > 1) e.key};
  }

  @override
  Widget build(BuildContext context) {
    final jobs = _jobs;
    final all = _groups(jobs ?? const []);
    final active = [for (final c in all) if (c.jobs.any(_isOpen)) c];
    final past = [for (final c in all) if (!c.jobs.any(_isOpen)) c];
    final archived = _groups(_archivedJobs ?? const []);
    final shared = _sharedNames([...all, ...archived]);
    final searching = _query.trim().isNotEmpty;
    // While searching, clients with nothing open are searched too.
    final shown = _filter(_showArchived ? archived : [...active, if (_showPast || searching) ...past]);
    final dash = _dash;
    final openJobs = [for (final j in jobs ?? const <JobSummary>[]) if (_isOpen(j)) j];
    // Archived clients are listed client by client whatever the view.
    final byJob = _view == 'jobs' && !_showArchived;
    return Scaffold(
      appBar: BrandBar(
        title: 'Clients',
        // On a phone the account button says who; the bar keeps to the title.
        subtitle: shellIsCompact(context)
            ? null
            : [widget.session.fullName, if ((widget.session.authorisationNumber ?? '').isNotEmpty) widget.session.authorisationNumber!].join(' · '),
        // People, the sync state and Sign out are the rail's (on a phone the
        // bottom bar and the account button's); the bar keeps Refresh.
        actions: [
          IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh), onPressed: _busy ? null : _reload),
          ...shellBarActions(context),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        // A readable column on a desk screen; edge to edge on a phone.
        child: LayoutBuilder(
          builder: (context, box) {
            final side = box.maxWidth > kReadable + 2 * Space.lg ? (box.maxWidth - kReadable) / 2 : Space.lg;
            final narrow = box.maxWidth < 600;
            return ListView(
              padding: EdgeInsets.fromLTRB(side, Space.xl, side, 48),
              children: [
                _welcome(openJobs, dash),
                _quickActions(openJobs, narrow: narrow),
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                if (_error != null)
                  Notice(
                    _error!,
                    icon: Icons.cloud_off_outlined,
                    action: TextButton(onPressed: _reload, child: const Text('Retry')),
                  ),
                if (!_showArchived && dash != null && dash.reminders.isNotEmpty) _attention(dash),
                _listHeader(
                  _showArchived
                      ? archived.length
                      : byJob
                          ? openJobs.length
                          : active.length,
                  byJob: byJob,
                  narrow: narrow,
                ),
                if ((jobs ?? const []).isNotEmpty || _showArchived) _searchField(byJob: byJob),
                if (_showArchived) ...[
                  if (_archivedJobs != null && archived.isEmpty)
                    const EmptyState(icon: Icons.inventory_2_outlined, title: 'No archived clients.'),
                ] else ...[
                  if (jobs != null && active.isEmpty && !searching) _empty(),
                ],
                if (byJob) ...[
                  if (openJobs.isNotEmpty || searching) _allJobs(openJobs),
                ] else ...[
                  if (searching && shown.isEmpty)
                    EmptyState(
                      icon: Icons.search_off,
                      title: 'No clients match "${_query.trim()}"',
                      message: 'Search looks at client names, trading names, locations and site addresses.',
                    ),
                  for (final c in shown) _clientCard(c, archivedView: _showArchived, sharedName: shared.contains(c.name.trim().toLowerCase())),
                ],
                _footer(byJob ? 0 : past.length),
                if (!_showArchived && dash != null && dash.activity.isNotEmpty) _activity(dash),
              ],
            );
          },
        ),
      ),
    );
  }

  void _setView(String v) {
    if (v == _view) return;
    setState(() => _view = v);
    widget.onViewChanged?.call(v);
  }

  /// Good morning, the date, and one line of what is open.
  Widget _welcome(List<JobSummary> open, DashboardData? dash) {
    final t = Theme.of(context).textTheme;
    final now = DateTime.now();
    final first = widget.session.fullName.trim().split(RegExp(r'\s+')).first;
    final attention = dash?.reminders.map((r) => r.jobId).toSet().length ?? 0;
    final summary = _jobs == null
        ? null
        : [
            open.isEmpty ? 'No active jobs' : '${open.length} active job${open.length == 1 ? '' : 's'}',
            if (dash != null) attention == 0 ? 'nothing needs attention' : '$attention need${attention == 1 ? 's' : ''} attention',
          ].join(' · ');
    return Padding(
      key: const ValueKey('welcome'),
      padding: const EdgeInsets.only(bottom: Space.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(JobsBoard.longDate(now), style: t.labelMedium?.copyWith(color: Neutral.muted)),
        const SizedBox(height: Space.xs),
        Text(first.isEmpty ? JobsBoard.greeting(now) : '${JobsBoard.greeting(now)}, $first', style: t.headlineSmall),
        if (summary != null) ...[
          const SizedBox(height: Space.xs),
          Text(summary, style: t.bodyLarge?.copyWith(color: Neutral.body)),
        ],
      ]),
    );
  }

  /// The open job worked on most recently that is still Bryan's move.
  static JobSummary? _latest(List<JobSummary> open) {
    JobSummary? best;
    DateTime? bestAt;
    for (final j in open) {
      if (_Bucket.of(j.stage) != _Bucket.inProgress) continue;
      final at = j.lastActivity ?? j.openedAt;
      if (best == null || (at != null && (bestAt == null || at.isAfter(bestAt)))) {
        best = j;
        bestAt = at;
      }
    }
    return best;
  }

  /// The next thing to do, as large targets: New job, pick up where he left
  /// off, and for a peer reviewer the jobs waiting for review.
  Widget _quickActions(List<JobSummary> open, {required bool narrow}) {
    final latest = _latest(open);
    final items = <Widget>[
      if (widget.session.canRecord)
        FilledButton.icon(
          key: const ValueKey('new-job'),
          style: FilledButton.styleFrom(minimumSize: const Size(160, kTouchLarge)),
          onPressed: _busy ? null : _newJob,
          icon: const Icon(Icons.add, size: 22),
          label: const Text('New job'),
        ),
      if (latest != null)
        _QuickCard(
          key: const ValueKey('continue-job'),
          icon: Icons.play_arrow_rounded,
          title: 'Continue: ${latest.subjectLine}',
          // Whose and where it stands; the job row below says the next step.
          subtitle: '${latest.clientName} · ${ProcessStage.short(latest.stage)}',
          onTap: _busy ? null : () => _open(latest.id),
        ),
      if (widget.session.isPeerReviewer)
        _QuickCard(
          key: const ValueKey('jobs-to-review'),
          icon: Icons.rate_review_outlined,
          title: 'Jobs to review',
          subtitle: '${open.length} flagged for a reg 17.91 peer review',
          onTap: () {
            setState(() => _bucket = null);
            _setView('jobs');
          },
        ),
    ];
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.xl),
      child: narrow
          ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: Space.md, children: items)
          : Row(spacing: Space.md, children: [
              for (final w in items) w is FilledButton ? w : Expanded(child: w),
            ]),
    );
  }

  /// What is listed, and how: By client or All jobs.
  Widget _listHeader(int n, {required bool byJob, required bool narrow}) {
    final title = Text(
      _jobs == null
          ? 'Clients'
          : _showArchived
              ? 'Archived clients ($n)'
              : byJob
                  ? '$n open job${n == 1 ? '' : 's'}'
                  : '$n active client${n == 1 ? '' : 's'}',
      style: Theme.of(context).textTheme.titleLarge,
    );
    final Widget? trailing = _showArchived
        ? TextButton.icon(
            key: const ValueKey('show-active'),
            onPressed: _busy ? null : _toggleArchived,
            icon: const Icon(Icons.arrow_back, size: 18),
            label: const Text('Active clients'),
          )
        : (_jobs ?? const []).isEmpty
            ? null
            : SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(
                    value: 'clients',
                    icon: Icon(Icons.business_outlined, size: 18),
                    label: Text('By client', key: ValueKey('view-clients')),
                  ),
                  ButtonSegment(
                    value: 'jobs',
                    icon: Icon(Icons.view_list_outlined, size: 18),
                    label: Text('All jobs', key: ValueKey('view-jobs')),
                  ),
                ],
                selected: {_view},
                onSelectionChanged: (s) => _setView(s.first),
              );
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.md),
      child: narrow && trailing is SegmentedButton
          ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              title,
              const SizedBox(height: Space.md),
              trailing,
            ])
          : Row(children: [Expanded(child: title), ?trailing]),
    );
  }

  /// Every open job in one list, Bryan's move first, then the client's,
  /// then certified work; latest activity first within each.
  Widget _allJobs(List<JobSummary> open) {
    final t = Theme.of(context).textTheme;
    final q = _query.trim().toLowerCase();
    bool has(String? s) => (s ?? '').toLowerCase().contains(q);
    final matching = q.isEmpty
        ? open
        : open.where((j) => has(j.clientName) || has(j.tradingName) || has(j.locationName) || has(j.subjectLine) || has(j.address)).toList();
    final counts = {for (final b in _Bucket.values) b: matching.where((j) => _Bucket.of(j.stage) == b).length};
    final shown = [for (final j in matching) if (_bucket == null || _Bucket.of(j.stage) == _bucket) j]
      ..sort((a, b) {
        final byBucket = _Bucket.of(a.stage).index.compareTo(_Bucket.of(b.stage).index);
        if (byBucket != 0) return byBucket;
        final at = a.lastActivity ?? a.openedAt, bt = b.lastActivity ?? b.openedAt;
        if (at == null || bt == null) return at == null ? (bt == null ? 0 : 1) : -1;
        return bt.compareTo(at);
      });
    Widget chip(String key, String label, int n, bool selected, VoidCallback onTap) => ChoiceChip(
          key: ValueKey('stage-filter-$key'),
          label: Text('$label  $n'),
          selected: selected,
          showCheckmark: false,
          onSelected: (_) => onTap(),
        );
    return Column(key: const ValueKey('all-jobs'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
        chip('all', 'All', matching.length, _bucket == null, () => setState(() => _bucket = null)),
        for (final b in _Bucket.values) chip(b.key, b.label, counts[b]!, _bucket == b, () => setState(() => _bucket = b)),
      ]),
      const SizedBox(height: Space.md),
      if (shown.isEmpty)
        EmptyState(
          icon: q.isNotEmpty ? Icons.search_off : Icons.inbox_outlined,
          title: q.isNotEmpty
              ? 'No jobs match "${_query.trim()}"'
              : switch (_bucket) {
                  _Bucket.waiting => 'Nothing waiting on a client',
                  _Bucket.issued => 'No certified jobs being looked after',
                  _ => 'No jobs in progress',
                },
          message: q.isNotEmpty ? 'Search looks at client names, trading names, locations and site addresses.' : null,
        )
      else
        Container(
          margin: const EdgeInsets.only(bottom: Space.md),
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.xs, Space.xs, Space.xs),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(Radii.md),
            border: Border.all(color: Neutral.line),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (var i = 0; i < shown.length; i++) ...[
              if (i > 0) const Divider(),
              _jobLine(shown[i], showClient: true),
            ],
          ]),
        ),
      if (shown.isNotEmpty && _bucket == null && q.isEmpty)
        Padding(
          padding: const EdgeInsets.only(left: Space.xs, bottom: Space.sm),
          child: Text('In progress first, then waiting on the client, then issued; latest activity first.', style: t.bodySmall),
        ),
    ]);
  }

  Widget _searchField({bool byJob = false}) => Padding(
        padding: const EdgeInsets.only(bottom: Space.md),
        child: TextField(
          key: const ValueKey('board-search'),
          controller: _search,
          onChanged: (v) => setState(() => _query = v),
          textInputAction: TextInputAction.search,
          style: Theme.of(context).textTheme.bodyLarge,
          decoration: InputDecoration(
            hintText: byJob ? 'Search jobs by client, site or location' : 'Search clients, sites and locations',
            prefixIcon: const Icon(Icons.search, color: Neutral.muted),
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear search',
                    icon: const Icon(Icons.close),
                    onPressed: () => setState(() {
                      _search.clear();
                      _query = '';
                    }),
                  ),
          ),
        ),
      );

  /// Quiet links under the list: clients with nothing open, and the archive.
  Widget _footer(int pastCount) => Padding(
        padding: const EdgeInsets.only(top: Space.xs, bottom: Space.md),
        child: Wrap(spacing: Space.sm, children: [
          if (!_showArchived && pastCount > 0 && _query.trim().isEmpty)
            TextButton(
              key: const ValueKey('show-past'),
              onPressed: () => setState(() => _showPast = !_showPast),
              child: Text(_showPast ? 'Hide clients with nothing open' : 'Clients with nothing open ($pastCount)'),
            ),
          if (!_showArchived)
            TextButton(
              key: const ValueKey('show-archived'),
              onPressed: _busy ? null : _toggleArchived,
              child: const Text('Archived clients'),
            ),
        ]),
      );

  static IconData _reminderIcon(String kind) => switch (kind) {
        'renewal' => Icons.event_repeat,
        'rfi' => Icons.hourglass_bottom,
        'action' => Icons.build_outlined,
        'no_action' => Icons.report_gmailerrorred_outlined,
        'triage' => Icons.inbox_outlined,
        'decide' => Icons.gavel_outlined,
        _ => Icons.pause_circle_outline,
      };

  /// The attention tiles, each a group of the server's reminder kinds. Only
  /// what the dashboard reports is counted; nothing is inferred.
  static const _attentionGroups = <({String key, String label, IconData icon, Tone tone})>[
    (key: 'actions', label: 'Corrective actions', icon: Icons.build_outlined, tone: Tone.bad),
    (key: 'renewals', label: 'Renewals due', icon: Icons.event_repeat, tone: Tone.warn),
    (key: 'decide', label: 'Ready to decide', icon: Icons.gavel_outlined, tone: Tone.info),
    (key: 'waiting', label: 'Waiting too long', icon: Icons.hourglass_bottom, tone: Tone.warn),
  ];

  static String _groupOf(String kind) => switch (kind) {
        'action' || 'no_action' => 'actions',
        'renewal' => 'renewals',
        'decide' => 'decide',
        _ => 'waiting', // rfi, stalled, triage
      };

  /// What needs attention: a tile per group with its count, and the lines of
  /// the open tile under them (each opens its job).
  Widget _attention(DashboardData d) {
    final t = Theme.of(context).textTheme;
    final byGroup = {for (final g in _attentionGroups) g.key: <Reminder>[]};
    for (final r in d.reminders) {
      byGroup[_groupOf(r.kind)]!.add(r);
    }
    final now = DateTime.now();
    final overdue = byGroup['actions']!.where((r) => r.kind == 'action' && r.when != null && r.when!.isBefore(now)).length;
    final open = _attentionGroup ?? _attentionGroups.firstWhere((g) => byGroup[g.key]!.isNotEmpty).key;
    final lines = byGroup[open] ?? const <Reminder>[];
    final openGroup = _attentionGroups.where((g) => g.key == open).firstOrNull;
    return Padding(
      key: const ValueKey('attention'),
      padding: const EdgeInsets.only(bottom: Space.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Needs attention (${d.reminders.length})', style: t.titleSmall),
        const SizedBox(height: Space.sm),
        LayoutBuilder(builder: (context, box) {
          // Four across on an iPad in landscape, two in portrait, one on a phone.
          final across = box.maxWidth >= 840 ? 4 : box.maxWidth >= 480 ? 2 : 1;
          final w = (box.maxWidth - Space.md * (across - 1)) / across;
          return Wrap(spacing: Space.md, runSpacing: Space.md, children: [
            // A group with nothing in it gets no tile: nothing shouts "0".
            for (final g in _attentionGroups)
              if (byGroup[g.key]!.isNotEmpty)
              SizedBox(
                width: w,
                child: _attentionTile(g, byGroup[g.key]!.length, selected: g.key == open,
                    note: g.key == 'actions' && overdue > 0 ? '$overdue overdue' : null),
              ),
          ]);
        }),
        if (openGroup != null && lines.isNotEmpty)
          Container(
            key: const ValueKey('attention-list'),
            margin: const EdgeInsets.only(top: Space.md),
            padding: const EdgeInsets.symmetric(vertical: Space.xs),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(Radii.md),
              border: Border.all(color: Neutral.line),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final r in lines.take(8))
                InkWell(
                  onTap: _busy ? null : () => _open(r.jobId),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: kTouch),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Icon(_reminderIcon(r.kind), size: 18, color: openGroup.tone.fg),
                        ),
                        const SizedBox(width: Space.md),
                        Expanded(
                          child: Text.rich(
                            TextSpan(children: [
                              TextSpan(text: '${r.client} · ${r.location}: ', style: const TextStyle(fontWeight: FontWeight.w600)),
                              TextSpan(text: Wording.humanise(r.text)),
                            ]),
                            style: t.bodyMedium,
                          ),
                        ),
                        const Icon(Icons.chevron_right, size: 20, color: Neutral.faint),
                      ]),
                    ),
                  ),
                ),
              if (lines.length > 8)
                Padding(
                  padding: const EdgeInsets.fromLTRB(Space.lg, Space.xs, Space.lg, Space.sm),
                  child: Text('+ ${lines.length - 8} more', style: t.bodySmall),
                ),
            ]),
          ),
      ]),
    );
  }

  Widget _attentionTile(({String key, String label, IconData icon, Tone tone}) g, int n, {required bool selected, String? note}) {
    final t = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      selected: selected,
      label: '${g.label}: $n${note == null ? '' : ', $note'}',
      excludeSemantics: true,
      child: Material(
        color: selected ? g.tone.bg : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          side: BorderSide(color: selected ? g.tone.fg : Neutral.line, width: selected ? 2 : 1),
        ),
        child: InkWell(
          key: ValueKey('attention-tile-${g.key}'),
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: () => setState(() => _attentionGroup = selected ? '' : g.key),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm + 2),
            child: Row(children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: selected ? Colors.white : g.tone.bg, shape: BoxShape.circle),
                child: Icon(g.icon, size: 18, color: g.tone.fg),
              ),
              const SizedBox(width: Space.md),
              Text('$n', style: t.headlineSmall),
              const SizedBox(width: Space.sm + 2),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(g.label, style: t.labelMedium?.copyWith(color: Neutral.strong), maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (note != null) Text(note, style: t.labelSmall?.copyWith(color: Tone.bad.fg)),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  /// Who did what, most recent first, across every job.
  /// A status change and a comment on the same item arrive as two events
  /// seconds apart; the strip shows the person did one thing, once.
  static List<T> _collapsed<T extends dynamic>(List<T> items) {
    final out = <T>[];
    for (final a in items) {
      if (out.isNotEmpty) {
        final p = out.last;
        if (a.jobId != null && p.userName == a.userName && p.verb == a.verb && p.jobId == a.jobId) continue;
      }
      out.add(a);
    }
    return out;
  }

  Widget _activity(DashboardData d) {
    final t = Theme.of(context).textTheme;
    return Padding(
      key: const ValueKey('activity'),
      padding: const EdgeInsets.fromLTRB(Space.xs, Space.sm, Space.xs, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Recent activity', style: t.titleSmall?.copyWith(color: Neutral.muted)),
        const SizedBox(height: Space.xs),
        for (final a in _collapsed(d.activity).take(5))
          InkWell(
            onTap: _busy || a.jobId == null ? null : () => _open(a.jobId!),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.xs),
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: a.userName ?? 'Someone', style: const TextStyle(fontWeight: FontWeight.w600)),
                  TextSpan(text: ' ${Wording.humanise(a.verb)}'),
                  if (a.location != null || a.client != null)
                    TextSpan(text: ' · ${a.location ?? a.client}', style: const TextStyle(color: Neutral.muted)),
                  TextSpan(text: '  ${_ago(a.at)}', style: t.labelSmall),
                ]),
                style: t.bodyMedium,
              ),
            ),
          ),
      ]),
    );
  }

  Widget _empty() => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: Neutral.line),
        ),
        child: EmptyState(
          icon: Icons.business_outlined,
          title: 'No active clients yet',
          message: 'Start with New job: the client, the site and what is being certified.',
          action: _demoBuild
              ? OutlinedButton(
                  key: const ValueKey('create-demo'),
                  onPressed: _busy ? null : _createDemo,
                  child: const Text('Load G2 Chiller (workbook)'))
              : null,
        ),
      );

  /// "AM" for Argenta Manufacturing Limited.
  static String _initials(String name) {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty && RegExp(r'[A-Za-z0-9]').hasMatch(w[0])).toList();
    if (words.isEmpty) return '?';
    return words.take(2).map((w) => w[0].toUpperCase()).join();
  }

  /// One client: name, its open jobs as lines (each opens its hub), and for
  /// the certifier a menu to archive it or bring it back.
  Widget _clientCard(_ClientGroup c, {bool archivedView = false, bool sharedName = false}) {
    final t = Theme.of(context).textTheme;
    final open = archivedView ? c.jobs : c.jobs.where(_isOpen).toList();
    final shown = open.isEmpty ? c.jobs : open;
    final finished = c.jobs.length - shown.length;
    final last = c.jobs.map((j) => j.lastActivity ?? j.openedAt).whereType<DateTime>().fold<DateTime?>(
        null, (a, b) => a == null || b.isAfter(a) ? b : a);
    final trading = (c.trading ?? '').trim();
    final sites = c.jobs.map((j) => (j.address ?? j.locationName).trim().toLowerCase()).toSet().length;
    final sub = [
      if (trading.isNotEmpty && trading != c.name) 'Trading as $trading',
      '$sites site${sites == 1 ? '' : 's'}',
    ].join(' · ');
    return Container(
      key: ValueKey('client-${c.id ?? c.name}'),
      margin: const EdgeInsets.only(bottom: Space.md),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: Neutral.line),
      ),
      padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.xs, Space.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            margin: const EdgeInsets.only(right: Space.md),
            decoration: const BoxDecoration(color: Neutral.tint, shape: BoxShape.circle),
            child: Text(_initials(c.name), style: t.labelLarge?.copyWith(color: Brand.ribbon)),
          ),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(c.name, style: t.titleMedium),
              Text(sub, style: t.bodySmall),
              if (sharedName)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.info_outline, size: 14, color: Tone.warn.fg),
                    const SizedBox(width: Space.xs),
                    Flexible(child: Text('Same name as another client', style: t.labelSmall?.copyWith(color: Tone.warn.fg))),
                  ]),
                ),
            ]),
          ),
          if (last != null)
            Padding(
              padding: const EdgeInsets.only(top: Space.xs, left: Space.sm),
              child: Text(_ago(last), style: t.labelSmall),
            ),
          if (widget.session.canDecide && c.id != null)
            PopupMenuButton<String>(
              key: ValueKey('client-menu-${c.id}'),
              tooltip: 'Client actions',
              icon: const Icon(Icons.more_vert, size: 20, color: Neutral.muted),
              onSelected: (v) => _setArchived(c, v == 'archive'),
              itemBuilder: (_) => [
                if (archivedView)
                  const PopupMenuItem(value: 'restore', child: Text('Bring back'))
                else
                  const PopupMenuItem(value: 'archive', child: Text('Archive client')),
              ],
            )
          else
            const SizedBox(width: Space.sm),
        ]),
        const SizedBox(height: Space.sm),
        for (final j in shown) _jobLine(j),
        if (finished > 0)
          Padding(
            padding: const EdgeInsets.only(top: Space.xs, left: Space.xs),
            child: Text('+ $finished closed job${finished == 1 ? '' : 's'}', style: t.labelSmall),
          ),
      ]),
    );
  }

  /// The sheet set in a few words, for the job row.
  static String? _classLabel(JobSummary j) => switch (j.classKey) {
        'class_6_8' => 'Classes 6 or 8',
        'class_2_3' => 'Classes 2 and 3.1',
        'class_5_1' => 'Class 5.1',
        'class_3_2_4' => 'Classes 3.2 and 4',
        _ => switch (j.kind) { 'handler' => 'Certified handler', 'cylinder' => 'Cylinder importation', _ => null },
      };

  /// Answered so far, two-toned: met in green, not met in red, the rest
  /// grey. Words beside it; never colour alone.
  static Widget _progress(JobSummary j, TextTheme t) {
    final total = j.itemTotal;
    final bad = j.nonCompliant.clamp(0, total);
    final good = (j.assessed - bad).clamp(0, total - bad);
    final rest = total - good - bad;
    final words = '${j.assessed} of $total answered'
        '${j.nonCompliant > 0 ? ' · ${j.nonCompliant} finding${j.nonCompliant == 1 ? '' : 's'}' : ''}';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(Radii.pill),
        child: SizedBox(
          height: 6,
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (good > 0) Expanded(flex: good, child: Container(color: Tone.good.fg)),
            if (bad > 0) Expanded(flex: bad, child: Container(color: Tone.bad.fg)),
            if (rest > 0) Expanded(flex: rest, child: Container(color: const Color(0xFFE3E9EA))),
          ]),
        ),
      ),
      const SizedBox(height: Space.xs),
      Text(words, style: t.labelSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
    ]);
  }

  /// One job: what and where, its stage and next step, how far along.
  /// [showClient] names the client above it (All jobs, where no client
  /// card says whose it is).
  Widget _jobLine(JobSummary j, {bool showClient = false}) {
    final t = Theme.of(context).textTheme;
    final hasInspection = j.itemTotal > 0;
    final cls = _classLabel(j);
    final detail = [?cls, if ((j.address ?? '').isNotEmpty) j.address!].join(' · ');
    final tone = StageChip.toneFor(j.stage);
    final icon = Container(
      width: 40,
      height: 40,
      margin: const EdgeInsets.only(right: Space.md),
      decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Icon(
        j.certificateDecision != null
            ? Icons.verified_outlined
            : switch (j.kind) { 'handler' => Icons.person_outline, 'cylinder' => Icons.propane_tank_outlined, _ => Icons.factory_outlined },
        color: tone.fg,
        size: 20,
      ),
    );
    final what = Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      if (showClient)
        Text(j.clientName, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.labelMedium?.copyWith(color: Neutral.muted)),
      Text(j.subjectLine, style: t.titleSmall),
      if (detail.isNotEmpty) Text(detail, style: t.bodySmall),
    ]);
    final stage = Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      StageChip(stage: j.stage, dense: true),
      const SizedBox(height: Space.xs),
      Text(j.nextAction, style: t.bodySmall?.copyWith(color: Brand.ribbon)),
    ]);
    return InkWell(
      key: ValueKey('job-${j.id}'),
      borderRadius: BorderRadius.circular(Radii.sm),
      onTap: _busy ? null : () => _open(j.id),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(0, Space.sm, Space.sm, Space.sm),
          child: LayoutBuilder(builder: (context, box) {
            // Three columns on an iPad or desk; stacked on a phone.
            if (box.maxWidth >= 640) {
              return Row(children: [
                icon,
                Expanded(flex: 5, child: what),
                const SizedBox(width: Space.md),
                Expanded(flex: 5, child: stage),
                const SizedBox(width: Space.md),
                Expanded(flex: 3, child: hasInspection ? _progress(j, t) : const SizedBox.shrink()),
                const Icon(Icons.chevron_right, size: 20, color: Neutral.faint),
              ]);
            }
            return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              icon,
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  what,
                  const SizedBox(height: Space.sm),
                  stage,
                  if (hasInspection) ...[const SizedBox(height: Space.sm), _progress(j, t)],
                ]),
              ),
              const Icon(Icons.chevron_right, size: 20, color: Neutral.faint),
            ]);
          }),
        ),
      ),
    );
  }
}

/// A large quick action on the landing: icon, what it does, and one line of
/// what it will open.
class _QuickCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  const _QuickCard({super.key, required this.icon, required this.title, required this.subtitle, this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: '$title. $subtitle',
      excludeSemantics: true,
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          side: const BorderSide(color: Neutral.line),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: kTouchLarge),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
              child: Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: Neutral.tint, borderRadius: BorderRadius.circular(Radii.sm)),
                  child: Icon(icon, color: Brand.ribbon),
                ),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleSmall?.copyWith(fontSize: 15)),
                    Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodySmall),
                  ]),
                ),
                const Icon(Icons.chevron_right, size: 20, color: Neutral.faint),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// A client as the board shows it: the jobs the server listed under its id.
class _ClientGroup {
  final int? id;
  final String name;
  final String? trading;
  final List<JobSummary> jobs = [];
  _ClientGroup({required this.id, required this.name, this.trading});
}

