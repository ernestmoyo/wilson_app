import 'package:flutter/material.dart';

import '../models/finding.dart';
import '../theme.dart';

/// One-tap answer for a check sheet item (UX change graph B6, 19 Oct 2026):
/// Compliant · Non-compliant · N/A as three ≥ 44 px segments, each an icon
/// and a word, the selected one in its [Tone]. Replaces the 11 px dropdown.
///
/// Conditional (CD) and "clear the answer" were in the old dropdown on every
/// sheet, so they stay on every sheet, one step further away in the menu
/// beside the segments. A conditional answer shows as a fourth, selected
/// segment so it is never hidden.
///
/// [onChanged] null means read-only (a viewer): no menu, taps do nothing.
/// [keyPrefix] names the segments `<prefix>-<wire value>` for tests and
/// automation; the menu is always `answer-more`.
class AnswerControl extends StatelessWidget {
  final FindingStatus status;
  final ValueChanged<FindingStatus>? onChanged;
  final String keyPrefix;

  const AnswerControl({super.key, required this.status, required this.onChanged, this.keyPrefix = 'answer'});

  static const _main = [FindingStatus.compliant, FindingStatus.nonCompliant, FindingStatus.notApplicable];

  /// Width weights so the longer words get the room they need.
  static int _weight(FindingStatus s) => switch (s) {
        FindingStatus.nonCompliant => 4,
        FindingStatus.compliant || FindingStatus.conditional => 3,
        _ => 2,
      };

  static IconData iconFor(FindingStatus s) => switch (s) {
        FindingStatus.compliant => Icons.check_circle_outline,
        FindingStatus.nonCompliant => Icons.cancel_outlined,
        FindingStatus.notApplicable => Icons.remove_circle_outline,
        FindingStatus.conditional => Icons.warning_amber_rounded,
        FindingStatus.pending => Icons.radio_button_unchecked,
      };

  @override
  Widget build(BuildContext context) {
    final segments = [..._main, if (status == FindingStatus.conditional) FindingStatus.conditional];
    final enabled = onChanged != null;
    return LayoutBuilder(builder: (context, box) {
      // Side by side when there is room for icon + word in a row; otherwise
      // the icon sits above the word (the sheet's Comments column).
      final menuWidth = enabled ? kTouch : 0.0;
      final perWeight = (box.maxWidth - menuWidth) / segments.fold<int>(0, (n, s) => n + _weight(s));
      final stacked = perWeight < 34;
      return Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Neutral.surface,
                borderRadius: BorderRadius.circular(Radii.sm),
                border: Border.all(color: Neutral.line),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(Radii.sm - 1),
                // A fixed height, not IntrinsicHeight: one of these sits on
                // every row of the sheet (F7).
                child: SizedBox(
                  height: stacked ? kTouch + 6 : kTouch,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var k = 0; k < segments.length; k++) ...[
                        if (k > 0) const VerticalDivider(width: 1, thickness: 1, color: Neutral.line),
                        Expanded(flex: _weight(segments[k]), child: _segment(segments[k], stacked)),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (enabled)
            SizedBox(
              width: kTouch,
              height: kTouch,
              child: PopupMenuButton<FindingStatus>(
                key: const ValueKey('answer-more'),
                tooltip: 'More answers',
                padding: EdgeInsets.zero,
                icon: const Icon(Icons.more_vert, color: Neutral.muted),
                onSelected: onChanged,
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: FindingStatus.conditional,
                    child: _menuRow(FindingStatus.conditional, 'Conditional'),
                  ),
                  PopupMenuItem(
                    value: FindingStatus.pending,
                    enabled: status != FindingStatus.pending,
                    child: _menuRow(FindingStatus.pending, 'Clear answer'),
                  ),
                ],
              ),
            ),
        ],
      );
    });
  }

  Widget _menuRow(FindingStatus s, String label) => Row(children: [
        Icon(iconFor(s), size: 20, color: Tone.forStatus(s).fg),
        const SizedBox(width: Space.sm),
        Text(label),
      ]);

  Widget _segment(FindingStatus s, bool stacked) {
    final selected = status == s;
    final tone = Tone.forStatus(s);
    final fg = selected ? tone.fg : Neutral.body;
    final icon = Icon(selected ? Tone.iconForStatus(s) : iconFor(s), size: 18, color: fg);
    final word = Text(
      s.label,
      maxLines: 1,
      softWrap: false,
      style: TextStyle(fontSize: stacked ? 12 : 13, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: fg),
    );
    return Semantics(
      button: true,
      selected: selected,
      enabled: onChanged != null,
      label: s.label,
      excludeSemantics: true,
      child: Material(
        color: selected ? tone.bg : Neutral.surface,
        child: InkWell(
          key: ValueKey('$keyPrefix-${s.wireValue}'),
          onTap: onChanged == null || selected ? null : () => onChanged!(s),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.xs, vertical: 2),
            child: Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: stacked
                    ? Column(mainAxisSize: MainAxisSize.min, children: [icon, const SizedBox(height: 2), word])
                    : Row(mainAxisSize: MainAxisSize.min, children: [icon, const SizedBox(width: 6), word]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
