import { NextResponse } from 'next/server';
import { getPool, query } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import {
  AccountingError,
  resolveServerUnitPrice,
  validateBankAccountCurrency,
  voidLinkedDocumentPayments,
} from '@/lib/accounting';
import {
  calculateLineAmounts,
  calculateOrderTotals,
  round2,
  round3,
} from '@/lib/pos-calculations';

export interface OrderLineInput {
  producto_id: number;
  cantidad: number;
  precio_unitario_usd?: number;
  presentacion_id?: number | null;
  subtotal_usd?: number;
}

// GET orders list (with items count, customer info, taxes and totals)
export async function GET(req: Request) {
  const auth = await requireAuth(req, { permissions: ['orders', 'pos', 'reports'] });
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const orderId = searchParams.get('id');

    if (orderId) {
      // Get single order with its lines
      const orders = await query(
        `SELECT p.id, p.fecha_hora, p.tercero_id,
                COALESCE(p.estado, 'COMPLETADO') as estado,
                COALESCE(t.razon_social_nombre, p.cliente_nombre, 'Cliente Genérico') as cliente_nombre,
                t.identificacion as tercero_identificacion,
                t.telefono as cliente_telefono,
                p.tasa_cambio_aplicada,
                COALESCE(p.base_imponible_usd, p.total_usd)::numeric as base_imponible_usd,
                COALESCE(p.monto_impuesto_usd, 0)::numeric as monto_impuesto_usd,
                p.total_usd, p.total_moneda_local,
                COALESCE(p.condicion_pago, 'CONTADO') as condicion_pago,
                p.tipo_pago_id,
                tp.nombre as tipo_pago_nombre,
                tp.moneda as tipo_pago_moneda,
                p.referencia_pago,
                TO_CHAR(p.fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento
         FROM t_pedido p
         LEFT JOIN m_tercero t ON t.id = p.tercero_id
         LEFT JOIN m_tipopago tp ON tp.id = p.tipo_pago_id
         WHERE p.id = $1`,
        [Number(orderId)]
      );

      if (orders.length === 0) {
        return NextResponse.json({ success: false, message: 'Pedido no encontrado' }, { status: 404 });
      }

      const lines = await query(
        `SELECT l.id, l.producto_id, pr.nombre as producto_nombre, l.cantidad, l.precio_unitario_usd,
                l.impuesto_id, COALESCE(i.nombre, 'IVA') as impuesto_nombre,
                COALESCE(l.porcentaje_impuesto, i.porcentaje, 0)::numeric as porcentaje_impuesto,
                COALESCE(l.monto_impuesto_usd, 0)::numeric as monto_impuesto_usd,
                l.subtotal_usd,
                l.presentacion_id,
                COALESCE(l.presentacion_nombre, pr.unidad_base, 'Unidad') as presentacion_nombre,
                COALESCE(l.factor_conversion, 1)::numeric as factor_conversion,
                COALESCE(l.cantidad_base, l.cantidad)::numeric as cantidad_base
         FROM t_pedidolinea l
         JOIN m_producto pr ON pr.id = l.producto_id
         LEFT JOIN m_impuesto i ON i.id = l.impuesto_id
         WHERE l.pedido_id = $1
         ORDER BY l.id ASC`,
        [Number(orderId)]
      );

      return NextResponse.json({
        success: true,
        order: {
          ...orders[0],
          lineas: lines,
        },
      });
    }

    const orders = await query(
      `SELECT p.id, p.fecha_hora, p.tercero_id,
              COALESCE(p.estado, 'COMPLETADO') as estado,
              COALESCE(t.razon_social_nombre, p.cliente_nombre, 'Cliente Genérico') as cliente_nombre,
              t.identificacion as tercero_identificacion,
              p.tasa_cambio_aplicada,
              COALESCE(p.base_imponible_usd, p.total_usd)::numeric as base_imponible_usd,
              COALESCE(p.monto_impuesto_usd, 0)::numeric as monto_impuesto_usd,
              p.total_usd, p.total_moneda_local,
              COALESCE(p.condicion_pago, 'CONTADO') as condicion_pago,
              p.tipo_pago_id,
              tp.nombre as tipo_pago_nombre,
              tp.moneda as tipo_pago_moneda,
              p.referencia_pago,
              TO_CHAR(p.fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
              COUNT(l.id)::int as total_articulos
       FROM t_pedido p
       LEFT JOIN m_tercero t ON t.id = p.tercero_id
       LEFT JOIN m_tipopago tp ON tp.id = p.tipo_pago_id
       LEFT JOIN t_pedidolinea l ON l.pedido_id = p.id
       GROUP BY p.id, p.estado, t.razon_social_nombre, t.identificacion, t.telefono, tp.nombre, tp.moneda
       ORDER BY p.fecha_hora DESC
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al obtener pedidos',
      },
      { status: 500 }
    );
  }
}

// POST create order transaction with stock validation and inventory deduction
export async function POST(req: Request) {
  const auth = await requireAuth(req, { permissions: ['pos'] });
  if (!auth.ok) return auth.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = await req.json();
    const {
      tercero_id,
      cliente_nombre,
      tasa_cambio_aplicada,
      condicion_pago = 'CONTADO',
      tipo_pago_id = 1,
      referencia_pago = null,
      fecha_vencimiento = null,
      permitir_stock_negativo = false,
      cuenta_bancaria_id = null,
      registrar_pago = true,
      monto_pago = null,
      items,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'El pedido debe tener al menos un producto' },
        { status: 400 }
      );
    }

    const rate = Number(tasa_cambio_aplicada);
    if (!rate || isNaN(rate) || rate <= 0) {
      return NextResponse.json(
        { success: false, message: 'Tasa de cambio inválida para procesar la venta' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // 1. Resolve Customer (tercero_id)
    let assignedTerceroId = Number(tercero_id);
    let finalClienteNombre = cliente_nombre ? String(cliente_nombre).trim() : null;

    if (!assignedTerceroId) {
      // Find generic customer (default id 1 or search by 'V-00000000')
      const genRes = await client.query(
        "SELECT id, razon_social_nombre FROM m_tercero WHERE id = 1 OR identificacion = 'V-00000000' LIMIT 1"
      );
      if (genRes.rows.length > 0) {
        assignedTerceroId = genRes.rows[0].id;
        if (!finalClienteNombre) finalClienteNombre = genRes.rows[0].razon_social_nombre;
      } else {
        assignedTerceroId = 1;
      }
    } else {
      const custRes = await client.query('SELECT razon_social_nombre FROM m_tercero WHERE id = $1', [assignedTerceroId]);
      if (custRes.rows.length > 0 && !finalClienteNombre) {
        finalClienteNombre = custRes.rows[0].razon_social_nombre;
      }
    }

    // 2. Validate products (ordenados por producto_id para evitar deadlocks en FOR UPDATE), check stock, calculate taxes
    const orderedItems = [...items].sort((a, b) => Number(a.producto_id) - Number(b.producto_id));

    const validatedLines: {
      producto_id: number;
      cantidad: number;
      precio_unitario_usd: number;
      impuesto_id: number;
      porcentaje_impuesto: number;
      monto_impuesto_usd: number;
      subtotal_usd: number;
      presentacion_id: number | null;
      presentacion_nombre: string;
      factor_conversion: number;
      cantidad_base: number;
    }[] = [];

    for (const item of orderedItems) {
      const pId = Number(item.producto_id);
      const qty = Number(item.cantidad);
      const presId = item.presentacion_id ? Number(item.presentacion_id) : null;

      if (!pId || !Number.isFinite(qty) || qty <= 0) {
        throw new AccountingError(400, 'Detalles de línea de pedido inválidos.');
      }

      // Lock product for atomic stock check, server price lookup, and discount
      const prodRes = await client.query(
        `SELECT p.id, p.nombre, p.precio_usd, p.stock_actual, p.impuesto_id, p.activo,
                COALESCE(p.unidad_base, 'Unidad') as unidad_base,
                COALESCE(i.porcentaje, 16.00)::numeric as impuesto_porcentaje
         FROM m_producto p
         LEFT JOIN m_impuesto i ON i.id = p.impuesto_id
         WHERE p.id = $1 FOR UPDATE OF p`,
        [pId]
      );

      if (prodRes.rows.length === 0) {
        throw new AccountingError(404, `Producto #${pId} no encontrado en la base de datos.`);
      }

      const prod = prodRes.rows[0];
      if (prod.activo === false) {
        throw new AccountingError(
          400,
          `El producto "${prod.nombre}" está inactivo y no puede venderse.`
        );
      }

      const stockDisponible = Number(prod.stock_actual) || 0;

      // Resolver presentación y precio oficial desde BD (null = unidad base, factor 1)
      let factor = 1;
      let presNombre = String(prod.unidad_base);
      let presRow: { precio_usd: unknown } | null = null;
      if (presId) {
        const presRes = await client.query(
          'SELECT nombre, factor, precio_usd FROM m_producto_presentacion WHERE id = $1 AND producto_id = $2',
          [presId, pId]
        );
        if (presRes.rows.length === 0) {
          throw new AccountingError(
            400,
            `La presentación seleccionada para "${prod.nombre}" no existe.`
          );
        }
        factor = Number(presRes.rows[0].factor);
        presNombre = String(presRes.rows[0].nombre);
        presRow = presRes.rows[0];
      }
      const unitPrice = resolveServerUnitPrice(prod.precio_usd, presRow);
      const qtyBase = round3(qty * factor);

      // Check stock availability (en unidad base)
      if (!permitir_stock_negativo && stockDisponible < qtyBase) {
        throw new AccountingError(
          400,
          `Stock insuficiente para "${prod.nombre}". Solicitado: ${qty} ${presNombre} (${qtyBase} ${prod.unidad_base}), disponible: ${stockDisponible} ${prod.unidad_base}.`
        );
      }

      const taxId = prod.impuesto_id || 1;
      const taxPercent =
        prod.impuesto_porcentaje !== null && prod.impuesto_porcentaje !== undefined
          ? Number(prod.impuesto_porcentaje)
          : 0;
      const { subtotalUsd: subtotal, montoImpuestoUsd: lineTax } = calculateLineAmounts(
        unitPrice,
        qty,
        taxPercent
      );

      validatedLines.push({
        producto_id: pId,
        cantidad: qty,
        precio_unitario_usd: unitPrice,
        impuesto_id: taxId,
        porcentaje_impuesto: taxPercent,
        monto_impuesto_usd: lineTax,
        subtotal_usd: subtotal,
        presentacion_id: presId,
        presentacion_nombre: presNombre,
        factor_conversion: factor,
        cantidad_base: qtyBase,
      });

      // Deduct inventory (unidad base)
      await client.query(
        'UPDATE m_producto SET stock_actual = stock_actual - $1 WHERE id = $2',
        [qtyBase, pId]
      );
    }

    const orderTotals = calculateOrderTotals(
      validatedLines.map((l) => ({
        precioUnitarioUsd: l.precio_unitario_usd,
        cantidad: l.cantidad,
        porcentajeImpuesto: l.porcentaje_impuesto,
      })),
      rate
    );

    const calculatedBaseUsd = orderTotals.baseImponibleUsd;
    const calculatedTaxUsd = orderTotals.montoImpuestoUsd;
    const totalUsd = orderTotals.totalUsd;
    const totalLocal = orderTotals.totalLocal;

    const isContado = condicion_pago === 'CONTADO';
    const hasExplicitPaymentFlag = Boolean(registrar_pago);
    const parsedMontoPago =
      monto_pago !== null && monto_pago !== undefined && monto_pago !== ''
        ? Number(monto_pago)
        : null;

    // Regla de negocio: en crédito con "registrar abono inicial" activo, exigir abono > 0 y < total
    if (!isContado && hasExplicitPaymentFlag) {
      if (parsedMontoPago === null || !Number.isFinite(parsedMontoPago) || parsedMontoPago <= 0) {
        throw new AccountingError(
          400,
          'En ventas a crédito con abono inicial, debes ingresar un monto de abono mayor a 0.'
        );
      }
    }

    const shouldRegisterPayment = isContado
      ? hasExplicitPaymentFlag
      : hasExplicitPaymentFlag && parsedMontoPago !== null && parsedMontoPago > 0;

    const effectiveTipoPagoId = shouldRegisterPayment
      ? Number(tipo_pago_id || 1)
      : null;
    const trimmedReferencia =
      shouldRegisterPayment && referencia_pago ? String(referencia_pago).trim() || null : null;

    // Validar método de pago, referencia, tope de monto y cuenta bancaria ANTES de insertar el pedido
    let resolvedTpMoneda = 'USD';
    let pagoOriginal = 0;
    let pagoEquivUsd = 0;

    if (shouldRegisterPayment) {
      const tpRes = await client.query(
        'SELECT id, nombre, moneda, requiere_referencia FROM m_tipopago WHERE id = $1',
        [effectiveTipoPagoId]
      );
      if (tpRes.rows.length === 0) {
        throw new AccountingError(400, 'El método de pago seleccionado no existe.');
      }

      const tp = tpRes.rows[0];
      resolvedTpMoneda = String(tp.moneda);

      if (Boolean(tp.requiere_referencia) && !trimmedReferencia) {
        throw new AccountingError(
          400,
          `El método de pago "${tp.nombre || effectiveTipoPagoId}" requiere número de referencia.`
        );
      }

      if (cuenta_bancaria_id) {
        await validateBankAccountCurrency(client, Number(cuenta_bancaria_id), resolvedTpMoneda);
      }

      const maxAllowed = resolvedTpMoneda === 'VES' ? totalLocal : totalUsd;

      if (parsedMontoPago !== null) {
        if (!Number.isFinite(parsedMontoPago) || parsedMontoPago <= 0) {
          throw new AccountingError(400, 'El monto de pago debe ser mayor a 0.');
        }
        if (!isContado && parsedMontoPago >= maxAllowed - 0.005) {
          throw new AccountingError(
            400,
            `El abono inicial (${parsedMontoPago.toFixed(2)}) debe ser menor al total del pedido (${maxAllowed.toFixed(2)} ${resolvedTpMoneda}). Para pago completo usa condición Contado.`
          );
        }
        if (isContado && parsedMontoPago > maxAllowed + 0.01) {
          throw new AccountingError(
            400,
            `El monto del pago (${parsedMontoPago.toFixed(2)}) no puede superar el total del pedido (${maxAllowed.toFixed(2)} ${resolvedTpMoneda}).`
          );
        }
        pagoOriginal = round2(parsedMontoPago);
      } else {
        pagoOriginal = maxAllowed;
      }

      pagoEquivUsd =
        resolvedTpMoneda === 'VES' ? round2(pagoOriginal / rate) : pagoOriginal;
    }

    // 3. Insert t_pedido
    const insertPedidoSql = `
      INSERT INTO t_pedido (
        tercero_id, cliente_nombre, tasa_cambio_aplicada,
        base_imponible_usd, monto_impuesto_usd, total_usd, total_moneda_local,
        condicion_pago, tipo_pago_id, referencia_pago, fecha_vencimiento, estado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETADO')
      RETURNING *;
    `;

    const pedidoRes = await client.query(insertPedidoSql, [
      assignedTerceroId,
      finalClienteNombre,
      rate,
      calculatedBaseUsd,
      calculatedTaxUsd,
      totalUsd,
      totalLocal,
      condicion_pago,
      effectiveTipoPagoId,
      trimmedReferencia,
      fecha_vencimiento ? String(fecha_vencimiento).trim() : null,
    ]);

    const nuevoPedido = pedidoRes.rows[0];

    // Si corresponde registrar cobro o abono inicial, crear registro en t_pago y t_pago_documento
    if (shouldRegisterPayment) {
      const tipoOperacion = isContado ? 'COBRO_VENTA' : 'ABONO_VENTA';

      const pagoRes = await client.query(
        `INSERT INTO t_pago (
          tipo_operacion, pedido_id, tercero_id, tipo_pago_id, cuenta_bancaria_id,
          moneda, monto_original, tasa_cambio, monto_equivalente_usd,
          referencia, estado, creado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APROBADO', $11)
        RETURNING id`,
        [
          tipoOperacion,
          nuevoPedido.id,
          assignedTerceroId,
          effectiveTipoPagoId,
          cuenta_bancaria_id ? Number(cuenta_bancaria_id) : null,
          resolvedTpMoneda,
          pagoOriginal,
          rate,
          pagoEquivUsd,
          trimmedReferencia,
          auth.session.user.id,
        ]
      );

      const nuevoPagoId = pagoRes.rows[0].id;

      // Imputar pago a la factura/pedido creado en t_pago_documento
      await client.query(
        `INSERT INTO t_pago_documento (
          pago_id, tipo_documento, pedido_id,
          monto_imputado_original, monto_imputado_usd
        ) VALUES ($1, 'VENTA', $2, $3, $4)`,
        [nuevoPagoId, nuevoPedido.id, pagoOriginal, pagoEquivUsd]
      );

      // Actualizar saldo de cuenta/caja receptora si fue seleccionada
      if (cuenta_bancaria_id) {
        await client.query(
          'UPDATE m_cuentabancaria SET saldo_actual = saldo_actual + $1 WHERE id = $2',
          [pagoOriginal, Number(cuenta_bancaria_id)]
        );
      }
    }

    // 4. Insert t_pedidolinea
    for (const line of validatedLines) {
      await client.query(
        `INSERT INTO t_pedidolinea (
          pedido_id, producto_id, cantidad, precio_unitario_usd,
          impuesto_id, porcentaje_impuesto, monto_impuesto_usd, subtotal_usd,
          presentacion_id, presentacion_nombre, factor_conversion, cantidad_base
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          nuevoPedido.id,
          line.producto_id,
          line.cantidad,
          line.precio_unitario_usd,
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
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      order: nuevoPedido,
      message: 'Venta registrada e inventario actualizado con éxito',
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error inserting order:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al procesar la venta',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// PATCH change order status (COMPLETADO, ANULADO)
export async function PATCH(req: Request) {
  const auth = await requireAuth(req, { permissions: ['orders'] });
  if (!auth.ok) return auth.response;

  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = await req.json();
    const { id, estado } = body;

    if (!id || !estado) {
      return NextResponse.json(
        { success: false, message: 'ID y estado son obligatorios' },
        { status: 400 }
      );
    }

    const validEstados = ['COMPLETADO', 'ANULADO'];
    if (!validEstados.includes(estado)) {
      return NextResponse.json(
        { success: false, message: 'Estado no válido. Use: COMPLETADO o ANULADO' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // Fetch order with row lock
    const orderRes = await client.query('SELECT * FROM t_pedido WHERE id = $1 FOR UPDATE', [Number(id)]);
    if (orderRes.rows.length === 0) {
      throw new AccountingError(404, 'Pedido no encontrado');
    }

    const pedido = orderRes.rows[0];
    const estadoAnterior = String(pedido.estado || 'COMPLETADO');
    const nuevoEstado = String(estado);

    if (estadoAnterior === nuevoEstado) {
      await client.query('COMMIT');
      return NextResponse.json({
        success: true,
        message: `El pedido ya se encuentra en estado ${nuevoEstado}`,
      });
    }

    if (estadoAnterior === 'ANULADO' && nuevoEstado === 'COMPLETADO') {
      throw new AccountingError(
        400,
        'No se puede reactivar un pedido anulado porque sus pagos ya fueron revertidos. Registre una nueva venta.'
      );
    }

    // Fetch order lines
    const linesRes = await client.query(
      'SELECT producto_id, COALESCE(cantidad_base, cantidad) as cantidad FROM t_pedidolinea WHERE pedido_id = $1',
      [Number(id)]
    );

    // Si se ANULA un pedido que estaba COMPLETADO: RESTAURAR inventario y anular pagos vinculados
    if (estadoAnterior === 'COMPLETADO' && nuevoEstado === 'ANULADO') {
      for (const line of linesRes.rows) {
        const prodId = Number(line.producto_id);
        await client.query('SELECT id FROM m_producto WHERE id = $1 FOR UPDATE', [prodId]);
        await client.query(
          'UPDATE m_producto SET stock_actual = stock_actual + $1 WHERE id = $2',
          [Number(line.cantidad), prodId]
        );
      }

      await voidLinkedDocumentPayments(client, {
        tipo: 'VENTA',
        docId: Number(id),
        userId: auth.session.user.id,
      });
    }

    // Actualizar estado del pedido
    await client.query('UPDATE t_pedido SET estado = $1 WHERE id = $2', [nuevoEstado, Number(id)]);

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: 'Pedido anulado, stock devuelto al inventario y pagos revertidos con éxito',
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error updating order status:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al cambiar estado del pedido',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

