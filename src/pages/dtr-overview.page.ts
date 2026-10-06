import { expect, Locator } from '@playwright/test';
import { ChartComponent } from '../core/components/chart.component';
import { expectFutureMonthsDisabled, kolkataCalendar, openMonthGrid, pickMonth, previousMonth } from '../core/components/month-grid';
import { DonutComponent, type DonutReading } from '../core/components/donut.component';
import { isRecord } from '../core/utils/guards';
import { BasePage } from './base.page';

export type DtrPeriod = 'hourly' | 'daily' | 'weekly';

const PERIOD_LABEL: Record<DtrPeriod, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
};
const COMPARE_LABEL: Record<DtrPeriod, string> = {
  hourly: 'vs Last Hour',
  daily: 'vs Yesterday',
  weekly: 'vs Last Week',
};
const SERIES_WINDOW: Record<DtrPeriod, number> = { hourly: 12, daily: 12, weekly: 8 };
const COMMUNICATION_WINDOW: Record<DtrPeriod, number> = { hourly: 6, daily: 6, weekly: 4 };

const CARDS = ['Total DTRs', 'DTRs ON', 'DTRs OFF', 'Active Alerts'] as const;
const WIDGETS = [
  'Power Status',
  'Communication Status',
  'Percentage Loading',
  'Energy Consumption',
  'Load Unbalance',
  'Voltage Unbalance',
] as const;

