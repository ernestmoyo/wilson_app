import 'package:flutter/material.dart';

import '../sync/sync_service.dart';
import '../theme.dart';

/// The shared building blocks (UX change graph, 19 Oct 2026, phase U1).
/// One badge, one card, one notice, one empty state, one key-value row and
/// one sync indicator, so every screen says the same thing the same way.

/// A status as icon + word on a tint. Never colour alone.
class StatusBadge extends StatelessWidget {
  final String label;
  final Tone tone;
  final IconData? icon;
  final bool dense;
  const StatusBadge({super.key, required this.label, required this.tone, this.icon, this.dense = false});

  @override
  Widget build(BuildContext context) => Container(
        height: dense ? 22 : 26,
        padding: EdgeInsets.symmetric(horizontal: dense ? 8 : 10),
        decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(Radii.pill)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon ?? tone.icon, size: dense ? 13 : 15, color: tone.fg),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: dense ? 12 : 13, fontWeight: FontWeight.w600, color: tone.fg),
              ),
            ),
          ],
        ),
      );
}

/// A titled white card: one block of a screen.
class SectionCard extends StatelessWidget {
  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  const SectionCard({
    super.key,
    this.title,
    this.subtitle,
    this.trailing,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(Space.lg + 4, Space.lg, Space.lg + 4, Space.lg + 4),
    this.margin = const EdgeInsets.symmetric(vertical: Space.sm),
  });

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: Neutral.line),
      ),
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (title != null) ...[
            Row(
              children: [
                Expanded(child: Text(title!, style: t.titleMedium)),
                ?trailing,
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              Text(subtitle!, style: t.bodySmall),
            ],
            const SizedBox(height: Space.md),
          ],
          child,
        ],
      ),
    );
  }
}

/// A label and its value on one line; wraps under on a narrow screen.
class KeyValueRow extends StatelessWidget {
  final String label;
  final String value;
  final double labelWidth;
  const KeyValueRow(this.label, this.value, {super.key, this.labelWidth = 160});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: LayoutBuilder(
        builder: (context, box) {
          final lbl = Text(label, style: t.bodySmall);
          final val = Text(value.isEmpty ? '—' : value, style: t.bodyMedium);
          if (box.maxWidth < labelWidth * 2.2) {
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [lbl, val]);
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [SizedBox(width: labelWidth, child: lbl), Expanded(child: val)],
          );
        },
      ),
    );
  }
}

/// An inline message: an error the person can act on, a warning, a note.
class Notice extends StatelessWidget {
  final String message;
  final Tone tone;
  final IconData? icon;
  final VoidCallback? onClose;
  final Widget? action;
  const Notice(this.message, {super.key, this.tone = Tone.bad, this.icon, this.onClose, this.action});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.symmetric(vertical: Space.sm),
        padding: const EdgeInsets.fromLTRB(Space.md, Space.sm + 2, Space.xs, Space.sm + 2),
        decoration: BoxDecoration(
          color: tone.bg,
          borderRadius: BorderRadius.circular(Radii.sm),
          border: Border.all(color: tone.fg.withValues(alpha: .25)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Icon(icon ?? tone.icon, size: 20, color: tone.fg),
            ),
            const SizedBox(width: Space.sm + 2),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 1, right: Space.sm),
                child: Text(message, style: TextStyle(fontSize: 14, color: tone.fg, height: 1.4)),
              ),
            ),
            ?action,
            if (onClose != null)
              IconButton(
                tooltip: 'Dismiss',
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.close, size: 18, color: tone.fg),
                onPressed: onClose,
              ),
          ],
        ),
      );
}

/// What to show where a list would be when it has nothing in it.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.xl, horizontal: Space.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(color: Neutral.tint, shape: BoxShape.circle),
            child: Icon(icon, color: Brand.ribbon),
          ),
          const SizedBox(height: Space.md),
          Text(title, style: t.titleSmall, textAlign: TextAlign.center),
          if (message != null) ...[
            const SizedBox(height: Space.xs),
            Text(message!, style: t.bodySmall, textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: Space.md), action!],
        ],
      ),
    );
  }
}

/// Saving state, in every app bar: saved, sending, waiting offline, or
/// refused by the server. Field work must never vanish silently (UX B9).
class SyncIndicator extends StatelessWidget {
  final SyncService sync;
  final VoidCallback? onTap;

  /// Icon only (words in the tooltip). Null: decide by the window width.
  final bool? iconOnly;

