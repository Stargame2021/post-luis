const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

console.log('========================================================');
console.log('   TIENDA EXPRESS POS - MODO DESARROLLO (DEV)');
console.log('========================================================');

let bcv = null;
let server = null;
let shuttingDown = false;

function forwardWithPrefix(stream, target, prefix) {
  if (!stream) return;
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) target.write(`${prefix} ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer.trim()) target.write(`${prefix} ${buffer}\n`);
  });
}

// Iniciar el scraper BCV en segundo plano
try {
  const bcvScript = path.join(__dirname, 'scrape-bcv.js');
  bcv = spawn(process.execPath, [bcvScript, '--daemon'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  forwardWithPrefix(bcv.stdout, process.stdout, '[BCV]');
  forwardWithPrefix(bcv.stderr, process.stderr, '[BCV]');
  bcv.on('error', (err) => {
    console.error('[BCV] Error en proceso sincronizador:', err.message);
  });
  console.log('✓ Sincronizador de tasa BCV iniciado.');
} catch (e) {
  console.warn('! No se pudo iniciar el scraper BCV:', e.message);
}

// Iniciar Next.js en modo dev (con Turbopack rápido)
const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
server = spawn(process.execPath, [nextBin, 'dev', '-p', '3000'], {
  stdio: 'inherit',
  shell: false,
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nApagando servicios (${signal})...`);

  if (bcv && !bcv.killed) {
    try {
      bcv.kill('SIGTERM');
    } catch {}
  }
  if (server && !server.killed) {
    try {
      server.kill('SIGTERM');
    } catch {}
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.on('error', (err) => {
  console.error('Error al iniciar el servidor Next:', err);
});

server.on('close', (code) => {
  if (bcv && !bcv.killed) {
    try {
      bcv.kill('SIGTERM');
    } catch {}
  }
  console.log(`El servidor se cerro con codigo ${code}`);
  process.exit(code ?? 0);
});

// Abrir navegador cuando el puerto 3000 responda
function checkAndOpenBrowser() {
  if (shuttingDown) return;
  const req = http.get('http://localhost:3000', () => {
    console.log('✓ Servidor web activo en http://localhost:3000');
    console.log('✓ Abriendo navegador...');
    spawn('cmd', ['/c', 'start', 'http://localhost:3000'], { detached: true, stdio: 'ignore' }).unref();
  });

  req.on('error', () => {
    if (!shuttingDown) setTimeout(checkAndOpenBrowser, 1000);
  });
}

setTimeout(checkAndOpenBrowser, 2000);