const DOWNLOADS: ReadonlyArray<{ title: string; prefix: string }> = [
  { title: 'Power Status', prefix: 'dtr-power-status' },
  { title: 'Communication Status', prefix: 'dtr-communication-status' },
  { title: 'Percentage Loading', prefix: 'dtr-percentage-loading' },
  { title: 'Energy Consumption', prefix: 'dtr-energy-consumption' },
  { title: 'Load Unbalance', prefix: 'dtr-load-unbalance' },
  { title: 'Voltage Unbalance', prefix: 'dtr-voltage-unbalance' },
];

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
    return this.main().getByRole('button', { name: 'Power Status period', exact: true });
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
    await expect(this.sectionTab()).toHaveAttribute('aria-selected', 'true');
    const period = this.periodButton();
    const month = this.monthButton();
    const periodName = await period.getAttribute('aria-label');
    if (periodName !== 'DTR overview period') {
      console.log(`ISSUE DO-001: the period button accessible name is "${periodName}". The spec requires "DTR overview period".`);
    }
    await expect.soft(period, 'DO-001 period name').toHaveAccessibleName('DTR overview period');
    await expect(period).toContainText('Daily');
    await expect(month).toHaveAccessibleName('DTR dashboard month and year');
    await expect(month).toContainText(kolkataMonth().label);
    await expect(month.getByRole('button', { name: /clear/i })).toHaveCount(0);

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
    expectPeriod(snapshot.summary.url, 'daily', false);
    expectPeriod(snapshot.power.url, 'daily', false);
    expectPeriod(snapshot.consumption.url, 'daily', false);
    expectNoPeriodOrMonth(snapshot.communication.url);
    expectNoPeriodOrMonth(snapshot.percentage.url);
    expect(new URL(snapshot.load.url).searchParams.get('period'), 'load period').toBeNull();
    expect(new URL(snapshot.load.url).searchParams.has('monthYear'), 'load monthYear').toBe(false);
    expect(new URL(snapshot.voltage.url).searchParams.get('period'), 'voltage period').toBeNull();
    expect(new URL(snapshot.voltage.url).searchParams.has('monthYear'), 'voltage monthYear').toBe(false);
  }

  async expectPeriodChoices(): Promise<void> {
    await this.periodButton().click();
    if ((await this.periodChoice('Hourly').count()) === 0) {
      console.log('ISSUE DO-003: Hourly is not in the period menu. The app offers Daily and Weekly only.');
    }
    for (const label of ['Hourly', 'Daily', 'Weekly'] as const) {
      await expect(this.periodChoice(label), label).toBeVisible();
    }
    await expect(this.page.getByText('Monthly', { exact: true })).toHaveCount(0);
    await expect(this.page.getByText('Yearly', { exact: true })).toHaveCount(0);
    await this.choosePeriod('Hourly');
    await expect(this.periodButton()).toContainText('Hourly');
    await this.choosePeriod('Weekly');
    await expect(this.periodButton()).toContainText('Weekly');
    await this.choosePeriod('Daily');
  }

  async expectMonthBounds(): Promise<void> {
    const current = kolkataCalendar();
    await expect(this.monthButton(), 'present month').toContainText(current.label);
    const grid = await openMonthGrid(this.page, this.monthButton());
    await expectFutureMonthsDisabled(grid, current);
    await this.page.keyboard.press('Escape');
  }

  async expectPastMonth(): Promise<void> {
    const requests = this.captureMonthScoped();
    await this.selectMonth('2025-06');
    const snapshot = await requests;
    expectMonthYear(snapshot.summary.url, '2025-06');
    expectMonthYear(snapshot.power.url, '2025-06');
    expectMonthYear(snapshot.consumption.url, '2025-06');
    expectMonthYear(snapshot.load.url, '2025-06');
    expectMonthYear(snapshot.voltage.url, '2025-06');
    await this.expectStaysCurrent('Communication Status');
    await this.expectStaysCurrent('Percentage Loading');
    for (const title of ['Power Status', 'Energy Consumption', 'Load Unbalance', 'Voltage Unbalance']) {
      await expect(this.widget(title)).toContainText('June 2025');
    }
    const current = this.captureMonthScoped();
    await this.selectMonth(kolkataMonth().ym);
    const restored = await current;
    expect(new URL(restored.summary.url).searchParams.has('monthYear'), 'current summary monthYear').toBe(false);
    expect(new URL(restored.power.url).searchParams.has('monthYear'), 'current power monthYear').toBe(false);
    expect(new URL(restored.consumption.url).searchParams.has('monthYear'), 'current consumption monthYear').toBe(false);
  }

  /**
   * After a past month is selected, each widget click opens its detail page.
   * Power, Load Unbalance, and Voltage Unbalance detail totals equal the clicked count.
   * Communication and Percentage Loading stay on Current, and their detail totals still equal the donut.
   * Energy opens the detail for that series; its detail total is shown on the page and is not the kWh bar.
   */
  async expectPastMonthClicks(percentageBody: unknown): Promise<void> {
    const past = previousMonth(kolkataCalendar());
    const requests = this.captureMonthScoped();
    await this.selectMonth(past.ym);
    const snapshot = await requests;
    expectMonthYear(snapshot.power.url, past.ym);
    expectMonthYear(snapshot.consumption.url, past.ym);
    expectMonthYear(snapshot.load.url, past.ym);
    expectMonthYear(snapshot.voltage.url, past.ym);
    await expect(this.monthButton()).toContainText(past.label);
    await this.expectStaysCurrent('Communication Status');
    await this.expectStaysCurrent('Percentage Loading');

    await this.expectPowerDrillDown(snapshot.power.body, 'daily', past.ym, 'Daily', past.label);
    await this.expectCommunicationDrillDown('Daily', past.label);
    await this.expectPercentageDrillDowns(percentageBody, 'Daily', past.label);
    await this.expectConsumption(snapshot.consumption.body, 'daily', past.label);
    await this.expectConsumptionDrillDown(snapshot.consumption.body, 'Daily', past.label, past.ym);
    await this.expectSeverityDrillDowns(
      'Load Unbalance',
      '/dtr/dashboard/load-unbalance',
      '/dashboard/dtr/load-unbalance-details',
      'Load Unbalance',
      'Daily',
      past.label,
      past.ym,
    );
    await this.expectSeverityDrillDowns(
      'Voltage Unbalance',
      '/dtr/dashboard/voltage-unbalance',
      '/dashboard/dtr/voltage-unbalance-details',
      'Voltage Unbalance',
      'Daily',
      past.label,
      past.ym,
    );
  }

  async expectCards(summaryBody: unknown, period: DtrPeriod): Promise<void> {
    const data = asRecord(unwrap(summaryBody), 'summary');
    const coverage = coverageOf(data);
    if (coverage === 'partial' || coverage === 'complete') {
      this.note('DO-088', `summary coverage is ${coverage} and the cards are asserted as numbers`);
    }
    if (coverage === 'unavailable') {
      await this.expectUnavailableCards();
      this.note('DO-016', 'live summary coverage is unavailable');
      return;
    }

    const metrics = readCardMetrics(data);
    for (const metric of metrics) {
      const shown = await this.cardValue(metric.name);
      if (shown === null) {
        throw new Error(`${metric.name} shows an em dash for a successful count`);
      }
      expect(shown, metric.name).toBe(metric.count);
      await this.expectFooter(metric.name, metric.series, period);
    }
    this.note('DO-017', 'ON plus OFF is not compared with Total DTRs');
    if (!metrics.some((metric) => metric.raw < 0)) {
      this.note('DO-018', 'no negative card count was in the live summary');
      this.note('DO-094', 'API count -3 was not in the live summary');
    }
    if (!metrics.some((metric) => metric.series.length === 0)) {
      this.note('DO-090', 'no card trend had length 0');
    }
    if (!metrics.some((metric) => metric.series.length === 1)) {
      this.note('DO-015', 'no card trend had a single finite value');
    }
  }

  async expectCardDrillDowns(summaryBody: unknown, periodLabel: string, monthText: string): Promise<void> {
    const data = asRecord(unwrap(summaryBody), 'summary');
    if (coverageOf(data) === 'unavailable') {
      this.note('DO-016', 'ON and OFF clicks are not asserted while coverage is unavailable');
      return;
    }
    const metrics = readCardMetrics(data);
    const clicks: Array<{ name: string; count: number; ids: number[] | null; metric: string | null; rawIds: unknown }> = [
      { name: 'Total DTRs', count: metricByName(metrics, 'Total DTRs').count, ids: null, metric: null, rawIds: undefined },
      { name: 'DTRs ON', count: metricByName(metrics, 'DTRs ON').count, ids: null, metric: 'DTRs ON', rawIds: undefined },
      {
        name: 'DTRs OFF',
        count: metricByName(metrics, 'DTRs OFF').count,
        ids: positiveIds(lookupIds(data, 'dtrsOff')),
        metric: null,
        rawIds: lookupIds(data, 'dtrsOff'),
      },
      {
        name: 'Active Alerts',
        count: metricByName(metrics, 'Active Alerts').count,
        ids: positiveIds(lookupIds(data, 'activeAlerts')),
        metric: null,
        rawIds: lookupIds(data, 'activeAlerts'),
      },
    ];

    for (const click of clicks) {
      const listResponse = this.page.waitForResponse(
        (response) => response.url().includes('/master-data/dtr-master-data') && response.ok(),
        { timeout: 60_000 },
      );
      await this.card(click.name).click();
      const url = new URL(this.page.url());
      expect(url.pathname, click.name).toMatch(/\/master-data\/dtrs$/);
      if (click.metric) {
        if (url.searchParams.get('metric') !== click.metric) {
          console.log(`ISSUE DO-011: ${click.name} opened ${url.pathname}${url.search}. The spec requires metric=${click.metric}.`);
        }
        expect(url.searchParams.get('metric'), click.name).toBe(click.metric);
        expect(url.searchParams.has('selectedIds'), click.name).toBe(false);
      } else if (click.ids) {
        expect(url.searchParams.get('selectedIds'), click.name).toBe(click.ids.join(','));
        droppedIds(click.rawIds, this);
      } else {
        expect(url.searchParams.has('selectedIds'), click.name).toBe(false);
        expect(url.searchParams.has('metric'), click.name).toBe(false);
      }
      expect(listTotal(await (await listResponse).json()), `${click.name} list`).toBe(click.count);
      await this.returnToOverview(periodLabel, monthText);
    }
    if (!Array.isArray(lookupIds(data, 'dtrsOff')) || (lookupIds(data, 'dtrsOff') as unknown[]).length > 0) {
      this.note('DO-096', 'DTRs OFF meterLookupIds was not an empty list');
    }
    this.note('DO-109', `period after card drill-down is still ${periodLabel}`);
    this.note('DO-110', `month after card drill-down is still ${monthText}`);
  }

  async expectPower(powerBody: unknown, period: DtrPeriod): Promise<void> {
    const data = asRecord(unwrap(powerBody), 'power');
    if (coverageOf(data) === 'unavailable' || (await this.widget('Power Status').getByTestId('dtr-power-status-data-unavailable').count()) > 0) {
      await expect(this.widget('Power Status').getByTestId('dtr-power-status-data-unavailable')).toBeVisible();
      await expect(this.widget('Power Status').getByText('Data unavailable for selected period')).toBeVisible();
      await expect(this.widget('Power Status').getByRole('button', { name: 'Download' })).toHaveCount(0);
      this.note('DO-024', 'power coverage is unavailable');
      return;
    }
    const widget = this.widget('Power Status');
    await expect(widget).toContainText('Power Status');
    await expect(widget).toContainText('ON and OFF status for');
    const points = visiblePoints(pointList(data), SERIES_WINDOW[period]);
    await widget.locator('g.apexcharts-series').first().waitFor({ state: 'attached' });
    const series = await new ChartComponent(this.page, widget).getSeries();
    const labels = points.map((point) => point.label);
    expect(series.find((item) => item.name === 'DTR On')?.points.map((point) => point.x), 'power categories').toEqual(labels);
    const gap = series.find((item) => item.name !== 'DTR On' && item.name !== 'DTR Off');
    for (const point of points) {
      const on = seriesValue(series, 'DTR On', point.label);
      const off = seriesValue(series, 'DTR Off', point.label);
      expect(on, `${point.label} on`).toBeCloseTo(point.onPercentage, 1);
      expect(Math.abs(off), `${point.label} off`).toBeCloseTo(Math.abs(point.offPercentage), 1);
      expect(off, `${point.label} off direction`).toBeLessThanOrEqual(0);
    }
    if (!gap) {
      this.note('DO-102', 'no gap series was present on Power Status');
    } else {
      await expect(widget.getByRole('button', { name: gap.name, exact: true })).toHaveCount(0);
    }
    if (!points.some((point) => point.onPercentage === 0 || point.offPercentage === 0)) {
      this.note('DO-023', 'no power point had a 0 percent');
    }
    if (!points.some((point) => point.label.includes('June'))) {
      this.note('DO-100', 'no power point was labeled June');
    }
    if (!points.some((point) => /Sept/.test(point.label))) {
      this.note('DO-101', 'no power point was labeled Sept');
    }
  }

  async expectPowerDrillDown(powerBody: unknown, period: DtrPeriod, monthYear: string | null, periodLabel: string, monthText: string): Promise<void> {
    const data = asRecord(unwrap(powerBody), 'power');
    if (coverageOf(data) === 'unavailable') {
      return;
    }
    const point = visiblePoints(pointList(data), SERIES_WINDOW[period]).find((item) => item.onPercentage !== 0) ?? null;
    if (!point) {
      this.note('DO-021', 'no non-zero DTR On point was available to open');
      return;
    }
    const onBody = await this.openChartPoint('Power Status', 'DTR On', point.label, '/dashboard/dtr/power-status-details');
    expect(detailsTotal(onBody), 'DTR On details').toBe(point.dtrsOn);
    await this.expectDetailShowsCount(point.dtrsOn, 'DTR On');
    const url = new URL(this.page.url());
    expect(url.pathname).toMatch(/\/dtr\/dashboard\/power-status$/);
    expect(url.searchParams.get('status')).toBe('on');
    expect(url.searchParams.get('period')).toBe(period);
    expect(url.searchParams.get('bucket')).toBe(toBucket(point.label));
    expect(url.searchParams.get('monthYear')).toBe(monthYear);
    await this.expectDetailHeading('Power Status');
    await this.returnToOverview(periodLabel, monthText);

    if (point.offPercentage === 0) {
      this.note('DO-022', `${point.label} DTR Off is 0, so that click is not a details navigation`);
      return;
    }
    const offBody = await this.openChartPoint('Power Status', 'DTR Off', point.label, '/dashboard/dtr/power-status-details');
    expect(detailsTotal(offBody), 'DTR Off details').toBe(point.dtrsOff);
    await this.expectDetailShowsCount(point.dtrsOff, 'DTR Off');
    const offUrl = new URL(this.page.url());
    expect(offUrl.searchParams.get('status')).toBe('off');
    expect(offUrl.searchParams.get('bucket')).toBe(toBucket(point.label));
    await this.returnToOverview(periodLabel, monthText);
  }

  async expectCommunication(body: unknown): Promise<void> {
    const data = unwrap(body);
    const record = isRecord(data) ? data : {};
    const slices = communicationSlices(record);
    const reading = await this.donut('Communication Status').read();
    expect(reading.centerLabel).toBe('Total Meters');
    await expect(this.widget('Communication Status')).toContainText('Current status of active Meters');
    const center = (slices.communicating ?? 0) + (slices.nonCommunicating ?? 0);
    expect(reading.total, 'communication center').toBe(center);
    expectSlice(reading, 'Communicating', slices.communicating ?? 0, center);
    expectSlice(reading, 'Non-Communicating', slices.nonCommunicating ?? 0, center);
    if (!reading.slices.some((slice) => !/communicat/i.test(slice.label))) {
      this.note('DO-033', 'no unknown communication label was on the donut');
    }
    if (!reading.slices.some((slice) => slice.label.toLowerCase() === 'comm')) {
      this.note('DO-103', 'no communication slice was named comm');
    }
  }

  async expectCommunicationDrillDown(periodLabel: string, monthText: string): Promise<void> {
    const reading = await this.donut('Communication Status').read();
    await this.openDonutSlice({
      title: 'Communication Status',
      label: 'Communicating',
      count: countOf(reading, 'Communicating'),
      pathname: '/dtr/dashboard/communication',
      query: 'status',
      value: 'communicated',
      details: '/dashboard/dtr/communication-details',
      breadcrumb: 'Communication',
      periodLabel,
      monthText,
      monthYear: null,
    });
    await this.openDonutSlice({
      title: 'Communication Status',
      label: 'Non-Communicating',
      count: countOf(reading, 'Non-Communicating'),
      pathname: '/dtr/dashboard/communication',
      query: 'status',
      value: 'non-communicated',
      details: '/dashboard/dtr/communication-details',
      breadcrumb: 'Communication',
      periodLabel,
      monthText,
      monthYear: null,
    });
  }

  async expectPercentageLoading(body: unknown): Promise<void> {
    await this.expectBandDonut(body, {
      title: 'Percentage Loading',
      subtitle: 'Transformer utilization distribution',
      emptyDescription: 'Percentage loading breakdown is not available from the API yet',
      rename: renameLoading,
      expectedLength: 4,
      shortId: 'DO-104',
      longId: 'DO-104',
    });
  }

  async expectPercentageDrillDowns(body: unknown, periodLabel: string, monthText: string): Promise<void> {
    const items = bandItems(unwrap(body));
    if (items.length === 0 || items.reduce((sum, item) => sum + item.value, 0) === 0) {
      this.note('DO-045', 'percentage loading has no positive breakdown to open');
      return;
    }
    const renamed = items.length === 4;
    for (const item of items) {
      const label = renamed ? renameLoading(item.label).label : item.label;
      const band = renamed ? renameLoading(item.label).band : 'critical';
      await this.openDonutSlice({
        title: 'Percentage Loading',
        label,
        count: item.value,
        pathname: '/dtr/dashboard/percentage-loading',
        query: 'band',
        value: band,
        details: '/dashboard/dtr/percentage-loading-details',
        breadcrumb: 'Percentage Loading',
        periodLabel,
        monthText,
        monthYear: null,
      });
    }
  }

  async expectConsumption(body: unknown, period: DtrPeriod, monthLabel: string): Promise<void> {
    const data = asRecord(unwrap(body), 'consumption');
    if (coverageOf(data) === 'unavailable' || (await this.widget('Energy Consumption').getByTestId('dtr-consumption-data-unavailable').count()) > 0) {
      await expect(this.widget('Energy Consumption').getByTestId('dtr-consumption-data-unavailable')).toContainText('Data unavailable for selected period');
      await expect(this.widget('Energy Consumption').getByRole('button', { name: 'Download' })).toHaveCount(0);
      this.note('DO-054', 'consumption coverage is unavailable');
      return;
    }
    const widget = this.widget('Energy Consumption');
    await expect(widget).toContainText('Energy Consumption');
    await expect(widget).toContainText('Energy usage');
    await expect(widget).toContainText(PERIOD_LABEL[period]);
    const widgetText = await widget.innerText();
    if (!widgetText.includes(monthLabel)) {
      console.log(`ISSUE DO-050: Energy Consumption does not include "${monthLabel}". The subtitle uses a date range, for example "24 Sep–5 Oct 2026", instead of the month name.`);
    }
    await expect(widget).toContainText(monthLabel);
    const points = visiblePoints(consumptionPoints(data), SERIES_WINDOW[period]);
    const series = await new ChartComponent(this.page, widget).getSeries();
    for (const name of ['kWh', 'kVAh', 'kVARh'] as const) {
      const field = name === 'kWh' ? 'kwh' : name === 'kVAh' ? 'kvah' : 'kvarh';
      expect(series.find((item) => item.name === name)?.points.map((point) => point.x), name).toEqual(points.map((point) => point.label));
      for (const point of points) {
        expect(seriesValue(series, name, point.label), `${name} ${point.label}`).toBeCloseTo(point[field], 1);
      }
    }
    if (!points.every((point) => point.kwh === 0 && point.kvah === 0 && point.kvarh === 0)) {
      this.note('DO-108', 'consumption is not all zeros, so the disabled download is not asserted');
    }
    if (!series.some((item) => !/^(kWh|kVAh|kVARh)$/.test(item.name))) {
      this.note('DO-053', 'every consumption series name is kWh, kVAh, or kVARh');
    }
  }

  async expectConsumptionDrillDown(body: unknown, periodLabel: string, monthText: string, monthYear: string | null): Promise<void> {
    const data = asRecord(unwrap(body), 'consumption');
    if (coverageOf(data) === 'unavailable') {
      return;
    }
    const point = visiblePoints(consumptionPoints(data), SERIES_WINDOW.daily)[0];
    if (!point) {
      this.note('DO-051', 'consumption returned no point to open');
      return;
    }
    const kinds = [
      ['kWh', 'kwh'],
      ['kVAh', 'kvah'],
      ['kVARh', 'kvarh'],
    ] as const;
    for (const [seriesName, kind] of kinds) {
      const detailsBody = await this.openChartPoint('Energy Consumption', seriesName, point.label, '/dashboard/dtr/consumption-details');
      const total = detailsTotal(detailsBody);
      await this.expectDetailShowsCount(total, seriesName);
      const url = new URL(this.page.url());
      expect(url.pathname).toMatch(/\/dtr\/dashboard\/consumption$/);
      expect(url.searchParams.get('kind')).toBe(kind);
      expect(url.searchParams.get('monthYear')).toBe(monthYear);
      await this.expectDetailHeading('Consumption');
      await this.returnToOverview(periodLabel, monthText);
    }
  }

  async expectLoadUnbalance(body: unknown, monthYear: string | null): Promise<void> {
    await this.expectSeverityDonut(body, 'Load Unbalance', 'Phase load imbalance distribution across DTRs', 'dtr-load-unbalance-data-unavailable', 'Load unbalance breakdown is not available from the API yet');
    expect(new URL(this.page.url()).searchParams.get('monthYear'), 'still on overview').toBeNull();
    if (monthYear) {
      this.note('DO-061', `load unbalance monthYear ${monthYear} is asserted on the details URL`);
    }
  }

  private async expectDetailHeading(breadcrumb: string): Promise<void> {
    const title = this.main().locator('.theme-text-page-title');
    if ((await title.count()) > 0) {
      const shown = (await title.first().innerText()).trim();
      if (shown !== 'DTR Overview Details') {
        console.log(`ISSUE detail page: the title is "${shown}". The spec requires "DTR Overview Details" and breadcrumb "${breadcrumb}".`);
      }
    }
    await expect(this.main().getByText('DTR Overview Details', { exact: true })).toBeVisible();
    await expect(this.main().getByText(breadcrumb, { exact: true })).toBeVisible();
  }

  private async expectStaysCurrent(title: 'Communication Status' | 'Percentage Loading'): Promise<void> {
    const widget = this.widget(title);
    const text = await widget.innerText();
    if (/data unavailable/i.test(text)) {
      console.log(`ISSUE DO-034: ${title} has no Current badge because the widget is showing the empty state.`);
      return;
    }
    if (!/\bCurrent\b/.test(text)) {
      console.log(`ISSUE DO-034: ${title} does not say Current after a past month is selected. Widget text starts: ${text.slice(0, 180)}`);
    }
    await expect(widget).toContainText(/Current/);
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
    const slices = this.donut(title).root.getByRole('button', { name: /^Open .+ details$/ });
    if ((await slices.count()) === 0) {
      console.log(`ISSUE ${title}: there are no "Open … details" buttons. The widget is Data unavailable, so a drill-down cannot be opened.`);
      return;
    }
    const reading = await this.donut(title).read();
    for (const slice of reading.slices) {
      const severity = severityOf(slice.label);
      await this.openDonutSlice({
        title,
        label: slice.label,
        count: slice.count ?? 0,
        pathname,
        query: 'severity',
        value: severity,
        details,
        breadcrumb,
        periodLabel,
        monthText,
        monthYear,
      });
    }
  }

  async expectVoltageUnbalance(body: unknown): Promise<void> {
    await this.expectSeverityDonut(body, 'Voltage Unbalance', 'Phase voltage imbalance distribution across DTRs', 'dtr-voltage-unbalance-data-unavailable', 'Voltage unbalance breakdown is not available from the API yet');
  }

  async expectDownloads(): Promise<void> {
    for (const item of DOWNLOADS) {
      const widget = this.widget(item.title);
      const download = widget.getByRole('button', { name: /download/i });
      await expect(widget.getByRole('searchbox')).toHaveCount(0);
      await expect(widget.getByRole('button', { name: /filter/i })).toHaveCount(0);
      if (/data unavailable/i.test(await widget.innerText())) {
        console.log(`ISSUE DO-006: ${item.title} has no Download button because that widget has no data.`);
        await expect(download, `${item.title} download absent`).toHaveCount(0);
        continue;
      }
      await expect(download, `${item.title} download`).toHaveCount(1);
      if (!(await download.isEnabled())) {
        console.log(`ISSUE DO-006: ${item.title} Download is disabled. Button title: "${await download.getAttribute('title')}".`);
      }
      await expect(download, `${item.title} download enabled`).toBeEnabled();
      const file = this.page.waitForEvent('download');
      await download.click();
      const saved = await file;
      const filename = saved.suggestedFilename();
      if (!filename.includes(item.prefix)) {
        console.log(`ISSUE DO-006: ${item.title} downloaded "${filename}". The spec prefix is "${item.prefix}". The match ignores letter case.`);
      }
      expect(filename.toLowerCase(), item.title).toContain(item.prefix.toLowerCase());
      await expect(this.page).toHaveURL(/\/dtr\/dashboard$/);
      if (item.title === 'Power Status') {
        const path = await saved.path();
        if (path) {
          const { readFileSync } = await import('node:fs');
          const contents = readFileSync(path).toString('utf8');
          if (contents.includes('DTR On')) {
            expect(contents).toContain('DTR Off');
            expect(contents.toLowerCase()).not.toContain('gap');
          } else {
            this.note('DO-006', 'Power Status download was not plain text, so the On/Off columns were not read');
          }
        }
      }
    }
  }

  async expectFailedWidgetKeepsOthers(failedTitle: string, planted: number): Promise<void> {
    await expect(this.widget(failedTitle)).not.toContainText(String(planted));
    for (const title of WIDGETS) {
      if (title === failedTitle) {
        continue;
      }
      await expect(this.widget(title).getByText(title, { exact: true })).toBeVisible();
    }
  }

  private captureMonthScoped(): Promise<Pick<DtrSnapshot, 'summary' | 'power' | 'consumption' | 'load' | 'voltage'>> {
    return Promise.all([
      this.waitFor('/dashboard/dtr/summary'),
      this.waitFor('/dashboard/dtr/power-status'),
      this.waitFor('/dashboard/dtr/consumption'),
      this.waitFor('/dashboard/dtr/load-unbalance'),
      this.waitFor('/dashboard/dtr/voltage-unbalance'),
    ]).then(([summary, power, consumption, load, voltage]) => ({ summary, power, consumption, load, voltage }));
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

  private async choosePeriod(label: 'Hourly' | 'Daily' | 'Weekly'): Promise<void> {
    const period = label.toLowerCase() as DtrPeriod;
    const pending = Promise.all([
      this.waitFor('/dashboard/dtr/summary'),
      this.waitFor('/dashboard/dtr/power-status'),
      this.waitFor('/dashboard/dtr/consumption'),
    ]);
    let communicationSeen = false;
    let percentageSeen = false;
    const onRequest = (request: { url(): string }): void => {
      if (request.url().includes('/dashboard/dtr/communication-status')) {
        communicationSeen = true;
      }
      if (request.url().includes('/dashboard/dtr/percentage-loading')) {
        percentageSeen = true;
      }
    };
    this.page.on('request', onRequest);
    const choice = this.periodChoice(label);
    if (!(await this.periodButton().getAttribute('aria-expanded'))) {
      await this.periodButton().click();
    }
    await choice.click();
    const [summary, power, consumption] = await pending;
    const pastMonth = (await this.monthButton().innerText()).includes(kolkataMonth().label) ? false : true;
    expectPeriod(summary.url, period, pastMonth);
    expectPeriod(power.url, period, pastMonth);
    expectPeriod(consumption.url, period, pastMonth);
    await this.page.waitForTimeout(500);
    this.page.off('request', onRequest);
    expect(communicationSeen, 'communication refetched').toBe(false);
    expect(percentageSeen, 'percentage refetched').toBe(false);
    await expect(this.periodChoice('Hourly')).toBeHidden();
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

  private async cardValue(name: string): Promise<number | null> {
    const text = (await this.card(name).innerText()).replace(/,/g, '');
    if (text.includes('—') || text.includes('–')) {
      return null;
    }
    const match = text.match(/\d+/);
    if (!match) {
      throw new Error(`No count on ${name}: ${text}`);
    }
    return Number(match[0]);
  }

  private async expectFooter(name: string, series: number[], period: DtrPeriod): Promise<void> {
    const text = (await this.card(name).innerText()).replace(/\s+/g, ' ');
    const finite = series.filter((value) => Number.isFinite(value));
    if (finite.length < 2) {
      expect(text, `${name} footer`).not.toContain(COMPARE_LABEL[period]);
      return;
    }
    const delta = roundHalfAway(finite[finite.length - 1] - finite[finite.length - 2]);
    const compare = COMPARE_LABEL[period];
    if (delta === 0) {
      expect(text, `${name} zero delta`).toContain(`No Change ${compare}`);
      expect(text, `${name} zero pill`).not.toMatch(/\+\s*0\b|\b-\s*0\b/);
      return;
    }
    if (delta > 0) {
      expect(text, `${name} increase`).toContain('Increase by');
      expect(text).toContain(`+${delta}`);
      expect(text).toContain(compare);
      return;
    }
    expect(text, `${name} decrease`).toContain('Decrease by');
    expect(text).toContain(String(delta));
    expect(text).toContain(compare);
    if (delta === -2) {
      this.note('DO-093', `${name} rounded a negative delta to -2`);
    }
    if (delta === 1) {
      this.note('DO-092', `${name} rounded a positive delta to +1`);
    }
  }

  private async expectDetailShowsCount(count: number, label: string): Promise<void> {
    const text = (await this.main().innerText()).replace(/,/g, '');
    expect(text, `${label} detail page`).toMatch(new RegExp(`(^|\\D)${count}(\\D|$)`));
  }

  private async expectUnavailableCards(): Promise<void> {
    for (const name of ['DTRs ON', 'DTRs OFF']) {
      await expect(this.card(name)).toContainText('—');
      await expect(this.card(name)).toContainText('Data unavailable for selected period');
    }
  }

  private async openDonutSlice(args: {
    title: string;
    label: string;
    count: number;
    pathname: string;
    query: string;
    value: string;
    details: string;
    breadcrumb: string;
    periodLabel: string;
    monthText: string;
    monthYear: string | null;
  }): Promise<void> {
    const details = this.page.waitForResponse(
      (response) => response.url().includes(args.details) && response.ok(),
      { timeout: 60_000 },
    );
    await this.donut(args.title).openSlice(args.label);
    const url = new URL(this.page.url());
    expect(url.pathname, args.label).toBe(args.pathname);
    expect(url.searchParams.get(args.query), args.label).toBe(args.value);
    expect(url.searchParams.get('monthYear'), args.label).toBe(args.monthYear);
    const total = detailsTotal(await (await details).json());
    if (args.details.includes('consumption-details')) {
      await this.expectDetailShowsCount(total, args.label);
    } else {
      expect(total, args.label).toBe(args.count);
      await this.expectDetailShowsCount(args.count, args.label);
    }
    await this.expectDetailHeading(args.breadcrumb);
    await this.returnToOverview(args.periodLabel, args.monthText);
  }

  private async openChartPoint(title: string, seriesName: string, category: string, detailsPath: string): Promise<unknown> {
    const details = this.page.waitForResponse(
      (response) => response.url().includes(detailsPath) && response.request().method() === 'GET',
      { timeout: 60_000 },
    );
    const widget = this.widget(title);
    await widget.scrollIntoViewIfNeeded();
    const point = await widget.evaluate(chartPointInPage, { seriesName, category });
    if (!point) {
      const labels = (await widget.locator('.apexcharts-xaxis-label title').allTextContents()).map((label) => label.trim()).filter(Boolean);
      console.log(`ISSUE ${title}: no bar for ${seriesName} "${category}". Chart labels: ${labels.join(', ') || 'none'}.`);
      throw new Error(`No chart point for ${seriesName} ${category} on ${title}`);
    }
    await this.page.mouse.click(point.x, point.y);
    return (await details).json();
  }

  private async returnToOverview(periodLabel: string, monthText: string): Promise<void> {
    const heading = this.heading();
    await this.page.goBack();
    try {
      await heading.waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      await this.page.goto(this.route('dtrDashboard'));
      await heading.waitFor({ state: 'visible', timeout: 20_000 });
    }
    await expect(this.sectionTab()).toHaveAttribute('aria-selected', 'true');
    await expect(this.periodButton()).toContainText(periodLabel);
    await expect(this.monthButton()).toContainText(monthText);
  }

  private async expectBandDonut(
    body: unknown,
    options: {
      title: string;
      subtitle: string;
      emptyDescription: string;
      rename: (label: string) => { label: string; band: string };
      expectedLength: number;
      shortId: string;
      longId: string;
    },
  ): Promise<void> {
    const data = unwrap(body);
    const items = bandItems(data);
    const widget = this.widget(options.title);
    if (items.length === 0 || items.reduce((sum, item) => sum + item.value, 0) === 0) {
      await expect(widget).toContainText(/data unavailable/i);
      await expect(widget).toContainText(new RegExp(options.emptyDescription.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      await expect(widget.getByRole('button', { name: 'Download' })).toHaveCount(0);
      return;
    }
    const reading = await this.donut(options.title).read();
    expect(reading.centerLabel).toBe('Analyzed meters');
    await expect(widget).toContainText(options.subtitle);
    const total = apiTotal(data);
    const sum = items.reduce((count, item) => count + item.value, 0);
    const center = total > 0 ? total : sum;
    expect(reading.total, options.title).toBe(center);
    if (total > 0) {
      this.note('DO-107', `${options.title} center uses the API total`);
    } else if (sum > 0) {
      this.note('DO-106', `${options.title} center uses the item sum`);
    }
    const renamed = items.length === options.expectedLength;
    if (!renamed && items.length === 1) {
      this.note(options.shortId, `${options.title} returned one item and keeps the raw label`);
    }
    if (!renamed && items.length > options.expectedLength) {
      this.note(options.longId, `${options.title} returned ${items.length} items and keeps raw labels`);
    }
    for (const item of items) {
      const label = renamed ? options.rename(item.label).label : item.label;
      expectSlice(reading, label, item.value, center);
    }
  }

  private async expectSeverityDonut(body: unknown, title: string, subtitle: string, testId: string, missing: string): Promise<void> {
    const data = unwrap(body);
    const record = isRecord(data) ? data : {};
    const widget = this.widget(title);
    if (coverageOf(record) === 'unavailable' || (await widget.getByTestId(testId).count()) > 0) {
      await expect(widget.getByTestId(testId)).toBeVisible();
      await expect(widget.getByRole('button', { name: 'Download' })).toHaveCount(0);
      if (coverageOf(record) === 'unavailable') {
        await expect(widget).toContainText('Data unavailable for selected period');
      } else {
        await expect(widget).toContainText(/data unavailable/i);
        await expect(widget).toContainText(new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      }
      return;
    }
    await this.expectBandDonut(body, {
      title,
      subtitle,
      emptyDescription: missing,
      rename: renameSeverity,
      expectedLength: 3,
      shortId: 'DO-105',
      longId: 'DO-105',
    });
  }
}

function chartPointInPage(root: Element, args: { seriesName: string; category: string }): { x: number; y: number } | null {
  const echarts = (window as unknown as { echarts?: { getInstanceByDom?: (el: Element) => { getOption(): { series?: Array<{ name?: string; data?: unknown[] }>; xAxis?: Array<{ data?: unknown[] }> }; getDom(): Element; convertToPixel(finder: { seriesIndex: number }, value: unknown[]): number[] } | undefined } }).echarts;
  if (echarts?.getInstanceByDom) {
    for (const host of [root, ...root.querySelectorAll('*')]) {
      const chart = echarts.getInstanceByDom(host);
      if (!chart) {
        continue;
      }
      const option = chart.getOption();
      const seriesIndex = (option.series ?? []).findIndex((series) => series.name === args.seriesName);
      const labels = (option.xAxis?.[0]?.data ?? []).map((label) => String(label));
      const dataIndex = labels.indexOf(args.category);
      if (seriesIndex < 0 || dataIndex < 0) {
        continue;
      }
      const raw = option.series?.[seriesIndex]?.data?.[dataIndex];
      const value = typeof raw === 'number' ? raw : Number((raw as { value?: number })?.value);
      const pixel = chart.convertToPixel({ seriesIndex }, [args.category, value]);
      const rect = chart.getDom().getBoundingClientRect();
      return { x: rect.left + pixel[0], y: rect.top + pixel[1] };
    }
  }

  const same = (left: string, right: string): boolean => left.replace(/\bSept\b/g, 'Sep').replace(/\s+/g, ' ').trim() === right.replace(/\bSept\b/g, 'Sep').replace(/\s+/g, ' ').trim();
  const labelNode = [...root.querySelectorAll('.apexcharts-xaxis-label title')].find((node) => same(node.textContent?.trim() ?? '', args.category));
  const labelRect = labelNode?.parentElement?.getBoundingClientRect();
  if (!labelRect || (labelRect.width === 0 && labelRect.height === 0)) {
    return null;
  }
  const targetX = labelRect.left + labelRect.width / 2;
  const group = [...root.querySelectorAll('g.apexcharts-series')].find((node) => node.getAttribute('seriesName') === args.seriesName);
  let best: DOMRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const bar of group ? [...group.querySelectorAll('path, rect')] : []) {
    const rect = bar.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }
    const distance = Math.abs(rect.left + rect.width / 2 - targetX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = rect;
    }
  }
  if (best && bestDistance < 40) {
    return { x: best.left + best.width / 2, y: best.top + Math.min(best.height / 2, 8) };
  }
  const plot = root.querySelector('.apexcharts-grid, .apexcharts-inner');
  const plotRect = plot?.getBoundingClientRect();
  if (!plotRect) {
    return null;
  }
  return { x: targetX, y: plotRect.top + plotRect.height * 0.25 };
}

export function kolkataMonth(): { ym: string; label: string } {
  const now = new Date();
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(now);
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' }).format(now);
  return { ym, label };
}

function unwrap(body: unknown): unknown {
  if (!isRecord(body) || body.success !== true || !('data' in body)) {
    const preview = JSON.stringify(body)?.slice(0, 300) ?? String(body);
    console.log(`ISSUE: dashboard response is not { success: true, data }. ${preview}`);
    throw new Error('Response did not unwrap { success: true, data }');
  }
  return body.data;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} data was not an object`);
  }
  return value;
}

function expectPeriod(url: string, period: DtrPeriod, monthYear: boolean): void {
  const params = new URL(url).searchParams;
  expect(params.get('period'), url).toBe(period);
  expect(params.has('monthYear'), url).toBe(monthYear);
}

function expectMonthYear(url: string, ym: string): void {
  expect(new URL(url).searchParams.get('monthYear'), url).toBe(ym);
}

function expectNoPeriodOrMonth(url: string): void {
  const params = new URL(url).searchParams;
  expect(params.get('period'), url).toBeNull();
  expect(params.has('monthYear'), url).toBe(false);
}

function coverageOf(data: Record<string, unknown>): string | null {
  const value = data.coverage ?? data.coverageStatus;
  return typeof value === 'string' ? value : null;
}

function roundHalfAway(value: number): number {
  const rounded = (value < 0 ? -1 : 1) * Math.round(Math.abs(value));
  return rounded;
}

function displayCount(value: number): number {
  const rounded = roundHalfAway(value);
  return rounded < 0 ? 0 : rounded;
}

interface CardMetric {
  name: string;
  count: number;
  raw: number;
  series: number[];
}

function readCardMetrics(data: Record<string, unknown>): CardMetric[] {
  const points = trendPoints(data);
  return [
    readMetric(data, 'Total DTRs', 'totalDtrs', points),
    readMetric(data, 'DTRs ON', 'dtrsOn', points),
    readMetric(data, 'DTRs OFF', 'dtrsOff', points),
    readMetric(data, 'Active Alerts', 'activeAlerts', points),
  ];
}

function readMetric(data: Record<string, unknown>, name: string, key: string, points: Array<Record<string, unknown>>): CardMetric {
  const node = data[key];
  const fromNode = isRecord(node) && typeof node.count === 'number' ? node.count : undefined;
  const fromTotal = isRecord(node) && typeof node.total === 'number' ? node.total : undefined;
  const raw = fromNode ?? fromTotal ?? numeric(points.at(-1)?.[key]);
  if (raw === undefined) {
    throw new Error(`No count for ${name}. summary keys: ${Object.keys(data).join(', ')}`);
  }
  const series = sparkline(node, key, points);
  return { name, raw, count: displayCount(raw), series };
}

function metricByName(metrics: CardMetric[], name: string): CardMetric {
  const found = metrics.find((metric) => metric.name === name);
  if (!found) {
    throw new Error(`Missing ${name}`);
  }
  return found;
}

function trendPoints(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const trends = isRecord(data.trends) ? data.trends : undefined;
  const points = trends && Array.isArray(trends.points) ? trends.points : [];
  return points.filter(isRecord);
}

function sparkline(node: unknown, key: string, points: Array<Record<string, unknown>>): number[] {
  if (isRecord(node) && Array.isArray(node.trends)) {
    return node.trends.map(numeric).filter((value): value is number => value !== undefined);
  }
  if (isRecord(node) && isRecord(node.trends) && Array.isArray(node.trends.values)) {
    return node.trends.values.map(numeric).filter((value): value is number => value !== undefined);
  }
  return points.map((point) => numeric(point[key])).filter((value): value is number => value !== undefined);
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function lookupIds(data: Record<string, unknown>, key: string): unknown {
  const node = data[key];
  if (!isRecord(node)) {
    return undefined;
  }
  return node.meterLookupIds;
}

function positiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0);
}

function droppedIds(value: unknown, page: DtrOverviewPage): void {
  if (!Array.isArray(value) || !value.some((id) => typeof id !== 'number' || !Number.isInteger(id) || id <= 0)) {
    page.note('DO-095', 'meterLookupIds had no 0, negative, or fractional id');
  }
}

function listTotal(body: unknown): number {
  return detailsTotal(body);
}

function detailsTotal(body: unknown): number {
  const data = unwrap(body);
  if (typeof data === 'number') {
    return data;
  }
  if (!isRecord(data)) {
    throw new Error('Details data was not an object');
  }
  if (typeof data.total === 'number') {
    return data.total;
  }
  if (isRecord(data.pagination) && typeof data.pagination.total === 'number') {
    return data.pagination.total;
  }
  if (typeof data.totalCount === 'number') {
    return data.totalCount;
  }
  throw new Error(`No details total. Keys: ${Object.keys(data).join(', ')}`);
}

interface PowerPoint {
  label: string;
  onPercentage: number;
  offPercentage: number;
  dtrsOn: number;
  dtrsOff: number;
}

function pointList(data: Record<string, unknown>): PowerPoint[] {
  const source = Array.isArray(data.points) ? data.points : [];
  return source.filter(isRecord).map((point) => ({
    label: String(point.label ?? ''),
    onPercentage: numberFrom(point, 'onPercentage', 'on_percentage'),
    offPercentage: numberFrom(point, 'offPercentage', 'off_percentage'),
    dtrsOn: numberFrom(point, 'dtrsOn', 'dtrs_on'),
    dtrsOff: numberFrom(point, 'dtrsOff', 'dtrs_off'),
  }));
}

function consumptionPoints(data: Record<string, unknown>): Array<{ label: string; kwh: number; kvah: number; kvarh: number }> {
  const source = Array.isArray(data.points) ? data.points : [];
  return source.filter(isRecord).map((point) => ({
    label: String(point.label ?? ''),
    kwh: finiteOrZero(point.kwh),
    kvah: finiteOrZero(point.kvah),
    kvarh: finiteOrZero(point.kvarh),
  }));
}

function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberFrom(point: Record<string, unknown>, camel: string, snake: string): number {
  const value = point[camel] ?? point[snake];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing ${camel} on ${String(point.label)}`);
  }
  return value;
}

