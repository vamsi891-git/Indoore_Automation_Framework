import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';
import { ConsumerList, ConsumerMasterDataPage, LedgerIdentity } from '../../../src/pages/consumer-master-data.page';
import { LEDGER_TEMPLATE_HEADERS, writeEmptyLedgerFile, writeLedgerSheet } from './ledger-file';

type LedgerCase = {
  name: string;
  message: string | RegExp;
  rows?: string[][];
  fileName?: string;
  plainText?: string;
  mode?: 'Merge' | 'Override';
};

test.describe('Consumer ledger upload checks @master-data @regression', () => {
  functionality('Master Data');
  test.describe.configure({ timeout: 120_000 });

  let list: ConsumerList;

  test.beforeEach(async ({ loginPage, data, page, app }) => {
    await loginPage.open();
    await loginPage.signIn(data.user('validAdmin'));
    await page.waitForURL(/\/consumers(?:\?|$)/, { timeout: 20_000 });
    list = await new ConsumerMasterDataPage(page, app).open();
  });

  test('Every ledger column rule is checked, including Merge and Override', async ({ page, app }) => {
    test.setTimeout(900_000);
    const master = new ConsumerMasterDataPage(page, app);
    const identity = master.identityFrom(list);
    const dir = await mkdtemp(path.join(tmpdir(), 'ledger-rules-'));
    const failures: string[] = [];
    console.log('CMD-010 files larger than 200 MB, or with more than 200,000 rows, are not uploaded. Those limits would write files this run cannot keep.');

    for (const [index, item] of ledgerCases(identity).entries()) {
      const fileName = item.fileName ?? `${index}.xlsx`;
      const filePath = path.join(dir, fileName);
      if (item.plainText != null) {
        await writeFile(filePath, item.plainText);
      } else if (item.rows) {
        await writeLedgerSheet(filePath, item.rows);
      } else {
        await writeEmptyLedgerFile(filePath);
      }

      try {
        await master.openLedger();
        if (item.mode) {
          await master.chooseLedgerMode(item.mode);
        }
        await master.chooseLedgerFile(filePath);
        if (item.plainText) {
          await expect(page.getByText(item.message).first()).toBeVisible({ timeout: 10_000 });
        } else {
          const result = await master.validateChosenLedger();
          const dialogText = await page.getByRole('dialog', { name: 'Ledger' }).innerText();
          const report = `${result.report}\n${dialogText}`;
          const found = item.message instanceof RegExp ? item.message.test(report) : report.includes(String(item.message));
          if (!found) {
            throw new Error(`missing "${String(item.message)}". Validate said: ${report.replace(/\s+/g, ' ').slice(0, 360)}`);
          }
        }
        console.log(`CMD-010 ${item.name}: matched`);
      } catch (error) {
        const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
        failures.push(`${item.name}: ${detail}`);
        console.log(`ISSUE CMD-010 ${item.name}: ${detail}`);
      }
      await master.closeLedger();
    }

    await master.expectTotal(list.total);
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

function ledgerCases(identity: LedgerIdentity): LedgerCase[] {
  const headers = [...LEDGER_TEMPLATE_HEADERS];
  const row = (patch: Record<string, string> = {}): string[] =>
    headers.map((header) => patch[header] ?? (header === 'Consumer No' ? identity.consumerNo : header === 'Serial No' ? identity.serialNo : ''));
  const spacedSerial = `${identity.serialNo.slice(0, 2)} ${identity.serialNo.slice(2)}`.trim().slice(0, 32);
  const otherConsumer = `9${identity.consumerNo}`.slice(0, 32);

  return [
    { name: 'blank Consumer No', message: 'Consumer No is required.', rows: [headers, row({ 'Consumer No': '' })] },
    { name: 'Consumer No spaces', message: 'Consumer No must not contain spaces.', rows: [headers, row({ 'Consumer No': 'AB 12' })] },
    { name: 'Consumer No length', message: 'Consumer No must be at most 32 characters.', rows: [headers, row({ 'Consumer No': '1'.repeat(33) })] },
    {
      name: 'duplicate Consumer No',
      message: 'Duplicate Consumer No within upload file is not allowed.',
      rows: [headers, row(), row({ 'Serial No': `Z${identity.serialNo}`.slice(0, 32) })],
    },
    {
      name: 'second Consumer No column',
      message: 'Consumer No #2 does not match Consumer No #1.',
      rows: [[...headers, 'Consumer No'], [...row(), otherConsumer]],
    },
    {
      name: 'missing Consumer No header',
      message: 'Required header "Consumer No" is missing.',
      rows: [headers.filter((header) => header !== 'Consumer No'), row().filter((_, index) => headers[index] !== 'Consumer No')],
    },
    {
      name: 'duplicate Circle header',
      message: 'Unable to map duplicate Ledger headers. Consumer No, Serial No, and Meter Make may appear more than once.',
      rows: [['Circle', ...headers], ['East', ...row()]],
    },
    {
      name: 'duplicate Meter Make is allowed',
      message: 'No errors or field changes in the preview.',
      rows: [[...headers, 'Meter Make'], [...row(), '']],
    },
    {
      name: 'unknown column is ignored',
      message: 'No errors or field changes in the preview.',
      rows: [[...headers, 'Not A Ledger Column'], [...row(), 'ignored']],
    },
    {
      name: 'header case consumerno',
      message: 'No errors or field changes in the preview.',
      rows: [headers.map((header) => (header === 'Consumer No' ? 'consumerno' : header)), row()],
    },
    {
      name: 'blank data row is skipped',
      message: 'No errors or field changes in the preview.',
      rows: [headers, headers.map(() => ''), row()],
    },
    {
      name: 'header after a title row',
      message: 'No errors or field changes in the preview.',
      rows: [['Ledger title'], headers, row()],
    },
    { name: 'Serial No spaces', message: 'Serial No must not contain spaces.', rows: [headers, row({ 'Serial No': spacedSerial })] },
    { name: 'Serial No length', message: 'Serial No must be at most 32 characters.', rows: [headers, row({ 'Serial No': 'A'.repeat(33) })] },
    {
      name: 'duplicate Serial No',
      message: 'Duplicate Serial No within upload file is not allowed.',
      rows: [headers, row(), row({ 'Consumer No': otherConsumer })],
    },
    {
      name: 'serial missing from the database',
      message: 'Meter serial does not exist in L_Meter_Lookup.',
      rows: [headers, row({ 'Serial No': 'NOTINDB999001' })],
    },
    { name: 'sanctioned load zero', message: 'Sanctioned Load (In KW) must be a positive number.', rows: [headers, row({ 'Sanctioned Load (In KW)': '0' })] },
    { name: 'sanctioned load negative', message: 'Sanctioned Load (In KW) must be a positive number.', rows: [headers, row({ 'Sanctioned Load (In KW)': '-1' })] },
    { name: 'sanctioned load text', message: 'Sanctioned Load (In KW) must be a positive number.', rows: [headers, row({ 'Sanctioned Load (In KW)': 'abc' })] },
    { name: 'mobile letters', message: 'Mobile No must contain digits only (max 10).', rows: [headers, row({ 'Mobile No': 'abcdefghij' })] },
    { name: 'mobile length', message: 'Mobile No must be exactly 10 digits.', rows: [headers, row({ 'Mobile No': '123456789' })] },
    { name: 'consumer name length', message: 'Consumer Name must be at most 240 characters.', rows: [headers, row({ 'Consumer Name': 'N'.repeat(241) })] },
    { name: 'employee number text', message: 'Employee Number must be a valid number.', rows: [headers, row({ 'Employee Number': 'abc' })] },
    { name: 'latitude text', message: 'Latitude must be a valid number.', rows: [headers, row({ Latitude: 'abc' })] },
    { name: 'longitude text', message: 'Longitude must be a valid number.', rows: [headers, row({ Longitude: 'abc' })] },
    { name: 'MF text', message: 'MF must be a valid number.', rows: [headers, row({ MF: 'abc' })] },
    { name: 'service date format', message: 'Service Date must use YYYY-MM-DD or DD-MM-YYYY.', rows: [headers, row({ 'Service Date': '32-13-2020' })] },
    { name: 'service date future', message: 'Service Date must not be a future date.', rows: [headers, row({ 'Service Date': '2099-01-01' })] },
    { name: 'unknown meter phase', message: 'Meter Phase does not exist in M_ServicePoint_MeterPhase.', rows: [headers, row({ 'Meter Phase': 'NOT-A-PHASE' })] },
    { name: 'unknown tariff', message: 'Tariff Category does not exist in M_Connection_Category.', rows: [headers, row({ 'Tariff Category': 'NOT-A-TARIFF' })] },
    { name: 'unknown DTR', message: 'DTR Code does not exist in L_Network_Lookup or DTR_Master_Change_History.', rows: [headers, row({ 'DTR Code': 'NOT-A-DTR' })] },
    { name: 'unknown feeder', message: 'Feeder Name does not exist in L_Network_Lookup or feeder billing code.', rows: [headers, row({ 'Feeder Name': 'NOT-A-FEEDER' })] },
    {
      name: 'email format',
      message: 'Email ID must be a valid email address.',
      rows: [[...headers, 'Email ID'], [...row(), 'not-an-email']],
    },
    { name: 'empty workbook', message: /header row is required|Header row is missing/i },
    {
      name: 'non-xlsx file',
      message: 'Unable to read upload file. Use a valid .xlsx spreadsheet.',
      fileName: 'notes.txt',
      plainText: 'not a workbook',
    },
    { name: 'Merge still rejects a blank Consumer No', message: 'Consumer No is required.', mode: 'Merge', rows: [headers, row({ 'Consumer No': '' })] },
    { name: 'Override still rejects a blank Consumer No', message: 'Consumer No is required.', mode: 'Override', rows: [headers, row({ 'Consumer No': '' })] },
  ];
}
