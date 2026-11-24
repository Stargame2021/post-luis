import type { CheerioAPI } from 'cheerio';
import {
  CARACAS_TIMEZONE,
  MONTHS_ES,
  TLS_CHAIN_ERROR_CODES,
  fetchBcvHtmlSafe as fetchBcvHtmlSafeCore,
  getCaracasDateString as getCaracasDateStringCore,
  getCaracasDayRangeIso as getCaracasDayRangeIsoCore,
  getCaracasMonthBounds as getCaracasMonthBoundsCore,
  parseBcvDateFromHtml as parseBcvDateFromHtmlCore,
} from '../../lib/bcv-core.cjs';

export { CARACAS_TIMEZONE, MONTHS_ES, TLS_CHAIN_ERROR_CODES };

export function getCaracasDateString(date: Date = new Date()): string {
  return getCaracasDateStringCore(date);
}

export function getCaracasMonthBounds(date: Date = new Date()): {
  firstDayOfMonth: string;
  today: string;
} {
  return getCaracasMonthBoundsCore(date);
}

export function getCaracasDayRangeIso(
  fechaDesde: string,
  fechaHasta: string
): { startIso: string; endIso: string } {
  return getCaracasDayRangeIsoCore(fechaDesde, fechaHasta);
}

export function parseBcvDateFromHtml($: CheerioAPI, now: Date = new Date()): string {
  return parseBcvDateFromHtmlCore($, now);
}

export async function fetchBcvHtmlSafe(timeoutMs: number = 20000): Promise<string> {
  return fetchBcvHtmlSafeCore(timeoutMs);
}
