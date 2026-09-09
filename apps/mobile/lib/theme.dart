import 'package:flutter/material.dart';

import 'models/finding.dart';

/// Assure Safety brand, taken from the certificate sheet rather than invented:
/// teal FF006666 on labels and the certifier's name, grey DDDDDD on the title
/// band. Keeping the field app and the certificate visually consistent matters
/// — they are the same document to the client.
class Brand {
  static const teal = Color(0xFF006666);
  static const tealDark = Color(0xFF004D4D);

  /// The certificate's bottom ribbon — a slightly bluer, deeper teal than the
  /// label colour. Used for the rule under the letterhead and for emphasis.
  static const ribbon = Color(0xFF0A5566);
  static const band = Color(0xFFDDDDDD);

  /// Status colours. Red and green are the workbook's own
  /// (FFFF0000 / FF00B050) so a certifier reading a printout and reading the
  /// app sees the same signal.
  static const nonCompliant = Color(0xFFFF0000);
  static const compliant = Color(0xFF00B050);
  static const notApplicable = Color(0xFF757575);
  static const conditional = Color(0xFFE68A00);
  static const pending = Color(0xFFBDBDBD);

  static Color forStatus(FindingStatus s) => switch (s) {
        FindingStatus.compliant => compliant,
        FindingStatus.nonCompliant => nonCompliant,
        FindingStatus.notApplicable => notApplicable,
        FindingStatus.conditional => conditional,
        FindingStatus.pending => pending,
      };
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.teal,
    primary: Brand.teal,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: const Color(0xFFF7F8F8),
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.teal,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    // Field use: gloved hands, bright light, a moving inspector. Targets are
    // deliberately large and contrast is high.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: Color(0xFFE0E3E3)),
      ),
      color: Colors.white,
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: const Color(0xFFFAFBFB),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
    ),
  );
}