function visiblePoints<T>(points: T[], window: number): T[] {
  return points.slice(-window);
}

function seriesValue(series: Array<{ name: string; points: Array<{ x: string; y: number }> }>, name: string, category: string): number {
  const match = series.find((item) => item.name === name)?.points.find((point) => point.x === category);
  if (!match || !Number.isFinite(match.y)) {
    throw new Error(`No ${name} value for ${category}`);
  }
  return match.y;
}

function toBucket(label: string): string {
  return label.replace(/\bSeptember\b/g, 'Sep').replace(/\bSept\b/g, 'Sep').replace(/\bJune\b/g, 'Jun').replace(/\bJuly\b/g, 'Jul');
}

function communicationSlices(data: Record<string, unknown>): { communicating?: number; nonCommunicating?: number } {
  const points = Array.isArray(data.points) ? data.points.filter(isRecord) : [];
  const windowed = points.slice(-COMMUNICATION_WINDOW.daily);
  const last = [...windowed].reverse().find((point) => numeric(point.communicating ?? point.communicated ?? point.communicatingCount) !== undefined);
  const source = last ?? data;
  return {
    communicating: displayCount(numberFromLoose(source, ['communicating', 'communicated', 'communicatingCount', 'communicatedCount'])),
    nonCommunicating: displayCount(numberFromLoose(source, ['nonCommunicating', 'nonCommunicated', 'non_communicating', 'nonCommunicatingCount'])),
  };
}

