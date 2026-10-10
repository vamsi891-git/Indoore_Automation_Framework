import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './base.component';

export interface DonutSlice {
  label: string;
  count: number | null;
  percent: number | null;
  percentText: string;
}

export interface DonutReading {
  title: string;
  centerLabel: string;
  total: number | null;
  slices: DonutSlice[];
}

/**
 * Reads a dashboard donut that shows a center total and legend rows.
 * Meter Status, OEM Distribution, Relay Status Overview, and Phase Distribution share this layout.
 */
export class DonutComponent extends BaseComponent {
  constructor(
    page: Page,
    root: Locator,
    readonly title: string,
  ) {
    super(page, root);
  }

  static locate(scope: Locator, title: string): Locator {
    return scope.getByText(title, { exact: true }).locator(
      'xpath=ancestor::*[.//*[@role="img" or self::img]][1]',
    );
  }

  async read(): Promise<DonutReading> {
    await this.root.waitFor({ state: 'visible' });
    await this.root.scrollIntoViewIfNeeded();
    await this.root.getByText(this.title, { exact: true }).first().hover();
    await this.root.getByRole('button', { name: /^Open .+ details$/ }).first().waitFor();

    const chart = this.root.getByRole('img', { name: /donut chart/i });
    const chartText = (await chart.innerText()).replace(/\u00a0/g, ' ');
    const rootText = (await this.root.innerText()).replace(/\u00a0/g, ' ');
    const cardText = await this.root.evaluate((node) => {
      const card = node.closest('.bi-box-container-card');
      return (card?.textContent ?? '').replace(/\u00a0/g, ' ');
    });
    const centerText = [chartText, rootText, cardText].find((text) => /(Total Meters|Analyzed meters|Total)\s*[\d,]+/.test(text)) ?? rootText;
    const centerMatch = centerText.match(/(Total Meters|Analyzed meters|Total)\s*([\d,]+|—|–|-)/);
    if (!centerMatch) {
      throw new Error(`No center total on ${this.title}: ${centerText.replace(/\s+/g, ' ').trim()}`);
    }

    const buttons = this.root.getByRole('button', { name: /^Open .+ details$/ });
    const buttonCount = await buttons.count();
    const slices: DonutSlice[] = [];
    for (let index = 0; index < buttonCount; index += 1) {
      const raw = (await buttons.nth(index).innerText()).replace(/\s+/g, ' ').trim();
      const match = raw.match(/^(.*?)\s+([\d,]+|—|–|-)\s+([\d.]+%|—|–|-)$/);
      if (!match) {
        throw new Error(`Unreadable slice on ${this.title}: ${raw}`);
      }
      slices.push({
        label: match[1].trim(),
        count: parseCount(match[2]),
        percentText: match[3],
        percent: parsePercent(match[3]),
      });
    }

    return {
      title: (await this.root.getByText(this.title, { exact: true }).first().innerText()).trim(),
      centerLabel: centerMatch[1],
      total: parseCount(centerMatch[2]),
      slices,
    };
  }

  async openSlice(label: string): Promise<void> {
    const button = this.root.getByRole('button', { name: `Open ${label} details`, exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
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
