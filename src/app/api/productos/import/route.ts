import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export interface PresentacionImportInput {
  nombre: string;
  factor: number;
  precio_usd: number;
}

export interface ProductoImportInput {
  nombre: string;
  unidad_base?: string;
  precio_usd: number;
  stock_actual: number;
  costo_promedio_usd?: number;
  impuesto_id?: number | null;
  presentaciones?: PresentacionImportInput[];
}

export async function POST(req: Request) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = await req.json();
    const { items, modo = 'actualizar' } = body as {
      items: ProductoImportInput[];
      modo?: 'actualizar' | 'omitir';
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No se enviaron productos para importar.' },
        { status: 400 }
      );
    }

    // Obtener impuesto por defecto (IVA 16% o el primero disponible)
    const impRes = await client.query('SELECT id, porcentaje FROM m_impuesto WHERE activo = true ORDER BY id ASC');
    const defaultImpuestoId = impRes.rows.length > 0 ? impRes.rows[0].id : 1;

    await client.query('BEGIN');

    let creados = 0;
    let actualizados = 0;
    let omitidos = 0;
    const detalles: { producto: string; accion: string; presentaciones: number }[] = [];

    for (const item of items) {
      const nombre = String(item.nombre || '').trim();
      if (!nombre) continue;

      const precioUsd = Math.max(0, Number(item.precio_usd) || 0);
      const stock = Math.max(0, Number(item.stock_actual) || 0);
      const costo = Math.max(0, Number(item.costo_promedio_usd) || 0);
      const unidadBase = String(item.unidad_base || 'Unidad').trim() || 'Unidad';
      const impuestoId = item.impuesto_id ? Number(item.impuesto_id) : defaultImpuestoId;

      // Buscar si el producto ya existe (por nombre case-insensitive)
      const existing = await client.query(
        'SELECT id, nombre, precio_usd, stock_actual, unidad_base FROM m_producto WHERE LOWER(TRIM(nombre)) = LOWER($1)',
        [nombre]
      );

      let productoId: number;

      if (existing.rows.length > 0) {
        if (modo === 'omitir') {
          omitidos++;
          detalles.push({ producto: nombre, accion: 'Omitido (ya existía)', presentaciones: 0 });
          continue;
        }

        // Actualizar producto existente
        productoId = existing.rows[0].id;
        await client.query(
          `UPDATE m_producto
           SET precio_usd = $1, stock_actual = $2, unidad_base = $3, impuesto_id = COALESCE($4, impuesto_id), activo = true
           WHERE id = $5`,
          [precioUsd, stock, unidadBase, impuestoId, productoId]
        );
        actualizados++;
      } else {
        // Crear nuevo producto
        const insertRes = await client.query(
          `INSERT INTO m_producto (nombre, precio_usd, stock_actual, costo_promedio_usd, unidad_base, impuesto_id, activo)
           VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
          [nombre, precioUsd, stock, costo, unidadBase, impuestoId]
        );
        productoId = insertRes.rows[0].id;
        creados++;
      }

      // Procesar presentaciones asociadas
      let presCount = 0;
      if (item.presentaciones && Array.isArray(item.presentaciones)) {
        for (const pres of item.presentaciones) {
          const presNombre = String(pres.nombre || '').trim();
          const presFactor = Number(pres.factor);
          const presPrecio = Math.max(0, Number(pres.precio_usd) || 0);

          if (!presNombre || !presFactor || presFactor <= 1) continue;

          // Ver si ya existe la presentación para este producto
          const existingPres = await client.query(
            'SELECT id FROM m_producto_presentacion WHERE producto_id = $1 AND LOWER(TRIM(nombre)) = LOWER($2)',
            [productoId, presNombre]
          );

          if (existingPres.rows.length > 0) {
            await client.query(
              `UPDATE m_producto_presentacion
               SET factor = $1, precio_usd = $2, activo = true
               WHERE id = $3`,
              [presFactor, presPrecio, existingPres.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO m_producto_presentacion (producto_id, nombre, factor, precio_usd, activo)
               VALUES ($1, $2, $3, $4, true)`,
              [productoId, presNombre, presFactor, presPrecio]
            );
          }
          presCount++;
        }
      }

      detalles.push({
        producto: nombre,
        accion: existing.rows.length > 0 ? 'Actualizado' : 'Creado',
        presentaciones: presCount,
      });
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Importación completada: ${creados} nuevos, ${actualizados} actualizados, ${omitidos} omitidos.`,
      stats: {
        total: items.length,
        creados,
        actualizados,
        omitidos,
      },
      detalles,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error al importar productos desde Excel:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Error en la importación de productos' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

