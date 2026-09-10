import 'package:flutter/material.dart';

import '../theme.dart';

/// The Assure Safety letterhead as an app bar: white strip, the logo mark,
/// a title, a teal rule beneath. The same header the certificate carries,
/// so the app and the paper read as one document.
///
/// The logo is dark-on-light (there is no knock-out version), which is why the
/// bar is white rather than teal. Teal is used for the rule and for accents.
class BrandBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  final Widget? leading;
  final PreferredSizeWidget? bottom;

  const BrandBar({
    super.key,
    required this.title,
    this.subtitle,
    this.actions = const [],
    this.leading,
    this.bottom,
  });

  static const double _barHeight = 64;

  /// The status-bar inset the SafeArea below will consume. preferredSize has
  /// no BuildContext, so read it from the primary view.
  static double get _topInset {
    final view = WidgetsBinding.instance.platformDispatcher.views.first;
    return view.padding.top / view.devicePixelRatio;
  }

  @override
  Size get preferredSize =>
      Size.fromHeight(_topInset + _barHeight + 3 + (bottom?.preferredSize.height ?? 0));

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return Material(
      color: Colors.white,
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: _barHeight,
              child: Row(
                children: [
                  if (leading != null)
                    leading!
                  else if (canPop)
                    IconButton(
                      icon: const Icon(Icons.arrow_back, color: Brand.teal),
                      onPressed: () => Navigator.of(context).maybePop(),
                    )
                  else
                    const SizedBox(width: 12),
                  // The logo goes home from anywhere: the jobs board is the
                  // first route, so pop to it.
                  InkWell(
                    key: const ValueKey('logo-home'),
                    onTap: () => Navigator.of(context).popUntil((r) => r.isFirst),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Image.asset(
                        'assets/brand/logo-white.png',
                        height: 36,
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: Brand.tealDark,
                            letterSpacing: .2,
                          ),
                        ),
                        if (subtitle != null)
                          Text(
                            subtitle!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: Colors.black54),
                          ),
                      ],
                    ),
                  ),
                  ...actions,
                  const SizedBox(width: 6),
                ],
              ),
            ),
            // The rule: the certificate's ribbon colour, edge to edge.
            Container(height: 3, color: Brand.ribbon),
            ?bottom,
          ],
        ),
      ),
    );
  }
}
