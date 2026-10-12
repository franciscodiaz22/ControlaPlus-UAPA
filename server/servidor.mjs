/**
 * servidor.mjs — backend REST de pruebas de Controla+ (U10 · M6, decisión D4 = A)
 * ---------------------------------------------------------------------------
 * Node.js puro (node:http + node:fs), sin dependencias. Arranque:
 *
 *   node server/servidor.mjs            → http://localhost:3000
 *   PUERTO=4000 node server/servidor.mjs
 *
 * Endpoints (los mismos que usa ApiService con `usarServidorSimulado: false`):
 *   GET  /qr/consultar?codigo=…  → { codigo, encontrado, datos? }
 *   GET  /movimientos            → movimientos guardados (sin los eliminados)
 *   POST /movimientos/lote       → aplica un lote de altas, ediciones y eliminaciones
 *
 * Contrato de POST /movimientos/lote (documentado en api.service.ts):
 *   - el cuerpo es una lista de movimientos completos; el `id` es la clave
 *     idempotente: el mismo movimiento enviado dos veces no se duplica;
 *   - `version` (ausente = 0): se ignora un elemento con versión menor a la
 *     que ya tiene el servidor (también si ese id ya se eliminó);
 *   - `eliminado: true` borra ese id (si no existe, no es un error).
 *   El lote se valida entero antes de aplicar nada: si un elemento no es
 *   válido se responde 400 y no se guarda ningún cambio.
 *
 * Los datos se guardan en server/datos.json (o en DATOS=ruta). Cada petición
 * se registra en la consola. CORS abierto para el navegador (ng serve).
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUERTO = Number(process.env.PUERTO ?? 3000);
const ARCHIVO = process.env.DATOS ?? join(dirname(fileURLToPath(import.meta.url)), 'datos.json');
const LIMITE_CUERPO = 1024 * 1024; // 1 MB
const CONCEPTO_MAX = 80; // el mismo límite que validarMovimiento() en la app

/** Códigos QR conocidos por el servidor (además del JSON de un movimiento). */
const CATALOGO_QR = {
  'CP-CAFE': { concepto: 'Café de la cafetería UAPA', monto: 125, tipo: 'gasto' },
  'CP-TRANSPORTE': { concepto: 'Pasaje de transporte', monto: 60, tipo: 'gasto' },
  'CP-BECA': { concepto: 'Pago de beca', monto: 3500, tipo: 'ingreso' },
};

// ---------------------------------------------------------------- datos
/** { movimientos: { [id]: Movimiento }, eliminados: { [id]: version } } */
function cargar() {
  if (!existsSync(ARCHIVO)) {
    return { movimientos: {}, eliminados: {} };
  }
  const datos = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
  return { movimientos: datos.movimientos ?? {}, eliminados: datos.eliminados ?? {} };
}

function guardar(datos) {
  mkdirSync(dirname(ARCHIVO), { recursive: true });
  const temporal = `${ARCHIVO}.tmp`;
  writeFileSync(temporal, JSON.stringify(datos, null, 2));
  renameSync(temporal, ARCHIVO); // escritura atómica
}

let datos = cargar();

// ---------------------------------------------------------------- validación
const esTipo = (t) => t === 'gasto' || t === 'ingreso';

/** Error del elemento `m` del lote, o null si es válido. */
function errorMovimiento(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'no es un objeto';
  if (typeof m.id !== 'string' || !m.id.trim()) return '`id` obligatorio (texto)';
  if (m.version !== undefined && !(Number.isInteger(m.version) && m.version >= 0)) return '`version` debe ser un entero ≥ 0';
  if (m.eliminado !== undefined && typeof m.eliminado !== 'boolean') return '`eliminado` debe ser true o false';
  if (m.eliminado) return null; // para borrar basta con id y versión
  if (typeof m.concepto !== 'string' || !m.concepto.trim() || m.concepto.trim().length > CONCEPTO_MAX) {
    return `\`concepto\` obligatorio (1–${CONCEPTO_MAX} caracteres)`;
  }
  if (typeof m.monto !== 'number' || !Number.isFinite(m.monto) || m.monto <= 0) return '`monto` debe ser un número mayor que 0';
  if (!esTipo(m.tipo)) return "`tipo` debe ser 'gasto' o 'ingreso'";
  if (typeof m.fecha !== 'string' || Number.isNaN(Date.parse(m.fecha))) return '`fecha` debe ser una fecha ISO 8601';
  return null;
}

/** Datos de un movimiento a partir de un código QR (catálogo o JSON). */
function datosDeCodigo(codigo) {
  if (CATALOGO_QR[codigo]) return CATALOGO_QR[codigo];
  try {
    const p = JSON.parse(codigo);
    if (p && typeof p.concepto === 'string' && typeof p.monto === 'number') {
      return { concepto: p.concepto, monto: p.monto, tipo: p.tipo === 'ingreso' ? 'ingreso' : 'gasto' };
    }
  } catch {
    // no es JSON
  }
  return undefined;
}

