import { describe, expect, it } from 'vitest';
import {
  calculateFifoRentabilidad,
  calculateInventoryValuation,
  type FifoOrderLineInput,
  type FifoProductInput,
  type FifoPurchaseBatchInput,
  type InventoryRowInput,
} from '@/services/fifo';

describe('Phase 5 · Servicio puro FIFO y valorización (src/services/fifo.ts)', () => {
  it('calculateFifoRentabilidad consume lotes cronológicamente, recurre a costo_promedio_usd y filtra por rango VET', () => {
    const products: FifoProductInput[] = [
      { id: 1, nombre: 'Café 500g', costo_promedio_usd: 4, precio_usd: 8, stock_actual: 5 },
      { id: 2, nombre: 'Azúcar 1kg', costo_promedio_usd: 1.2, precio_usd: 2.5, stock_actual: 10 },
    ];

    const purchaseBatches: FifoPurchaseBatchInput[] = [
      {
        linea_id: 101,
        compra_id: 1,
        numero_factura: 'F-001',
        fecha_emision: '2026-11-01',
        producto_id: 1,
        cantidad: 5,
        costo_unitario_usd: 3,
      },
      {
        linea_id: 102,
        compra_id: 2,
        numero_factura: 'F-002',
        fecha_emision: '2026-11-10',
        producto_id: 1,
        cantidad: 5,
        costo_unitario_usd: 5,
      },
    ];

    const orderLines: FifoOrderLineInput[] = [
      // Venta previa fuera del rango solicitado, pero consume 3 unidades del primer lote ($3)
      {
        linea_id: 201,
        pedido_id: 10,
        fecha_hora: '2026-11-05T14:00:00.000-04:00',
        cliente_nombre: 'Cliente Histórico',
        producto_id: 1,
        producto_nombre: 'Café 500g',
        cantidad: 3,
        cantidad_base: 3,
        precio_unitario_usd: 8,
        subtotal_usd: 24,
      },
      // Venta dentro del rango: toma 2 de F-001 ($6), 5 de F-002 ($25) y 2 con fallback ($8) = $39
      {
        linea_id: 202,
        pedido_id: 11,
        fecha_hora: '2026-11-20T22:30:00.000-04:00',
        cliente_nombre: 'Ana Pérez',
        producto_id: 1,
        producto_nombre: 'Café 500g',
        cantidad: 9,
        cantidad_base: 9,
        precio_unitario_usd: 8,
        subtotal_usd: 72,
      },
      // Venta de producto sin lotes registrados (usa costo_promedio_usd = 1.2) y subtotal 0 edge case
      {
        linea_id: 203,
        pedido_id: 12,
        fecha_hora: '2026-11-21T10:00:00.000-04:00',
        cliente_nombre: 'Luis Gómez',
        producto_id: 2,
        producto_nombre: 'Azúcar 1kg',
        cantidad: 2,
        cantidad_base: 2,
        precio_unitario_usd: 0,
        subtotal_usd: 0,
      },
    ];

    const result = calculateFifoRentabilidad({
      products,
      purchaseBatches,
      orderLines,
      startIso: '2026-11-20T00:00:00.000-04:00',
      endIso: '2026-11-21T23:59:59.999-04:00',
    });

    expect(result.ventasDetalle).toHaveLength(2);
    const cafeSale = result.ventasDetalle.find((v) => v.pedido_id === 11);
    expect(cafeSale?.costo_fifo_total_usd).toBe(39);
    expect(cafeSale?.utilidad_bruta_usd).toBe(33);
    expect(cafeSale?.lotes_consumidos).toEqual([
      { compra_id: 1, numero_factura: 'F-001', costo_unitario_usd: 3, cantidad_consumida: 2 },
      { compra_id: 2, numero_factura: 'F-002', costo_unitario_usd: 5, cantidad_consumida: 5 },
      { costo_unitario_usd: 4, cantidad_consumida: 2, es_costo_base: true },
    ]);

    const sugarSale = result.ventasDetalle.find((v) => v.pedido_id === 12);
    expect(sugarSale?.margen_porcentaje).toBe(0);
    expect(sugarSale?.costo_fifo_total_usd).toBe(2.4);

    // Ordenado por utilidad_bruta_usd DESC: Café ($33) antes de Azúcar (-$2.4)
    expect(result.porProducto[0].producto_id).toBe(1);
    expect(result.resumen.totalIngresosUsd).toBe(72);
    expect(result.resumen.totalCostosFifoUsd).toBe(41.4);
    expect(result.resumen.totalUtilidadBrutaUsd).toBe(30.6);
  });

  it('calculateInventoryValuation clasifica agotados, stock bajo y proyecta utilidad global', () => {
    const rows: InventoryRowInput[] = [
      {
        id: 1,
        nombre: 'Harina PAN',
        precio_usd: 1.5,
        stock_actual: 20,
        costo_promedio_usd: 1.0,
        unidad_base: 'Kg',
        activo: true,
        impuesto_nombre: 'Exento',
        impuesto_porcentaje: 0,
        presentaciones: [],
      },
      {
        id: 2,
        nombre: 'Aceite',
        precio_usd: 4.0,
        stock_actual: 3,
        costo_promedio_usd: 2.5,
        unidad_base: 'Litro',
        activo: true,
        impuesto_nombre: 'IVA 16%',
        impuesto_porcentaje: 16,
        presentaciones: [],
      },
      {
        id: 3,
        nombre: 'Sal',
        precio_usd: 1.0,
        stock_actual: 0,
        costo_promedio_usd: 0.5,
        unidad_base: 'Kg',
        activo: false,
        impuesto_nombre: 'Exento',
        impuesto_porcentaje: 0,
        presentaciones: null,
      },
    ];

    const inv = calculateInventoryValuation(rows);
    expect(inv.resumen.totalProductos).toBe(3);
    expect(inv.resumen.productosActivos).toBe(2);
    expect(inv.resumen.totalUnidadesEnStock).toBe(23);
    expect(inv.resumen.valorTotalCostoUsd).toBe(27.5);
    expect(inv.resumen.valorTotalVentaUsd).toBe(42);
    expect(inv.resumen.utilidadPotencialGlobalUsd).toBe(14.5);
    expect(inv.resumen.productosAgotados).toBe(1);
    expect(inv.resumen.productosStockBajo).toBe(1);
  });
});
