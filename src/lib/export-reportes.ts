import * as XLSX from 'xlsx';
import { formatStockDesgloseCompleto, getSegmentacionExistencias } from '@/lib/unidades';
import type {
  InventoryReportData,
  RentabilidadFifoData,
  ReportData,
  ReportTab,
  SalesCurrencyMode,
  SalesReportData,
} from '@/components/reportes/types';

export type SheetCell = string | number;
export type SheetRows = SheetCell[][];

export function buildSalesExportSheets(
  ventas: SalesReportData,
  salesCurrencyMode: SalesCurrencyMode,
  appliedRate: number,
  fechaDesde: string,
  fechaHasta: string
): {
  ventasRows: SheetRows;
  itemRows: SheetRows;
  resumenRows: SheetRows;
} {
  let headers: string[] = [];
  if (salesCurrencyMode === 'ambas') {
    headers = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'RIF / Cédula',
      'Productos Vendidos',
      'Artículos',
      'Tasa BCV',
      'Base Imponible USD',
      'IVA USD',
      'Total USD',
      'Base Imponible Bs.',
      'IVA Bs.',
      'Total Bs.',
    ];
  } else if (salesCurrencyMode === 'usd') {
    headers = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'RIF / Cédula',
      'Productos Vendidos',
      'Artículos',
      'Tasa BCV',
      'Base Imponible USD',
      'IVA USD',
      'Total USD',
    ];
  } else {
    headers = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'RIF / Cédula',
      'Productos Vendidos',
      'Artículos',
      'Tasa BCV',
      'Base Imponible Bs.',
      'IVA Bs.',
      'Total Bs.',
    ];
  }

  const dataRows: SheetRows = ventas.pedidos.map((p) => {
    const prods = (p.lineas || [])
      .map(
        (l) =>
          `${Number(l.cantidad)}x ${l.producto_nombre}${l.presentacion_nombre ? ` (${l.presentacion_nombre})` : ''}`
      )
      .join('; ');
    const tasa = Number(p.tasa_cambio_aplicada);
    const baseBs =
      p.base_imponible_bs !== undefined
        ? Number(p.base_imponible_bs)
        : Number((Number(p.base_imponible_usd) * tasa).toFixed(2));
    const ivaBs =
      p.monto_impuesto_bs !== undefined
        ? Number(p.monto_impuesto_bs)
        : Number((Number(p.monto_impuesto_usd) * tasa).toFixed(2));

    const baseRow: SheetCell[] = [
      p.id,
      new Date(p.fecha_hora).toLocaleString('es-VE'),
      p.cliente_nombre || 'Consumidor Final',
      p.cliente_identificacion || 'N/A',
      prods,
      p.total_articulos,
      tasa,
    ];

    if (salesCurrencyMode === 'ambas') {
      return [
        ...baseRow,
        Number(p.base_imponible_usd),
        Number(p.monto_impuesto_usd),
        Number(p.total_usd),
        baseBs,
        ivaBs,
        Number(p.total_moneda_local),
      ];
    }
    if (salesCurrencyMode === 'usd') {
      return [
        ...baseRow,
        Number(p.base_imponible_usd),
        Number(p.monto_impuesto_usd),
        Number(p.total_usd),
      ];
    }
    return [...baseRow, baseBs, ivaBs, Number(p.total_moneda_local)];
  });

  let itemHeaders: string[] = [];
  if (salesCurrencyMode === 'ambas') {
    itemHeaders = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'ID Producto',
      'Producto',
      'Presentación / Medida',
      'Cantidad',
      'Precio Unitario USD',
      'IVA %',
      'Monto IVA USD',
      'Subtotal USD',
      'Total USD',
      'Base Bs.',
      'IVA Bs.',
      'Total Bs.',
    ];
  } else if (salesCurrencyMode === 'usd') {
    itemHeaders = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'ID Producto',
      'Producto',
      'Presentación / Medida',
      'Cantidad',
      'Precio Unitario USD',
      'IVA %',
      'Monto IVA USD',
      'Subtotal USD',
      'Total USD',
    ];
  } else {
    itemHeaders = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'ID Producto',
      'Producto',
      'Presentación / Medida',
      'Cantidad',
      'Precio Unitario Bs.',
      'IVA %',
      'Base Bs.',
      'IVA Bs.',
      'Total Bs.',
    ];
  }

  const itemDataRows: SheetRows = [];
  for (const p of ventas.pedidos) {
    const tasa = Number(p.tasa_cambio_aplicada);
    for (const l of p.lineas || []) {
      const subtotalUsd = Number(l.subtotal_usd);
      const ivaUsd = Number(l.monto_impuesto_usd);
      const lineTotalUsd = subtotalUsd + ivaUsd;
      const subtotalBs = Number((subtotalUsd * tasa).toFixed(2));
      const ivaBs = Number((ivaUsd * tasa).toFixed(2));
      const lineTotalBs = Number((lineTotalUsd * tasa).toFixed(2));

      const baseItem: SheetCell[] = [
        p.id,
        new Date(p.fecha_hora).toLocaleString('es-VE'),
        p.cliente_nombre || 'Consumidor Final',
        l.producto_id,
        l.producto_nombre,
        l.presentacion_nombre || l.unidad_base || 'Unidad',
        Number(l.cantidad),
      ];

      if (salesCurrencyMode === 'ambas') {
        itemDataRows.push([
          ...baseItem,
          Number(l.precio_unitario_usd),
          Number(l.porcentaje_impuesto),
          ivaUsd,
          subtotalUsd,
          Number(lineTotalUsd.toFixed(2)),
          subtotalBs,
          ivaBs,
          lineTotalBs,
        ]);
      } else if (salesCurrencyMode === 'usd') {
        itemDataRows.push([
          ...baseItem,
          Number(l.precio_unitario_usd),
          Number(l.porcentaje_impuesto),
          ivaUsd,
          subtotalUsd,
          Number(lineTotalUsd.toFixed(2)),
        ]);
      } else {
        itemDataRows.push([
          ...baseItem,
          Number((Number(l.precio_unitario_usd) * tasa).toFixed(2)),
          Number(l.porcentaje_impuesto),
          subtotalBs,
          ivaBs,
          lineTotalBs,
        ]);
      }
    }
  }

  const res = ventas.resumen;
  const resumenRows: SheetRows = [
    ['Métrica', 'Valor'],
    [
      'Modo de Moneda',
      salesCurrencyMode === 'ambas'
        ? 'Ambas Monedas (USD y Bs.)'
        : salesCurrencyMode === 'usd'
          ? 'Solo Dólares (USD)'
          : 'Solo Bolívares (Bs.)',
    ],
    ['Total Ventas USD', res.totalVentasUsd],
    ['Total Ventas Bs.', res.totalVentasLocal],
    ['Base Imponible USD', res.totalBaseUsd],
    ['Base Imponible Bs.', res.totalBaseLocal ?? Number((res.totalBaseUsd * appliedRate).toFixed(2))],
    ['IVA Total USD', res.totalIvaUsd],
    ['IVA Total Bs.', res.totalIvaLocal ?? Number((res.totalIvaUsd * appliedRate).toFixed(2))],
    ['Cantidad de Pedidos', res.cantidadPedidos],
    ['Ticket Promedio USD', res.ticketPromedioUsd],
    ['Tasa BCV Promedio', res.tasaPromedio ?? appliedRate],
    ['Período Desde', fechaDesde],
    ['Período Hasta', fechaHasta],
  ];

  return {
    ventasRows: [headers, ...dataRows],
    itemRows: [itemHeaders, ...itemDataRows],
    resumenRows,
  };
}

