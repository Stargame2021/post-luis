import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuloPermiso } from '@/types';

const { mockQuery, mockPoolQuery, mockGetPool, mockGetStoredDbConfig } = vi.hoisted(() => {
  const mockQuery = vi.fn<
    (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
  >(async () => []);
  const mockPoolQuery = vi.fn<
    (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  >(async () => ({ rows: [] }));
  const mockGetPool = vi.fn(() => ({
    query: mockPoolQuery,
    connect: vi.fn(),
    end: vi.fn(async () => undefined),
  }));
  const mockGetStoredDbConfig = vi.fn(() => ({
    host: 'localhost',
    port: 5432,
    user: 'adempiere',
    password: 'secret',
    database: 'luis',
    ssl: false,
  }));

  return {
    mockQuery,
    mockPoolQuery,
    mockGetPool,
    mockGetStoredDbConfig,
  };
});

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    query: mockQuery,
    getPool: mockGetPool,
    getStoredDbConfig: mockGetStoredDbConfig,
    ensureAuthTables: vi.fn(async () => undefined),
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { GET as respaldoGET } from '@/app/api/respaldo/route';
import { getDbConfigFilePath } from '@/lib/db';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import {
  BACKUP_TABLE_PRIORITY,
  ensureDatabaseSchema,
  loadCanonicalSqlFile,
} from '@/lib/schema';
import { SESSION_COOKIE_NAME, createSessionToken } from '@/lib/session';

const ROOT_DIR = process.cwd();

interface MockUser {
  id: number;
  username: string;
  nombre_completo: string;
  email: string | null;
  rol_id: number;
  rol_nombre: string;
  permisos: ModuloPermiso[];
  activo: boolean;
  rol_activo: boolean;
}

const ADMIN_USER: MockUser = {
  id: 1,
  username: 'admin',
  nombre_completo: 'Administrador del Sistema',
  email: 'admin@tiendaexpress.com',
  rol_id: 1,
  rol_nombre: 'ADMINISTRADOR',
  permisos: [...ALL_PERMISSIONS],
  activo: true,
  rol_activo: true,
};

let prevSecret: string | undefined;
let prevDbConfigPath: string | undefined;

beforeAll(() => {
  prevSecret = process.env.AUTH_SECRET;
  prevDbConfigPath = process.env.DB_CONFIG_PATH;
  process.env.AUTH_SECRET = 'vitest-phase3-schema-secret';
});

afterAll(() => {
  if (prevSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = prevSecret;
  }

  if (prevDbConfigPath === undefined) {
    delete process.env.DB_CONFIG_PATH;
  } else {
    process.env.DB_CONFIG_PATH = prevDbConfigPath;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM m_usuario u') && sql.includes('JOIN m_rol r')) {
      return [ADMIN_USER as unknown as Record<string, unknown>];
    }
    return [];
  });
  mockPoolQuery.mockResolvedValue({ rows: [] });
});

describe('1. Fuente única SQL (sql/01_tablas.sql + sql/02_datos_iniciales.sql)', () => {
  it('01_tablas.sql define las 17 tablas canónicas y los 31 índices esperados', () => {
    const tablesSql = loadCanonicalSqlFile('01_tablas.sql');
    expect(BACKUP_TABLE_PRIORITY).toHaveLength(17);

    for (const table of BACKUP_TABLE_PRIORITY) {
      expect(tablesSql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }

    const indexMatches = tablesSql.match(/CREATE INDEX IF NOT EXISTS\s+/g) ?? [];
    expect(indexMatches).toHaveLength(31);
  });

  it('02_datos_iniciales.sql no contiene ON CONFLICT DO UPDATE y protege la inserción de productos demo', () => {
    const seedsSql = loadCanonicalSqlFile('02_datos_iniciales.sql');
    expect(seedsSql.toUpperCase()).not.toContain('DO UPDATE');
    expect(seedsSql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(seedsSql).toContain('WHERE NOT EXISTS (SELECT 1 FROM m_producto LIMIT 1)');
  });
});

describe('2. Runner unificado ensureDatabaseSchema y configuración DB', () => {
  it('ensureDatabaseSchema ejecuta 01_tablas.sql, compatibilidad legacy y 02_datos_iniciales.sql (opcional)', async () => {
    const executedSql: string[] = [];
    const fakeRunner = {
      query: vi.fn(async (sql: string) => {
        executedSql.push(sql);
        return { rows: [] };
      }),
    } as unknown as PoolClient;

    await ensureDatabaseSchema(fakeRunner);
    expect(executedSql).toHaveLength(3);
    expect(executedSql[0]).toContain('CREATE TABLE IF NOT EXISTS t_pago_documento');
    expect(executedSql[1]).toContain('ALTER TABLE t_pedido');
    expect(executedSql[2]).toContain('INSERT INTO m_tipopago');

    executedSql.length = 0;
    await ensureDatabaseSchema(fakeRunner, { includeSeeds: false });
    expect(executedSql).toHaveLength(2);
  });

  it('src/lib/db.ts delega en ensureDatabaseSchema sin DO UPDATE embebido y respeta DB_CONFIG_PATH', () => {
    const dbSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'lib', 'db.ts'), 'utf-8');
    expect(dbSource.toUpperCase()).not.toContain('DO UPDATE');
    expect(dbSource).toContain('ensureDatabaseSchema(getPool())');

    process.env.DB_CONFIG_PATH = '/app/data/.dbconfig.json';
    expect(getDbConfigFilePath()).toBe(path.resolve('/app/data/.dbconfig.json'));
    delete process.env.DB_CONFIG_PATH;
    expect(getDbConfigFilePath()).toBe(path.join(ROOT_DIR, '.dbconfig.json'));
  });
});

