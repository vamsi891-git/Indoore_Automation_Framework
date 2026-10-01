import { Locator, Page } from '@playwright/test';

export abstract class BaseComponent {
  constructor(
    protected readonly page: Page,
    readonly root: Locator,
  ) {}
}
