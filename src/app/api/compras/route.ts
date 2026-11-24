import { NextResponse } from 'next/server';
import { getPool, query } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import {
  AccountingError,
  calculateWeightedAverageCost,
  validateBankAccountCurrency,
  voidLinkedDocumentPayments,
} from '@/lib/accounting';

export interface PurchaseLineInput {
  producto_id: number;
  cantidad: number;
  costo_unitario_usd: number;
  impuesto_id: number;
  presentacion_id?: number | null;
}

// GET purchases list or single purchase with lines
export async function GET(req: Request) {
  const auth = await requireAuth(req, { permissions: ['compras'] });
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const purchaseId = searchParams.get('id');

    if (purchaseId) {
      const purchases = await query(
        `SELECT c.id, c.numero_factura, c.tercero_id, 
                t.razon_social_nombre as proveedor_nombre,
                t.identificacion as proveedor_identificacion,
                t.telefono as proveedor_telefono,
                TO_CHAR(c.fecha_emision, 'YYYY-MM-DD') as fecha_emision,
                c.tasa_cambio_aplicada,
                c.base_imponible_usd, c.monto_impuesto_usd, c.total_usd, c.total_moneda_local,
                COALESCE(c.condicion_pago, 'CONTADO') as condicion_pago,
                c.tipo_pago_id,
                tp.nombre as tipo_pago_nombre,
                tp.moneda as tipo_pago_moneda,
                c.referencia_pago,
                TO_CHAR(c.fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
                c.observaciones, c.estado, c.creado_en
         FROM t_compra c
         JOIN m_tercero t ON t.id = c.tercero_id
         LEFT JOIN m_tipopago tp ON tp.id = c.tipo_pago_id
         WHERE c.id = $1`,
        [Number(purchaseId)]
      );

      if (purchases.length === 0) {
        return NextResponse.json({ success: false, message: 'Factura de compra no encontrada' }, { status: 404 });
      }

      const lines = await query(
        `SELECT l.id, l.producto_id, p.nombre as producto_nombre, l.cantidad, l.costo_unitario_usd,
                l.impuesto_id, i.nombre as impuesto_nombre, l.porcentaje_impuesto, l.monto_impuesto_usd,
                l.subtotal_usd,
                l.presentacion_id,
                COALESCE(l.presentacion_nombre, p.unidad_base, 'Unidad') as presentacion_nombre,
                COALESCE(l.factor_conversion, 1)::numeric as factor_conversion,
                COALESCE(l.cantidad_base, l.cantidad)::numeric as cantidad_base
         FROM t_compralinea l
         JOIN m_producto p ON p.id = l.producto_id
         JOIN m_impuesto i ON i.id = l.impuesto_id
         WHERE l.compra_id = $1
         ORDER BY l.id ASC`,
        [Number(purchaseId)]
      );

      return NextResponse.json({
        success: true,
        purchase: {
          ...purchases[0],
          lineas: lines,
        },
      });
    }

    const purchases = await query(
      `SELECT c.id, c.numero_factura, c.tercero_id,
              t.razon_social_nombre as proveedor_nombre,
              t.identificacion as proveedor_identificacion,
              TO_CHAR(c.fecha_emision, 'YYYY-MM-DD') as fecha_emision,
              c.tasa_cambio_aplicada,
              c.base_imponible_usd, c.monto_impuesto_usd, c.total_usd, c.total_moneda_local,
              COALESCE(c.condicion_pago, 'CONTADO') as condicion_pago,
              c.tipo_pago_id,
              tp.nombre as tipo_pago_nombre,
              tp.moneda as tipo_pago_moneda,
              c.referencia_pago,
              TO_CHAR(c.fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
              c.observaciones, c.estado, c.creado_en,
              COUNT(l.id)::int as total_articulos
       FROM t_compra c
       JOIN m_tercero t ON t.id = c.tercero_id
       LEFT JOIN m_tipopago tp ON tp.id = c.tipo_pago_id
       LEFT JOIN t_compralinea l ON l.compra_id = c.id
       GROUP BY c.id, t.razon_social_nombre, t.identificacion, tp.nombre, tp.moneda
       ORDER BY c.fecha_emision DESC, c.id DESC
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json({ success: true, purchases });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al obtener facturas de compra',
      },
      { status: 500 }
    );
  }
}

// POST register purchase and update inventory + average cost
export async function POST(req: Request) {
  const auth = await requireAuth(req, { permissions: ['compras'] });
  if (!auth.ok) return auth.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = await req.json();
    const {
      numero_factura,
      tercero_id,
      fecha_emision,
      tasa_cambio_aplicada,
      condicion_pago = 'CONTADO',
      tipo_pago_id = 1,
      referencia_pago = null,
      fecha_vencimiento = null,
      observaciones,
      estado = 'COMPLETADO',
      cuenta_bancaria_id = null,
      registrar_pago = true,
      items,
    } = body;

    const validEstados = ['PROCESO', 'COMPLETADO', 'ANULADO'];
    const estadoDoc = validEstados.includes(estado) ? estado : 'COMPLETADO';

    if (!numero_factura || !String(numero_factura).trim()) {
      return NextResponse.json(
        { success: false, message: 'El número de factura del proveedor es obligatorio' },
        { status: 400 }
      );
    }

    const supplierId = Number(tercero_id);
    if (!supplierId) {
      return NextResponse.json(
        { success: false, message: 'Debe seleccionar un proveedor válido' },
        { status: 400 }
      );
    }

    // Verify supplier exists and is PROVEEDOR or AMBOS
    const supplierCheck = await client.query(
      'SELECT id, tipo, razon_social_nombre FROM m_tercero WHERE id = $1',
      [supplierId]
    );

    if (supplierCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'El proveedor seleccionado no existe' },
        { status: 400 }
      );
    }

    const supplier = supplierCheck.rows[0];
    if (supplier.tipo !== 'PROVEEDOR' && supplier.tipo !== 'AMBOS') {
      return NextResponse.json(
        { success: false, message: 'El tercero seleccionado debe tener rol de PROVEEDOR' },
        { status: 400 }
      );
    }

    const rate = Number(tasa_cambio_aplicada);
    if (!rate || isNaN(rate) || rate <= 0) {
      return NextResponse.json(
        { success: false, message: 'Tasa de cambio inválida para registrar la compra' },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'La factura de compra debe contener al menos un producto' },
        { status: 400 }
      );
    }

    const issueDate = fecha_emision ? String(fecha_emision) : new Date().toISOString().split('T')[0];

    // Fetch taxes map
    const taxesRes = await client.query('SELECT id, porcentaje FROM m_impuesto');
    const taxMap = new Map<number, number>();
    for (const t of taxesRes.rows) {
      taxMap.set(Number(t.id), Number(t.porcentaje));
    }

    await client.query('BEGIN');

    let totalBaseUsd = 0;
    let totalTaxUsd = 0;

    const validatedLines: {
      producto_id: number;
      cantidad: number;
      costo_unitario_usd: number;
      impuesto_id: number;
      porcentaje_impuesto: number;
      monto_impuesto_usd: number;
      subtotal_usd: number;
      presentacion_id: number | null;
      presentacion_nombre: string;
      factor_conversion: number;
      cantidad_base: number;
    }[] = [];

    for (const item of items) {
      const pId = Number(item.producto_id);
      const qty = Number(item.cantidad);
      const unitCost = Number(item.costo_unitario_usd);
      const taxId = Number(item.impuesto_id) || 1;
      const presId = item.presentacion_id ? Number(item.presentacion_id) : null;

      if (!pId || qty <= 0 || unitCost < 0) {
        throw new Error(`Datos inválidos en el producto ID ${pId}: cantidad o costo incorrecto.`);
      }

      // Resolver presentación (null = unidad base)
      let factor = 1;
      let presNombre = 'Unidad';
      if (presId) {
        const presRes = await client.query(
          'SELECT nombre, factor FROM m_producto_presentacion WHERE id = $1 AND producto_id = $2',
          [presId, pId]
        );
        if (presRes.rows.length === 0) {
          throw new Error(`La presentación seleccionada para el producto ID ${pId} no existe.`);
        }
        factor = Number(presRes.rows[0].factor);
        presNombre = String(presRes.rows[0].nombre);
      } else {
        const ub = await client.query("SELECT COALESCE(unidad_base, 'Unidad') as u FROM m_producto WHERE id = $1", [pId]);
        if (ub.rows.length > 0) presNombre = String(ub.rows[0].u);
      }

      const taxPercent = taxMap.has(taxId) ? taxMap.get(taxId)! : 16.0;
      const subtotal = Number((qty * unitCost).toFixed(2));
      const lineTax = Number(((subtotal * taxPercent) / 100).toFixed(2));

      totalBaseUsd += subtotal;
      totalTaxUsd += lineTax;

      validatedLines.push({
        producto_id: pId,
        cantidad: qty,
        costo_unitario_usd: unitCost,
        impuesto_id: taxId,
        porcentaje_impuesto: taxPercent,
        monto_impuesto_usd: lineTax,
        subtotal_usd: subtotal,
        presentacion_id: presId,
        presentacion_nombre: presNombre,
        factor_conversion: factor,
        cantidad_base: Number((qty * factor).toFixed(3)),
      });
    }

    totalBaseUsd = Number(totalBaseUsd.toFixed(2));
    totalTaxUsd = Number(totalTaxUsd.toFixed(2));
    const totalUsd = Number((totalBaseUsd + totalTaxUsd).toFixed(2));
    const totalLocal = Number((totalUsd * rate).toFixed(2));

    // 1. Insert t_compra
    const insertCompraSql = `
      INSERT INTO t_compra (
        numero_factura, tercero_id, fecha_emision, tasa_cambio_aplicada,
        base_imponible_usd, monto_impuesto_usd, total_usd, total_moneda_local,
        condicion_pago, tipo_pago_id, referencia_pago, fecha_vencimiento, observaciones, estado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `;

    const compraRes = await client.query(insertCompraSql, [
      String(numero_factura).trim(),
      supplierId,
      issueDate,
      rate,
      totalBaseUsd,
      totalTaxUsd,
      totalUsd,
      totalLocal,
      condicion_pago,
      tipo_pago_id ? Number(tipo_pago_id) : 1,
      referencia_pago ? String(referencia_pago).trim() : null,
      fecha_vencimiento ? String(fecha_vencimiento).trim() : null,
      observaciones ? String(observaciones).trim() : null,
      estadoDoc,
    ]);

    const nuevaCompra = compraRes.rows[0];

    // Registrar en t_pago y t_pago_documento si registrar_pago es true y es contado
    if (registrar_pago && condicion_pago === 'CONTADO' && estadoDoc === 'COMPLETADO') {
      const tpRes = await client.query('SELECT id, moneda FROM m_tipopago WHERE id = $1', [
        Number(tipo_pago_id || 1),
      ]);
      if (tpRes.rows.length === 0) {
        throw new AccountingError(400, 'El método de pago seleccionado no existe.');
      }
      const tpMoneda = String(tpRes.rows[0].moneda);
      if (cuenta_bancaria_id) {
        await validateBankAccountCurrency(client, Number(cuenta_bancaria_id), tpMoneda);
      }

      const pagoOriginal = tpMoneda === 'VES' ? totalLocal : totalUsd;
      const pagoEquivUsd = tpMoneda === 'VES' ? Number((pagoOriginal / rate).toFixed(2)) : pagoOriginal;

      const pagoRes = await client.query(
        `INSERT INTO t_pago (
          tipo_operacion, compra_id, tercero_id, tipo_pago_id, cuenta_bancaria_id,
          moneda, monto_original, tasa_cambio, monto_equivalente_usd,
          referencia, estado, creado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APROBADO', $11)
        RETURNING id`,
        [
          'PAGO_COMPRA',
          nuevaCompra.id,
          supplierId,
          Number(tipo_pago_id || 1),
          cuenta_bancaria_id ? Number(cuenta_bancaria_id) : null,
          tpMoneda,
          pagoOriginal,
          rate,
          pagoEquivUsd,
          referencia_pago ? String(referencia_pago).trim() : null,
          auth.session.user.id,
        ]
      );

      const nuevoPagoId = pagoRes.rows[0].id;

      await client.query(
        `INSERT INTO t_pago_documento (
          pago_id, tipo_documento, compra_id,
          monto_imputado_original, monto_imputado_usd
        ) VALUES ($1, 'COMPRA', $2, $3, $4)`,
        [nuevoPagoId, nuevaCompra.id, pagoOriginal, pagoEquivUsd]
      );

      // Descontar saldo de la cuenta emisora de la compra
      if (cuenta_bancaria_id) {
        await client.query(
          'UPDATE m_cuentabancaria SET saldo_actual = saldo_actual - $1 WHERE id = $2',
          [pagoOriginal, Number(cuenta_bancaria_id)]
        );
      }
    }

    // 2. Insert lines
    for (const line of validatedLines) {
      await client.query(
        `INSERT INTO t_compralinea (
          compra_id, producto_id, cantidad, costo_unitario_usd, impuesto_id,
          porcentaje_impuesto, monto_impuesto_usd, subtotal_usd,
          presentacion_id, presentacion_nombre, factor_conversion, cantidad_base
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          nuevaCompra.id,
          line.producto_id,
          line.cantidad,
          line.costo_unitario_usd,
          line.impuesto_id,
          line.porcentaje_impuesto,
          line.monto_impuesto_usd,
          line.subtotal_usd,
          line.presentacion_id,
          line.presentacion_nombre,
          line.factor_conversion,
          line.cantidad_base,
        ]
      );

      // Si el estado es COMPLETADO, suma inventario y recalcula costo promedio inmediatamente
      if (estadoDoc === 'COMPLETADO') {
        const prodRes = await client.query(
          'SELECT id, stock_actual, costo_promedio_usd FROM m_producto WHERE id = $1 FOR UPDATE',
          [line.producto_id]
        );

        if (prodRes.rows.length === 0) {
          throw new Error(`Producto con ID ${line.producto_id} no existe en catálogo.`);
        }

        const prod = prodRes.rows[0];
        const cantComprada = line.cantidad_base;
        const nuevoCostoPromedio = calculateWeightedAverageCost({
          stockAnterior: Number(prod.stock_actual) || 0,
          costoAnterior: Number(prod.costo_promedio_usd) || 0,
          cantidadBaseComprada: cantComprada,
          costoUnitarioPresentacion: line.costo_unitario_usd,
          factorConversion: line.factor_conversion,
        });

        await client.query(
          `UPDATE m_producto
           SET stock_actual = stock_actual + $1,
               costo_promedio_usd = $2
           WHERE id = $3`,
          [cantComprada, nuevoCostoPromedio, line.producto_id]
        );
      }
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      purchase: nuevaCompra,
      message:
        estadoDoc === 'COMPLETADO'
          ? 'Factura de compra registrada e inventario incrementado con éxito'
          : `Factura de compra registrada en estado ${estadoDoc}`,
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error inserting purchase:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al procesar la factura de compra',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// PATCH change purchase status (PROCESO, COMPLETADO, ANULADO)
export async function PATCH(req: Request) {
  const auth = await requireAuth(req, { permissions: ['compras'] });
  if (!auth.ok) return auth.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = await req.json();
    const { id, estado } = body;

    if (!id || !estado) {
      return NextResponse.json(
        { success: false, message: 'ID y nuevo estado son obligatorios' },
        { status: 400 }
      );
    }

    const validEstados = ['PROCESO', 'COMPLETADO', 'ANULADO'];
    if (!validEstados.includes(estado)) {
      return NextResponse.json(
        { success: false, message: 'Estado no válido. Use: PROCESO, COMPLETADO o ANULADO' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // Fetch current purchase
    const compRes = await client.query('SELECT * FROM t_compra WHERE id = $1 FOR UPDATE', [Number(id)]);
    if (compRes.rows.length === 0) {
      throw new AccountingError(404, 'Factura de compra no encontrada');
    }

    const compra = compRes.rows[0];
    const estadoAnterior = String(compra.estado);
    const nuevoEstado = String(estado);

    if (estadoAnterior === nuevoEstado) {
      await client.query('COMMIT');
      return NextResponse.json({ success: true, message: `La compra ya se encuentra en estado ${nuevoEstado}` });
    }

    if (estadoAnterior === 'ANULADO') {
      throw new AccountingError(
        400,
        'No se puede reactivar una compra anulada. Registre una nueva factura de compra.'
      );
    }

    // Fetch purchase lines
    const linesRes = await client.query(
      'SELECT producto_id, COALESCE(cantidad_base, cantidad) as cantidad, costo_unitario_usd, COALESCE(factor_conversion, 1) as factor_conversion FROM t_compralinea WHERE compra_id = $1',
      [Number(id)]
    );

    // Si pasa de PROCESO a COMPLETADO, sumar inventario y recalcular costo promedio ponderado
    if (estadoAnterior === 'PROCESO' && nuevoEstado === 'COMPLETADO') {
      for (const line of linesRes.rows) {
        const prodId = Number(line.producto_id);
        const prodRes = await client.query(
          'SELECT id, stock_actual, costo_promedio_usd FROM m_producto WHERE id = $1 FOR UPDATE',
          [prodId]
        );
        if (prodRes.rows.length === 0) {
          throw new AccountingError(404, `Producto con ID ${prodId} no existe en catálogo.`);
        }
        const prod = prodRes.rows[0];
        const cantComprada = Number(line.cantidad);
        const nuevoCostoPromedio = calculateWeightedAverageCost({
          stockAnterior: Number(prod.stock_actual) || 0,
          costoAnterior: Number(prod.costo_promedio_usd) || 0,
          cantidadBaseComprada: cantComprada,
          costoUnitarioPresentacion: Number(line.costo_unitario_usd) || 0,
          factorConversion: Number(line.factor_conversion) || 1,
        });
        await client.query(
          `UPDATE m_producto
           SET stock_actual = stock_actual + $1,
               costo_promedio_usd = $2
           WHERE id = $3`,
          [cantComprada, nuevoCostoPromedio, prodId]
        );
      }
    }

    // Si pasa de COMPLETADO a PROCESO, bloquear si existen pagos aprobados asociados
    if (estadoAnterior === 'COMPLETADO' && nuevoEstado === 'PROCESO') {
      const pagosRes = await client.query(
        `SELECT id FROM t_pago
         WHERE estado = 'APROBADO'
           AND (compra_id = $1 OR id IN (SELECT pago_id FROM t_pago_documento WHERE compra_id = $1))
         LIMIT 1`,
        [Number(id)]
      );
      if (pagosRes.rows.length > 0) {
        throw new AccountingError(
          409,
          'No se puede devolver a PROCESO una compra con pagos aprobados. Anule los pagos primero o anule la compra.'
        );
      }

      for (const line of linesRes.rows) {
        const prodId = Number(line.producto_id);
        await client.query('SELECT id FROM m_producto WHERE id = $1 FOR UPDATE', [prodId]);
        await client.query(
          'UPDATE m_producto SET stock_actual = stock_actual - $1 WHERE id = $2',
          [Number(line.cantidad), prodId]
        );
      }
    }

    // Si pasa a ANULADO, revertir inventario (si estaba COMPLETADO) y anular pagos vinculados
    if (nuevoEstado === 'ANULADO') {
      if (estadoAnterior === 'COMPLETADO') {
        for (const line of linesRes.rows) {
          const prodId = Number(line.producto_id);
          await client.query('SELECT id FROM m_producto WHERE id = $1 FOR UPDATE', [prodId]);
          await client.query(
            'UPDATE m_producto SET stock_actual = stock_actual - $1 WHERE id = $2',
            [Number(line.cantidad), prodId]
          );
        }
      }

      await voidLinkedDocumentPayments(client, {
        tipo: 'COMPRA',
        docId: Number(id),
        userId: auth.session.user.id,
      });
    }

    await client.query('UPDATE t_compra SET estado = $1 WHERE id = $2', [nuevoEstado, Number(id)]);

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Estado de la compra #${id} actualizado a ${nuevoEstado} exitosamente.`,
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error changing purchase state:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al actualizar estado de la compra',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