export function buildFifoExportSheets(
  rentabilidadFifo: RentabilidadFifoData,
  appliedRate: number,
  fechaDesde: string,
  fechaHasta: string
): {
  prodRows: SheetRows;
  detalleRows: SheetRows;
  resumenRows: SheetRows;
} {
  const prodHeaders = [
    'ID Producto',
    'Producto',
    'Unidades Vendidas',
    'Ingreso Total USD',
    'Costo FIFO Total USD',
    'Utilidad Bruta USD',
    'Margen %',
  ];
  const prodData: SheetRows = rentabilidadFifo.porProducto.map((p) => [
    p.producto_id,
    p.producto_nombre,
    Number(p.unidades_vendidas),
    Number(p.ingreso_total_usd),
    Number(p.costo_fifo_total_usd),
    Number(p.utilidad_bruta_usd),
    Number(p.margen_porcentaje),
  ]);

  const pedHeaders = [
    'ID Pedido',
    'Fecha',
    'Cliente',
    'Producto',
    'Presentación',
    'Cant. Base',
    'Ingreso USD',
    'Costo FIFO USD',
    'Utilidad USD',
    'Margen %',
  ];
  const pedData: SheetRows = (rentabilidadFifo.ventasDetalle || []).map((p) => [
    p.pedido_id,
    new Date(p.fecha_hora).toLocaleString('es-VE'),
    p.cliente_nombre || 'Consumidor Final',
    p.producto_nombre,
    p.presentacion_nombre || p.unidad_base || 'Unidad',
    Number(p.cantidad_base),
    Number(p.ingreso_usd),
    Number(p.costo_fifo_total_usd),
    Number(p.utilidad_bruta_usd),
    Number(p.margen_porcentaje),
  ]);

  const rFifo = rentabilidadFifo.resumen;
  const resumenRows: SheetRows = [
    ['Métrica FIFO', 'Valor USD', 'Valor Bs.'],
    ['Ingresos Totales por Ventas', rFifo.totalIngresosUsd, (rFifo.totalIngresosUsd * appliedRate).toFixed(2)],
    ['Costo Total de Ventas (FIFO)', rFifo.totalCostosFifoUsd, (rFifo.totalCostosFifoUsd * appliedRate).toFixed(2)],
    ['Utilidad Bruta Global', rFifo.totalUtilidadBrutaUsd, (rFifo.totalUtilidadBrutaUsd * appliedRate).toFixed(2)],
    ['Margen Bruto Global %', `${rFifo.margenGlobalPorcentaje}%`, ''],
    ['Tasa BCV Aplicada', appliedRate, ''],
    ['Período Desde', fechaDesde, ''],
    ['Período Hasta', fechaHasta, ''],
  ];

  return {
    prodRows: [prodHeaders, ...prodData],
    detalleRows: [pedHeaders, ...pedData],
    resumenRows,
  };
}

