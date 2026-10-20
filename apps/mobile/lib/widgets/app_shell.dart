import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../auth/session.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import 'ui.dart';

/// The top-level destinations and who is signed in, around the landing and
/// People (owner, 20 Oct 2026: "make it easy to see projects / people
/// buttons"). From [kRailFrom] a teal rail on the left, as in the Claude
/// Design mock "1 · Clients": the logo, Clients and People, and at the foot
/// the sync state, the signed-in person and Sign out. On a phone the same
/// destinations sit in a bottom bar and the person behind an account button.
///
/// Only / and /people are inside: a job, its check sheet and an item cover
/// the shell and keep their own back navigation.
class AppShell extends StatelessWidget {
  final Session session;
  final SyncService sync;
  final Future<void> Function() onSignOut;

  /// The current path, to mark the destination it belongs to.
  final String location;
  final Widget child;

  const AppShell({
    super.key,
    required this.session,
    required this.sync,
    required this.onSignOut,
    required this.location,
    required this.child,
  });

  static const _clients = _Destination(
      key: 'nav-clients', label: 'Clients', path: '/', icon: Icons.business_outlined, selectedIcon: Icons.business);
  static const _people =
      _Destination(key: 'nav-people', label: 'People', path: '/people', icon: Icons.group_outlined, selectedIcon: Icons.group);

  @override
  Widget build(BuildContext context) {
    final destinations = [_clients, if (session.canManagePeople) _people];
    final selected = location.startsWith('/people') && session.canManagePeople ? 1 : 0;
    void go(int i) => GoRouter.of(context).go(destinations[i].path);
    final width = MediaQuery.sizeOf(context).width;

    if (width >= kRailFrom) {
      return Material(
        color: Neutral.canvas,
        child: Row(children: [
          _Rail(
            destinations: destinations,
            selected: selected,
            onSelect: go,
            extended: width >= kRailExtendedFrom,
            session: session,
            sync: sync,
            onSignOut: onSignOut,
          ),
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeLeft: true,
              child: AppShellScope(hasRail: true, session: session, sync: sync, onSignOut: onSignOut, child: child),
            ),
          ),
        ]),
      );
    }
    // One destination is not a choice: no bar, the account button carries
    // the rest.
    final bar = destinations.length > 1;
    return Material(
      color: Neutral.canvas,
      child: Column(children: [
        Expanded(
          child: MediaQuery.removePadding(
            context: context,
            removeBottom: bar,
            child: AppShellScope(hasRail: false, session: session, sync: sync, onSignOut: onSignOut, child: child),
          ),
        ),
        if (bar)
          DecoratedBox(
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: Neutral.line))),
            child: NavigationBar(
              key: const ValueKey('nav-bar'),
              selectedIndex: selected,
              onDestinationSelected: go,
              destinations: [
                for (final d in destinations)
                  NavigationDestination(
                    key: ValueKey(d.key),
                    icon: Icon(d.icon),
                    selectedIcon: Icon(d.selectedIcon),
                    label: d.label,
                  ),
              ],
            ),
          ),
      ]),
    );
  }
}

/// What a screen inside the shell needs to know about it: whether the rail
/// is showing (then its own bar leaves out the logo, the sync state and the
/// account), and the session behind the account button.
class AppShellScope extends InheritedWidget {
  final bool hasRail;
  final Session session;
  final SyncService sync;
  final Future<void> Function() onSignOut;

  const AppShellScope({
    super.key,
    required this.hasRail,
    required this.session,
    required this.sync,
    required this.onSignOut,
    required super.child,
  });

  static AppShellScope? maybeOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppShellScope>();

  @override
  bool updateShouldNotify(AppShellScope old) => hasRail != old.hasRail || session != old.session;
}

/// The app bar actions a shell screen adds on a phone: the sync state and
/// the account. Nothing with the rail showing (the rail has them) or
/// outside the shell.
List<Widget> shellBarActions(BuildContext context) {
  final scope = AppShellScope.maybeOf(context);
  if (scope == null || scope.hasRail) return const [];
  return [
    SyncIndicator(sync: scope.sync, onTap: () => _flush(scope.sync)),
    AccountButton(session: scope.session, sync: scope.sync, onSignOut: scope.onSignOut),
  ];
}

/// Inside the shell on a phone: the bar has the sync state and the account
/// to fit, so a shell screen leaves its subtitle out.
bool shellIsCompact(BuildContext context) {
  final scope = AppShellScope.maybeOf(context);
  return scope != null && !scope.hasRail && MediaQuery.sizeOf(context).width < 600;
}

Future<void> _flush(SyncService sync) async {
  try {
    await sync.flush();
  } catch (_) {
    // The indicator already says what is waiting; a failed retry changes nothing.
  }
}

Future<void> _signOut(BuildContext context, SyncService sync, Future<void> Function() onSignOut) async {
  if (await confirmSignOut(context, pending: sync.pendingCount)) await onSignOut();
}

