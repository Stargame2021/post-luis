-- ==============================================================================
-- 03_MIGRACION_IMAGEN_PRODUCTO.SQL - MIGRACION IDEMPOTENTE (DDL)
-- Agrega soporte opcional de imagen ligera/comprimida en m_producto sin tocar semillas
-- ==============================================================================

ALTER TABLE m_producto
  ADD COLUMN IF NOT EXISTS imagen_url TEXT;
