export interface FifoProductInput {
  id: number | string;
  nombre: string;
  costo_promedio_usd: number | string | null;
  precio_usd: number | string | null;
  stock_actual: number | string | null;
}

export interface FifoPurchaseBatchInput {
  linea_id: number;
  compra_id: number;
  numero_factura: string;
  fecha_emision: string;
  creado_en?: string;
  producto_id: number | string;
  cantidad: number | string;
  costo_unitario_usd: number | string;
}

export interface FifoOrderLineInput {
  linea_id: number;
  pedido_id: number;
  fecha_hora: string;
  tasa_cambio_aplicada?: number | string;
  cliente_nombre: string;
  producto_id: number | string;
  producto_nombre: string;
  cantidad: number | string;
  cantidad_base: number | string;
  precio_unitario_usd: number | string;
  subtotal_usd: number | string;
  presentacion_nombre?: string | null;
  unidad_base?: string | null;
}

export interface FifoConsumedLot {
  compra_id?: number;
  numero_factura?: string;
  costo_unitario_usd: number;
  cantidad_consumida: number;
  es_costo_base?: boolean;
}

export interface FifoSaleRecord {
  linea_id: number;
  pedido_id: number;
  fecha_hora: string;
  cliente_nombre: string;
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  cantidad_base: number;
  presentacion_nombre?: string | null;
  unidad_base?: string | null;
  precio_unitario_usd: number;
  ingreso_usd: number;
  costo_fifo_total_usd: number;
  costo_unitario_ponderado_fifo: number;
  utilidad_bruta_usd: number;
  margen_porcentaje: number;
  lotes_consumidos: FifoConsumedLot[];
}

export interface FifoProductProfitability {
  producto_id: number;
  producto_nombre: string;
  unidades_vendidas: number;
  ingreso_total_usd: number;
  costo_fifo_total_usd: number;
  utilidad_bruta_usd: number;
  margen_porcentaje: number;
}

export interface FifoRentabilidadResult {
  resumen: {
    totalIngresosUsd: number;
    totalCostosFifoUsd: number;
    totalUtilidadBrutaUsd: number;
    margenGlobalPorcentaje: number;
  };
  porProducto: FifoProductProfitability[];
  ventasDetalle: FifoSaleRecord[];
}

export interface InventoryPresentationInput {
  id: number;
  nombre: string;
  factor: number | string;
  precio_usd: number | string;
}

export interface InventoryRowInput {
  id: number | string;
  nombre: string;
  precio_usd: number | string | null;
  stock_actual: number | string | null;
  costo_promedio_usd: number | string | null;
  unidad_base: string | null;
  activo: boolean | null;
  impuesto_id?: number | null;
  impuesto_nombre: string;
  impuesto_porcentaje: number | string | null;
  presentaciones: InventoryPresentationInput[] | null;
}

export interface InventoryValuationItem {
  id: number;
  nombre: string;
  unidad_base: string;
  precio_usd: number;
  costo_promedio_usd: number;
  stock_actual: number;
  valor_costo_usd: number;
  valor_venta_usd: number;
  utilidad_potencial_usd: number;
  margen_potencial_porcentaje: number;
  activo: boolean;
  impuesto_nombre: string;
  impuesto_porcentaje: number;
  presentaciones: InventoryPresentationInput[];
}

export interface InventoryValuationResult {
  resumen: {
    totalProductos: number;
    productosActivos: number;
    totalUnidadesEnStock: number;
    valorTotalCostoUsd: number;
    valorTotalVentaUsd: number;
    utilidadPotencialGlobalUsd: number;
    margenPotencialGlobalPct: number;
    productosAgotados: number;
    productosStockBajo: number;
  };
  productos: InventoryValuationItem[];
}

interface InternalBatch {
  compra_id: number;
  numero_factura: string;
  fecha_emision: string;
  costo_unitario_usd: number;
  cantidad_disponible: number;
}

/**
 * Calcula rentabilidad FIFO (PEPS) histórica filtrada por un rango ISO,
 * usando costo_promedio_usd como respaldo cuando el consumo supera los lotes.
 */
