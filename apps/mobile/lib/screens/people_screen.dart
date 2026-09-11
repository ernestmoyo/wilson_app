import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../bootstrap.dart' show CurrentUser;
import '../models/person.dart';
import '../sync/api_client.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';

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

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final people = _people;
    return Scaffold(
      appBar: BrandBar(
        title: 'People',
        subtitle: 'Who may sign in, and as what',
        actions: [
          TextButton.icon(
            key: const ValueKey('to-jobs'),
            onPressed: () => context.go('/'),
            icon: const Icon(Icons.view_list_outlined, size: 18, color: Brand.teal),
            label: const Text('Jobs', style: TextStyle(color: Brand.teal, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      body: !CurrentUser.canDecide
          ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Managing people needs a compliance certifier.')))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
              children: [
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                Row(children: [
                  const Expanded(
                    child: Text(
                      'Every account is one person. History and photographs carry that person\'s name and occupation, so nobody shares a sign-in.',
                      style: TextStyle(fontSize: 12.5, color: Colors.black54),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    key: const ValueKey('add-person'),
                    onPressed: _busy ? null : () => _edit(null),
                    icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
                    label: const Text('Add person'),
                  ),
                ]),
                const SizedBox(height: 12),
                if (_error != null)
                  Card(
                    color: const Color(0xFFFDECEA),
                    child: ListTile(
                      leading: const Icon(Icons.error_outline, color: Brand.nonCompliant),
                      title: Text(_error!, style: const TextStyle(fontSize: 13)),
                      trailing: TextButton(onPressed: _load, child: const Text('Retry')),
                    ),
                  ),
                if (people != null) for (final p in people) _card(p),
                const SizedBox(height: 16),
                const Text('Roles', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Brand.tealDark)),
                for (final r in roleNames.keys)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text.rich(TextSpan(children: [
                      TextSpan(text: '${roleNames[r]}: ', style: const TextStyle(fontWeight: FontWeight.w700)),
                      TextSpan(text: roleHelp[r]),
                    ]), style: const TextStyle(fontSize: 12.5, color: Colors.black87)),
                  ),
              ],
            ),
    );
  }

  Widget _card(Person p) => Card(
        key: ValueKey('person-${p.id}'),
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(
              switch (p.role) { 'certifier' || 'admin' => Icons.verified_user_outlined, 'viewer' => Icons.visibility_outlined, _ => Icons.edit_note_outlined },
              color: p.active ? Brand.teal : Colors.black38,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text(p.fullName, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: p.active ? Colors.black87 : Colors.black38)),
                  const SizedBox(width: 8),
                  _chip(roleNames[p.role] ?? p.role, p.active ? Brand.tealDark : Colors.black38),
                  if (!p.active) ...[const SizedBox(width: 6), _chip('Inactive', Colors.black38)],
                  if (p.id == CurrentUser.id) ...[const SizedBox(width: 6), _chip('You', Brand.conditional)],
                ]),
                const SizedBox(height: 2),
                Text(
                  [p.occupation, p.email ?? '', if ((p.authorisationNumber ?? '').isNotEmpty) 'Authorisation ${p.authorisationNumber}'].where((x) => x.isNotEmpty).join('  ·  '),
                  style: const TextStyle(fontSize: 12.5, color: Colors.black54),
                ),
                if (!p.hasPasscode)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text('No passcode yet: this person cannot sign in until one is set.', style: TextStyle(fontSize: 12, color: Brand.nonCompliant)),
                  ),
              ]),
            ),
            PopupMenuButton<String>(
              key: ValueKey('person-menu-${p.id}'),
              tooltip: 'Actions',
              onSelected: (v) => switch (v) {
                'edit' => _edit(p),
                'passcode' => _passcode(p),
                'active' => _run(() => widget.api.updatePerson(p.id, {'active': !p.active})),
                _ => null,
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Text('Edit details and role')),
                const PopupMenuItem(value: 'passcode', child: Text('Set a new passcode')),
                if (p.id != CurrentUser.id) PopupMenuItem(value: 'active', child: Text(p.active ? 'Deactivate' : 'Reactivate')),
              ],
            ),
          ]),
        ),
      );

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
        child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
      );

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
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, key: const ValueKey('p-name'), decoration: const InputDecoration(labelText: 'Full name')),
              TextField(
                controller: occupation,
                key: const ValueKey('p-occupation'),
                decoration: const InputDecoration(labelText: 'Occupation', helperText: 'Printed with every photograph they take (IPS 21(4))'),
              ),
              TextField(controller: email, key: const ValueKey('p-email'), decoration: const InputDecoration(labelText: 'Sign-in email')),
              DropdownButtonFormField<String>(
                key: const ValueKey('p-role'),
                initialValue: role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: [for (final r in roleNames.keys) DropdownMenuItem(value: r, child: Text(roleNames[r]!))],
                onChanged: (v) => setD(() => role = v ?? role),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(roleHelp[role] ?? '', style: const TextStyle(fontSize: 11.5, color: Colors.black54)),
              ),
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
          ),
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
    await _run(() async {
      if (p == null) {
        await widget.api.createPerson({...body, 'passcode': passcode.text});
      } else {
        await widget.api.updatePerson(p.id, body);
      }
    });
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
    await _run(() => widget.api.setPasscode(p.id, passcode.text));
  }
}
