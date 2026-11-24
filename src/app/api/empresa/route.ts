import { NextResponse } from 'next/server';
import { query, ensureAuthTables } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export interface EmpresaConfig {
  id: number;
  nombre_comercial: string;
  rif: string;
  direccion: string;
  telefono: string;
  moneda_local: string;
}

const DEFAULT_EMPRESA: EmpresaConfig = {
  id: 1,
  nombre_comercial: 'Tienda Express',
  rif: '',
  direccion: '',
  telefono: '',
  moneda_local: 'Bs.',
};

export async function GET() {
  try {
    await ensureAuthTables();
    const rows = await query<Partial<EmpresaConfig>>(
      'SELECT id, nombre_comercial, rif, direccion, telefono, moneda_local FROM m_empresa WHERE id = 1'
    );
    const row = rows[0];
    const empresa: EmpresaConfig = row
      ? {
          id: Number(row.id ?? 1),
          nombre_comercial: String(row.nombre_comercial || DEFAULT_EMPRESA.nombre_comercial),
          rif: String(row.rif ?? ''),
          direccion: String(row.direccion ?? ''),
          telefono: String(row.telefono ?? ''),
          moneda_local: String(row.moneda_local || DEFAULT_EMPRESA.moneda_local),
        }
      : DEFAULT_EMPRESA;

    return NextResponse.json({ success: true, empresa });
  } catch {
    return NextResponse.json({ success: true, empresa: DEFAULT_EMPRESA });
  }
}

export async function PUT(req: Request) {
  const auth = await requireAuth(req, { adminOnly: true, permissions: ['maintenance'] });
  if (!auth.ok) return auth.response;

  try {
    await ensureAuthTables();
    const body = (await req.json()) as Partial<EmpresaConfig>;
    const nombreComercial = String(body?.nombre_comercial ?? '').trim();

    if (!nombreComercial) {
      return NextResponse.json(
        { success: false, message: 'El nombre comercial de la tienda es obligatorio.' },
        { status: 400 }
      );
    }

    const rif = String(body?.rif ?? '').trim();
    const direccion = String(body?.direccion ?? '').trim();
    const telefono = String(body?.telefono ?? '').trim();
    const monedaLocal = String(body?.moneda_local ?? 'Bs.').trim() || 'Bs.';

    const rows = await query<EmpresaConfig>(
      `INSERT INTO m_empresa (id, nombre_comercial, rif, direccion, telefono, moneda_local, actualizado_en)
       VALUES (1, $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         nombre_comercial = EXCLUDED.nombre_comercial,
         rif = EXCLUDED.rif,
         direccion = EXCLUDED.direccion,
         telefono = EXCLUDED.telefono,
         moneda_local = EXCLUDED.moneda_local,
         actualizado_en = CURRENT_TIMESTAMP
       RETURNING id, nombre_comercial, rif, direccion, telefono, moneda_local`,
      [nombreComercial, rif, direccion, telefono, monedaLocal]
    );

    return NextResponse.json({
      success: true,
      empresa: rows[0] ?? DEFAULT_EMPRESA,
      message: 'Identidad de la tienda actualizada correctamente.',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : 'Error al actualizar la identidad de la tienda',
      },
      { status: 500 }
    );
  }
}
