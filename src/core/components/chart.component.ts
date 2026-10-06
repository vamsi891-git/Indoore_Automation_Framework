import { expect, Locator } from '@playwright/test';
import { BaseComponent } from './base.component';
import { findByRole } from './queries';

export interface ChartPoint {
  x: string;
  y: number;
}

export interface ChartSeries {
  name: string;
  visible: boolean;
  points: ChartPoint[];
}

export interface ChartPlotSeries {
  name: string;
  points: ChartPoint[];
}

interface ChartJsInstance {
  data: {
    labels?: unknown[];
    datasets: Array<{ label?: string; data: Array<number | { y?: number }> }>;
  };
  isDatasetVisible(index: number): boolean;
}

interface HighchartsPoint {
  category?: unknown;
  x?: unknown;
  y: number;
}

interface HighchartsChart {
  renderTo: Element;
  series: Array<{ name: string; visible: boolean; points: HighchartsPoint[] }>;
}

interface EChartsInstance {
  getOption(): {
    series?: Array<{ name?: string; data?: unknown[] }>;
    xAxis?: Array<{ data?: unknown[] }>;
  };
}

interface ApexChartInstance {
  el?: Element;
  w?: {
    globals?: { seriesNames?: string[]; labels?: unknown[]; series?: unknown[][] };
    config?: { series?: Array<{ name?: string; data?: unknown[] }>; xaxis?: { categories?: unknown[] } };
  };
}

/**
 * Reads Chart.js, Highcharts, or the framework SVG contract from the chart root.
 * The function is evaluated in the browser, so it cannot close over Node values.
 */
function readSeriesInPage(root: Element): ChartSeries[] {
  function readableApexName(name: string): string {
    if (!name || name.includes('_')) {
      return name;
    }
    return name.replace(/x(?=[A-Z])/g, ' ');
  }

  function seriesKey(node: Element): string {
    return node.getAttribute('seriesName') ?? node.getAttribute('seriesname') ?? '';
  }

  function apexFromDom(scope: Element): ChartSeries[] {
    const labels = [...scope.querySelectorAll('.apexcharts-xaxis-label title')]
      .map((node) => node.textContent?.trim() ?? '')
      .filter((label) => label.length > 0);
    const groups = [...scope.querySelectorAll('g.apexcharts-series')];
    if (groups.length === 0) {
      return [];
    }
    const legendName = new Map<string, string>();
    for (const item of scope.querySelectorAll('.apexcharts-legend-series')) {
      const key = seriesKey(item);
      const text = item.querySelector('.apexcharts-legend-text')?.textContent?.trim() ?? '';
      if (key && text) {
        legendName.set(key, text);
      }
    }
    return groups.map((group, index) => {
      const key = seriesKey(group);
      const bars = [...group.querySelectorAll('path.apexcharts-bar-area, rect')].filter((bar) => bar.hasAttribute('val') || bar.hasAttribute('j'));
      return {
        name: legendName.get(key) || readableApexName(key) || `series-${index}`,
        visible: true,
        points: bars.map((bar, pointIndex) => ({
          x: labels[pointIndex] ?? String(pointIndex),
          y: Number(bar.getAttribute('val') ?? bar.getAttribute('j')),
        })),
      };
    });
  }

  const chartJs = (window as unknown as { Chart?: { getChart?: (canvas: Element) => ChartJsInstance | undefined } })
    .Chart;
  const canvas = root.querySelector('canvas');
  if (canvas && chartJs?.getChart) {
    const chart = chartJs.getChart(canvas);
    if (chart) {
      return chart.data.datasets.map((dataset, index) => ({
        name: dataset.label ?? `series-${index}`,
        visible: chart.isDatasetVisible(index),
        points: dataset.data.map((value, pointIndex) => ({
          x: String(chart.data.labels?.[pointIndex] ?? pointIndex),
          y: typeof value === 'number' ? value : Number(value?.y),
        })),
      }));
    }
  }

  const echartsApi = (window as unknown as { echarts?: { getInstanceByDom?: (el: Element) => EChartsInstance | undefined } })
    .echarts;
  if (echartsApi?.getInstanceByDom) {
    const hosts = [root, ...root.querySelectorAll('*')];
    for (const host of hosts) {
      const chart = echartsApi.getInstanceByDom(host);
      if (!chart) {
        continue;
      }
      const option = chart.getOption();
      const labels = option.xAxis?.[0]?.data ?? [];
      return (option.series ?? []).map((series, index) => ({
        name: series.name ?? `series-${index}`,
        visible: true,
        points: (series.data ?? []).map((value, pointIndex) => ({
          x: String(labels[pointIndex] ?? pointIndex),
          y: typeof value === 'number' ? value : Number((value as { value?: number })?.value),
        })),
      }));
    }
  }

  const apexBag = (
    window as unknown as { Apex?: { _chartInstances?: Array<{ chart?: ApexChartInstance }> } }
  ).Apex?._chartInstances;
  const apexDom = apexFromDom(root);
  if (apexDom.length > 0) {
    return apexDom;
  }

  const apex = apexBag?.map((item) => item.chart).find((chart) => chart?.el && root.contains(chart.el));
  if (apex?.w) {
    const configured = apex.w.config?.series ?? [];
    const names = configured.map((series, index) => series.name ?? apex.w?.globals?.seriesNames?.[index] ?? `series-${index}`);
    const labels = (apex.w.config?.xaxis?.categories ?? apex.w.globals?.labels ?? []).map((label) => String(label));
    return names.map((name, index) => ({
      name,
      visible: true,
      points: (configured[index]?.data ?? apex.w?.globals?.series?.[index] ?? []).map((value, pointIndex) => ({
        x: labels[pointIndex] ?? String(pointIndex),
        y: typeof value === 'number' ? value : Number((value as { y?: number })?.y),
      })),
    }));
  }

  const highcharts = (
    window as unknown as { Highcharts?: { charts?: Array<HighchartsChart | undefined> } }
  ).Highcharts;
  const match = highcharts?.charts?.find((chart) => chart && root.contains(chart.renderTo));
  if (match) {
    return match.series.map((series) => ({
      name: series.name,
      visible: series.visible,
      points: series.points.map((point) => ({
        x: String(point.category ?? point.x ?? ''),
        y: point.y,
      })),
    }));
  }

  const svg = root.querySelector('[data-chart-svg]');
  if (!svg) {
    return [];
  }
  return [...svg.children]
    .filter((node) => node.hasAttribute('data-series'))
    .map((group) => ({
      name: group.getAttribute('data-series') ?? '',
      visible: group.getAttribute('data-visible') !== 'false',
      points: [...group.querySelectorAll('circle')].map((circle) => ({
        x: circle.getAttribute('data-x') ?? '',
        y: Number(circle.getAttribute('data-y')),
      })),
    }));
}