/// "BW" for Bryan Wilson.
String initialsOf(String name) {
  final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty && RegExp(r'[A-Za-z0-9]').hasMatch(w[0])).toList();
  if (words.isEmpty) return '?';
  return words.take(2).map((w) => w[0].toUpperCase()).join();
}

class _Destination {
  final String key;
  final String label;
  final String path;
  final IconData icon;
  final IconData selectedIcon;
  const _Destination({required this.key, required this.label, required this.path, required this.icon, required this.selectedIcon});
}

class _Rail extends StatelessWidget {
  final List<_Destination> destinations;
  final int selected;
  final ValueChanged<int> onSelect;
  final bool extended;
  final Session session;
  final SyncService sync;
  final Future<void> Function() onSignOut;

  const _Rail({
    required this.destinations,
    required this.selected,
    required this.onSelect,
    required this.extended,
    required this.session,
    required this.sync,
    required this.onSignOut,
  });

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final who = [session.occupation, if ((session.authorisationNumber ?? '').isNotEmpty) session.authorisationNumber!]
        .where((x) => x.isNotEmpty)
        .join(' · ');
    return Container(
      key: const ValueKey('app-rail'),
      width: extended ? 240 : 96,
      color: Brand.ribbon,
      child: SafeArea(
        right: false,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: extended ? Space.md : Space.sm, vertical: Space.lg),
          child: Column(crossAxisAlignment: extended ? CrossAxisAlignment.stretch : CrossAxisAlignment.center, children: [
            // The mark goes home, as the logo does in every bar.
            Semantics(
              button: true,
              label: 'Assure Safety: Clients',
              excludeSemantics: true,
              child: InkWell(
                key: const ValueKey('rail-logo'),
                borderRadius: BorderRadius.circular(Radii.md),
                onTap: () => GoRouter.of(context).go('/'),
                child: Padding(
                  padding: const EdgeInsets.all(Space.xs),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(Radii.md),
                      child: Image.asset(
                        'assets/brand/icon-teal.png',
                        width: 48,
                        height: 48,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const SizedBox(width: 48, height: 48),
                      ),
                    ),
                    if (extended) ...[
                      const SizedBox(width: Space.md),
                      Flexible(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                          Text('Assure Safety', maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: t.titleMedium?.copyWith(color: Brand.onRibbon)),
                          Text('Field', style: t.labelMedium?.copyWith(color: Brand.onRibbonMuted)),
                        ]),
                      ),
                    ],
                  ]),
                ),
              ),
            ),
            const SizedBox(height: Space.xl),
            // The destinations take the middle; on a short window they scroll
            // rather than push the account off the bottom.
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: extended ? CrossAxisAlignment.stretch : CrossAxisAlignment.center,
                  children: [
                    for (var i = 0; i < destinations.length; i++) ...[
                      if (i > 0) const SizedBox(height: Space.sm),
                      _wrapLegacyKey(
                        destinations[i],
                        _RailItem(
                            destination: destinations[i], selected: i == selected, extended: extended, onTap: () => onSelect(i)),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: Space.md),
            Align(
              alignment: extended ? Alignment.centerLeft : Alignment.center,
              child: SyncIndicator(sync: sync, onTap: () => _flush(sync), iconOnly: !extended, onDark: true),
            ),
            const SizedBox(height: Space.md),
            Tooltip(
              message: [session.fullName, if (who.isNotEmpty) who].join('\n'),
              child: Row(mainAxisSize: extended ? MainAxisSize.max : MainAxisSize.min, children: [
                _Avatar(name: session.fullName, onDark: true),
                if (extended) ...[
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(session.fullName, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: t.titleSmall?.copyWith(color: Brand.onRibbon)),
                      // Occupation and authorisation on their own lines: the
                      // number is never cut off.
                      for (final line in [session.occupation, session.authorisationNumber ?? ''])
                        if (line.isNotEmpty)
                          Text(line, maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: t.labelSmall?.copyWith(color: Brand.onRibbonMuted)),
                    ]),
                  ),
                ],
              ]),
            ),
            const SizedBox(height: Space.sm),
            if (extended)
              TextButton.icon(
                key: const ValueKey('sign-out'),
                style: TextButton.styleFrom(foregroundColor: Brand.onRibbon, alignment: Alignment.centerLeft),
                onPressed: () => _signOut(context, sync, onSignOut),
                icon: const Icon(Icons.logout, size: 20),
                label: const Text('Sign out'),
              )
            else
              IconButton(
                key: const ValueKey('sign-out'),
                tooltip: 'Sign out',
                color: Brand.onRibbon,
                onPressed: () => _signOut(context, sync, onSignOut),
                icon: const Icon(Icons.logout),
              ),
          ]),
        ),
      ),
    );
  }

  /// People kept its old key (to-people) from the board's bar, so older
  /// links in the tests and notes still find it.
  static Widget _wrapLegacyKey(_Destination d, Widget child) =>
      d.key == 'nav-people' ? KeyedSubtree(key: const ValueKey('to-people'), child: child) : child;
}

