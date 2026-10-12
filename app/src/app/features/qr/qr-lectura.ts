/**
 * qr-lectura.ts — reglas de la lectura QR (U8), sin dependencias de Angular.
 * ---------------------------------------------------------------------------
 *  - interpretarFallo(): traduce los errores del escáner (ML Kit / Capacitor)
 *    a un tipo y un mensaje en español. Cancelar no se trata como error.
 *  - rutaParaMlKit(): ruta de una foto de @capacitor/camera → URI para ML Kit.
 *  - analizarContenido(): texto leído → vacío, enlace http(s) o texto/datos.
 *  - movimientoDesdeQr(): valida los datos de un QR de Controla+ con las
 *    mismas reglas que el resto de la app antes de crear un movimiento.
 */
import { DatosMovimiento, validarMovimiento } from '../movimientos/validacion';

export type TipoFalloQr = 'cancelado' | 'permiso' | 'no-soportado' | 'modulo' | 'error';

export interface FalloQr {
  tipo: TipoFalloQr;
  mensaje: string;
}

const MENSAJES_FALLO: Record<TipoFalloQr, string> = {
  cancelado: 'Escaneo cancelado. Pulsa «Escanear QR» para intentarlo de nuevo.',
  permiso: 'No hay permiso para usar la cámara. Actívalo en los ajustes del teléfono e inténtalo de nuevo.',
  'no-soportado': 'La cámara o el escáner QR no están disponibles en este dispositivo.',
  modulo: 'El módulo de escaneo de Google todavía no está disponible. Espera a que termine de instalarse e inténtalo de nuevo.',
  error: 'No se pudo abrir la cámara o leer el código. Inténtalo de nuevo.',
};

/** Mensajes propios de "Leer QR desde una foto" (@capacitor/camera). */
const MENSAJES_FALLO_FOTO: Partial<Record<TipoFalloQr, string>> = {
  cancelado: 'No se eligió ninguna foto. Pulsa «Tomar foto» o «Elegir de la galería» para intentarlo de nuevo.',
  permiso: 'No hay permiso para usar la cámara o la galería. Actívalo en los ajustes del teléfono e inténtalo de nuevo.',
  error: 'No se pudo obtener la foto. Inténtalo de nuevo.',
};

/**
 * Error del escáner o de la cámara → tipo + mensaje claro (nunca el texto
 * técnico en inglés). `origen` 'foto' usa los mensajes de la lectura desde una foto.
 */
export function interpretarFallo(err: unknown, origen: 'escaner' | 'foto' = 'escaner'): FalloQr {
  const texto = `${(err as { message?: unknown } | null)?.message ?? err ?? ''}`.toLowerCase();
  let tipo: TipoFalloQr = 'error';
  if (texto.includes('cancel')) {
    tipo = 'cancelado';
  } else if (
    texto.includes('permission') ||
    texto.includes('permiso') ||
    texto.includes('denied') ||
    texto.includes("access wasn't provided")
  ) {
    tipo = 'permiso';
  } else if (texto.includes('module') || texto.includes('módulo')) {
    tipo = 'modulo';
  } else if (texto.includes('not implemented') || texto.includes('unimplemented') || texto.includes('not supported') || texto.includes('no camera')) {
    tipo = 'no-soportado';
  }
  const mensaje = (origen === 'foto' && MENSAJES_FALLO_FOTO[tipo]) || MENSAJES_FALLO[tipo];
  return { tipo, mensaje };
}

/**
 * Ruta de la foto (@capacitor/camera) → ruta que acepta ML Kit
 * (readBarcodesFromImage). En Android la cámara devuelve una ruta absoluta
 * del sistema de archivos y ML Kit necesita una URI (file:// o content://).
 */
export function rutaParaMlKit(uri: string | null | undefined): string | null {
  const ruta = (uri ?? '').trim();
  if (!ruta) {
    return null;
  }
  return ruta.startsWith('/') ? `file://${ruta}` : ruta;
}

export type ContenidoQr =
  | { tipo: 'vacio' }
  | { tipo: 'enlace'; texto: string; url: string }
  | { tipo: 'texto'; texto: string };

/** Clasifica el texto leído. Solo se consideran enlaces las URL http(s). */
export function analizarContenido(valor: string | null | undefined): ContenidoQr {
  const texto = (valor ?? '').trim();
  if (!texto) {
    return { tipo: 'vacio' };
  }
  try {
    const url = new URL(texto);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { tipo: 'enlace', texto, url: url.href };
    }
  } catch {
    // no es una URL
  }
  return { tipo: 'texto', texto };
}

/** Datos de un movimiento leídos de un QR → validados (concepto, monto, tipo). */
export function movimientoDesdeQr(
  datos: { concepto?: unknown; monto?: unknown; tipo?: unknown } | undefined,
): { ok: true; datos: DatosMovimiento } | { ok: false; mensaje: string } {
  if (!datos) {
    return { ok: false, mensaje: 'El código no contiene datos de un movimiento.' };
  }
  const resultado = validarMovimiento(datos);
  return resultado.ok
    ? { ok: true, datos: resultado.datos }
    : { ok: false, mensaje: `Los datos del QR no son válidos: ${resultado.mensaje}` };
}