function quotedAttr(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export class ChartComponent extends BaseComponent {
  async waitForRender(): Promise<void> {
    await this.root.waitFor({ state: 'visible' });
    await this.root.locator('[data-chart-svg] circle, canvas').first().waitFor({ state: 'visible' });
  }

  async getTitle(): Promise<string> {
    return (await this.root.locator('[data-chart-title]').innerText()).trim();
  }

  async getUnit(): Promise<string> {
    const unit = this.root.locator('[data-chart-unit]');
    if ((await unit.count()) === 0) {
      return '';
    }
    return (await unit.innerText()).trim();
  }

  async getSeries(options?: { onlyVisible?: boolean }): Promise<ChartSeries[]> {
    const series = await this.root.evaluate(readSeriesInPage);
    if (options?.onlyVisible) {
      return series.filter((item) => item.visible);
    }
    return series;
  }

  async getPlot(options?: { onlyVisible?: boolean }): Promise<ChartPlotSeries[]> {
    const series = await this.getSeries(options);
    return series.map(({ name, points }) => ({ name, points }));
  }

  async getAxisLabels(axis: 'x' | 'y'): Promise<string[]> {
    return this.root.locator(`[data-axis="${axis}"]`).evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? '').filter((label) => label.length > 0),
    );
  }

  async hoverPoint(seriesName: string, index: number): Promise<string> {
    const point = this.points(seriesName).nth(index);
    await point.waitFor();
    await point.hover();
    const tooltip = this.root.locator('[data-chart-tooltip]');
    await expect(tooltip).toBeVisible();
    return (await tooltip.innerText()).trim();
  }

  async toggleSeries(seriesName: string): Promise<void> {
    const button = await findByRole(this.root, 'button', { name: seriesName, exact: true });
    await button.click();
  }

  private points(seriesName: string): Locator {
    return this.root.locator(`[data-series=${quotedAttr(seriesName)}] circle`);
  }
}
