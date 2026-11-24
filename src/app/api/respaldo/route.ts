import { NextResponse } from 'next/server';
import { getStoredDbConfig, getPool } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { BACKUP_TABLE_PRIORITY } from '@/lib/schema';

const ALLOWED_BACKUP_TABLES = new Set<string>(BACKUP_TABLE_PRIORITY);

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Identificador SQL inválido: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const auth = await requireAuth(req, { adminOnly: true, permissions: ['maintenance'] });
  if (!auth.ok) return auth.response;

  const pool = getPool();
  try {
    const config = getStoredDbConfig();

    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const discoveredSet = new Set<string>(
      tablesRes.rows
        .map((r) => String(r.table_name))
        .filter((name) => ALLOWED_BACKUP_TABLES.has(name))
    );

    const sortedTables = BACKUP_TABLE_PRIORITY.filter((table) => discoveredSet.has(table));

    let sqlDump = `-- =============================================================================\n`;
    sqlDump += `-- RESPALDO DE BASE DE DATOS TIENDA EXPRESS POS (ERP EXPRESS)\n`;
    sqlDump += `-- Generado: ${new Date().toISOString()}\n`;
    sqlDump += `-- Base de Datos: ${config.database}\n`;
    sqlDump += `-- =============================================================================\n\n`;
    sqlDump += `SET statement_timeout = 0;\n`;
    sqlDump += `SET client_encoding = 'UTF8';\n`;
    sqlDump += `SET standard_conforming_strings = on;\n\n`;

    for (const table of sortedTables) {
      const safeTable = quoteIdent(table);
      const dataRes = await pool.query(`SELECT * FROM ${safeTable} ORDER BY id ASC`);
      if (dataRes.rows.length === 0) continue;

      sqlDump += `-- -------------------------------------------------------------\n`;
      sqlDump += `-- Datos de la tabla: ${table} (${dataRes.rows.length} registros)\n`;
      if (table === 'm_usuario') {
        sqlDump += `-- NOTA DE SEGURIDAD: Las contraseñas (password_hash) fueron omitidas/redactadas por seguridad.\n`;
      }
      sqlDump += `-- -------------------------------------------------------------\n`;

      const columns = Object.keys(dataRes.rows[0]);
      const colList = columns.map((c) => quoteIdent(c)).join(', ');

      for (const row of dataRes.rows) {
        const values = columns
          .map((col) => {
            const val =
              table === 'm_usuario' && col === 'password_hash'
                ? '__REDACTED_RESET_REQUIRED__'
                : row[col];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number') return val;
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
          })
          .join(', ');

        sqlDump += `INSERT INTO ${safeTable} (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
      }

      sqlDump += `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${safeTable}), 1), true);\n\n`;
    }

    const filename = `backup_pos_${new Date().toISOString().slice(0, 10)}_${Date.now()}.sql`;

    return new Response(sqlDump, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error('Error generando respaldo SQL:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al generar respaldo de la base de datos',
      },
      { status: 500 }
    );
  }
}
