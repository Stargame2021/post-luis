import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    // 1. Current Exchange Rate (latest)
    const rateRows = await query(
      'SELECT id, TO_CHAR(fecha, \'YYYY-MM-DD\') as fecha, tasa FROM m_tasa ORDER BY fecha DESC LIMIT 1'
    );
    const currentRate = rateRows.length > 0 ? rateRows[0] : null;

    // 2. Summary stats (Today total in America/Caracas, overall sales - excluding ANULADO)
    const todayStats = await query(`
      SELECT 
        COUNT(*)::int as pedidos_hoy,
        COALESCE(SUM(total_usd), 0)::numeric as total_usd_hoy,
        COALESCE(SUM(total_moneda_local), 0)::numeric as total_local_hoy
      FROM t_pedido
      WHERE (fecha_hora AT TIME ZONE 'America/Caracas')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Caracas')::date
        AND (estado IS NULL OR estado != 'ANULADO')
    `);

    const allTimeStats = await query(`
      SELECT 
        COUNT(*)::int as pedidos_totales,
        COALESCE(SUM(total_usd), 0)::numeric as total_usd_total,
        COALESCE(SUM(total_moneda_local), 0)::numeric as total_local_total
      FROM t_pedido
      WHERE (estado IS NULL OR estado != 'ANULADO')
    `);

    // 3. Compras stats (excluding ANULADO)
    const comprasStats = await query(`
      SELECT
        COUNT(*)::int as total_compras,
        COALESCE(SUM(total_usd), 0)::numeric as total_usd_compras,
        COALESCE(SUM(total_moneda_local), 0)::numeric as total_local_compras
      FROM t_compra
      WHERE (estado IS NULL OR estado != 'ANULADO')
    `);

    // 4. Inventario stats
    const inventarioStats = await query(`
      SELECT
        COUNT(*)::int as total_productos,
        COALESCE(SUM(stock_actual), 0)::numeric as total_unidades,
        COALESCE(SUM(stock_actual * costo_promedio_usd), 0)::numeric as valor_inventario_costo,
        COUNT(CASE WHEN stock_actual <= 5 AND activo = true THEN 1 END)::int as productos_bajo_stock
      FROM m_producto
      WHERE activo = true
    `);

    // 5. Ventas diarias (últimos 7 días en America/Caracas)
    const dailySales = await query(`
      WITH days AS (
        SELECT generate_series(
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Caracas')::date - INTERVAL '6 days',
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Caracas')::date,
          INTERVAL '1 day'
        )::date AS day
      )
      SELECT 
        TO_CHAR(d.day, 'YYYY-MM-DD') as fecha,
        TO_CHAR(d.day, 'Dy DD Mon') as etiqueta,
        COALESCE(SUM(p.total_usd), 0)::numeric as total_usd,
        COALESCE(SUM(p.total_moneda_local), 0)::numeric as total_local,
        COUNT(p.id)::int as cantidad_pedidos
      FROM days d
      LEFT JOIN t_pedido p
        ON d.day = (p.fecha_hora AT TIME ZONE 'America/Caracas')::date
       AND (p.estado IS NULL OR p.estado != 'ANULADO')
      GROUP BY d.day
      ORDER BY d.day ASC
    `);

    // 6. Ventas semanales (últimas 8 semanas en America/Caracas)
    const weeklySales = await query(`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Caracas')::date - INTERVAL '7 weeks'),
          date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Caracas')::date),
          INTERVAL '1 week'
        )::date AS week_start
      )
      SELECT 
        TO_CHAR(w.week_start, 'YYYY-"W"IW') as semana,
        'Sem ' || TO_CHAR(w.week_start, 'DD Mon') as etiqueta,
        COALESCE(SUM(p.total_usd), 0)::numeric as total_usd,
        COALESCE(SUM(p.total_moneda_local), 0)::numeric as total_local,
        COUNT(p.id)::int as cantidad_pedidos
      FROM weeks w
      LEFT JOIN t_pedido p
        ON date_trunc('week', (p.fecha_hora AT TIME ZONE 'America/Caracas'))::date = w.week_start
       AND (p.estado IS NULL OR p.estado != 'ANULADO')
      GROUP BY w.week_start
      ORDER BY w.week_start ASC
    `);

    // 7. Ventas mensuales (últimos 6 meses en America/Caracas)
    const monthlySales = await query(`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Caracas')::date - INTERVAL '5 months'),
          date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Caracas')::date),
          INTERVAL '1 month'
        )::date AS month_start
      )
      SELECT 
        TO_CHAR(m.month_start, 'YYYY-MM') as mes,
        TO_CHAR(m.month_start, 'Mon YYYY') as etiqueta,
        COALESCE(SUM(p.total_usd), 0)::numeric as total_usd,
        COALESCE(SUM(p.total_moneda_local), 0)::numeric as total_local,
        COUNT(p.id)::int as cantidad_pedidos
      FROM months m
      LEFT JOIN t_pedido p
        ON date_trunc('month', (p.fecha_hora AT TIME ZONE 'America/Caracas'))::date = m.month_start
       AND (p.estado IS NULL OR p.estado != 'ANULADO')
      GROUP BY m.month_start
      ORDER BY m.month_start ASC
    `);

    // 8. Top 5 productos más vendidos en unidades base (excluding ANULADO)
    const topProducts = await query(`
      SELECT 
        p.id,
        p.nombre,
        COALESCE(SUM(COALESCE(l.cantidad_base, l.cantidad)), 0)::numeric as unidades_vendidas,
        SUM(l.subtotal_usd)::numeric as ingresos_usd
      FROM t_pedidolinea l
      JOIN m_producto p ON p.id = l.producto_id
      JOIN t_pedido ped ON ped.id = l.pedido_id
      WHERE (ped.estado IS NULL OR ped.estado != 'ANULADO')
      GROUP BY p.id, p.nombre
      ORDER BY unidades_vendidas DESC
      LIMIT 5
    `);

    return NextResponse.json({
      success: true,
      data: {
        tasaActual: currentRate,
        hoy: todayStats[0] || { pedidos_hoy: 0, total_usd_hoy: 0, total_local_hoy: 0 },
        total: allTimeStats[0] || { pedidos_totales: 0, total_usd_total: 0, total_local_total: 0 },
        comprasResumen: comprasStats[0] || { total_compras: 0, total_usd_compras: 0, total_local_compras: 0 },
        inventarioResumen: inventarioStats[0] || { total_productos: 0, total_unidades: 0, valor_inventario_costo: 0, productos_bajo_stock: 0 },
        ventasDiarias: dailySales,
        ventasSemanales: weeklySales,
        ventasMensuales: monthlySales,
        topProductos: topProducts,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al obtener métricas del dashboard',
      },
      { status: 500 }
    );
  }
}