export function calculateFifoRentabilidad(params: {
  products: FifoProductInput[];
  purchaseBatches: FifoPurchaseBatchInput[];
  orderLines: FifoOrderLineInput[];
  startIso: string;
  endIso: string;
}): FifoRentabilidadResult {
  const { products, purchaseBatches, orderLines, startIso, endIso } = params;

  const productMap = new Map<number, FifoProductInput>();
  for (const p of products) {
    productMap.set(Number(p.id), p);
  }

  const fifoInventory = new Map<number, InternalBatch[]>();
  for (const b of purchaseBatches) {
    const pId = Number(b.producto_id);
    let list = fifoInventory.get(pId);
    if (!list) {
      list = [];
      fifoInventory.set(pId, list);
    }
    list.push({
      compra_id: Number(b.compra_id),
      numero_factura: b.numero_factura,
      fecha_emision: b.fecha_emision,
      costo_unitario_usd: Number(b.costo_unitario_usd),
      cantidad_disponible: Number(b.cantidad),
    });
  }

  const processedFifoSales: FifoSaleRecord[] = [];

  for (const sale of orderLines) {
    const pId = Number(sale.producto_id);
    let qtyNeeded = Number(sale.cantidad_base);
    const unitSalePrice = Number(sale.precio_unitario_usd);
    const saleSubtotal = Number(sale.subtotal_usd);

    let lineTotalCostFifo = 0;
    const consumedLots: FifoConsumedLot[] = [];
    const availableBatches = fifoInventory.get(pId) || [];

    for (const batch of availableBatches) {
      if (qtyNeeded <= 0) break;
      if (batch.cantidad_disponible > 0) {
        const qtyToTake = Math.min(qtyNeeded, batch.cantidad_disponible);
        const costOfPortion = qtyToTake * batch.costo_unitario_usd;

        lineTotalCostFifo += costOfPortion;
        batch.cantidad_disponible -= qtyToTake;
        qtyNeeded -= qtyToTake;

        consumedLots.push({
          compra_id: batch.compra_id,
          numero_factura: batch.numero_factura,
          costo_unitario_usd: batch.costo_unitario_usd,
          cantidad_consumida: qtyToTake,
        });
      }
    }

    if (qtyNeeded > 0) {
      const prod = productMap.get(pId);
      const fallbackCost = prod ? Number(prod.costo_promedio_usd || 0) : 0;
      const portionCost = qtyNeeded * fallbackCost;
      lineTotalCostFifo += portionCost;

      consumedLots.push({
        costo_unitario_usd: fallbackCost,
        cantidad_consumida: qtyNeeded,
        es_costo_base: true,
      });
    }

    lineTotalCostFifo = Number(lineTotalCostFifo.toFixed(2));
    const grossProfit = Number((saleSubtotal - lineTotalCostFifo).toFixed(2));
    const marginPct =
      saleSubtotal > 0 ? Number(((grossProfit / saleSubtotal) * 100).toFixed(2)) : 0;
    const qtyCount = Number(sale.cantidad);
    const unitWeightedCostFifo =
      qtyCount > 0 ? Number((lineTotalCostFifo / qtyCount).toFixed(2)) : 0;

    processedFifoSales.push({
      linea_id: Number(sale.linea_id),
      pedido_id: Number(sale.pedido_id),
      fecha_hora: sale.fecha_hora,
      cliente_nombre: sale.cliente_nombre,
      producto_id: pId,
      producto_nombre: sale.producto_nombre,
      cantidad: qtyCount,
      cantidad_base: Number(sale.cantidad_base),
      presentacion_nombre: sale.presentacion_nombre ?? undefined,
      unidad_base: sale.unidad_base ?? undefined,
      precio_unitario_usd: unitSalePrice,
      ingreso_usd: saleSubtotal,
      costo_fifo_total_usd: lineTotalCostFifo,
      costo_unitario_ponderado_fifo: unitWeightedCostFifo,
      utilidad_bruta_usd: grossProfit,
      margen_porcentaje: marginPct,
      lotes_consumidos: consumedLots,
    });
  }

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const filteredFifoSales = processedFifoSales.filter((s) => {
    const saleMs = new Date(s.fecha_hora).getTime();
    return saleMs >= startMs && saleMs <= endMs;
  });

  const productProfitabilityMap = new Map<number, FifoProductProfitability>();
  for (const item of filteredFifoSales) {
    let pData = productProfitabilityMap.get(item.producto_id);
    if (!pData) {
      pData = {
        producto_id: item.producto_id,
        producto_nombre: item.producto_nombre,
        unidades_vendidas: 0,
        ingreso_total_usd: 0,
        costo_fifo_total_usd: 0,
        utilidad_bruta_usd: 0,
        margen_porcentaje: 0,
      };
      productProfitabilityMap.set(item.producto_id, pData);
    }
    pData.unidades_vendidas += item.cantidad_base;
    pData.ingreso_total_usd += item.ingreso_usd;
    pData.costo_fifo_total_usd += item.costo_fifo_total_usd;
    pData.utilidad_bruta_usd += item.utilidad_bruta_usd;
  }

  const porProducto = Array.from(productProfitabilityMap.values())
    .map((p) => {
      const margin =
        p.ingreso_total_usd > 0
          ? Number(((p.utilidad_bruta_usd / p.ingreso_total_usd) * 100).toFixed(2))
          : 0;
      return {
        ...p,
        ingreso_total_usd: Number(p.ingreso_total_usd.toFixed(2)),
        costo_fifo_total_usd: Number(p.costo_fifo_total_usd.toFixed(2)),
        utilidad_bruta_usd: Number(p.utilidad_bruta_usd.toFixed(2)),
        margen_porcentaje: margin,
      };
    })
    .sort((a, b) => b.utilidad_bruta_usd - a.utilidad_bruta_usd);

  const totalIngresosFifo = filteredFifoSales.reduce((acc, s) => acc + s.ingreso_usd, 0);
  const totalCostosFifo = filteredFifoSales.reduce((acc, s) => acc + s.costo_fifo_total_usd, 0);
  const totalUtilidadBruta = Number((totalIngresosFifo - totalCostosFifo).toFixed(2));
  const margenGlobalPorcentaje =
    totalIngresosFifo > 0
      ? Number(((totalUtilidadBruta / totalIngresosFifo) * 100).toFixed(2))
      : 0;

  return {
    resumen: {
      totalIngresosUsd: Number(totalIngresosFifo.toFixed(2)),
      totalCostosFifoUsd: Number(totalCostosFifo.toFixed(2)),
      totalUtilidadBrutaUsd: totalUtilidadBruta,
      margenGlobalPorcentaje,
    },
    porProducto,
    ventasDetalle: [...filteredFifoSales].sort(
      (a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime()
    ),
  };
}

/**
 * Valoriza existencias actuales al costo y a precio de venta proyectado.
 */
export function calculateInventoryValuation(
  inventoryRows: InventoryRowInput[]
): InventoryValuationResult {
  let valorTotalCostoUsd = 0;
  let valorTotalVentaUsd = 0;
  let totalUnidadesEnStock = 0;
  let productosAgotados = 0;
  let productosStockBajo = 0;

  const productos: InventoryValuationItem[] = inventoryRows.map((row) => {
    const stock = Number(row.stock_actual || 0);
    const costo = Number(row.costo_promedio_usd || 0);
    const precio = Number(row.precio_usd || 0);
    const valorCosto = Number((stock * costo).toFixed(2));
    const valorVenta = Number((stock * precio).toFixed(2));
    const utilidadPotencial = Number((valorVenta - valorCosto).toFixed(2));
    const margenPotencialPct =
      valorVenta > 0 ? Number(((utilidadPotencial / valorVenta) * 100).toFixed(2)) : 0;

    valorTotalCostoUsd += valorCosto;
    valorTotalVentaUsd += valorVenta;
    totalUnidadesEnStock += stock;

    if (stock <= 0) {
      productosAgotados += 1;
    } else if (stock <= 5) {
      productosStockBajo += 1;
    }

    return {
      id: Number(row.id),
      nombre: row.nombre,
      unidad_base: row.unidad_base || 'Unidad',
      precio_usd: precio,
      costo_promedio_usd: costo,
      stock_actual: stock,
      valor_costo_usd: valorCosto,
      valor_venta_usd: valorVenta,
      utilidad_potencial_usd: utilidadPotencial,
      margen_potencial_porcentaje: margenPotencialPct,
      activo: Boolean(row.activo),
      impuesto_nombre: row.impuesto_nombre,
      impuesto_porcentaje: Number(row.impuesto_porcentaje ?? 0),
      presentaciones: Array.isArray(row.presentaciones) ? row.presentaciones : [],
    };
  });

  const utilidadPotencialGlobalUsd = Number((valorTotalVentaUsd - valorTotalCostoUsd).toFixed(2));
  const margenPotencialGlobalPct =
    valorTotalVentaUsd > 0
      ? Number(((utilidadPotencialGlobalUsd / valorTotalVentaUsd) * 100).toFixed(2))
      : 0;

  return {
    resumen: {
      totalProductos: productos.length,
      productosActivos: productos.filter((i) => i.activo).length,
      totalUnidadesEnStock,
      valorTotalCostoUsd: Number(valorTotalCostoUsd.toFixed(2)),
      valorTotalVentaUsd: Number(valorTotalVentaUsd.toFixed(2)),
      utilidadPotencialGlobalUsd,
      margenPotencialGlobalPct,
      productosAgotados,
      productosStockBajo,
    },
    productos,
  };
}
