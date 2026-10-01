import { Locator, Page } from '@playwright/test';
import type { AppProfile, ElementQuery } from '../core/config/config.schema';
import { find } from '../core/components/queries';

export abstract class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly app: AppProfile,
  ) {}

  protected route(name: string): string {
    const route = this.app.routes[name];
    if (!route) {
      throw new Error(`Unknown route '${name}' in app '${this.app.id}'. Available: ${Object.keys(this.app.routes).join(', ')}`);
    }
    return route;
  }

  protected query(name: string): ElementQuery {
    const query = this.app.ui.elements[name];
    if (!query) {
      throw new Error(
        `Unknown element '${name}' in app '${this.app.id}'. Available: ${Object.keys(this.app.ui.elements).join(', ')}`,
      );
    }
    return query;
  }

  protected find(name: string, scope: Page | Locator = this.page): Promise<Locator> {
    return find(scope, this.query(name));
  }
}
