import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { fetchBcvHtmlSafe, parseBcvDateFromHtml } from '@/lib/bcv';

export async function POST(req: Request) {
  const auth = await requireAuth(req, { permissions: ['rates'] });
  if (!auth.ok) return auth.response;

  try {
    const html = await fetchBcvHtmlSafe(20000);
    const $ = cheerio.load(html);

    const usdContainer = $('#dolar');
    if (!usdContainer.length) {
      return NextResponse.json(
        { success: false, message: 'No se encontró el contenedor #dolar en la página del BCV.' },
        { status: 502 }
      );
    }

    const rawValue = usdContainer.find('strong').text().trim();
    if (!rawValue) {
      return NextResponse.json(
        { success: false, message: 'No se pudo leer el valor numérico de la tasa en el BCV.' },
        { status: 502 }
      );
    }

    const cleanValue = rawValue.replace(/\./g, '').replace(',', '.');
    const numericValue = parseFloat(cleanValue);

    if (isNaN(numericValue) || numericValue <= 0) {
      return NextResponse.json(
        { success: false, message: `El valor extraído ("${rawValue}") no es válido.` },
        { status: 502 }
      );
    }

    const tasaRedondeada = Number(numericValue.toFixed(4));
    const fechaValor = parseBcvDateFromHtml($);

    const upsertSql = `
      INSERT INTO m_tasa (fecha, tasa)
      VALUES ($1, $2)
      ON CONFLICT (fecha)
      DO UPDATE SET tasa = EXCLUDED.tasa, creado_en = CURRENT_TIMESTAMP
      RETURNING id, TO_CHAR(fecha, 'YYYY-MM-DD') as fecha, tasa;
    `;

    const rows = await query(upsertSql, [fechaValor, tasaRedondeada]);

    return NextResponse.json({
      success: true,
      rate: rows[0],
      fecha: fechaValor,
      tasa: tasaRedondeada,
      message: `Tasa oficial del BCV obtenida exitosamente: ${tasaRedondeada} Bs./USD (Fecha: ${fechaValor})`,
    });
  } catch (error: unknown) {
    console.error('Error sincronizando tasa BCV:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al conectar con la página del BCV',
      },
      { status: 500 }
    );
  }
}
