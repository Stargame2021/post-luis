export interface BcvHtmlSelection {
  attr(name: string): string | undefined;
  text(): string;
  first(): { text(): string };
}

export type BcvHtmlQuery = (selector: string) => BcvHtmlSelection;

export declare const CARACAS_TIMEZONE: string;
export declare const MONTHS_ES: Record<string, string>;
export declare const TLS_CHAIN_ERROR_CODES: Set<string>;
export declare function getCaracasDateString(date?: Date): string;
export declare function getCaracasMonthBounds(date?: Date): {
  firstDayOfMonth: string;
  today: string;
};
export declare function getCaracasDayRangeIso(
  fechaDesde: string,
  fechaHasta: string
): { startIso: string; endIso: string };
export declare function parseBcvDateFromHtml($: BcvHtmlQuery, now?: Date): string;
export declare function fetchBcvHtmlSafe(timeoutMs?: number): Promise<string>;