export function buildInventoryExportSheets(
  inventario: InventoryReportData,
  appliedRate: number,
  emissionDate: string = new Date().toLocaleDateString('es-VE')
): {
  invRows: SheetRows;
  segDetailRows: SheetRows;
  sumRows: SheetRows;
} {
  const invHeaders = [
    'ID Producto',
    'Nombre Producto',
    'Unidad Base',
    'Presentaciones Registradas',
    'Stock Base (Unidades)',
    'Empaque Jerárquico Óptimo',
    'Segmentación de Existencias',
    'Precios de Venta por Medida',
    'Costo Unitario USD',
    'Precio Venta Base USD',
    'Valor Costo Total USD',
    'Valor Costo Total Bs.',
    'Valor Venta Total USD',
    'Valor Venta Total Bs.',
    'Ganancia Potencial USD',
    'Margen %',
    'Estado',
  ];

  const invData: SheetRows = inventario.productos.map((p) => {
    const presNames =
      (p.presentaciones || []).map((pr) => `${pr.nombre} (x${pr.factor})`).join('; ') || 'Ninguna';
    const empaque = formatStockDesgloseCompleto(p, p.stock_actual);
    const segs = getSegmentacionExistencias(p, p.stock_actual);
    const segText = segs
      .map(
        (s) =>
          `${s.unidades_completas} ${s.nombre}${s.resto_unidades > 0 && s.factor > 1 ? ` (+${s.resto_unidades}u)` : ''}`
      )
      .join(' | ');
    const preciosText = segs
      .map(
        (s) =>
          `${s.nombre}: $${s.precio_usd.toFixed(2)}${s.factor > 1 ? ` ($${s.precio_unitario_equivalente.toFixed(2)}/u)` : ''}`
      )
      .join(' | ');
    const st = p.stock_actual <= 0 ? 'Agotado' : p.stock_actual <= 5 ? 'Stock Bajo' : 'Óptimo';
    return [
      p.id,
      p.nombre,
      p.unidad_base || 'Unidad',
      presNames,
      Number(p.stock_actual),
      empaque,
      segText,
      preciosText,
      Number(p.costo_promedio_usd),
      Number(p.precio_usd),
      Number(p.valor_costo_usd),
      Number((p.valor_costo_usd * appliedRate).toFixed(2)),
      Number(p.valor_venta_usd),
      Number((p.valor_venta_usd * appliedRate).toFixed(2)),
      Number(p.utilidad_potencial_usd),
      Number(p.margen_potencial_porcentaje),
      st,
    ];
  });

  const segDetailHeaders = [
    'ID Producto',
    'Nombre Producto',
    'Presentación / Medida',
    'Factor Empaque',
    'Stock Disponible Completo',
    'Fracción / Unidades Sueltas',
    'Precio Venta USD',
    'Precio Venta Bs.',
    'Precio Equivalente por Unidad USD',
    'Valor Total Potencial USD',
    'Ganancia Potencial USD',
  ];

  const segDetailData: SheetRows = [];
  for (const p of inventario.productos) {
    const segs = getSegmentacionExistencias(p, p.stock_actual);
    for (const seg of segs) {
      const precioBs = seg.precio_usd * appliedRate;
      const ganancia = seg.valor_potencial_usd - p.valor_costo_usd;
      segDetailData.push([
        p.id,
        p.nombre,
        seg.nombre,
        seg.factor,
        seg.unidades_completas,
        seg.resto_unidades,
        seg.precio_usd,
        Number(precioBs.toFixed(2)),
        seg.precio_unitario_equivalente,
        seg.valor_potencial_usd,
        Number(ganancia.toFixed(2)),
      ]);
    }
  }

  const invSum = inventario.resumen;
  const sumRows: SheetRows = [
    ['Métrica', 'Valor USD', 'Valor Bs.'],
    ['Total Productos en Catálogo', invSum.totalProductos, ''],
    ['Productos Activos', invSum.productosActivos, ''],
    ['Total Unidades Físicas en Stock', invSum.totalUnidadesEnStock, ''],
    ['Valor Total al Costo', invSum.valorTotalCostoUsd, (invSum.valorTotalCostoUsd * appliedRate).toFixed(2)],
    ['Valor Total a Venta Proyectado', invSum.valorTotalVentaUsd, (invSum.valorTotalVentaUsd * appliedRate).toFixed(2)],
    ['Ganancia Potencial Global', invSum.utilidadPotencialGlobalUsd, (invSum.utilidadPotencialGlobalUsd * appliedRate).toFixed(2)],
    ['Margen Potencial Global %', `${invSum.margenPotencialGlobalPct}%`, ''],
    ['Productos Agotados (Stock 0)', invSum.productosAgotados, ''],
    ['Productos con Stock Bajo (≤ 5)', invSum.productosStockBajo, ''],
    ['Tasa BCV Aplicada', appliedRate, ''],
    ['Fecha de Emisión', emissionDate, ''],
  ];

  return {
    invRows: [invHeaders, ...invData],
    segDetailRows: [segDetailHeaders, ...segDetailData],
    sumRows,
  };
}

