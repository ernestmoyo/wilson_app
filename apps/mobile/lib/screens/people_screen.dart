import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../bootstrap.dart' show CurrentUser;
import '../models/person.dart';
import '../sync/api_client.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';
import '../widgets/ui.dart';

/// Person → Role. Who may sign in, and as what. Only a compliance certifier
/// (or admin) sees this screen; the server refuses everyone else too.
class PeopleScreen extends StatefulWidget {
  final ApiClient api;
  const PeopleScreen({super.key, required this.api});

  @override
  State<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends State<PeopleScreen> {
  List<Person>? _people;
  String? _error;
  bool _busy = false;

  static const roleNames = {
    'certifier': 'Compliance certifier',
    'reviewer': 'Reviewer',
    'viewer': 'Viewer',
    'admin': 'Administrator',
  };
  static const roleHelp = {
    'certifier': 'Signs the declaration, answers the register of interests, verifies corrective actions, decides and issues certificates. Needs a WorkSafe authorisation number.',
    'reviewer': 'Records findings, comments, evidence, corrective actions and communications, and moves a job between the working stages. Cannot sign, decide or issue.',
    'viewer': 'Reads everything. Records nothing.',
    'admin': 'As a compliance certifier, for whoever administers the system.',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final rows = await widget.api.users();
      if (mounted) setState(() { _people = rows; _error = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not reach the server: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Runs an action, reloads, and says whether it worked.
  Future<bool> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      await _load();
      return _error == null;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final people = _people;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: BrandBar(
        title: 'People',
        subtitle: 'Who may sign in, and as what',
        actions: [
          TextButton.icon(
            key: const ValueKey('to-jobs'),
            onPressed: () => context.go('/'),
            icon: const Icon(Icons.view_list_outlined, size: 18),
            label: const Text('Clients'),
          ),
        ],
      ),
      body: !CurrentUser.canDecide
          ? const Center(
              child: EmptyState(icon: Icons.lock_outline, title: 'Managing people needs a compliance certifier.'),
            )
          : LayoutBuilder(
              builder: (context, box) {
                // The same readable column as the board.
                final side = box.maxWidth > 992 ? (box.maxWidth - 960) / 2 : Space.lg;
                return ListView(
                  padding: EdgeInsets.fromLTRB(side, Space.lg, side, 48),
                  children: [
                    if (_busy) const LinearProgressIndicator(minHeight: 2),
                    Row(children: [
                      Expanded(
                        child: Text(
                          'Every account is one person. History and photographs carry that person\'s name and occupation, so nobody shares a sign-in.',
                          style: t.bodySmall,
                        ),
                      ),
                      const SizedBox(width: Space.md),
                      FilledButton.icon(
                        key: const ValueKey('add-person'),
                        onPressed: _busy ? null : () => _edit(null),
                        icon: const Icon(Icons.person_add_alt_1_outlined, size: 20),
                        label: const Text('Add person'),
                      ),
                    ]),
                    const SizedBox(height: Space.md),
                    if (_error != null)
                      Notice(
                        _error!,
                        action: TextButton(onPressed: _load, child: const Text('Retry')),
                        onClose: () => setState(() => _error = null),
                      ),
                    if (people != null)
                      SectionCard(
                        title: 'People (${people.length})',
                        padding: const EdgeInsets.fromLTRB(Space.lg + 4, Space.lg, Space.sm, Space.sm),
                        child: people.isEmpty
                            ? const EmptyState(
                                icon: Icons.group_outlined,
                                title: 'No one here yet',
                                message: 'Add the people who record findings or review jobs.',
                              )
                            : Column(children: [
                                for (var i = 0; i < people.length; i++) ...[
                                  if (i > 0) const Divider(),
                                  _card(people[i]),
                                ],
                              ]),
                      ),
                    SectionCard(
                      title: 'Roles',
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        for (final r in roleNames.keys)
                          Padding(
                            padding: const EdgeInsets.only(bottom: Space.sm),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              SizedBox(width: 200, child: Align(alignment: Alignment.centerLeft, child: _roleBadge(r, active: true))),
                              Expanded(child: Text(roleHelp[r] ?? '', style: t.bodyMedium)),
                            ]),
                          ),
                      ]),
                    ),
                  ],
                );
              },
            ),
    );
  }

  static Tone _roleTone(String role) => switch (role) {
        'certifier' || 'admin' => Tone.info,
        _ => Tone.neutral,
      };

  static IconData _roleIcon(String role) => switch (role) {
        'certifier' || 'admin' => Icons.verified_user_outlined,
        'viewer' => Icons.visibility_outlined,
        _ => Icons.edit_note_outlined,
      };

  Widget _roleBadge(String role, {required bool active}) => StatusBadge(
        label: roleNames[role] ?? role,
        tone: active ? _roleTone(role) : Tone.neutral,
        icon: _roleIcon(role),
        dense: true,
      );

  /// "BW" for Bryan Wilson.
  static String _initials(String name) {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '?';
    return words.take(2).map((w) => w[0].toUpperCase()).join();
  }

  Widget _card(Person p) {
    final t = Theme.of(context).textTheme;
    return Padding(
      key: ValueKey('person-${p.id}'),
      padding: const EdgeInsets.symmetric(vertical: Space.sm),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          margin: const EdgeInsets.only(right: Space.md),
          decoration: BoxDecoration(color: p.active ? Neutral.tint : Tone.neutral.bg, shape: BoxShape.circle),
          child: Text(_initials(p.fullName), style: t.labelLarge?.copyWith(color: p.active ? Brand.ribbon : Neutral.muted)),
        ),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: Space.sm, runSpacing: Space.xs, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Text(p.fullName, style: t.titleSmall?.copyWith(color: p.active ? Neutral.strong : Neutral.muted)),
              _roleBadge(p.role, active: p.active),
              if (!p.active) const StatusBadge(label: 'Inactive', tone: Tone.neutral, icon: Icons.block, dense: true),
              if (p.id == CurrentUser.id) const StatusBadge(label: 'You', tone: Tone.good, icon: Icons.account_circle_outlined, dense: true),
            ]),
            const SizedBox(height: 2),
            Text(
              [p.occupation, p.email ?? '', if ((p.authorisationNumber ?? '').isNotEmpty) 'Authorisation ${p.authorisationNumber}'].where((x) => x.isNotEmpty).join('  ·  '),
              style: t.bodySmall,
            ),
            if (!p.hasPasscode)
              Padding(
                padding: const EdgeInsets.only(top: Space.xs),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Tone.warn.icon, size: 16, color: Tone.warn.fg),
                  const SizedBox(width: Space.xs),
                  Flexible(
                    child: Text('No passcode yet: this person cannot sign in until one is set.',
                        style: t.bodySmall?.copyWith(color: Tone.warn.fg)),
                  ),
                ]),
              ),
          ]),
        ),
        PopupMenuButton<String>(
          key: ValueKey('person-menu-${p.id}'),
          tooltip: 'Actions',
          icon: const Icon(Icons.more_vert, color: Neutral.muted),
          onSelected: (v) => switch (v) {
            'edit' => _edit(p),
            'passcode' => _passcode(p),
            'active' => _setActive(p),
            _ => null,
          },
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'edit', child: Text('Edit details and role')),
            const PopupMenuItem(value: 'passcode', child: Text('Set a new passcode')),
            if (p.id != CurrentUser.id) PopupMenuItem(value: 'active', child: Text(p.active ? 'Deactivate' : 'Reactivate')),
          ],
        ),
      ]),
    );
  }

  Future<void> _setActive(Person p) async {
    if (await _run(() => widget.api.updatePerson(p.id, {'active': !p.active})) && mounted) {
      showDone(context, p.active ? '${p.fullName} deactivated' : '${p.fullName} reactivated');
    }
  }

  /// Add (p == null) or edit a person. A passcode is asked for only on add;
  /// resetting one is its own action so it is never changed by accident.
  Future<void> _edit(Person? p) async {
    final name = TextEditingController(text: p?.fullName ?? '');
    final occupation = TextEditingController(text: p?.occupation ?? '');
    final email = TextEditingController(text: p?.email ?? '');
    final authorisation = TextEditingController(text: p?.authorisationNumber ?? '');
    final passcode = TextEditingController();
    var role = p?.role ?? 'reviewer';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text(p == null ? 'Add person' : 'Edit ${p.fullName}'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, spacing: Space.md, children: [
              TextField(controller: name, key: const ValueKey('p-name'), decoration: const InputDecoration(labelText: 'Full name')),
              TextField(
                controller: occupation,
                key: const ValueKey('p-occupation'),
                decoration: const InputDecoration(labelText: 'Occupation', helperText: 'Printed with every photograph they take (IPS 21(4))'),
              ),
              TextField(controller: email, key: const ValueKey('p-email'), decoration: const InputDecoration(labelText: 'Sign-in email')),
              DropdownButtonFormField<String>(
                isExpanded: true,
                key: const ValueKey('p-role'),
                initialValue: role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: [for (final r in roleNames.keys) DropdownMenuItem(value: r, child: Text(roleNames[r]!))],
                onChanged: (v) => setD(() => role = v ?? role),
              ),
              Text(roleHelp[role] ?? '', style: Theme.of(ctx).textTheme.bodySmall),
              if (role == 'certifier' || role == 'admin')
                TextField(controller: authorisation, key: const ValueKey('p-authorisation'), decoration: const InputDecoration(labelText: 'WorkSafe authorisation number')),
              if (p == null)
                TextField(
                  controller: passcode,
                  key: const ValueKey('p-passcode'),
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Passcode (at least 6 characters)'),
                ),
            ]),
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(key: const ValueKey('p-save'), onPressed: () => Navigator.pop(ctx, true), child: Text(p == null ? 'Add' : 'Save')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final body = {
      'fullName': name.text.trim(),
      'occupation': occupation.text.trim(),
      'email': email.text.trim(),
      'role': role,
      if (authorisation.text.trim().isNotEmpty) 'authorisationNumber': authorisation.text.trim(),
    };
    final done = await _run(() async {
      if (p == null) {
        await widget.api.createPerson({...body, 'passcode': passcode.text});
      } else {
        await widget.api.updatePerson(p.id, body);
      }
    });
    if (done && mounted) showDone(context, p == null ? '${body['fullName']} added' : 'Changes saved');
  }

  Future<void> _passcode(Person p) async {
    final passcode = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('New passcode for ${p.fullName}'),
        content: TextField(
          controller: passcode,
          key: const ValueKey('p-new-passcode'),
          obscureText: true,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Passcode (at least 6 characters)', helperText: 'They are signed out everywhere and sign in again with this.'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(key: const ValueKey('p-passcode-save'), onPressed: () => Navigator.pop(ctx, true), child: const Text('Set passcode')),
        ],
      ),
    );
    if (ok != true) return;
    if (await _run(() => widget.api.setPasscode(p.id, passcode.text)) && mounted) {
      showDone(context, 'Passcode set: ${p.fullName} signs in again with it');
    }
  }
}