describe('3. Respaldo SQL seguro (/api/respaldo)', () => {
  it('exporta las 16 tablas en orden seguro de FK, filtra tablas fuera de lista blanca y redacta password_hash', async () => {
    mockPoolQuery.mockImplementation(async (sql) => {
      if (sql.includes('information_schema.tables')) {
        return {
          rows: [
            { table_name: 't_pago_documento' },
            { table_name: 't_pago' },
            { table_name: 'm_banco' },
            { table_name: 'm_cuentabancaria' },
            { table_name: 'm_usuario' },
            { table_name: 'm_rol' },
            { table_name: 'evil_table"; DROP TABLE t_pedido; --' },
          ],
        };
      }
      if (sql.includes('FROM "m_rol"')) {
        return { rows: [{ id: 1, nombre: 'ADMINISTRADOR' }] };
      }
      if (sql.includes('FROM "m_usuario"')) {
        return {
          rows: [{ id: 1, username: 'admin', password_hash: 'scrypt$secret$hash' }],
        };
      }
      if (sql.includes('FROM "m_banco"')) {
        return { rows: [{ id: 1, nombre: 'Caja Principal' }] };
      }
      if (sql.includes('FROM "m_cuentabancaria"')) {
        return { rows: [{ id: 1, banco_id: 1, nombre: 'Caja USD' }] };
      }
      if (sql.includes('FROM "t_pago"')) {
        return { rows: [{ id: 1, monto_original: 10 }] };
      }
      if (sql.includes('FROM "t_pago_documento"')) {
        return { rows: [{ id: 1, pago_id: 1, pedido_id: 1 }] };
      }
      return { rows: [] };
    });

    const token = createSessionToken(ADMIN_USER.id, 3600);
    const res = await respaldoGET(
      new Request('http://localhost/api/respaldo', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      })
    );

    expect(res.status).toBe(200);
    const sqlDump = await res.text();
    expect(sqlDump).not.toContain('evil_table');
    expect(sqlDump).not.toContain('scrypt$secret$hash');
    expect(sqlDump).toContain("'__REDACTED_RESET_REQUIRED__'");

    // Orden topológico: m_rol < m_usuario, m_banco < m_cuentabancaria, t_pago < t_pago_documento
    expect(sqlDump.indexOf('INSERT INTO "m_rol"')).toBeLessThan(sqlDump.indexOf('INSERT INTO "m_usuario"'));
    expect(sqlDump.indexOf('INSERT INTO "m_banco"')).toBeLessThan(
      sqlDump.indexOf('INSERT INTO "m_cuentabancaria"')
    );
    expect(sqlDump.indexOf('INSERT INTO "t_pago"')).toBeLessThan(
      sqlDump.indexOf('INSERT INTO "t_pago_documento"')
    );
  });
});

describe('4. Despliegue Docker, Next.js standalone y portabilidad de scripts Windows', () => {
  it('next.config.ts, Dockerfile y docker-compose.yml están alineados para standalone + ./sql + /app/data', () => {
    const nextConfig = fs.readFileSync(path.join(ROOT_DIR, 'next.config.ts'), 'utf-8');
    const dockerfile = fs.readFileSync(path.join(ROOT_DIR, 'Dockerfile'), 'utf-8');
    const compose = fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.yml'), 'utf-8');

    expect(nextConfig).toMatch(/output:\s*['"]standalone['"]/);
    expect(dockerfile).toContain('/app/data');
    expect(dockerfile).toContain('COPY --from=builder --chown=nextjs:nodejs /app/sql ./sql');
    expect(compose).toContain('./sql:/docker-entrypoint-initdb.d:ro');
    expect(compose).not.toContain('./init.sql');
    expect(compose).toContain('DB_CONFIG_PATH: /app/data/.dbconfig.json');
    expect(compose).toContain('app_data:/app/data');
  });

  it('scripts Windows (.bat, .vbs, .ps1) son portables, apuntan a icono existente y no usan Invoke-Expression', () => {
    const batAndVbsFiles = [
      'compilar-produccion.bat',
      'iniciar-pos-node.bat',
      'iniciar-pos-dev.bat',
      'generar_acceso_directo.bat',
      'generar_acceso_directo_dev.bat',
      'crear_acceso_directo.vbs',
      'crear_acceso_directo_dev.vbs',
      path.join('scripts', 'hacer-respaldo.bat'),
      path.join('scripts', 'programar-respaldo-automatico.bat'),
    ];

    for (const relPath of batAndVbsFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');
      expect(content.toLowerCase()).not.toContain('c:\\app\\post-luis');
      expect(content.toLowerCase()).not.toContain('public\\favicon.ico');
    }

    const vbsMain = fs.readFileSync(path.join(ROOT_DIR, 'crear_acceso_directo.vbs'), 'utf-8');
    expect(vbsMain).toContain('public\\icono.ico');
    expect(vbsMain).toContain('GetParentFolderName(WScript.ScriptFullName)');

    const ps1 = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'reset-transacciones.ps1'), 'utf-8');
    expect(ps1).not.toContain('Invoke-Expression');
    expect(ps1).toContain('& docker @dockerArgs');
  });
});
