import 'package:flutter/material.dart';

import '../models/job.dart';
import '../theme.dart';

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

  @override
  Size get preferredSize => const Size.fromHeight(40);

  @override
  Widget build(BuildContext context) => Container(
        height: 40,
        color: const Color(0xFFEEF3F3),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          children: [
            const Icon(Icons.business_outlined, size: 16, color: Brand.tealDark),
            const SizedBox(width: 6),
            Expanded(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: clientName, style: const TextStyle(fontWeight: FontWeight.w800)),
                  const TextSpan(text: '  ·  '),
                  TextSpan(text: locationName, style: const TextStyle(fontWeight: FontWeight.w600)),
                  if ((address ?? '').isNotEmpty) ...[
                    const TextSpan(text: '  ·  '),
                    TextSpan(text: address, style: const TextStyle(color: Colors.black54)),
                  ],
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, color: Colors.black87),
              ),
            ),
            if (trailing != null) ...[
              Text(trailing!, style: const TextStyle(fontSize: 12, color: Colors.black54)),
              const SizedBox(width: 10),
            ],
            StageChip(stage: stage),
          ],
        ),
      );
}

/// Stage as a coloured chip: teal while the job moves forward, amber while it
/// waits on the client, green once a certificate is issued, grey when it ends.
class StageChip extends StatelessWidget {
  final String stage;
  final bool dense;
  const StageChip({super.key, required this.stage, this.dense = false});

  static Color colorFor(String stage) => switch (stage) {
        'rfi' || 'gap_closure' => Brand.conditional,
        'certificate_issued' || 'monitoring' => Brand.compliant,
        'closed' || 'referred' => Brand.notApplicable,
        _ => Brand.teal,
      };

  @override
  Widget build(BuildContext context) {
    final n = ProcessStage.numberOf(stage);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: dense ? 8 : 10, vertical: dense ? 2 : 4),
      decoration: BoxDecoration(color: colorFor(stage), borderRadius: BorderRadius.circular(12)),
      child: Text(
        '${n > 0 ? '$n · ' : ''}${ProcessStage.short(stage)}',
        style: TextStyle(color: Colors.white, fontSize: dense ? 11 : 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}
