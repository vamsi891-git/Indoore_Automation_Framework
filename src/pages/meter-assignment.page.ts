import { expect, Locator } from '@playwright/test';
import { BasePage } from './base.page';

export interface AssignmentIdentity {
  serial: string;
  consumerId: string;
  dtrCode: string;
}

export class MeterAssignmentPage extends BasePage {
  async assignMeterToConsumer(identity: AssignmentIdentity): Promise<void> {
    await this.openAddConsumer();
    await this.fill(/^Consumer ID/i, identity.consumerId);
    await this.fill(/^Consumer Name/i, `E2E Consumer ${identity.consumerId.slice(-6)}`);
    await this.fill(/^Mobile Number/i, '9876543210');
    await this.fill(/^Address/i, 'E2E assignment address');
    await this.next();

    await this.pickSearch('add-consumer-step-zone');
    await this.pickSearch('add-consumer-connection-subStation');
    await this.pickSearch('add-consumer-connection-feeder');
    await this.pickSearch('add-consumer-connection-dtr');
    await this.fill(/IVRS Number/i, identity.consumerId);
    await this.fill(/Account ID/i, identity.consumerId);
    await this.keepExistingNearestAccount();
    await this.fill(/Sanctioned Load/i, '1');
    await this.pickBillDay();
    await this.pickConnectionLookups();
    await this.next();

    await this.fillMeterSerial('add-consumer-meter-msn', identity.serial, 'Meter is available to link the Consumer.');
    await this.pickSearch('add-consumer-meter-mainSubMeter', false);
    await this.pickSearch('add-consumer-meter-meterPhase', false);
    await this.fillId('add-consumer-meter-servicePointId', `SP${identity.consumerId}`);
    await this.fillId('add-consumer-meter-dateOfService', '2024-01-15');
    await this.fillId('add-consumer-meter-simNo', '8991000000000000001');
    await this.fillId('add-consumer-meter-imsiNo', '404100000000001');
    await this.fillId('add-consumer-meter-mobileNo', '9876543211');
    await this.fillId('add-consumer-meter-ipAddress', '10.1.1.10');
    await this.fillId('add-consumer-meter-modemSerialNumber', `E2EMDM${identity.serial.slice(-6)}`);
    await this.fillId('add-consumer-meter-modemImei', '490154203237518');
    await this.fillId('add-consumer-meter-meterInitialReading', '1');
    await this.next();

    const created = this.page.waitForResponse(
      (response) => /\/consumers(?:\?|$|\/)/.test(new URL(response.url()).pathname) && response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await this.page.getByRole('button', { name: 'Create Consumer', exact: true }).click();
    const response = await created;
    expect(response.ok(), 'create consumer').toBe(true);
  }

  async assignMeterToDtr(identity: AssignmentIdentity): Promise<void> {
    await this.openAddDtr();
    await this.pickSearch('add-dtr-step-1-zone');
    await this.pickSearch('add-dtr-step-1-substation');
    await this.pickSearch('add-dtr-step-1-feeder');
    await this.next();

    await this.fillId('add-dtr-step-2-dtrCode', identity.dtrCode);
    await this.fillId('add-dtr-step-2-dtrName', `E2E ${identity.dtrCode}`);
    await this.fillId('add-dtr-step-2-dtrCapacityKva', '25');
    await this.next();

    await this.fillMeterSerial('add-dtr-meter-msn', identity.serial, 'Meter found and available for DTR assignment.');
    await this.fillDtrMeterDetails(identity.dtrCode, identity.serial);
    await this.next();

    const created = this.page.waitForResponse(
      (response) => response.url().includes('/master-data') && response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await created;
    expect(response.ok(), 'create DTR').toBe(true);
  }

  async expectConsumerRejectsDtrMeter(serial: string): Promise<void> {
    await this.openAddConsumer();
    await this.reachConsumerMeterStep();
    await this.fillMeterSerial('add-consumer-meter-msn', serial, 'This meter is already linked to a DTR.');
  }

  async expectDtrRejectsConsumerMeter(serial: string): Promise<void> {
    await this.openAddDtr();
    await this.pickSearch('add-dtr-step-1-zone');
    await this.pickSearch('add-dtr-step-1-substation');
    await this.pickSearch('add-dtr-step-1-feeder');
    await this.next();
    await this.fillId('add-dtr-step-2-dtrCode', `E2EX${serial.slice(-6)}`);
    await this.fillId('add-dtr-step-2-dtrName', 'E2E reject');
    await this.fillId('add-dtr-step-2-dtrCapacityKva', '25');
    await this.next();
    await this.fillMeterSerial('add-dtr-meter-msn', serial, 'This meter is already assigned to a consumer.');
  }

  private async openAddConsumer(): Promise<void> {
    await this.page.goto(this.route('consumerAdd'));
    const dialog = this.page.getByRole('dialog', { name: 'Add Consumer' });
    const form = this.page.getByText('1. Consumer Details', { exact: true });
    await expect(dialog.or(form)).toBeVisible({ timeout: 20_000 });
    if (await dialog.isVisible()) {
      await this.pickSelect(/^Zone\b/i);
      await dialog.getByRole('button', { name: 'Add Consumer', exact: true }).click();
    }
    await expect(form).toBeVisible({ timeout: 20_000 });
  }

  private async reachConsumerMeterStep(): Promise<void> {
    const stamp = Date.now().toString().slice(-8);
    const id = `E2EX${stamp}`.slice(0, 12);
    await this.fill(/^Consumer ID/i, id);
    await this.fill(/^Consumer Name/i, `E2E Consumer ${id.slice(-6)}`);
    await this.fill(/^Mobile Number/i, '9876543210');
    await this.fill(/^Address/i, 'E2E assignment address');
    await this.next();
    await this.pickSearch('add-consumer-step-zone');
    await this.pickSearch('add-consumer-connection-subStation');
    await this.pickSearch('add-consumer-connection-feeder');
    await this.pickSearch('add-consumer-connection-dtr');
    await this.fill(/IVRS Number/i, id);
    await this.fill(/Account ID/i, id);
    await this.keepExistingNearestAccount();
    await this.fill(/Sanctioned Load/i, '1');
    await this.pickBillDay();
    await this.pickConnectionLookups();
    await this.next();
  }

  private async fillMeterSerial(inputId: string, serial: string, message: string): Promise<void> {
    const box = this.page.locator(`#${inputId}`);
    await box.click();
    await box.fill(serial);
    const suggestion = this.page.locator('[id*="suggestion-"]').locator('visible=true').filter({ hasText: serial }).first();
    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click({ force: true });
    }
    const available = this.page.getByText(message).first();
    const blocked = this.page.getByRole('alert').or(this.page.getByText(/not found in the system|Enter remaining meter details manually/i)).first();
    await expect(available.or(blocked)).toBeVisible({ timeout: 20_000 });
    if (await available.isVisible()) return;
    const reason = (
      (await blocked.getAttribute('aria-label')) ||
      (await blocked.textContent()) ||
      'meter serial was not accepted'
    ).trim();
    throw new Error(
      `ISSUE: meter ${serial} was created by bulk upload and is listed in Meter Data, but assignment says "${reason}". Bulk upload writes L_Meter_Lookup. Add Consumer and Add DTR look up L_Meter_Lookup_new, so the new meter cannot be assigned.`,
    );
  }

  private async keepExistingNearestAccount(): Promise<void> {
    const box = this.page.getByRole('textbox', { name: /Nearest Acct/i }).first();
    if ((await box.inputValue()).trim()) return;
    await box.fill('8500');
    const suggestion = this.page.locator('[id*="suggestion-"]').locator('visible=true').first();
    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click({ force: true });
    }
  }

