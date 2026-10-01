import { Locator } from '@playwright/test';
import type { UserRecord } from '../core/data/dataset.types';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.page.goto(this.route('login'));
    await this.find('loginSubmit');
  }

  async signIn(user: UserRecord): Promise<void> {
    const email = await this.find('email');
    await email.fill(user.email);
    const password = await this.find('password');
    await password.fill(user.password);
    const captcha = await this.find('captcha');
    await captcha.fill(user.captcha);
    const submit = await this.find('loginSubmit');
    await submit.click();
  }

  error(): Promise<Locator> {
    return this.find('loginError');
  }
}