  /// On the teal rail: the state sits on its own tint so it still reads.
  final bool onDark;
  const SyncIndicator({super.key, required this.sync, this.onTap, this.iconOnly, this.onDark = false});

  static ({String label, IconData icon, Tone tone}) describe(SyncService s) {
    if (s.rejectedCount > 0) {
      return (label: '${s.rejectedCount} not accepted', icon: Icons.report_gmailerrorred, tone: Tone.bad);
    }
    if (s.isFlushing) return (label: 'Saving…', icon: Icons.cloud_upload_outlined, tone: Tone.info);
    if (s.lastError != null && s.pendingCount > 0) {
      return (label: 'Offline · ${s.pendingCount} waiting', icon: Icons.cloud_off_outlined, tone: Tone.warn);
    }
    if (s.pendingCount > 0) {
      return (label: '${s.pendingCount} waiting', icon: Icons.cloud_upload_outlined, tone: Tone.info);
    }
    return (label: 'All saved', icon: Icons.cloud_done_outlined, tone: Tone.good);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: sync,
        builder: (context, _) {
          final d = describe(sync);
          // A phone's app bar has no room for the words: icon only, words in
          // the tooltip.
          final iconOnly = this.iconOnly ?? MediaQuery.sizeOf(context).width < 600;
          if (iconOnly) {
            return IconButton(
              key: const ValueKey('sync-indicator'),
              tooltip: d.label,
              onPressed: onTap,
              style: onDark ? IconButton.styleFrom(backgroundColor: d.tone.bg, disabledBackgroundColor: d.tone.bg) : null,
              icon: Icon(d.icon, color: d.tone.fg),
            );
          }
          if (onDark) {
            return Tooltip(
              message: 'Sync status: ${d.label}',
              child: Material(
                color: d.tone.bg,
                shape: const StadiumBorder(),
                child: InkWell(
                  key: const ValueKey('sync-indicator'),
                  customBorder: const StadiumBorder(),
                  onTap: onTap,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: kTouch),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Space.md),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(d.icon, size: 18, color: d.tone.fg),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(d.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: d.tone.fg)),
                        ),
                      ]),
                    ),
                  ),
                ),
              ),
            );
          }
          return Semantics(
            label: 'Sync status: ${d.label}',
            button: onTap != null,
            child: InkWell(
              key: const ValueKey('sync-indicator'),
              borderRadius: BorderRadius.circular(Radii.pill),
              onTap: onTap,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: kTouch),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Space.sm),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(d.icon, size: 18, color: d.tone.fg),
                      const SizedBox(width: 6),
                      Text(d.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: d.tone.fg)),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      );
}

/// Tell the person an action worked. Short, then gone.
void showDone(BuildContext context, String message) {
  final m = ScaffoldMessenger.maybeOf(context);
  m?.hideCurrentSnackBar();
  m?.showSnackBar(SnackBar(
    content: Row(children: [
      const Icon(Icons.check_circle, color: Color(0xFF8FE0B0), size: 20),
      const SizedBox(width: Space.sm),
      Expanded(child: Text(message)),
    ]),
    duration: const Duration(seconds: 3),
  ));
}

/// One name for each thing, everywhere (UX B8). Internal codes such as
/// "wks17-general" never reach the screen.
class Wording {
  static const checkSheet = 'Check sheet';
  static const ncReason = 'Reason not met';

  /// "General" for the general sheet, otherwise the class sheet's own name.
  static String sheetName(String templateCode, {String? classTitle}) {
    if (templateCode.endsWith('-general')) return 'General';
    if (classTitle != null && classTitle.isNotEmpty) return classTitle;
    return _classSheets[templateCode] ?? 'Class sheet';
  }

  static const _classSheets = {
    'wks17-class-2-and-3-1-substances': 'Class 2 & 3.1',
    'wks17-class-6-1a-6-1b-6-1c-8-2a-8': 'Class 6 & 8',
    'wks17-class-5-1-1-and-5-1-2': 'Class 5.1',
  };

  /// "General 6.2" for wks17-general section 6 item 2.
  static String itemRef(String templateCode, int section, int item) =>
      '${sheetName(templateCode)} $section.$item';

  /// Replaces raw "wks17-xxx 6/2" references inside server-written text.
  static String humanise(String text) => text.replaceAllMapped(
        RegExp(r'(wks17-[a-z0-9-]+)\s+(\d+)/(\d+)'),
        (m) => itemRef(m.group(1)!, int.parse(m.group(2)!), int.parse(m.group(3)!)),
      );
}
