import { BaseComponent } from './base.component';

export class TableComponent extends BaseComponent {
  rows(): Promise<Array<Record<string, string>>> {
    return this.root.evaluate((table) => {
      const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim() ?? '');
      return [...table.querySelectorAll('tbody tr')].map((row) => {
        const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim() ?? '');
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = cells[index] ?? '';
        });
        return record;
      });
    });
  }

  async rowByRecordId(id: string): Promise<Record<string, string>> {
    const record = await this.root.evaluate((table, recordId) => {
      const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim() ?? '');
      const row = [...table.querySelectorAll('tbody tr')].find(
        (candidate) => candidate.getAttribute('data-record-id') === recordId,
      );
      if (!row) {
        return null;
      }
      const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim() ?? '');
      const mapped: Record<string, string> = {};
      headers.forEach((header, index) => {
        mapped[header] = cells[index] ?? '';
      });
      return mapped;
    }, id);

    if (!record) {
      throw new Error(`No table row for id '${id}'`);
    }
    return record;
  }
}