export function buildSalesCsv(
  ventas: SalesReportData,
  salesCurrencyMode: SalesCurrencyMode
): string {
  let headers: string[] = [];
  if (salesCurrencyMode === 'ambas') {
    headers = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'RIF',
      'Productos Vendidos',
      'Articulos',
      'Tasa',
      'Base USD',
      'IVA USD',
      'Total USD',
      'Base Bs',
      'IVA Bs',
      'Total Bs',
    ];
  } else if (salesCurrencyMode === 'usd') {
    headers = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'RIF',
      'Productos Vendidos',
      'Articulos',
      'Tasa',
      'Base USD',
      'IVA USD',
      'Total USD',
    ];
  } else {
    headers = [
      'ID Pedido',
      'Fecha y Hora',
      'Cliente',
      'RIF',
      'Productos Vendidos',
      'Articulos',
      'Tasa',
      'Base Bs',
      'IVA Bs',
      'Total Bs',
    ];
  }

  const rows = ventas.pedidos.map((p) => {
    const prods = (p.lineas || [])
      .map(
        (l) =>
          `${Number(l.cantidad)}x ${l.producto_nombre}${l.presentacion_nombre ? ` (${l.presentacion_nombre})` : ''}`
      )
      .join('; ');
    const tasa = Number(p.tasa_cambio_aplicada);
    const baseBs =
      p.base_imponible_bs !== undefined
        ? Number(p.base_imponible_bs)
        : Number((Number(p.base_imponible_usd) * tasa).toFixed(2));
    const ivaBs =
      p.monto_impuesto_bs !== undefined
        ? Number(p.monto_impuesto_bs)
        : Number((Number(p.monto_impuesto_usd) * tasa).toFixed(2));

    const baseRow: SheetCell[] = [
      p.id,
      new Date(p.fecha_hora).toLocaleString('es-VE'),
      `"${p.cliente_nombre || ''}"`,
      `"${p.cliente_identificacion || ''}"`,
      `"${prods}"`,
      p.total_articulos,
      p.tasa_cambio_aplicada,
    ];

    if (salesCurrencyMode === 'ambas') {
      return [
        ...baseRow,
        p.base_imponible_usd,
        p.monto_impuesto_usd,
        p.total_usd,
        baseBs,
        ivaBs,
        p.total_moneda_local,
      ];
    }
    if (salesCurrencyMode === 'usd') {
      return [...baseRow, p.base_imponible_usd, p.monto_impuesto_usd, p.total_usd];
    }
    return [...baseRow, baseBs, ivaBs, p.total_moneda_local];
  });

  return [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
}

