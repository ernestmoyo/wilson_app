import 'package:flutter/material.dart';

import '../theme.dart';

/// Assure Safety's contact block, as text rather than the bitmap the workbook
/// pastes. Same four facts the letterhead carries; crisp at any size.
class CompanyInfo {
  static const address = '1 Matakohe Road, Westgate, Auckland, New Zealand';
  static const email = 'compliancecertifier@assuresafety.co.nz';
  static const website = 'www.assuresafety.co.nz';
  static const phone = '020 476 4841';
}

class CompanyDetails extends StatelessWidget {
  final double fontSize;
  const CompanyDetails({super.key, this.fontSize = 12.5});

  Widget _line(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: fontSize + 3, color: Brand.teal),
          const SizedBox(width: 6),
          // Gives way rather than overflowing a narrow letterhead.
          Flexible(
            child: Text(text,
                textAlign: TextAlign.end,
                style: TextStyle(fontSize: fontSize, color: Neutral.strong, height: 1.2)),
          ),
        ],
      );

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          _line(Icons.place_outlined, CompanyInfo.address),
          const SizedBox(height: 3),
          _line(Icons.mail_outline, CompanyInfo.email),
          const SizedBox(height: 3),
          Wrap(alignment: WrapAlignment.end, spacing: 14, runSpacing: 3, children: [
            _line(Icons.language, CompanyInfo.website),
            _line(Icons.phone_outlined, CompanyInfo.phone),
          ]),
        ],
      );
}
