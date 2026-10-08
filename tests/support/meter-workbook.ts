import { writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

export const METER_TEMPLATE_HEADERS = [
  'Meter Serial Number',
  'Meter RAPDRP Code',
  'Asset ID',
  'MPTR',
  'MCTR',
  'LPTR',
  'LCTR',
  'MF',
  'Accuracy Class',
  'Meter PO Number',
  'Meter PO Date',
  'Meter Testing Date',
  'No. Of Display Digit',
  'Meter Manufacturer',
  'Meter Model',
  'Meter Version',
  'SIM Number',
  'IMSI Number',
  'IP Address',
  'Modem Serial No.',
  'Modem IMEI No.',
  'Meter Status',
  'DLMS / Non-DLMS',
  'Meter Rating',
] as const;

export function meterCells(
  values: Partial<Record<(typeof METER_TEMPLATE_HEADERS)[number], string>>,
  headers: readonly string[] = METER_TEMPLATE_HEADERS,
): string[] {
  return headers.map((header) => values[header as (typeof METER_TEMPLATE_HEADERS)[number]] ?? '');
}

export async function meterSheetBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Meters');
  for (const row of rows) {
    const added = sheet.addRow(row);
    added.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = '@';
    });
  }
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function writeMeterSheet(filePath: string, rows: string[][]): Promise<void> {
  await writeFile(filePath, await meterSheetBuffer(rows));
}
