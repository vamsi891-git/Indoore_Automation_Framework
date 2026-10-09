import { expect, Locator } from '@playwright/test';
import { DonutComponent } from '../core/components/donut.component';
import {
  CARDS,
  WIDGETS,
  expectCardDrillDowns,
  expectCards,
  expectCommunication,
  expectCommunicationDrillDown,
  expectConsumption,
  expectConsumptionDrillDown,
  expectDownloads,
  expectFailedWidgetKeepsOthers,
  expectLoadUnbalance,
  expectMonthYear,
  expectNoPeriodOrMonth,
  expectPercentageDrillDowns,
  expectPercentageLoading,
  expectPeriod,
  expectPower,
  expectPowerDrillDown,
  expectSeverityDrillDowns,
  expectVoltageUnbalance,
  kolkataMonth,
  unwrap,
  type DtrWidgetHost,
} from '../core/components/dtr-overview-widgets';

export { kolkataMonth };
import { calendarMonth, expectFutureMonthsDisabled, kolkataCalendar, monthDayLabels, monthRangeText, openMonthGrid, pickMonth } from '../core/components/month-grid';
import { BasePage } from './base.page';

export type DtrPeriod = 'hourly' | 'daily' | 'weekly';

export interface DtrPayload {
  url: string;
  status: number;
  body: unknown;
}

export interface DtrSnapshot {
  summary: DtrPayload;
  power: DtrPayload;
  consumption: DtrPayload;
  communication: DtrPayload;
  percentage: DtrPayload;
  load: DtrPayload;
  voltage: DtrPayload;
}

export class DtrOverviewPage extends BasePage {
  readonly issues: string[] = [];

  private main(): Locator {
    return this.page.getByRole('main');
  }

  heading(): Locator {
    return this.main().locator('.theme-text-page-title').getByText('DTR Overview', { exact: true });
  }

  sectionTab(): Locator {
    return this.page.getByRole('navigation', { name: 'Main sections' }).getByRole('tab', { name: 'DTR Management', exact: true });
  }

  periodButton(): Locator {
    return this.powerPeriod();
  }

  powerPeriod(): Locator {
    return this.main().getByRole('button', { name: 'Power Status period', exact: true });
  }

  energyPeriod(): Locator {
    return this.main().getByRole('button', { name: 'Energy Consumption period', exact: true });
  }

  monthButton(): Locator {
    return this.main().getByRole('button', { name: 'DTR dashboard month and year', exact: true });
  }

  card(name: string): Locator {
    const pattern = new RegExp(name);
    return this.main().getByRole('button', { name: pattern }).or(this.main().getByRole('link', { name: pattern })).first();
  }

  widget(title: string): Locator {
    return this.main().locator('.bi-box-container-card').filter({ hasText: title }).first();
  }

  donut(title: string): DonutComponent {
    return new DonutComponent(this.page, DonutComponent.locate(this.main(), title), title);
  }

  note(id: string, message: string): void {
    const line = `${id}: ${message}`;
    if (!this.issues.includes(line)) {
      this.issues.push(line);
    }
  }

  flushIssues(): string[] {
    const found = [...this.issues];
    this.issues.length = 0;
    for (const issue of found) {
      console.log(`ISSUE ${issue}`);
    }
    return found;
  }

  async openFromManagement(): Promise<DtrSnapshot> {
    const pending = this.capture();
    await this.sectionTab().click();
    await this.page.waitForURL(/\/dtr\/dashboard$/, { timeout: 20_000 });
    const snapshot = await pending;
    await expect(this.heading()).toBeVisible();
    return snapshot;
  }

  async expectShell(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dtr\/dashboard$/);
    await expect(this.heading()).toBeVisible();
    await expect(this.main()).toContainText('Dashboard');
    await expect(this.sectionTab()).toHaveAttribute('aria-selected', 'true');
    const sections = this.page.getByRole('navigation', { name: 'Main sections' });
    for (const name of ['Water', 'DG', 'Gas']) {
      await expect(sections.getByRole('tab', { name, exact: true })).toBeDisabled();
    }
    await expect(this.powerPeriod()).toHaveAccessibleName('Power Status period');
    await expect(this.energyPeriod()).toHaveAccessibleName('Energy Consumption period');
    await expect(this.powerPeriod()).toContainText('Daily');
    await expect(this.energyPeriod()).toContainText('Daily');
    await expect(this.main().getByRole('button', { name: 'DTR overview period', exact: true })).toHaveCount(0);
    const month = this.monthButton();
    await expect(month).toHaveAccessibleName('DTR dashboard month and year');
    await expect(month).toContainText(kolkataCalendar().label);