function numberFromLoose(source: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (typeof source[key] === 'number') {
      return source[key] as number;
    }
  }
  throw new Error(`No communication count in ${Object.keys(source).join(', ')}`);
}

interface BandItem {
  label: string;
  value: number;
}

function bandItems(data: unknown): BandItem[] {
  const record = isRecord(data) ? data : {};
  const source = [record.items, record.bands, record.slices, record.distribution, Array.isArray(data) ? data : undefined].find(Array.isArray) as unknown[] | undefined;
  if (!source) {
    return [];
  }
  return source.filter(isRecord).flatMap((item) => {
    const label = typeof item.label === 'string' ? item.label : typeof item.name === 'string' ? item.name : '';
    const value = numeric(item.value ?? item.count ?? item.total);
    if (!label || value === undefined) {
      return [];
    }
    return [{ label, value: Math.max(0, value) }];
  });
}

function apiTotal(data: unknown): number {
  if (!isRecord(data) || typeof data.total !== 'number' || !Number.isFinite(data.total)) {
    return 0;
  }
  return data.total;
}

function renameLoading(label: string): { label: string; band: string } {
  const key = label.trim().toLowerCase();
  if (key === 'critical' || key === 'high') {
    return { label: key === 'high' ? 'Critical' : label === 'critical' ? 'Critical' : 'Critical', band: 'critical' };
  }
  if (key === 'medium' || key === 'high load' || key === 'high-load') {
    return { label: 'High Load', band: 'high-load' };
  }
  if (key === 'low' || key === 'normal') {
    return { label: 'Normal', band: 'normal' };
  }
  if (key === 'very low' || key === 'under utilized' || key === 'under-utilized') {
    return { label: 'Under Utilized', band: 'under-utilized' };
  }
  return { label, band: 'critical' };
}

