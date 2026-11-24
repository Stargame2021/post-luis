export interface RowImportPreview {
  producto: string;
  presentacion: string;
  factor: number;
  precio: number;
  existencia: number;
  costo: number;
  impuestoId: number | null;
  esPresentacionSecundaria: boolean;
  isValid: boolean;
  error?: string;
}

export interface GroupedProductoPreview {
  nombre: string;
  unidad_base: string;
  precio_usd: number;
  stock_actual: number;
  costo_promedio_usd: number;
  impuesto_id?: number | null;
  presentaciones: {
    nombre: string;
    factor: number;
    precio_usd: number;
  }[];
}

function pickCell(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== '' && value !== null && value !== undefined) {
        return value;
      }
    }
  }
  return '';
}

function parseOptionalNumber(raw: unknown): { provided: boolean; value: number } {
  const str = String(raw ?? '').trim();
  if (!str) return { provided: false, value: 0 };
  const normalized = str.replace(',', '.');
  const num = Number(normalized);
  return { provided: true, value: num };
}

/**
 * Convierte el PVP final con IVA a precio base de 4 decimales para evitar saltos de redondeo
 * (ej. 0,11 con 16% -> 0,0948 -> round(0,0948 * 1,16, 2) === 0,11).
 */
export function calculateBaseFromFinalPrice(finalUsd: number, taxPct: number): number {
  const safeFinal = Number.isFinite(finalUsd) ? Math.max(0, finalUsd) : 0;
  const safeTax = Number.isFinite(taxPct) && taxPct > 0 ? taxPct : 0;
  const base = safeTax > 0 ? safeFinal / (1 + safeTax / 100) : safeFinal;
  return Number(base.toFixed(4));
}

export function parseExcelImportRows(rows: Record<string, unknown>[]): RowImportPreview[] {
  const parsedRows: RowImportPreview[] = [];

  for (const row of rows) {
    const prodRaw = pickCell(row, [
      'Producto',
      'producto',
      'PRODUCTO',
      'Articulo',
      'articulo',
      'Nombre',
      'nombre',
    ]);
    const producto = String(prodRaw ?? '').trim();
    if (!producto) continue;

    const presRaw = pickCell(row, [
      'Presentacion',
      'presentacion',
      'PRESENTACION',
      'Presentación',
      'Empaque',
      'empaque',
      'Unidad',
      'unidad',
    ]);
    const factorRaw = pickCell(row, [
      'Factor',
      'factor',
      'FACTOR',
      'Unidades por Empaque',
      'Cantidad Empaque',
    ]);
    const precioRaw = pickCell(row, [
      'Precio USD',
      'Precio',
      'precio',
      'PRECIO',
      'PVP',
      'pvp',
    ]);
    const stockRaw = pickCell(row, [
      'Existencia',
      'existencia',
      'EXISTENCIA',
      'Stock',
      'stock',
      'Cantidad',
      'cantidad',
    ]);
    const costoRaw = pickCell(row, [
      'Costo USD',
      'Costo',
      'costo',
      'COSTO',
      'Costo Promedio',
    ]);
    const impuestoRaw = pickCell(row, ['Impuesto ID', 'impuesto_id', 'IVA ID']);

    let presentacion = String(presRaw ?? '')
      .trim()
      .replace(/^\(|\)$/g, '')
      .trim();
    if (!presentacion) {
      presentacion = 'Unidad';
    }

    const errors: string[] = [];

    const parsedFactor = parseOptionalNumber(factorRaw);
    let factor = 1;
    if (parsedFactor.provided) {
      if (!Number.isFinite(parsedFactor.value) || parsedFactor.value <= 0) {
        errors.push('Factor debe ser mayor a 0');
      } else {
        factor = parsedFactor.value;
      }
    } else {
      // Solo palabras de empaque explícitas; nunca extraer números del nombre (ej: "Botella 500ml")
      const lowerPres = presentacion.toLowerCase();
      if (lowerPres === 'sixpack' || lowerPres === 'six pack' || lowerPres === 'six-pack') {
        factor = 6;
      } else if (lowerPres === 'docena') {
        factor = 12;
      }
    }

    const parsedPrecio = parseOptionalNumber(precioRaw);
    const precio = parsedPrecio.provided ? parsedPrecio.value : 0;
    if (!Number.isFinite(precio) || precio < 0) {
      errors.push('Precio inválido');
    }

    const parsedStock = parseOptionalNumber(stockRaw);
    const existencia = parsedStock.provided ? parsedStock.value : 0;
    if (!Number.isFinite(existencia) || existencia < 0) {
      errors.push('Existencia negativa');
    }

    const parsedCosto = parseOptionalNumber(costoRaw);
    const costo = parsedCosto.provided ? parsedCosto.value : 0;
    if (!Number.isFinite(costo) || costo < 0) {
      errors.push('Costo inválido');
    }

    const parsedImp = parseOptionalNumber(impuestoRaw);
    let impuestoId: number | null = null;
    if (parsedImp.provided) {
      if (!Number.isInteger(parsedImp.value) || parsedImp.value <= 0) {
        errors.push('Impuesto ID inválido');
      } else {
        impuestoId = parsedImp.value;
      }
    }

    parsedRows.push({
      producto,
      presentacion,
      factor,
      precio: Number.isFinite(precio) ? precio : 0,
      existencia: Number.isFinite(existencia) ? existencia : 0,
      costo: Number.isFinite(costo) ? costo : 0,
      impuestoId,
      esPresentacionSecundaria: factor > 1,
      isValid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    });
  }

  return parsedRows;
}

export function groupImportRows(parsedRows: RowImportPreview[]): GroupedProductoPreview[] {
  const groupedMap = new Map<string, GroupedProductoPreview>();

  for (const r of parsedRows) {
    const key = r.producto.toLowerCase();
    const existing = groupedMap.get(key);

    if (!existing) {
      groupedMap.set(key, {
        nombre: r.producto,
        unidad_base: r.presentacion || 'Unidad',
        precio_usd: r.precio,
        stock_actual: r.existencia,
        costo_promedio_usd: r.costo,
        ...(r.impuestoId !== null ? { impuesto_id: r.impuestoId } : {}),
        presentaciones: [],
      });
    } else if (r.presentacion.toLowerCase() === existing.unidad_base.toLowerCase()) {
      existing.precio_usd = r.precio;
      if (r.existencia > 0) existing.stock_actual = r.existencia;
      if (r.costo > 0) existing.costo_promedio_usd = r.costo;
      if (r.impuestoId !== null) existing.impuesto_id = r.impuestoId;
    } else {
      existing.presentaciones.push({
        nombre: r.presentacion,
        factor: r.factor,
        precio_usd: r.precio,
      });
    }
  }

  return Array.from(groupedMap.values());
}
