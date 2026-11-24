import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { hasAnyPermission } from '@/lib/permissions';
import { getCaracasDayRangeIso, getCaracasMonthBounds } from '@/lib/bcv';
import {
  calculateFifoRentabilidad,
  calculateInventoryValuation,
  type FifoOrderLineInput,
  type FifoProductInput,
  type FifoPurchaseBatchInput,
  type FifoRentabilidadResult,
  type InventoryRowInput,
} from '@/services/fifo';

interface SalesReportRow {
  id: number;
  fecha_hora: string;
  tercero_id: number | null;
  cliente_nombre: string;
  cliente_identificacion: string | null;
  tasa_cambio_aplicada: number | string;
  base_imponible_usd: number | string;
  monto_impuesto_usd: number | string;
  total_usd: number | string;
  total_moneda_local: number | string;
  total_articulos: number;
  total_unidades: number | string;
  lineas: unknown[];
  base_imponible_bs?: number;
  monto_impuesto_bs?: number;
}

export async function GET(req: Request) {
  const auth = await requireAuth(req, { permissions: ['reports', 'reports_profit'] });
  if (!auth.ok) return auth.response;

  const canViewProfit = hasAnyPermission(auth.session.user, ['reports_profit']);

  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo') || 'resumen';

    if (!canViewProfit && tipo === 'rentabilidad') {
      return NextResponse.json(
        { success: false, message: 'No tienes permiso para acceder al reporte de rentabilidad.' },
        { status: 403 }
      );
    }

    const { firstDayOfMonth, today } = getCaracasMonthBounds();
    const fechaDesde = searchParams.get('desde') || firstDayOfMonth;
    const fechaHasta = searchParams.get('hasta') || today;
    const { startIso, endIso } = getCaracasDayRangeIso(fechaDesde, fechaHasta);

    // 1. REPORTE DE VENTAS POR RANGO DE FECHA
    const salesReportQuery = `
      SELECT 
        p.id,
        p.fecha_hora,
        p.tercero_id,
        COALESCE(t.razon_social_nombre, p.cliente_nombre, 'Cliente Genérico') as cliente_nombre,
        t.identificacion as cliente_identificacion,
        p.tasa_cambio_aplicada,
        COALESCE(p.base_imponible_usd, p.total_usd)::numeric as base_imponible_usd,
        COALESCE(p.monto_impuesto_usd, 0)::numeric as monto_impuesto_usd,
        p.total_usd::numeric,
        p.total_moneda_local::numeric,
        COUNT(l.id)::int as total_articulos,
        COALESCE(SUM(COALESCE(l.cantidad_base, l.cantidad)), 0)::numeric as total_unidades,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', l.id,
              'producto_id', l.producto_id,
              'producto_nombre', pr.nombre,
              'unidad_base', pr.unidad_base,
              'presentacion_nombre', l.presentacion_nombre,
              'factor_conversion', COALESCE(l.factor_conversion, 1),
              'cantidad', l.cantidad::numeric,
              'cantidad_base', COALESCE(l.cantidad_base, l.cantidad)::numeric,
              'precio_unitario_usd', l.precio_unitario_usd::numeric,
              'porcentaje_impuesto', COALESCE(l.porcentaje_impuesto, 0)::numeric,
              'monto_impuesto_usd', COALESCE(l.monto_impuesto_usd, 0)::numeric,
              'subtotal_usd', l.subtotal_usd::numeric
            ) ORDER BY l.id
          ) FILTER (WHERE l.id IS NOT NULL),
          '[]'::json
        ) as lineas
      FROM t_pedido p
      LEFT JOIN m_tercero t ON t.id = p.tercero_id
      LEFT JOIN t_pedidolinea l ON l.pedido_id = p.id
      LEFT JOIN m_producto pr ON pr.id = l.producto_id
      WHERE p.estado = 'COMPLETADO'
        AND p.fecha_hora >= $1 
        AND p.fecha_hora <= $2
      GROUP BY p.id, p.fecha_hora, p.tercero_id, t.razon_social_nombre, p.cliente_nombre, t.identificacion, p.tasa_cambio_aplicada, p.base_imponible_usd, p.monto_impuesto_usd, p.total_usd, p.total_moneda_local
      ORDER BY p.fecha_hora DESC
    `;

    const salesRows = (await query(salesReportQuery, [startIso, endIso])) as SalesReportRow[];

    for (const row of salesRows) {
      const tasa = Number(row.tasa_cambio_aplicada) || 1;
      const baseUsd = Number(row.base_imponible_usd) || 0;
      const ivaUsd = Number(row.monto_impuesto_usd) || 0;
      row.base_imponible_bs = Number((baseUsd * tasa).toFixed(2));
      row.monto_impuesto_bs = Number((ivaUsd * tasa).toFixed(2));
    }

    const totalVentasUsd = salesRows.reduce((acc, row) => acc + Number(row.total_usd || 0), 0);
    const totalVentasLocal = salesRows.reduce((acc, row) => acc + Number(row.total_moneda_local || 0), 0);
    const totalBaseUsd = salesRows.reduce((acc, row) => acc + Number(row.base_imponible_usd || 0), 0);
    const totalIvaUsd = salesRows.reduce((acc, row) => acc + Number(row.monto_impuesto_usd || 0), 0);
    const totalBaseLocal = salesRows.reduce((acc, row) => acc + Number(row.base_imponible_bs || 0), 0);
    const totalIvaLocal = salesRows.reduce((acc, row) => acc + Number(row.monto_impuesto_bs || 0), 0);
    const cantidadPedidos = salesRows.length;
    const ticketPromedioUsd = cantidadPedidos > 0 ? totalVentasUsd / cantidadPedidos : 0;
    const totalUnidadesVendidas = salesRows.reduce((acc, row) => acc + Number(row.total_unidades || 0), 0);

    const dailyBreakdownQuery = `
      SELECT 
        TO_CHAR(p.fecha_hora AT TIME ZONE 'America/Caracas', 'YYYY-MM-DD') as fecha,
        TO_CHAR(p.fecha_hora AT TIME ZONE 'America/Caracas', 'Dy DD Mon') as etiqueta,
        COUNT(p.id)::int as cantidad_ventas,
        COALESCE(SUM(p.total_usd), 0)::numeric as total_usd,
        COALESCE(SUM(p.total_moneda_local), 0)::numeric as total_local
      FROM t_pedido p
      WHERE p.estado = 'COMPLETADO'
        AND p.fecha_hora >= $1 
        AND p.fecha_hora <= $2
      GROUP BY TO_CHAR(p.fecha_hora AT TIME ZONE 'America/Caracas', 'YYYY-MM-DD'),
               TO_CHAR(p.fecha_hora AT TIME ZONE 'America/Caracas', 'Dy DD Mon')
      ORDER BY fecha ASC
    `;
    const dailyBreakdown = await query(dailyBreakdownQuery, [startIso, endIso]);

    // 2. REPORTE DE RENTABILIDAD FIFO (PEPS)
    let rentabilidadFifo: FifoRentabilidadResult | null = null;

    if (canViewProfit) {
      const [allProducts, purchaseBatches, allOrderLines] = await Promise.all([
        query(`
          SELECT id, nombre, costo_promedio_usd, precio_usd, stock_actual 
          FROM m_producto 
          ORDER BY id ASC
        `),
        query(`
          SELECT 
            cl.id as linea_id,
            c.id as compra_id,
            c.numero_factura,
            c.fecha_emision,
            c.creado_en,
            cl.producto_id,
            COALESCE(cl.cantidad_base, cl.cantidad)::numeric as cantidad,
            (cl.costo_unitario_usd / COALESCE(cl.factor_conversion, 1))::numeric as costo_unitario_usd
          FROM t_compra c
          JOIN t_compralinea cl ON cl.compra_id = c.id
          WHERE COALESCE(c.estado, 'COMPLETADO') = 'COMPLETADO'
          ORDER BY c.fecha_emision ASC, c.id ASC, cl.id ASC
        `),
        query(`
          SELECT 
            l.id as linea_id,
            p.id as pedido_id,
            p.fecha_hora,
            p.tasa_cambio_aplicada,
            COALESCE(t.razon_social_nombre, p.cliente_nombre, 'Cliente Genérico') as cliente_nombre,
            l.producto_id,
            pr.nombre as producto_nombre,
            l.cantidad::numeric,
            COALESCE(l.cantidad_base, l.cantidad)::numeric as cantidad_base,
            l.precio_unitario_usd::numeric,
            l.subtotal_usd::numeric,
            l.presentacion_nombre,
            COALESCE(pr.unidad_base, 'Unidad') as unidad_base
          FROM t_pedido p
          JOIN t_pedidolinea l ON l.pedido_id = p.id
          JOIN m_producto pr ON pr.id = l.producto_id
          LEFT JOIN m_tercero t ON t.id = p.tercero_id
          WHERE p.estado = 'COMPLETADO'
          ORDER BY p.fecha_hora ASC, p.id ASC, l.id ASC
        `),
      ]);

      rentabilidadFifo = calculateFifoRentabilidad({
        products: allProducts as unknown as FifoProductInput[],
        purchaseBatches: purchaseBatches as unknown as FifoPurchaseBatchInput[],
        orderLines: allOrderLines as unknown as FifoOrderLineInput[],
        startIso,
        endIso,
      });
    }

    // 3. REPORTE DE INVENTARIO Y VALORIZACIÓN
    const inventoryQuery = `
      SELECT 
        p.id,
        p.nombre,
        p.precio_usd,
        COALESCE(p.stock_actual, 0)::numeric as stock_actual,
        COALESCE(p.costo_promedio_usd, 0)::numeric as costo_promedio_usd,
        COALESCE(p.unidad_base, 'Unidad') as unidad_base,
        p.activo,
        p.impuesto_id,
        COALESCE(i.nombre, 'IVA 16%') as impuesto_nombre,
        COALESCE(i.porcentaje, 16.00)::numeric as impuesto_porcentaje,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pr.id,
              'nombre', pr.nombre,
              'factor', pr.factor,
              'precio_usd', pr.precio_usd
            ) ORDER BY pr.factor ASC
          ) FILTER (WHERE pr.id IS NOT NULL AND pr.activo = TRUE),
          '[]'::json
        ) as presentaciones
      FROM m_producto p
      LEFT JOIN m_impuesto i ON i.id = p.impuesto_id
      LEFT JOIN m_producto_presentacion pr ON pr.producto_id = p.id
      GROUP BY p.id, p.nombre, p.precio_usd, p.stock_actual, p.costo_promedio_usd, p.unidad_base, p.activo, p.impuesto_id, i.nombre, i.porcentaje
      ORDER BY p.nombre ASC
    `;

    const inventoryRows = (await query(inventoryQuery)) as unknown as InventoryRowInput[];
    const inventario = calculateInventoryValuation(inventoryRows);

    return NextResponse.json({
      success: true,
      rango: {
        desde: fechaDesde,
        hasta: fechaHasta,
      },
      ventas: {
        resumen: {
          totalVentasUsd: Number(totalVentasUsd.toFixed(2)),
          totalVentasLocal: Number(totalVentasLocal.toFixed(2)),
          totalBaseUsd: Number(totalBaseUsd.toFixed(2)),
          totalBaseLocal: Number(totalBaseLocal.toFixed(2)),
          totalIvaUsd: Number(totalIvaUsd.toFixed(2)),
          totalIvaLocal: Number(totalIvaLocal.toFixed(2)),
          cantidadPedidos,
          ticketPromedioUsd: Number(ticketPromedioUsd.toFixed(2)),
          totalUnidadesVendidas,
        },
        pedidos: salesRows,
        graficoDiario: dailyBreakdown,
      },
      rentabilidadFifo,
      inventario,
    });
  } catch (error: unknown) {
    console.error('Error in /api/reportes:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al generar reportes',
      },
      { status: 500 }
    );
  }
}
