import { loadConfig } from '../config/config.loader';

export function appTimeZone(): string {
  return loadConfig().app.timezone;
}

export function todayInAppZone(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: appTimeZone() }).format(date);
}
