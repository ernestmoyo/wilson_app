/// The site block: rows 2–14 of every check sheet, reproduced in the same
/// order with the same labels. Each entry is one workbook row; a few rows
/// carry a second label/value pair in columns D/E (rows 11 and 13).
class SiteRow {
  final String label;
  final String value;
  final String? label2;
  final String? value2;
  const SiteRow(this.label, this.value, {this.label2, this.value2});
}

class SiteBlock {
  final String? legalEntityName;
  final String? tradingAsName;
  final String? siteAddress;
  final String? postalAddress;
  final String? businessPhone;
  final String? website;
  final String? nzbn;
  final String? industry;
  final String? managerName;
  final DateTime? inspectionDate;
  final String? inspectionStatus;
  final String? directDial;
  final List<String> substanceNames;
  final String? hsLocation;
  final String? summary;

  const SiteBlock({
    this.legalEntityName,
    this.tradingAsName,
    this.siteAddress,
    this.postalAddress,
    this.businessPhone,
    this.website,
    this.nzbn,
    this.industry,
    this.managerName,
    this.inspectionDate,
    this.inspectionStatus,
    this.directDial,
    this.substanceNames = const [],
    this.hsLocation,
    this.summary,
  });

  static String formatDate(DateTime? d) => _d(d);

  static String _d(DateTime? d) {
    if (d == null) return '';
    final l = d.toLocal();
    return '${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year}';
  }

  /// "in_progress" → "In progress": the sheet is read by people, not by code.
  static String _status(String? s) {
    if (s == null || s.isEmpty) return '';
    final words = s.replaceAll('_', ' ');
    return words[0].toUpperCase() + words.substring(1);
  }

  /// Rows 2–14, verbatim labels, in sheet order.
  List<SiteRow> rows() => [
        SiteRow('Legal Entity Name', legalEntityName ?? ''),
        SiteRow('Trading as Name', tradingAsName ?? ''),
        SiteRow('Site / Location Address', siteAddress ?? ''),
        SiteRow('Postal Address', postalAddress ?? ''),
        SiteRow('Business Phone Number', businessPhone ?? ''),
        SiteRow('Business Website', website ?? ''),
        SiteRow('NZBN', nzbn ?? ''),
        SiteRow('Description of Business Type / Industry', industry ?? ''),
        SiteRow('Manager Name', managerName ?? ''),
        SiteRow('Date of Inspection/Site Visit', _d(inspectionDate),
            label2: 'Status of Inspection', value2: _status(inspectionStatus)),
        SiteRow('Direct Dial Number and/or Mobile Number', directDial ?? ''),
        SiteRow('Hazardous substance name', substanceNames.join(', '),
            label2: 'Hazardous Substance Location', value2: hsLocation ?? ''),
        SiteRow('Brief location summary', summary ?? ''),
      ];
}
