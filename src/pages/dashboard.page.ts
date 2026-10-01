import { Locator } from '@playwright/test';
import { ChartComponent } from '../core/components/chart.component';
import { NavigationComponent } from '../core/components/navigation.component';
import { roleName } from '../core/components/queries';
import { TableComponent } from '../core/components/table.component';
import { BasePage } from './base.page';

export class DashboardPage extends BasePage {
  pageTitle(): Promise<Locator> {
    return this.find('pageTitle');
  }

  async dtrTable(): Promise<TableComponent> {
    return new TableComponent(this.page, await this.find('dtrTable'));
  }

  async chart(elementKey: string): Promise<ChartComponent> {
    return new ChartComponent(this.page, await this.find(elementKey));
  }

  updateKpis(): Promise<Locator> {
    return this.find('updateKpis');
  }

  assetMap(): Promise<Locator> {
    return this.find('assetMap');
  }

  mapSearch(): Promise<Locator> {
    return this.find('mapSearch');
  }

  card(elementKey: string): Promise<Locator> {
    return this.find(elementKey);
  }

  async open(): Promise<void> {
    await this.page.goto(this.route('dashboard'));
    await this.expectReady();
  }

  async openFromConsumers(): Promise<void> {
    const link = this.page.getByRole('main').getByRole('link', { name: 'Dashboard', exact: true });
    await link.click();
    await this.expectReady();
  }

  async expectReady(): Promise<void> {
    await this.find('pageTitle');
  }

  async goTo(elementKey: string): Promise<void> {
    const navigation = new NavigationComponent(this.page, await this.find('appNav'));
    await navigation.open(roleName(this.query(elementKey), elementKey));
  }
}
