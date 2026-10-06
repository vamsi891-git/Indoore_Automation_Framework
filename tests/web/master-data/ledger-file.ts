import ExcelJS from 'exceljs';

export const LEDGER_TEMPLATE_HEADERS = [
  'Circle',
  'Division',
  'Zone',
  'Consumer No',
  'Old Consumer No',
  'Tariff Category',
  'Tariff Code',
  'Meter Phase',
  'Sanctioned Load (In KW)',
  'Employee Number',
  'Employee Company Name',
  'Consumer Name',
  'Address1',
  'Mobile No',
  'DTR Code',
  'Feeder Name',
  'Meter Make',
  'Serial No',
  'Latitude',
  'Longitude',
  'Service Date',
  'MF',
] as const;

export async function writeLedgerFile(
  filePath: string,
  rows: Array<Partial<Record<(typeof LEDGER_TEMPLATE_HEADERS)[number], string>>>,
  headers: readonly string[] = LEDGER_TEMPLATE_HEADERS,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ledger');
  sheet.addRow([...headers]);
  for (const row of rows) {
    const added = sheet.addRow(headers.map((header) => row[header as (typeof LEDGER_TEMPLATE_HEADERS)[number]] ?? ''));
    for (const header of ['Consumer No', 'Old Consumer No', 'Serial No'] as const) {
      const index = headers.indexOf(header);
      if (index >= 0) {
        added.getCell(index + 1).numFmt = '@';
      }
    }
  }
  await workbook.xlsx.writeFile(filePath);
}

export async function writeLedgerSheet(filePath: string, rows: string[][]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ledger');
  for (const row of rows) {
    const added = sheet.addRow(row);
    added.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = '@';
    });
  }
  await workbook.xlsx.writeFile(filePath);
}

export async function writeEmptyLedgerFile(filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Ledger');
  await workbook.xlsx.writeFile(filePath);
}

export async function readFirstRow(filePath: string): Promise<{ sheet: string; headers: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const headers: string[] = [];
  sheet?.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.text ?? cell.value ?? '').trim());
  });
  return { sheet: sheet?.name ?? '', headers };
}
