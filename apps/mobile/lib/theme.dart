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
  /// label colour. The app's primary colour (UX change graph B5, 19 Oct 2026).
  static const ribbon = Color(0xFF0A5566);
  static const band = Color(0xFFDDDDDD);

  /// Status colours. Red and green are the workbook's own
  /// (FFFF0000 / FF00B050) so a certifier reading a printout and reading the
  /// app sees the same signal. They stay exact on check sheet comment text
  /// (UX B2); badges and buttons use [Tone] instead, which pass contrast.
  static const nonCompliant = Color(0xFFFF0000);
  static const compliant = Color(0xFF00B050);
  /// The workbooks' blue "General comment" (scope of work, 19 Oct 2026).
  static const generalComment = Color(0xFF0070C0);
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

/// Neutral colours. Every text colour here passes 4.5:1 on white and on
/// [canvas]; use these instead of Colors.black54 and friends.
class Neutral {
  static const strong = Color(0xFF14262B);
  static const body = Color(0xFF3C5055);
  static const muted = Color(0xFF52666B);
  static const faint = Color(0xFF7A8C90); // icons and rules only, never text
  static const line = Color(0xFFDCE4E5);
  static const lineSoft = Color(0xFFEDF1F2);
  static const canvas = Color(0xFFF4F6F6);
  static const surface = Colors.white;
  static const tint = Color(0xFFE7F0F1); // selected row, current step
}

/// A status as a foreground on a tinted background: badges, chips, the
/// selected answer button. Both pass contrast, and a [Tone] always travels
/// with an icon and a word (never colour alone).
enum Tone {
  good(Color(0xFF0B6E3A), Color(0xFFE3F3EA), Icons.check_circle_outline),
  bad(Color(0xFFA1221B), Color(0xFFFBE9E7), Icons.error_outline),
  warn(Color(0xFF7A4F00), Color(0xFFFFF3D6), Icons.warning_amber_rounded),
  info(Brand.ribbon, Neutral.tint, Icons.info_outline),
  neutral(Neutral.body, Color(0xFFEEF1F1), Icons.remove_circle_outline);

  final Color fg;
  final Color bg;
  final IconData icon;
  const Tone(this.fg, this.bg, this.icon);

  static Tone forStatus(FindingStatus s) => switch (s) {
        FindingStatus.compliant => good,
        FindingStatus.nonCompliant => bad,
        FindingStatus.conditional => warn,
        FindingStatus.notApplicable => neutral,
        FindingStatus.pending => neutral,
      };

  static IconData iconForStatus(FindingStatus s) => switch (s) {
        FindingStatus.compliant => Icons.check,
        FindingStatus.nonCompliant => Icons.close,
        FindingStatus.conditional => Icons.warning_amber_rounded,
        FindingStatus.notApplicable => Icons.remove,
        FindingStatus.pending => Icons.radio_button_unchecked,
      };
}

/// 4-point spacing scale.
class Space {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

class Radii {
  static const sm = 8.0;
  static const md = 12.0;
  static const pill = 999.0;
}

/// The smallest thing a gloved finger should have to hit.
const double kTouch = 44;

const _font = 'IBM Plex Sans';

TextTheme _textTheme() => const TextTheme(
      displaySmall: TextStyle(fontSize: 32, fontWeight: FontWeight.w600, color: Neutral.strong, height: 1.2),
      headlineSmall: TextStyle(fontSize: 24, fontWeight: FontWeight.w600, color: Neutral.strong, letterSpacing: -.2, height: 1.25),
      titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: Neutral.strong, height: 1.3),
      titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Neutral.strong, height: 1.35),
      titleSmall: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Neutral.strong, height: 1.35),
      bodyLarge: TextStyle(fontSize: 16, color: Neutral.strong, height: 1.45),
      bodyMedium: TextStyle(fontSize: 14, color: Neutral.strong, height: 1.45),
      bodySmall: TextStyle(fontSize: 13, color: Neutral.muted, height: 1.4),
      labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.2),
      labelMedium: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Neutral.body, height: 1.2),
      labelSmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Neutral.muted, height: 1.2),
    );

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.ribbon,
    primary: Brand.ribbon,
    error: Tone.bad.fg,
    surface: Neutral.surface,
    onSurface: Neutral.strong,
    onSurfaceVariant: Neutral.muted,
    outline: const Color(0xFFB9C7CA),
    outlineVariant: Neutral.line,
    brightness: Brightness.light,
  );
  final text = _textTheme();
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));

  return ThemeData(
    useMaterial3: true,
    fontFamily: _font,
    colorScheme: scheme,
    textTheme: text,
    scaffoldBackgroundColor: Neutral.canvas,
    dividerTheme: const DividerThemeData(color: Neutral.lineSoft, thickness: 1, space: 1),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: Neutral.strong,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleMedium,
      iconTheme: const IconThemeData(color: Brand.ribbon),
    ),
    // Field use: gloved hands, bright light, a moving inspector. Targets are
    // deliberately large and contrast is high.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, kTouch + 4),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        textStyle: text.labelLarge,
        shape: shape,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, kTouch),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        foregroundColor: Brand.ribbon,
        side: const BorderSide(color: Color(0xFFB9C7CA)),
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w500),
        shape: shape,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(0, kTouch),
        foregroundColor: Brand.ribbon,
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w500),
        shape: shape,
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(minimumSize: const Size(kTouch, kTouch)),
    ),
    chipTheme: ChipThemeData(
      labelStyle: text.labelMedium,
      side: const BorderSide(color: Color(0xFFB9C7CA)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.pill)),
      selectedColor: Neutral.tint,
      checkmarkColor: Brand.ribbon,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: Space.md, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        side: const BorderSide(color: Neutral.line),
      ),
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      titleTextStyle: text.titleLarge,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Neutral.strong,
      contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm)),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: Brand.ribbon,
      unselectedLabelColor: Neutral.muted,
      indicatorColor: Brand.ribbon,
      labelStyle: text.labelLarge,
      unselectedLabelStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w500),
      dividerColor: Neutral.line,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: Brand.ribbon,
      linearTrackColor: Color(0xFFE3E9EA),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.md),
      labelStyle: text.bodyMedium?.copyWith(color: Neutral.muted),
      hintStyle: text.bodyMedium?.copyWith(color: Neutral.muted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.sm),
        borderSide: const BorderSide(color: Color(0xFFB9C7CA)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.sm),
        borderSide: const BorderSide(color: Color(0xFFB9C7CA)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.sm),
        borderSide: const BorderSide(color: Brand.ribbon, width: 2),
      ),
    ),
  );
}
