import 'package:flutter/material.dart';

import '../generated/checksheets.g.dart';
import '../models/inspection.dart';
import '../theme.dart';

/// The block above the items on a form sheet: the template's labels down
/// the left, the recorded values on the right, edited in place. A label
/// with options becomes a choice. Used by the wide sheet and the phone list.
class SubjectEditor extends StatelessWidget {
  final Inspection inspection;
  final SheetMeta sheet;
  final bool readOnly;
  const SubjectEditor({
    super.key,
    required this.inspection,
    required this.sheet,
    this.readOnly = false,
  });

  @override
  Widget build(BuildContext context) {
    final labels = sheet.subjectBlock;
    if (labels.isEmpty) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: inspection,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (sheet.subjectBlockTitle != null)
            Container(
              color: Brand.band,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Text(
                sheet.subjectBlockTitle!,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
          for (final l in labels) _row(context, l),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, SubjectLabel l) {
    final value = inspection.subject[l.label] ?? '';
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFBDBDBD))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 3,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Text(
                l.label,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                ),
              ),
            ),
          ),
          Expanded(
            flex: 6,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              child: l.options.isNotEmpty
                  ? DropdownButton<String>(
                      key: ValueKey('subject-${l.label}'),
                      value: l.options.contains(value) ? value : null,
                      hint: const Text(
                        'Choose',
                        style: TextStyle(fontSize: 12),
                      ),
                      isExpanded: true,
                      underline: const SizedBox.shrink(),
                      items: [
                        for (final o in l.options)
                          DropdownMenuItem(
                            value: o,
                            child: Text(
                              o,
                              style: const TextStyle(fontSize: 12.5),
                            ),
                          ),
                      ],
                      onChanged: readOnly
                          ? null
                          : (v) => v == null
                                ? null
                                : inspection.setSubject(l.label, v),
                    )
                  : _InlineText(
                      key: ValueKey('subject-${l.label}'),
                      value: value,
                      readOnly: readOnly,
                      onCommit: (v) => inspection.setSubject(l.label, v),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Units of a form sheet (cylinder batches): the template's labels down the
/// left and one column per unit, as the workbook lays cylinders across
/// columns. Add a unit with the button; remove with the x on its column.
class UnitsEditor extends StatelessWidget {
  final Inspection inspection;
  final SheetMeta sheet;
  final bool readOnly;
  const UnitsEditor({
    super.key,
    required this.inspection,
    required this.sheet,
    this.readOnly = false,
  });

  @override
  Widget build(BuildContext context) {
    final labels = sheet.unitBlock ?? const <SubjectLabel>[];
    if (labels.isEmpty) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: inspection,
      builder: (context, _) => _build(context, labels),
    );
  }

  Widget _build(BuildContext context, List<SubjectLabel> labels) {
    final units = inspection.units;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          color: Brand.band,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  sheet.unitBlockTitle ?? 'Units',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
              if (!readOnly)
                TextButton.icon(
                  key: const ValueKey('add-unit'),
                  onPressed: inspection.addUnit,
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add', style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ),
        if (units.isEmpty)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text(
              'No units recorded yet. Add one per cylinder batch.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
          )
        else
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: 220 + 180.0 * units.length,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const SizedBox(width: 220),
                      for (var u = 0; u < units.length; u++)
                        SizedBox(
                          width: 180,
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Unit ${u + 1}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              if (!readOnly)
                                IconButton(
                                  key: ValueKey('remove-unit-${u + 1}'),
                                  icon: const Icon(Icons.close, size: 14),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () => inspection.removeUnit(u + 1),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                  for (final l in labels)
                    Container(
                      decoration: const BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: Color(0xFFE0E0E0)),
                        ),
                      ),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 220,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              child: Text(
                                l.label,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ),
                          for (var u = 0; u < units.length; u++)
                            SizedBox(
                              width: 180,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                  vertical: 2,
                                ),
                                child: _InlineText(
                                  key: ValueKey('unit-${u + 1}-${l.label}'),
                                  value: units[u][l.label] ?? '',
                                  readOnly: readOnly,
                                  onCommit: (v) => inspection.setUnitField(
                                    u + 1,
                                    l.label,
                                    v,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// A text field that commits on focus loss or Enter, keeping its own
/// controller so a rebuild does not lose the caret.
class _InlineText extends StatefulWidget {
  final String value;
  final bool readOnly;
  final void Function(String) onCommit;
  const _InlineText({
    super.key,
    required this.value,
    required this.onCommit,
    this.readOnly = false,
  });

  @override
  State<_InlineText> createState() => _InlineTextState();
}

class _InlineTextState extends State<_InlineText> {
  late final TextEditingController _c = TextEditingController(
    text: widget.value,
  );
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus && _c.text != widget.value) widget.onCommit(_c.text);
    });
  }

  @override
  void didUpdateWidget(covariant _InlineText old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value &&
        !_focus.hasFocus &&
        _c.text != widget.value) {
      _c.text = widget.value;
    }
  }

  @override
  void dispose() {
    _focus.dispose();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _c,
    focusNode: _focus,
    readOnly: widget.readOnly,
    style: const TextStyle(fontSize: 12.5),
    decoration: const InputDecoration(
      isDense: true,
      border: InputBorder.none,
      contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 6),
    ),
    onSubmitted: (v) => widget.onCommit(v),
  );
}
