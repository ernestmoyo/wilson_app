import 'package:flutter/material.dart';

import '../theme.dart';

/// Assure Safety's contact block, as text rather than the bitmap the workbook
/// pastes. Same four facts the letterhead carries; crisp at any size.
class CompanyInfo {
  static const address = '59A Vintage Drive, Henderson, Auckland (0612)';
  static const email = 'compliancecertifier@assuresafety.co.nz';
  static const website = 'www.assuresafety.co.nz';
  static const phone = '+64 21 204 8493';
}

class CompanyDetails extends StatelessWidget {
  final double fontSize;
  const CompanyDetails({super.key, this.fontSize = 12.5});

  Widget _line(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: fontSize + 3, color: Brand.teal),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(fontSize: fontSize, color: Colors.black87, height: 1.2)),
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
          Row(mainAxisSize: MainAxisSize.min, children: [
            _line(Icons.language, CompanyInfo.website),
            const SizedBox(width: 14),
            _line(Icons.phone_outlined, CompanyInfo.phone),
          ]),
        ],
      );
}
