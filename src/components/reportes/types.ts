export type ReportTab = 'ventas' | 'rentabilidad' | 'inventario';
export type DatePreset = 'mes' | 'hoy' | 'semana' | '30dias' | 'anio' | 'custom';
export type SalesCurrencyMode = 'ambas' | 'usd' | 'bs';
export type InventoryFilter = 'TODOS' | 'CON_STOCK' | 'BAJO_STOCK' | 'AGOTADOS';
export type InventorySort =
  | 'NOMBRE'
  | 'STOCK_DESC'
  | 'VALOR_COSTO_DESC'
  | 'VALOR_VENTA_DESC'
  | 'UTILIDAD_DESC';

export interface SalesReportLine {
  id?: number;
  producto_id: number;
  producto_nombre: string;
  unidad_base?: string | null;
  presentacion_nombre?: string | null;
  factor_conversion?: number | string;
  cantidad: number | string;
  cantidad_base?: number | string;
  precio_unitario_usd: number | string;
  porcentaje_impuesto: number | string;
  monto_impuesto_usd: number | string;
  subtotal_usd: number | string;
}

export interface SalesReportRow {
  id: number;
  fecha_hora: string;
  tercero_id?: number | null;
  cliente_nombre?: string | null;
  cliente_identificacion?: string | null;
  tasa_cambio_aplicada: number | string;
  base_imponible_usd: number | string;
  monto_impuesto_usd: number | string;
  total_usd: number | string;
  total_moneda_local: number | string;
  base_imponible_bs?: number;
  monto_impuesto_bs?: number;
  total_articulos: number;
  total_unidades?: number | string;
  lineas?: SalesReportLine[];
}

export interface SalesReportSummary {
  totalVentasUsd: number;
  totalVentasLocal: number;
  totalBaseUsd: number;
  totalBaseLocal?: number;
  totalIvaUsd: number;
  totalIvaLocal?: number;
  cantidadPedidos: number;
  ticketPromedioUsd: number;
  totalUnidadesVendidas: number;
  tasaPromedio?: number;
}

export interface SalesReportData {
  resumen: SalesReportSummary;
  pedidos: SalesReportRow[];
  graficoDiario?: Array<{
    fecha: string;
    etiqueta: string;
    cantidad_ventas: number;
    total_usd: number | string;
    total_local: number | string;
  }>;
}

export interface FifoConsumedLot {
  compra_id?: number;
  numero_factura?: string;
  costo_unitario_usd: number;
  cantidad_consumida: number;
  es_costo_base?: boolean;
}

export interface FifoProductRow {
  producto_id: number;
  producto_nombre: string;
  unidades_vendidas: number;
  ingreso_total_usd: number;
  costo_fifo_total_usd: number;
  utilidad_bruta_usd: number;
  margen_porcentaje: number;
}

export interface FifoSaleDetail {
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

export interface RentabilidadFifoData {
  resumen: {
    totalIngresosUsd: number;
    totalCostosFifoUsd: number;
    totalUtilidadBrutaUsd: number;
    margenGlobalPorcentaje: number;
  };
  porProducto: FifoProductRow[];
  ventasDetalle: FifoSaleDetail[];
}

export interface InventoryPresentationRow {
  id: number;
  nombre: string;
  factor: number | string;
  precio_usd: number | string;
}

export interface InventoryReportItem {
  id: number;
  nombre: string;
  unidad_base?: string | null;
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
  presentaciones: InventoryPresentationRow[];
}

export interface InventoryReportData {
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
  productos: InventoryReportItem[];
}

export interface ReportData {
  success: boolean;
  rango?: { desde: string; hasta: string };
  ventas: SalesReportData;
  rentabilidadFifo: RentabilidadFifoData | null;
  inventario: InventoryReportData;
}

export function getCaracasDateStringClient(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}
