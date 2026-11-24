import fs from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';

// Orden topológico seguro para respetar llaves foráneas de todas las tablas del sistema
export const BACKUP_TABLE_PRIORITY = [
  'm_impuesto',
  'm_tercero',
  'm_producto',
  'm_producto_presentacion',
  'm_tasa',
  'm_rol',
  'm_usuario',
  'm_tipopago',
  'm_banco',
  'm_cuentabancaria',
  't_pedido',
  't_pedidolinea',
  't_compra',
  't_compralinea',
  't_pago',
  't_pago_documento',
] as const;

const LEGACY_COMPATIBILITY_SQL = `
ALTER TABLE m_producto
  ADD COLUMN IF NOT EXISTS impuesto_id INT REFERENCES m_impuesto(id),
  ADD COLUMN IF NOT EXISTS stock_actual NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_promedio_usd NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidad_base VARCHAR(50) NOT NULL DEFAULT 'Unidad';

ALTER TABLE m_producto
  ALTER COLUMN costo_promedio_usd TYPE NUMERIC(14, 4);

UPDATE m_producto SET impuesto_id = 1 WHERE impuesto_id IS NULL;

ALTER TABLE m_usuario
  ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMP WITH TIME ZONE;

ALTER TABLE t_pedido
  ADD COLUMN IF NOT EXISTS tercero_id INT REFERENCES m_tercero(id),
  ADD COLUMN IF NOT EXISTS base_imponible_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_impuesto_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condicion_pago VARCHAR(20) NOT NULL DEFAULT 'CONTADO',
  ADD COLUMN IF NOT EXISTS tipo_pago_id INT REFERENCES m_tipopago(id),
  ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE,
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADO';

ALTER TABLE t_pedido DROP CONSTRAINT IF EXISTS t_pedido_condicion_pago_check;
ALTER TABLE t_pedido ADD CONSTRAINT t_pedido_condicion_pago_check
  CHECK (condicion_pago IN ('CONTADO', 'CREDITO', 'CREDITO_7', 'CREDITO_15', 'CREDITO_30', 'CREDITO_45'));

UPDATE t_pedido SET tipo_pago_id = 1 WHERE tipo_pago_id IS NULL;

ALTER TABLE t_pedidolinea
  ADD COLUMN IF NOT EXISTS impuesto_id INT REFERENCES m_impuesto(id),
  ADD COLUMN IF NOT EXISTS porcentaje_impuesto NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_impuesto_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS presentacion_id INT REFERENCES m_producto_presentacion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS presentacion_nombre VARCHAR(50),
  ADD COLUMN IF NOT EXISTS factor_conversion NUMERIC(12, 3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cantidad_base NUMERIC(14, 3);

UPDATE t_pedidolinea SET cantidad_base = cantidad * factor_conversion WHERE cantidad_base IS NULL;

ALTER TABLE t_compra
  ADD COLUMN IF NOT EXISTS condicion_pago VARCHAR(20) NOT NULL DEFAULT 'CONTADO',
  ADD COLUMN IF NOT EXISTS tipo_pago_id INT REFERENCES m_tipopago(id),
  ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE,
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADO';

ALTER TABLE t_compra DROP CONSTRAINT IF EXISTS t_compra_condicion_pago_check;
ALTER TABLE t_compra ADD CONSTRAINT t_compra_condicion_pago_check
  CHECK (condicion_pago IN ('CONTADO', 'CREDITO', 'CREDITO_7', 'CREDITO_15', 'CREDITO_30', 'CREDITO_45'));

UPDATE t_compra SET tipo_pago_id = 1 WHERE tipo_pago_id IS NULL;

ALTER TABLE t_compralinea
  ADD COLUMN IF NOT EXISTS presentacion_id INT REFERENCES m_producto_presentacion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS presentacion_nombre VARCHAR(50),
  ADD COLUMN IF NOT EXISTS factor_conversion NUMERIC(12, 3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cantidad_base NUMERIC(14, 3);

UPDATE t_compralinea SET cantidad_base = cantidad * factor_conversion WHERE cantidad_base IS NULL;
`;

export function loadCanonicalSqlFile(
  filename: '01_tablas.sql' | '02_datos_iniciales.sql'
): string {
  const filePath = path.join(process.cwd(), 'sql', filename);
  return fs.readFileSync(filePath, 'utf-8');
}

export async function ensureDatabaseSchema(
  runner: Pool | PoolClient,
  options?: { includeSeeds?: boolean }
): Promise<void> {
  const tablesSql = loadCanonicalSqlFile('01_tablas.sql');
  await runner.query(tablesSql);
  await runner.query(LEGACY_COMPATIBILITY_SQL);

  if (options?.includeSeeds !== false) {
    const seedsSql = loadCanonicalSqlFile('02_datos_iniciales.sql');
    await runner.query(seedsSql);
  }
}