function renameSeverity(label: string): { label: string; band: string } {
  const key = label.trim().toLowerCase();
  if (key === 'high' || key === 'severe') {
    return { label: 'Severe', band: 'severe' };
  }
  if (key === 'medium' || key === 'normal' || key === 'moderate') {
    return { label: 'Moderate', band: 'moderate' };
  }
  if (key === 'low' || key === 'balanced') {
    return { label: 'Balanced', band: 'balanced' };
  }
  return { label, band: 'severe' };
}

function severityOf(label: string): string {
  return renameSeverity(label).band;
}

function expectSlice(reading: DonutReading, label: string, count: number, center: number): void {
  const slice = reading.slices.find((item) => item.label === label);
  expect(slice, label).toBeDefined();
  const shown = slice as NonNullable<typeof slice>;
  if (count === 0) {
    expect(shown.count === 0 || shown.count === null, `${label} zero`).toBe(true);
  } else {
    expect(shown.count, label).toBe(count);
  }
  if (shown.percent === null) {
    throw new Error(`${label} percent is empty`);
  }
  const expected = center === 0 ? 0 : (count / center) * 100;
  const places = (shown.percentText.split('.')[1] ?? '').replace('%', '').length;
  expect(shown.percent, `${label} %`).toBeCloseTo(expected, places);
}

function countOf(reading: DonutReading, label: string): number {
  const slice = reading.slices.find((item) => item.label === label);
  if (!slice || slice.count === null) {
    throw new Error(`Missing ${label}`);
  }
  return slice.count;
}
