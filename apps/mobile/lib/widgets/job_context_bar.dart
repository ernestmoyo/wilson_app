import 'package:flutter/material.dart';

import '../models/job.dart';
import '../theme.dart';
import 'ui.dart';

/// The line that answers "which client, where, at what stage" on every job
/// screen. Sits under the letterhead bar so the sheet and the hub read as
/// the same job.
class JobContextBar extends StatelessWidget implements PreferredSizeWidget {
  final String clientName;
  final String locationName;
  final String? address;
  final String stage;
  final String? trailing;

  const JobContextBar({
    super.key,
    required this.clientName,
    required this.locationName,
    this.address,
    required this.stage,
    this.trailing,
  });

  static const double height = 44;

  @override
  Size get preferredSize => const Size.fromHeight(height);

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(bottom: BorderSide(color: Neutral.line)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: Space.lg),
        child: Row(
          children: [
            const Icon(Icons.business_outlined, size: 18, color: Brand.ribbon),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: clientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                  const TextSpan(text: '  ·  '),
                  TextSpan(text: locationName, style: const TextStyle(fontWeight: FontWeight.w500)),
                  if ((address ?? '').isNotEmpty) ...[
                    const TextSpan(text: '  ·  '),
                    TextSpan(text: address, style: const TextStyle(color: Neutral.muted)),
                  ],
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, color: Neutral.strong),
              ),
            ),
            if (trailing != null) ...[
              Text(trailing!, style: const TextStyle(fontSize: 13, color: Neutral.muted)),
              const SizedBox(width: Space.md),
            ],
            StageChip(stage: stage),
          ],
        ),
      );
}

/// Stage as a badge: info while the job moves forward, warning while it
/// waits on the client, good once a certificate is issued, neutral when it
/// ends. Icon + words, never colour alone.
class StageChip extends StatelessWidget {
  final String stage;
  final bool dense;
  const StageChip({super.key, required this.stage, this.dense = false});

  static Tone toneFor(String stage) => switch (stage) {
        'rfi' || 'gap_closure' => Tone.warn,
        'certificate_issued' || 'monitoring' => Tone.good,
        'closed' || 'referred' => Tone.neutral,
        _ => Tone.info,
      };

  static Color colorFor(String stage) => toneFor(stage).fg;

  static IconData iconFor(String stage) => switch (stage) {
        'rfi' || 'gap_closure' => Icons.hourglass_bottom,
        'certificate_issued' => Icons.verified_outlined,
        'monitoring' => Icons.event_repeat,
        'closed' || 'referred' => Icons.do_not_disturb_on_outlined,
        _ => Icons.play_circle_outline,
      };

  @override
  Widget build(BuildContext context) {
    final n = ProcessStage.numberOf(stage);
    return StatusBadge(
      label: '${n > 0 ? '$n · ' : ''}${ProcessStage.short(stage)}',
      tone: toneFor(stage),
      icon: iconFor(stage),
      dense: dense,
    );
  }
}
