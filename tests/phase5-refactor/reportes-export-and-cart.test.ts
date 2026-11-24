import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildFifoCsv,
  buildFifoExportSheets,
  buildInventoryCsv,
  buildInventoryExportSheets,
  buildSalesCsv,
  buildSalesExportSheets,
} from '@/lib/export-reportes';
import { calculateCartTotals, type CartItem } from '@/hooks/usePosCart';
import type {
  InventoryReportData,
  RentabilidadFifoData,
  SalesReportData,
} from '@/components/reportes/types';
import type { Producto } from '@/types';

const ROOT_DIR = process.cwd();

const SAMPLE_SALES: SalesReportData = {
  resumen: {
    totalVentasUsd: 116,
    totalVentasLocal: 5800,
    totalBaseUsd: 100,
    totalBaseLocal: 5000,
    totalIvaUsd: 16,
    totalIvaLocal: 800,
    cantidadPedidos: 1,
    ticketPromedioUsd: 116,
    totalUnidadesVendidas: 2,
  },
  pedidos: [
    {
      id: 45,
      fecha_hora: '2026-11-24T12:00:00.000-04:00',
      cliente_nombre: 'Cliente #1 VIP',
      cliente_identificacion: 'V-12345678',
      tasa_cambio_aplicada: 50,
      base_imponible_usd: 100,
      monto_impuesto_usd: 16,
      total_usd: 116,
      total_moneda_local: 5800,
      base_imponible_bs: 5000,
      monto_impuesto_bs: 800,
      total_articulos: 1,
      lineas: [
        {
          id: 1,
          producto_id: 7,
          producto_nombre: 'Queso #1',
          unidad_base: 'Kg',
          presentacion_nombre: 'Kg',
          cantidad: 2,
          precio_unitario_usd: 50,
          porcentaje_impuesto: 16,
          monto_impuesto_usd: 16,
          subtotal_usd: 100,
        },
      ],
    },
  ],
};

const SAMPLE_FIFO: RentabilidadFifoData = {
  resumen: {
    totalIngresosUsd: 100,
    totalCostosFifoUsd: 60,
    totalUtilidadBrutaUsd: 40,
    margenGlobalPorcentaje: 40,
  },
  porProducto: [
    {
      producto_id: 7,
      producto_nombre: 'Queso #1',
      unidades_vendidas: 2,
      ingreso_total_usd: 100,
      costo_fifo_total_usd: 60,
      utilidad_bruta_usd: 40,
      margen_porcentaje: 40,
    },
  ],
  ventasDetalle: [
    {
      linea_id: 1,
      pedido_id: 45,
      fecha_hora: '2026-11-24T12:00:00.000-04:00',
      cliente_nombre: 'Cliente #1 VIP',
      producto_id: 7,
      producto_nombre: 'Queso #1',
      cantidad: 2,
      cantidad_base: 2,
      presentacion_nombre: 'Kg',
      unidad_base: 'Kg',
      precio_unitario_usd: 50,
      ingreso_usd: 100,
      costo_fifo_total_usd: 60,
      costo_unitario_ponderado_fifo: 30,
      utilidad_bruta_usd: 40,
      margen_porcentaje: 40,
      lotes_consumidos: [],
    },
  ],
};

const SAMPLE_INVENTORY: InventoryReportData = {
  resumen: {
    totalProductos: 1,
    productosActivos: 1,
    totalUnidadesEnStock: 10,
    valorTotalCostoUsd: 30,
    valorTotalVentaUsd: 50,
    utilidadPotencialGlobalUsd: 20,
    margenPotencialGlobalPct: 40,
    productosAgotados: 0,
    productosStockBajo: 0,
  },
  productos: [
    {
      id: 7,
      nombre: 'Queso #1',
      unidad_base: 'Kg',
      precio_usd: 5,
      costo_promedio_usd: 3,
      stock_actual: 10,
      valor_costo_usd: 30,
      valor_venta_usd: 50,
      utilidad_potencial_usd: 20,
      margen_potencial_porcentaje: 40,
      activo: true,
      impuesto_nombre: 'IVA 16%',
      impuesto_porcentaje: 16,
      presentaciones: [],
    },
  ],
};