// ---------------------------------------------------------------- lote
/** Aplica el lote sobre una copia y solo la adopta si se guardó en disco. */
function aplicarLote(lote) {
  const anterior = datos;
  datos = structuredClone(anterior);
  const resultado = { recibidos: lote.length, aplicados: 0, eliminados: 0, ignorados: [] };
  for (const m of lote) {
    const version = m.version ?? 0;
    const actual = datos.movimientos[m.id]?.version ?? datos.eliminados[m.id] ?? -1;
    if (version < actual) {
      resultado.ignorados.push({ id: m.id, motivo: `versión ${version} anterior a la guardada (${actual})` });
      continue;
    }
    if (m.eliminado) {
      delete datos.movimientos[m.id];
      datos.eliminados[m.id] = version;
      resultado.eliminados++;
      continue;
    }
    // `estado` es solo del teléfono (pendiente/sincronizado): no se guarda.
    const { estado: _estado, ...guardado } = m;
    datos.movimientos[m.id] = { ...guardado, version, recibido: new Date().toISOString() };
    delete datos.eliminados[m.id];
    resultado.aplicados++;
  }
  try {
    guardar(datos);
  } catch (err) {
    datos = anterior; // si no se pudo guardar, no se aplica nada
    throw err;
  }
  return resultado;
}

// ---------------------------------------------------------------- HTTP
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600',
};

function responder(res, estado, cuerpo) {
  const texto = cuerpo === undefined ? '' : JSON.stringify(cuerpo);
  res.writeHead(estado, { ...CORS, ...(texto ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamano = 0;
    req.on('data', (c) => {
      tamano += c.length;
      if (tamano > LIMITE_CUERPO) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { estado: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

async function atender(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const ruta = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    return { estado: 204 }; // preflight CORS
  }

  if (ruta === '/qr/consultar') {
    if (req.method !== 'GET') return { estado: 405, cuerpo: { error: 'Método no permitido' } };
    const codigo = url.searchParams.get('codigo');
    if (!codigo || !codigo.trim()) return { estado: 400, cuerpo: { error: 'Falta el parámetro `codigo`' } };
    const encontrados = datosDeCodigo(codigo.trim());
    return { estado: 200, cuerpo: { codigo, encontrado: !!encontrados, ...(encontrados ? { datos: encontrados } : {}) } };
  }

  if (ruta === '/movimientos') {
    if (req.method !== 'GET') return { estado: 405, cuerpo: { error: 'Método no permitido' } };
    const lista = Object.values(datos.movimientos).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    return { estado: 200, cuerpo: lista };
  }

  if (ruta === '/movimientos/lote') {
    if (req.method !== 'POST') return { estado: 405, cuerpo: { error: 'Método no permitido' } };
    let lote;
    try {
      lote = JSON.parse(await leerCuerpo(req));
    } catch (err) {
      if (err.estado === 413) return { estado: 413, cuerpo: { error: err.message } };
      return { estado: 400, cuerpo: { error: 'El cuerpo no es JSON válido' } };
    }
    if (!Array.isArray(lote)) return { estado: 400, cuerpo: { error: 'El cuerpo debe ser una lista de movimientos' } };
    const errores = lote
      .map((m, i) => ({ indice: i, id: m?.id, error: errorMovimiento(m) }))
      .filter((e) => e.error);
    if (errores.length) return { estado: 400, cuerpo: { error: 'Lote no válido; no se guardó ningún cambio', detalles: errores } };
    return { estado: 200, cuerpo: aplicarLote(lote) };
  }

  if (ruta === '/') {
    return { estado: 200, cuerpo: { servicio: 'Controla+ API de pruebas', endpoints: ['GET /qr/consultar?codigo=', 'GET /movimientos', 'POST /movimientos/lote'] } };
  }
  return { estado: 404, cuerpo: { error: 'Ruta no encontrada' } };
}

const servidor = createServer(async (req, res) => {
  const inicio = Date.now();
  let r;
  try {
    r = await atender(req, res);
  } catch (err) {
    console.error(err);
    r = { estado: 500, cuerpo: { error: 'Error interno del servidor' } };
  }
  responder(res, r.estado, r.cuerpo);
  const c = r.cuerpo;
  const resumen = c && !Array.isArray(c) && 'recibidos' in c
    ? ` · recibidos=${c.recibidos} aplicados=${c.aplicados} eliminados=${c.eliminados} ignorados=${c.ignorados.length}`
    : Array.isArray(c) ? ` · ${c.length} movimiento(s)` : c?.error ? ` · ${c.error}` : '';
  console.log(`${new Date().toISOString()}  ${req.method} ${req.url} → ${r.estado} (${Date.now() - inicio} ms)${resumen}`);
});

servidor.listen(PUERTO, () => {
  console.log(`Controla+ API de pruebas escuchando en http://localhost:${PUERTO}`);
  console.log(`Datos: ${ARCHIVO} · ${Object.keys(datos.movimientos).length} movimiento(s) guardado(s)`);
});
