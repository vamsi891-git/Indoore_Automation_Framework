import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './base.component';

export interface CategoryRow {
  code: string;
  name: string;
  count: number | null;
  percent: number | null;
  percentText: string;
}

/** Reads the Category Distribution rows: code, name, count, and percent. */
export class CategoryDistributionComponent extends BaseComponent {
  constructor(page: Page, root: Locator) {
    super(page, root);
  }

  static locate(scope: Locator): Locator {
    return scope.getByText('Category Distribution', { exact: true }).locator(
      'xpath=ancestor::*[.//a[contains(@href, "category-distribution")]][1]',
    );
  }

  async read(): Promise<CategoryRow[]> {
    await this.root.waitFor({ state: 'visible' });
    await this.root.scrollIntoViewIfNeeded();
    const links = this.root.getByRole('link', { name: /^Open .+ category distribution details$/ });
    await links.first().waitFor();

    const linkCount = await links.count();
    const rows: CategoryRow[] = [];
    for (let index = 0; index < linkCount; index += 1) {
      const raw = (await links.nth(index).innerText()).replace(/\s+/g, ' ').trim();
      const match = raw.match(/^([A-Z]+)\s*-\s*(.+?)\s*\(([\d,]+|—|–|-)\)\s+([\d.]+%|—|–|-)$/);
      if (!match) {
        throw new Error(`Unreadable category row: ${raw}`);
      }
      rows.push({
        code: match[1],
        name: match[2].trim(),
        count: parseCount(match[3]),
        percentText: match[4],
        percent: parsePercent(match[4]),
      });
    }
    return rows;
  }

  async open(name: string): Promise<void> {
    const link = this.root.getByRole('link', { name: `Open ${name} category distribution details`, exact: true });
    await link.scrollIntoViewIfNeeded();
    await link.click();
  }
}

function parseCount(value: string): number | null {
  if (value === '—' || value === '–' || value === '-') {
    return null;
  }
  return Number(value.replace(/,/g, ''));
}

function parsePercent(value: string): number | null {
  if (value === '—' || value === '–' || value === '-') {
    return null;
  }
  return Number(value.replace('%', '').replace(/,/g, '').trim());
}
