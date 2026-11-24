import https from 'https';
import type { CheerioAPI } from 'cheerio';

export const CARACAS_TIMEZONE = 'America/Caracas';

const MONTHS_ES: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

const TLS_CHAIN_ERROR_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export function getCaracasDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getCaracasMonthBounds(date: Date = new Date()): {
  firstDayOfMonth: string;
  today: string;
} {
  const today = getCaracasDateString(date);
  return {
    firstDayOfMonth: `${today.slice(0, 7)}-01`,
    today,
  };
}

export function getCaracasDayRangeIso(
  fechaDesde: string,
  fechaHasta: string
): { startIso: string; endIso: string } {
  return {
    startIso: `${fechaDesde}T00:00:00.000-04:00`,
    endIso: `${fechaHasta}T23:59:59.999-04:00`,
  };
}

export function parseBcvDateFromHtml($: CheerioAPI, now: Date = new Date()): string {
  try {
    const attrDate =
      $('span.date-display-single').attr('content') ||
      $('.pull-right.dinpro span.date-display-single').attr('content');
    if (attrDate) {
      const isoMatch = attrDate.match(/^(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) return isoMatch[1];
    }

    const dateText =
      $('.diname-round .date-display-single').text().trim() ||
      $('span.date-display-single').first().text().trim();
    if (dateText) {
      const match = dateText.match(/(\d{1,2})\s+([a-zA-Záéíóúñ]+)\s+(\d{4})/i);
      if (match) {
        const day = match[1].padStart(2, '0');
        const month = MONTHS_ES[match[2].toLowerCase()];
        const year = match[3];
        if (month) {
          return `${year}-${month}-${day}`;
        }
      }
    }
  } catch {
    // fallback to Caracas local date
  }

  return getCaracasDateString(now);
}

function requestBcvHtml(rejectUnauthorized: boolean, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'www.bcv.org.ve',
        port: 443,
        path: '/',
        method: 'GET',
        rejectUnauthorized,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tiempo de espera agotado al conectar con bcv.org.ve'));
    });
    req.end();
  });
}

export async function fetchBcvHtmlSafe(timeoutMs: number = 20000): Promise<string> {
  try {
    return await requestBcvHtml(true, timeoutMs);
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : '';
    if (TLS_CHAIN_ERROR_CODES.has(code)) {
      console.warn(
        `Advertencia TLS verificando certificado de www.bcv.org.ve (${code}); reintentando sin cadena estricta.`
      );
      return await requestBcvHtml(false, timeoutMs);
    }
    throw err;
  }
}