    for (const label of [...CARDS, ...WIDGETS]) {
      try {
        await this.main().getByText(label, { exact: true }).first().waitFor({ timeout: 20_000 });
      } catch {
        console.log(`ISSUE DO-001: "${label}" is not in the DTR Overview main region.`);
      }
    }
    const text = await this.main().innerText();
    const positions = [...CARDS, ...WIDGETS].map((label) => text.indexOf(label));
    const missing = [...CARDS, ...WIDGETS].filter((_, index) => positions[index] < 0);
    if (missing.length > 0) {
      console.log(`ISSUE DO-001: layout is missing ${missing.join(', ')}.`);
    }
    expect(positions.every((index) => index >= 0), 'layout labels').toBe(true);
    const sorted = [...positions].sort((left, right) => left - right);
    expect(positions, 'widget order').toEqual(sorted);
  }

  expectInitialRequests(snapshot: DtrSnapshot): void {
    for (const payload of Object.values(snapshot)) {
      expect(payload.status, payload.url).toBe(200);
      unwrap(payload.body);
    }
    const current = kolkataCalendar().ym;
    for (const payload of [snapshot.summary, snapshot.power, snapshot.consumption]) {
      expectPeriod(payload.url, 'daily', true);
      expectMonthYear(payload.url, current);
    }
    expectNoPeriodOrMonth(snapshot.communication.url);
    expectNoPeriodOrMonth(snapshot.percentage.url);
    expectNoPeriodOrMonth(snapshot.load.url);
    expectNoPeriodOrMonth(snapshot.voltage.url);
  }

  async expectPeriodMenus(monthYear: string): Promise<void> {
    await this.expectChoices(this.powerPeriod());
    await this.page.keyboard.press('Escape');
    await this.expectChoices(this.energyPeriod());
    await this.page.keyboard.press('Escape');
    const weeklyPower = this.waitFor('/dashboard/dtr/power-status');
    await this.choose(this.powerPeriod(), 'Weekly');
    expectPeriod((await weeklyPower).url, 'weekly', true);
    expectMonthYear((await weeklyPower).url, monthYear);
    await expect(this.energyPeriod()).toContainText('Daily');
    const weeklyEnergy = this.waitFor('/dashboard/dtr/consumption');
    await this.choose(this.energyPeriod(), 'Weekly');
    expectPeriod((await weeklyEnergy).url, 'weekly', true);
    expectMonthYear((await weeklyEnergy).url, monthYear);
    await expect(this.powerPeriod()).toContainText('Weekly');
    for (const name of CARDS) {
      await expect(this.card(name)).toContainText('vs Yesterday');
    }
  }

  async expectMonthBounds(): Promise<void> {
    const current = kolkataCalendar();
    const grid = await openMonthGrid(this.page, this.monthButton());
    await expect(grid.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
    await expectFutureMonthsDisabled(grid, current);
    await this.page.keyboard.press('Escape');
  }

  async applySelectedMonth(monthYear: string, period: DtrPeriod): Promise<DtrSnapshot> {
    const requests = this.capture();
    await this.selectMonth(monthYear);
    const snapshot = await requests;
    for (const payload of Object.values(snapshot)) {
      expect(payload.status, payload.url).toBe(200);
      expectMonthYear(payload.url, monthYear);
    }
    expectPeriod(snapshot.summary.url, 'daily', true);
    expectPeriod(snapshot.power.url, 'daily', true);
    expectPeriod(snapshot.consumption.url, 'daily', true);
    expect(new URL(snapshot.communication.url).searchParams.get('period'), 'communication period').toBeNull();
    expect(new URL(snapshot.percentage.url).searchParams.get('period'), 'loading period').toBeNull();
    expect(new URL(snapshot.load.url).searchParams.get('period'), 'load period').toBeNull();
    expect(new URL(snapshot.voltage.url).searchParams.get('period'), 'voltage period').toBeNull();

    const month = calendarMonth(monthYear);
    const range = monthRangeText(monthYear);
    await expect(this.monthButton()).toContainText(month.label);
    await expect(this.widget('Power Status')).toContainText(range);
    await expect(this.widget('Energy Consumption')).toContainText(range);
    await expect(this.widget('Load Unbalance')).toContainText('Phase load imbalance distribution across DTRs');
    await expect(this.widget('Voltage Unbalance')).toContainText('Phase voltage imbalance distribution across DTRs');
    const communication = await this.widget('Communication Status').innerText();
    expect(communication).toContain('Current status of active Meters');
    expect(communication.includes(month.label), 'communication has no month caption').toBe(false);
    const loading = await this.widget('Percentage Loading').innerText();
    expect(loading.includes(month.label), 'percentage loading has no month caption').toBe(false);
    for (const name of CARDS) {
      await expect(this.card(name)).toContainText('vs Yesterday');
    }
    if (period === 'daily') {
      const powerLabels = pointLabels(snapshot.power.body);
      const energyLabels = pointLabels(snapshot.consumption.body);
      for (const day of monthDayLabels(monthYear)) {
        expect(powerLabels, `power ${day}`).toContain(day);
        expect(energyLabels, `energy ${day}`).toContain(day);
      }
    }
    if (period === 'weekly') {
      const power = this.waitFor('/dashboard/dtr/power-status');
      await this.choose(this.powerPeriod(), 'Weekly');
      snapshot.power = await power;
      const consumption = this.waitFor('/dashboard/dtr/consumption');
      await this.choose(this.energyPeriod(), 'Weekly');
      snapshot.consumption = await consumption;
      expectPeriod(snapshot.power.url, 'weekly', true);
      expectPeriod(snapshot.consumption.url, 'weekly', true);
      expectMonthYear(snapshot.power.url, monthYear);
      expectMonthYear(snapshot.consumption.url, monthYear);
    }
    return snapshot;
  }

  private capture(): Promise<DtrSnapshot> {
    return Promise.all([
      this.waitFor('/dashboard/dtr/summary'),
      this.waitFor('/dashboard/dtr/power-status'),
      this.waitFor('/dashboard/dtr/consumption'),
      this.waitFor('/dashboard/dtr/communication-status'),
      this.waitFor('/dashboard/dtr/percentage-loading'),
      this.waitFor('/dashboard/dtr/load-unbalance'),
      this.waitFor('/dashboard/dtr/voltage-unbalance'),
    ]).then(([summary, power, consumption, communication, percentage, load, voltage]) => ({
      summary,
      power,
      consumption,
      communication,
      percentage,
      load,
      voltage,
    }));
  }

  private waitFor(part: string): Promise<DtrPayload> {
    return this.page
      .waitForResponse((response) => response.url().includes(part) && response.request().method() === 'GET' && !response.url().includes('-details'), {
        timeout: 60_000,
      })
      .then(async (response) => ({ url: response.url(), status: response.status(), body: await response.json() }));
  }

  private async expectChoices(opener: Locator): Promise<void> {
    await opener.click();
    for (const label of ['Daily', 'Weekly'] as const) {
      await expect(this.periodChoice(label), label).toBeVisible();
    }
    await expect(this.periodChoice('Hourly')).toHaveCount(0);
  }

  private async choose(opener: Locator, label: 'Daily' | 'Weekly'): Promise<void> {
    if ((await opener.getAttribute('aria-expanded')) !== 'true') {
      await opener.click();
    }
    await this.periodChoice(label).click();
    await expect(opener).toContainText(label);
  }

  private periodChoice(label: 'Hourly' | 'Daily' | 'Weekly'): Locator {
    return this.page
      .getByRole('menuitem', { name: label, exact: true })
      .or(this.page.getByRole('option', { name: label, exact: true }))
      .or(this.page.getByRole('button', { name: label, exact: true }))
      .last();
  }

  private async selectMonth(ym: string): Promise<void> {
    const [year, month] = ym.split('-').map(Number);
    const grid = await openMonthGrid(this.page, this.monthButton());
    await pickMonth(grid, year, month - 1);
  }



  async expectCards(summaryBody: unknown, period: DtrPeriod): Promise<void> {
    await expectCards(this.widgetHost(), summaryBody, period);
  }

  async expectCardDrillDowns(summaryBody: unknown, periodLabel: string, monthText: string): Promise<void> {
    await expectCardDrillDowns(this.widgetHost(), summaryBody, periodLabel, monthText);
  }

  async expectPower(powerBody: unknown, period: DtrPeriod): Promise<void> {
    await expectPower(this.widgetHost(), powerBody, period);
  }

  async expectPowerDrillDown(powerBody: unknown, period: DtrPeriod, monthYear: string | null, periodLabel: string, monthText: string): Promise<void> {
    await expectPowerDrillDown(this.widgetHost(), powerBody, period, monthYear, periodLabel, monthText);
  }

  async expectCommunication(body: unknown): Promise<void> {
    await expectCommunication(this.widgetHost(), body);
  }

  async expectCommunicationDrillDown(periodLabel: string, monthText: string, monthYear: string | null): Promise<void> {
    await expectCommunicationDrillDown(this.widgetHost(), periodLabel, monthText, monthYear);
  }

  async expectPercentageLoading(body: unknown): Promise<void> {
    await expectPercentageLoading(this.widgetHost(), body);
  }

  async expectPercentageDrillDowns(body: unknown, periodLabel: string, monthText: string, monthYear: string | null): Promise<void> {
    await expectPercentageDrillDowns(this.widgetHost(), body, periodLabel, monthText, monthYear);
  }

  async expectConsumption(body: unknown, period: DtrPeriod, monthLabel: string): Promise<void> {
    await expectConsumption(this.widgetHost(), body, period, monthLabel);
  }

  async expectConsumptionDrillDown(body: unknown, periodLabel: string, monthText: string, monthYear: string | null): Promise<void> {
    await expectConsumptionDrillDown(this.widgetHost(), body, periodLabel, monthText, monthYear);
  }

  async expectLoadUnbalance(body: unknown, monthYear: string | null): Promise<void> {
    await expectLoadUnbalance(this.widgetHost(), body, monthYear);
  }

  async expectSeverityDrillDowns(
    title: 'Load Unbalance' | 'Voltage Unbalance',
    pathname: string,
    details: string,
    breadcrumb: string,
    periodLabel: string,
    monthText: string,
    monthYear: string | null,
  ): Promise<void> {
    await expectSeverityDrillDowns(this.widgetHost(), title, pathname, details, breadcrumb, periodLabel, monthText, monthYear);
  }

  async expectVoltageUnbalance(body: unknown): Promise<void> {
    await expectVoltageUnbalance(this.widgetHost(), body);
  }

  async expectDownloads(): Promise<void> {
    await expectDownloads(this.widgetHost());
  }

  async expectFailedWidgetKeepsOthers(failedTitle: string, planted: number): Promise<void> {
    await expectFailedWidgetKeepsOthers(this.widgetHost(), failedTitle, planted);
  }

  private widgetHost(): DtrWidgetHost {
    return {
      page: this.page,
      main: () => this.main(),
      card: (name) => this.card(name),
      widget: (title) => this.widget(title),
      donut: (title) => this.donut(title),
      note: (id, message) => this.note(id, message),
      periodButton: () => this.powerPeriod(),
      energyPeriodButton: () => this.energyPeriod(),
      monthButton: () => this.monthButton(),
      heading: () => this.heading(),
      sectionTab: () => this.sectionTab(),
      route: (name) => this.route(name),
    };
  }
}

function pointLabels(body: unknown): string[] {
  const data = unwrap(body);
  const points = data && typeof data === 'object' && Array.isArray((data as { points?: unknown }).points) ? (data as { points: Array<{ label?: unknown }> }).points : [];
  return points.map((point) => String(point.label ?? ''));
}