describe('Phase 5 · Exportadores de Reportes y Totales POS', () => {
  it('buildSalesExportSheets / Fifo / Inventory no producen undefined y soportan modos de moneda', () => {
    for (const mode of ['ambas', 'usd', 'bs'] as const) {
      const sheets = buildSalesExportSheets(SAMPLE_SALES, mode, 50, '2026-11-01', '2026-11-24');
      expect(sheets.ventasRows.length).toBe(2);
      expect(sheets.itemRows.length).toBe(2);
      expect(sheets.resumenRows.flat().some((cell) => cell === undefined)).toBe(false);
    }

    const fifoSheets = buildFifoExportSheets(SAMPLE_FIFO, 50, '2026-11-01', '2026-11-24');
    expect(fifoSheets.prodRows.length).toBe(2);
    expect(fifoSheets.detalleRows.length).toBe(2);
    expect(fifoSheets.resumenRows.flat().some((cell) => cell === undefined)).toBe(false);

    const invSheets = buildInventoryExportSheets(SAMPLE_INVENTORY, 50, '24/11/2026');
    expect(invSheets.invRows.length).toBe(2);
    expect(invSheets.sumRows.flat().some((cell) => cell === undefined)).toBe(false);
  });

  it('CSV builders preservan caracteres # para descargas vía Blob', () => {
    const salesCsv = buildSalesCsv(SAMPLE_SALES, 'ambas');
    expect(salesCsv).toContain('Cliente #1 VIP');
    expect(salesCsv).toContain('Queso #1');

    const fifoCsv = buildFifoCsv(SAMPLE_FIFO);
    expect(fifoCsv).toContain('Queso #1');

    const invCsv = buildInventoryCsv(SAMPLE_INVENTORY, 50);
    expect(invCsv).toContain('Queso #1');
  });

  it('calculateCartTotals discrimina base exenta, base gravada, IVA y total en Bs.', () => {
    const prodGravado: Producto = {
      id: 1,
      nombre: 'Producto IVA',
      precio_usd: 10,
      stock_actual: 10,
      costo_promedio_usd: 5,
      impuesto_id: 1,
      impuesto_porcentaje: 16,
      activo: true,
    };
    const prodExento: Producto = {
      id: 2,
      nombre: 'Producto Exento',
      precio_usd: 5,
      stock_actual: 10,
      costo_promedio_usd: 2,
      impuesto_id: 2,
      impuesto_porcentaje: 0,
      activo: true,
    };

    const cart: CartItem[] = [
      {
        id: '1-base',
        producto: prodGravado,
        presentacion_id: null,
        presentacion_nombre: 'Unidad',
        factor: 1,
        precio_unitario_usd: 10,
        cantidad: 2,
      },
      {
        id: '2-base',
        producto: prodExento,
        presentacion_id: null,
        presentacion_nombre: 'Unidad',
        factor: 1,
        precio_unitario_usd: 5,
        cantidad: 1,
      },
    ];

    const totals = calculateCartTotals(cart, 50);
    expect(totals.baseImponibleUsd).toBe(25);
    expect(totals.baseGravadaUsd).toBe(20);
    expect(totals.baseExentaUsd).toBe(5);
    expect(totals.montoImpuestoUsd).toBe(3.2);
    expect(totals.totalUsd).toBe(28.2);
    expect(totals.totalLocal).toBe(1410);
  });
});

describe('Phase 5 · Verificaciones estructurales de arquitectura, runtime y CI', () => {
  it('scrape-bcv.js y src/lib/bcv.ts comparten lib/bcv-core.cjs y Dockerfile.bcv lo empaqueta', () => {
    const scraperSrc = fs.readFileSync(path.join(ROOT_DIR, 'scrape-bcv.js'), 'utf-8');
    const bcvSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'lib', 'bcv.ts'), 'utf-8');
    const dockerfileBcv = fs.readFileSync(path.join(ROOT_DIR, 'Dockerfile.bcv'), 'utf-8');

    expect(scraperSrc).toContain("require('./lib/bcv-core.cjs')");
    expect(bcvSrc).toContain("lib/bcv-core.cjs");
    expect(dockerfileBcv).toContain('COPY lib ./lib');
  });

  it('server.js y server-dev.js capturan SIGINT/SIGTERM y no silencian logs del daemon BCV', () => {
    for (const file of ['server.js', 'server-dev.js']) {
      const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf-8');
      expect(content).toContain("process.on('SIGINT'");
      expect(content).toContain("process.on('SIGTERM'");
      expect(content).toContain("stdio: ['ignore', 'pipe', 'pipe']");
    }
  });

  it('SVGs boilerplate eliminados, layout enlaza icono.ico, cero alert/confirm nativos y CI activo', () => {
    for (const svg of ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg']) {
      expect(fs.existsSync(path.join(ROOT_DIR, 'public', svg))).toBe(false);
    }

    const layoutSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'layout.tsx'), 'utf-8');
    expect(layoutSrc).toContain('/icono.ico');
    expect(layoutSrc).toContain('ToastProvider');

    const compDir = path.join(ROOT_DIR, 'src', 'components');
    const scanFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...scanFiles(full));
        else if (entry.name.endsWith('.tsx')) out.push(full);
      }
      return out;
    };

    for (const filePath of scanFiles(compDir)) {
      const src = fs.readFileSync(filePath, 'utf-8');
      expect(src).not.toMatch(/\b(alert|confirm)\(/);
    }

    const ciPath = path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const ciSrc = fs.readFileSync(ciPath, 'utf-8');
    expect(ciSrc).toContain('npm run lint:core');
    expect(ciSrc).toContain('npm run typecheck');
    expect(ciSrc).toContain('npm test');
    expect(ciSrc).toContain('npm run build');
  });
});