  private async fillId(id: string, value: string): Promise<void> {
    await this.page.locator(`#${id}`).fill(value);
  }

  private async pickConnectionLookups(): Promise<void> {
    await this.pickSearch('add-consumer-connection-connectionType', false);
    await this.pickSearch('add-consumer-connection-billingCycle', false);
    await this.pickSearch('add-consumer-connection-consumerCategory', false);
    await this.pickSearch('add-consumer-connection-connectionStatus', false);
    await this.pickSearch('add-consumer-connection-tod', false);
  }

  private async fillDtrMeterDetails(code: string, serial: string): Promise<void> {
    await this.pickSearch('add-dtr-meter-mainSubMeter', false);
    await this.pickSearch('add-dtr-meter-meterPhase', false);
    await this.fillId('add-dtr-meter-servicePointId', `SP${code}`);
    await this.fillId('add-dtr-meter-dateOfService', '2024-01-15');
    await this.fillId('add-dtr-meter-simNo', '8991000000000000002');
    await this.fillId('add-dtr-meter-imsiNo', '404100000000002');
    await this.fillId('add-dtr-meter-ipAddress', '10.1.1.11');
    await this.fillId('add-dtr-meter-modemSerialNumber', `E2EDTR${serial.slice(-6)}`);
    await this.fillId('add-dtr-meter-modemImei', '490154203237519');
    await this.fillId('add-dtr-meter-meterInitialReading', '1');
  }

  private async openAddDtr(): Promise<void> {
    await this.page.goto(this.route('dtrAdd'));
    await expect(this.page.getByText('Add New DTR', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }

  private async fill(name: RegExp, value: string): Promise<void> {
    const box = this.page.getByRole('textbox', { name }).or(this.page.getByRole('spinbutton', { name })).first();
    await box.fill(value);
  }

  private async pickBillDay(): Promise<void> {
    await this.page.locator('#add-consumer-connection-billDay').click();
    await this.page.getByRole('option', { name: '1', exact: true }).click();
  }

  private async next(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  private async pickSearch(idPrefix: string, remote = true): Promise<void> {
    const box = this.page.locator(`#${idPrefix}-input`);
    await expect(box).toBeEnabled({ timeout: 20_000 });
    const lookup = remote
      ? this.page
          .waitForResponse((response) => response.url().includes('/utils/search/') && response.ok(), { timeout: 20_000 })
          .catch(() => null)
      : Promise.resolve(null);
    await box.click();
    await box.press('ArrowDown');
    await lookup;
    const suggestion = this.page.locator('[id*="suggestion-"]').locator('visible=true').first();
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click({ force: true });
    await expect(suggestion).toBeHidden({ timeout: 10_000 });
  }

  private async pickSelect(name: RegExp): Promise<void> {
    const trigger = this.trigger(name);
    await trigger.click();
    const menu = this.page.getByRole('menu').last().or(this.page.getByRole('listbox').last());
    await expect(menu).toBeVisible({ timeout: 15_000 });
    const item = menu.getByRole('menuitem').or(menu.getByRole('option')).filter({ hasNotText: /^select /i }).first();
    await item.click();
  }

  private trigger(name: RegExp): Locator {
    return this.page
      .getByRole('combobox', { name })
      .or(this.page.getByRole('button', { name }))
      .first();
  }
}
