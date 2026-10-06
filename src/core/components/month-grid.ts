import { expect, Locator, Page } from '@playwright/test';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface CalendarMonth {
  year: number;
  monthIndex: number;
  ym: string;
  label: string;
  short: (typeof MONTHS)[number];
}

export function kolkataCalendar(date = new Date()): CalendarMonth {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return calendarFrom(year, month - 1);
}

export function previousMonth(current: CalendarMonth): CalendarMonth {
  if (current.monthIndex === 0) {
    return calendarFrom(current.year - 1, 11);
  }
  return calendarFrom(current.year, current.monthIndex - 1);
}

export function calendarFrom(year: number, monthIndex: number): CalendarMonth {
  const month = String(monthIndex + 1).padStart(2, '0');
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthIndex, 1)),
  );
  return { year, monthIndex, ym: `${year}-${month}`, label, short: MONTHS[monthIndex] };
}

export async function openMonthGrid(page: Page, opener: Locator): Promise<Locator> {
  await opener.click();
  const grid = page.locator('.bi-calendar-panel--month-grid');
  await grid.waitFor();
  return grid;
}

function monthButton(grid: Locator, year: number, monthIndex: number): Locator {
  return grid.getByRole('button', { name: `${MONTHS[monthIndex]} ${year}`, exact: true });
}

export async function showYear(grid: Locator, year: number): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shown = Number((await grid.locator('text=/^\\d{4}$/').first().innerText()).trim());
    if (shown === year) {
      return;
    }
    const name = shown > year ? 'Previous year' : 'Next year';
    const control = grid.getByRole('button', { name, exact: true });
    await expect(control, `year control for ${year}`).toBeEnabled();
    await control.click();
  }
  throw new Error(`Could not show year ${year}`);
}

/** Months after the current Asia/Kolkata month cannot be chosen. A later year, when it opens, is disabled too. */
export async function expectFutureMonthsDisabled(grid: Locator, current: CalendarMonth): Promise<void> {
  await showYear(grid, current.year);
  for (let index = current.monthIndex + 1; index < MONTHS.length; index += 1) {
    await expect(monthButton(grid, current.year, index), MONTHS[index]).toBeDisabled();
  }
  await expect(monthButton(grid, current.year, current.monthIndex), 'current month').toBeEnabled();
  if (current.monthIndex > 0) {
    await expect(monthButton(grid, current.year, current.monthIndex - 1), 'past month').toBeEnabled();
  }
  const nextYear = grid.getByRole('button', { name: 'Next year', exact: true });
  if ((await nextYear.count()) === 0 || !(await nextYear.first().isEnabled())) {
    return;
  }
  await nextYear.first().click();
  const next = current.year + 1;
  for (let index = 0; index < MONTHS.length; index += 1) {
    await expect(monthButton(grid, next, index), `${MONTHS[index]} next year`).toBeDisabled();
  }
  await grid.getByRole('button', { name: 'Previous year', exact: true }).click();
}

export async function pickMonth(grid: Locator, year: number, monthIndex: number): Promise<void> {
  await showYear(grid, year);
  await monthButton(grid, year, monthIndex).click();
}