export function buildFifoCsv(rentabilidadFifo: RentabilidadFifoData): string {
  const headers = [
    'ID Producto',
    'Producto',
    'Unidades Vendidas',
    'Ingreso Total USD',
    'Costo FIFO Total USD',
    'Utilidad Bruta USD',
    'Margen %',
  ];
  const rows = rentabilidadFifo.porProducto.map((p) => [
    p.producto_id,
    `"${p.producto_nombre}"`,
    p.unidades_vendidas,
    p.ingreso_total_usd,
    p.costo_fifo_total_usd,
    p.utilidad_bruta_usd,
    `${p.margen_porcentaje}%`,
  ]);
  return [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
}

export function buildInventoryCsv(
  inventario: InventoryReportData,
  appliedRate: number
): string {
  const headers = [
    'ID Producto',
    'Nombre Producto',
    'Unidad Base',
    'Presentaciones Registradas',
    'Stock Base (Unidades)',
    'Empaque Jerarquico Optimo',
    'Segmentacion de Existencias por Medida',
    'Precios por Medida',
    'Costo Promedio USD',
    'Precio Venta Base USD',
    'Valor Costo Total USD',
    'Valor Costo Total Bs',
    'Valor Venta Total USD',
    'Valor Venta Total Bs',
    'Ganancia Potencial USD',
    'Margen %',
    'Estado',
  ];
  const rows = inventario.productos.map((p) => {
    const presNames =
      (p.presentaciones || []).map((pr) => `${pr.nombre} (x${pr.factor})`).join('; ') || 'Ninguna';
    const empaque = formatStockDesgloseCompleto(p, p.stock_actual);
    const segs = getSegmentacionExistencias(p, p.stock_actual);
    const segText = segs
      .map(
        (s) =>
          `${s.unidades_completas} ${s.nombre}${s.resto_unidades > 0 && s.factor > 1 ? ` (+${s.resto_unidades}u)` : ''}`
      )
      .join(' | ');
    const preciosText = segs
      .map(
        (s) =>
          `${s.nombre}: $${s.precio_usd.toFixed(2)}${s.factor > 1 ? ` ($${s.precio_unitario_equivalente.toFixed(2)}/u)` : ''}`
      )
      .join(' | ');
    const st = p.stock_actual <= 0 ? 'Agotado' : p.stock_actual <= 5 ? 'Stock Bajo' : 'Óptimo';
    return [
      p.id,
      `"${p.nombre}"`,
      `"${p.unidad_base || 'Unidad'}"`,
      `"${presNames}"`,
      p.stock_actual,
      `"${empaque}"`,
      `"${segText}"`,
      `"${preciosText}"`,
      p.costo_promedio_usd,
      p.precio_usd,
      p.valor_costo_usd,
      (p.valor_costo_usd * appliedRate).toFixed(2),
      p.valor_venta_usd,
      (p.valor_venta_usd * appliedRate).toFixed(2),
      p.utilidad_potencial_usd,
      `${p.margen_potencial_porcentaje}%`,
      st,
    ];
  });
  return [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
}

export function downloadCsvBlob(filename: string, csvText: string): void {
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReportExcel(params: {
  activeTab: ReportTab;
  reportData: ReportData | null;
  salesCurrencyMode: SalesCurrencyMode;
  appliedRate: number;
  fechaDesde: string;
  fechaHasta: string;
}): void {
  const { activeTab, reportData, salesCurrencyMode, appliedRate, fechaDesde, fechaHasta } = params;
  if (!reportData) return;

  if (activeTab === 'ventas') {
    if (!reportData.ventas?.pedidos) return;
    const wb = XLSX.utils.book_new();
    const { ventasRows, itemRows, resumenRows } = buildSalesExportSheets(
      reportData.ventas,
      salesCurrencyMode,
      appliedRate,
      fechaDesde,
      fechaHasta
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ventasRows), 'Ventas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), 'Detalle de Productos');
    if (reportData.ventas.resumen) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenRows), 'Resumen');
    }
    XLSX.writeFile(wb, `reporte_ventas_${salesCurrencyMode}_${fechaDesde}_al_${fechaHasta}.xlsx`);
    return;
  }

  if (activeTab === 'rentabilidad') {
    if (!reportData.rentabilidadFifo?.porProducto) return;
    const wb = XLSX.utils.book_new();
    const { prodRows, detalleRows, resumenRows } = buildFifoExportSheets(
      reportData.rentabilidadFifo,
      appliedRate,
      fechaDesde,
      fechaHasta
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodRows), 'Rentabilidad Productos');
    if (reportData.rentabilidadFifo.ventasDetalle) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalleRows), 'Detalle Ventas FIFO');
    }
    if (reportData.rentabilidadFifo.resumen) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenRows), 'Resumen FIFO');
    }
    XLSX.writeFile(wb, `reporte_rentabilidad_fifo_${fechaDesde}_al_${fechaHasta}.xlsx`);
    return;
  }

  if (!reportData.inventario?.productos) return;
  const wb = XLSX.utils.book_new();
  const { invRows, segDetailRows, sumRows } = buildInventoryExportSheets(
    reportData.inventario,
    appliedRate
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), 'Inventario');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(segDetailRows), 'Detalle Medidas');
  if (reportData.inventario.resumen) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Resumen Almacén');
  }
  XLSX.writeFile(wb, `reporte_inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportReportCsv(params: {
  activeTab: ReportTab;
  reportData: ReportData | null;
  salesCurrencyMode: SalesCurrencyMode;
  appliedRate: number;
  fechaDesde: string;
  fechaHasta: string;
}): void {
  const { activeTab, reportData, salesCurrencyMode, appliedRate, fechaDesde, fechaHasta } = params;
  if (!reportData) return;

  if (activeTab === 'ventas') {
    if (!reportData.ventas?.pedidos) return;
    downloadCsvBlob(
      `reporte_ventas_${salesCurrencyMode}_${fechaDesde}_al_${fechaHasta}.csv`,
      buildSalesCsv(reportData.ventas, salesCurrencyMode)
    );
    return;
  }

  if (activeTab === 'rentabilidad') {
    if (!reportData.rentabilidadFifo?.porProducto) return;
    downloadCsvBlob(
      `reporte_rentabilidad_fifo_${fechaDesde}_al_${fechaHasta}.csv`,
      buildFifoCsv(reportData.rentabilidadFifo)
    );
    return;
  }

  if (!reportData.inventario?.productos) return;
  downloadCsvBlob(
    `reporte_inventario_${new Date().toISOString().split('T')[0]}.csv`,
    buildInventoryCsv(reportData.inventario, appliedRate)
  );
}
