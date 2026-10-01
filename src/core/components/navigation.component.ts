import { findByRole } from './queries';
import { BaseComponent } from './base.component';

export class NavigationComponent extends BaseComponent {
  async open(name: string): Promise<void> {
    const link = await findByRole(this.root, 'link', { name, exact: true });
    await link.click();
  }
}