class _RailItem extends StatelessWidget {
  final _Destination destination;
  final bool selected;
  final bool extended;
  final VoidCallback onTap;
  const _RailItem({required this.destination, required this.selected, required this.extended, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final ink = selected ? Brand.onRibbon : Brand.onRibbonMuted;
    final icon = Icon(selected ? destination.selectedIcon : destination.icon, color: ink, size: 24);
    final label = Text(
      destination.label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: (extended ? t.labelLarge : t.labelMedium)?.copyWith(
        color: ink,
        fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
      ),
    );
    return Semantics(
      button: true,
      selected: selected,
      label: destination.label,
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: ValueKey(destination.key),
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: onTap,
          child: extended
              ? Container(
                  constraints: const BoxConstraints(minHeight: kTouch + 4),
                  padding: const EdgeInsets.symmetric(horizontal: Space.lg),
                  decoration: BoxDecoration(
                    color: selected ? Brand.ribbonWash : null,
                    borderRadius: BorderRadius.circular(Radii.md),
                  ),
                  child: Row(children: [icon, const SizedBox(width: Space.md), Expanded(child: label)]),
                )
              : SizedBox(
                  width: 80,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: Space.xs),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      // The Material 3 rail's pill behind the selected icon.
                      Container(
                        width: 56,
                        height: 32,
                        decoration: BoxDecoration(
                          color: selected ? Brand.ribbonWash : null,
                          borderRadius: BorderRadius.circular(Radii.pill),
                        ),
                        child: icon,
                      ),
                      const SizedBox(height: Space.xs),
                      label,
                    ]),
                  ),
                ),
        ),
      ),
    );
  }
}

/// The signed-in person's initials in a circle.
class _Avatar extends StatelessWidget {
  final String name;
  final bool onDark;
  final double size;
  const _Avatar({required this.name, this.onDark = false, this.size = 40});

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: onDark ? Brand.ribbonWash : Neutral.tint, shape: BoxShape.circle),
        child: Text(
          initialsOf(name),
          style: Theme.of(context).textTheme.labelLarge?.copyWith(color: onDark ? Brand.onRibbon : Brand.ribbon),
        ),
      );
}

/// On a phone: the person behind their initials. Opens a sheet with who is
/// signed in, the sync state and Sign out.
class AccountButton extends StatelessWidget {
  final Session session;
  final SyncService sync;
  final Future<void> Function() onSignOut;
  const AccountButton({super.key, required this.session, required this.sync, required this.onSignOut});

  @override
  Widget build(BuildContext context) => IconButton(
        key: const ValueKey('account'),
        tooltip: 'Account: ${session.fullName}',
        onPressed: () => _open(context),
        icon: _Avatar(name: session.fullName, size: 32),
      );

  Future<void> _open(BuildContext context) async {
    final t = Theme.of(context).textTheme;
    final who = [session.occupation, if ((session.authorisationNumber ?? '').isNotEmpty) session.authorisationNumber!]
        .where((x) => x.isNotEmpty)
        .join(' · ');
    final out = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.white,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              _Avatar(name: session.fullName, size: 48),
              const SizedBox(width: Space.lg),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(session.fullName, style: t.titleMedium),
                  if (who.isNotEmpty) Text(who, style: t.bodySmall),
                ]),
              ),
            ]),
            const SizedBox(height: Space.lg),
            Align(alignment: Alignment.centerLeft, child: SyncIndicator(sync: sync, iconOnly: false, onTap: () => _flush(sync))),
            const SizedBox(height: Space.md),
            OutlinedButton.icon(
              key: const ValueKey('sign-out'),
              onPressed: () => Navigator.pop(ctx, true),
              icon: const Icon(Icons.logout, size: 20),
              label: const Text('Sign out'),
            ),
          ]),
        ),
      ),
    );
    if (out == true && context.mounted) await _signOut(context, sync, onSignOut);
  }
}

/// Signing out drops whatever has not reached the server (it is never sent
/// under the next person's sign-in), so say so first (UX change graph F1).
/// True to go ahead.
Future<bool> confirmSignOut(BuildContext context, {required int pending}) async {
  if (pending <= 0) return true;
  final go = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      icon: Icon(Icons.cloud_off_outlined, color: Tone.warn.fg),
      title: const Text('Changes not saved yet'),
      content: Text(
        '$pending ${pending == 1 ? 'change has' : 'changes have'} not reached the server. '
        'Signing out now throws ${pending == 1 ? 'it' : 'them'} away. '
        'Stay signed in until the status shows "All saved".',
      ),
      actions: [
        TextButton(
          key: const ValueKey('sign-out-anyway'),
          style: TextButton.styleFrom(foregroundColor: Tone.bad.fg),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Sign out anyway'),
        ),
        FilledButton(
          key: const ValueKey('sign-out-stay'),
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Stay signed in'),
        ),
      ],
    ),
  );
  return go ?? false;
}
