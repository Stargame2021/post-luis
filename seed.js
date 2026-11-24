const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const result = {};
  if (!fs.existsSync(envPath)) return result;

  for (const rawLine of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx !== -1) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return result;
}

function loadDbConfig() {
  const configPath = process.env.DB_CONFIG_PATH
    ? path.resolve(process.env.DB_CONFIG_PATH)
    : path.join(__dirname, '.dbconfig.json');

  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        host: cfg.host || 'localhost',
        port: Number(cfg.port) || 5432,
        user: cfg.user || 'adempiere',
        password: cfg.password || 'adempiere',
        database: cfg.database || 'luis',
        ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
      };
    } catch {
      // fallback to .env / process.env
    }
  }

  const env = parseEnvFile();
  return {
    host: env.DB_HOST || process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: parseInt(env.DB_PORT || process.env.DB_PORT || process.env.PGPORT || '5432', 10),
    user: env.DB_USER || process.env.DB_USER || process.env.PGUSER || 'adempiere',
    password: env.DB_PASSWORD || process.env.DB_PASSWORD || process.env.PGPASSWORD || 'adempiere',
    database: env.DB_DATABASE || process.env.DB_DATABASE || process.env.PGDATABASE || 'luis',
    ssl: (env.DB_SSL || process.env.DB_SSL || process.env.PGSSL) === 'true'
      ? { rejectUnauthorized: false }
      : false,
  };
}

async function seed() {
  const client = new Client(loadDbConfig());
  await client.connect();

  try {
    const sqlDir = path.join(__dirname, 'sql');
    const tablesSql = fs.readFileSync(path.join(sqlDir, '01_tablas.sql'), 'utf-8');
    const seedsSql = fs.readFileSync(path.join(sqlDir, '02_datos_iniciales.sql'), 'utf-8');

    await client.query(tablesSql);
    await client.query(seedsSql);
    console.log('Esquema y datos iniciales aplicados desde sql/01_tablas.sql y sql/02_datos_iniciales.sql.');
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error('Error ejecutando seed.js:', err);
  process.exit(1);
});
