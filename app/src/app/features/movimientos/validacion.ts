/**
 * validacion.ts — reglas de un movimiento introducido por el usuario (U9).
 * ---------------------------------------------------------------------------
 * Función pura compartida por las alertas de Inicio y el formulario de
 * alta/edición. No cambia nada de MovimientosService: solo decide si los
 * datos se pueden guardar y devuelve los valores ya limpios.
 *
 * El límite del concepto es el mismo que acepta Compartir Cerca al recibir
 * (CONCEPTO_MAX), para que cualquier movimiento guardado se pueda compartir.
 */
import { CONCEPTO_MAX } from '../../core/compartir/ble-protocolo';
import { TipoMovimiento } from '../../core/offline/movimiento.model';

export { CONCEPTO_MAX };

export interface DatosMovimiento {
  concepto: string;
  monto: number;
  tipo: TipoMovimiento;
}

export type CampoMovimiento = keyof DatosMovimiento;

export type ResultadoValidacion =
  | { ok: true; datos: DatosMovimiento }
  | { ok: false; errores: Partial<Record<CampoMovimiento, string>>; mensaje: string };

export const MENSAJES_VALIDACION = {
  conceptoVacio: 'Escribe un concepto.',
  conceptoLargo: `El concepto admite como máximo ${CONCEPTO_MAX} caracteres.`,
  montoVacio: 'Escribe un monto.',
  montoInvalido: 'El monto debe ser un número.',
  montoNoPositivo: 'El monto debe ser mayor que 0.',
  tipoInvalido: 'Elige si es un ingreso o un gasto.',
} as const;

/** Quita espacios al principio y al final y deja uno solo entre palabras. */
export function limpiarConcepto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Valida y normaliza concepto, monto y tipo. El monto puede llegar como
 * número (formulario) o como texto (alertas); se conservan sus decimales.
 */
export function validarMovimiento(entrada: { concepto?: unknown; monto?: unknown; tipo?: unknown }): ResultadoValidacion {
  const errores: Partial<Record<CampoMovimiento, string>> = {};

  const concepto = limpiarConcepto(entrada.concepto);
  if (!concepto) {
    errores.concepto = MENSAJES_VALIDACION.conceptoVacio;
  } else if (concepto.length > CONCEPTO_MAX) {
    errores.concepto = MENSAJES_VALIDACION.conceptoLargo;
  }

  const textoMonto = typeof entrada.monto === 'string' ? entrada.monto.trim() : entrada.monto;
  const monto = typeof textoMonto === 'number' ? textoMonto : typeof textoMonto === 'string' ? Number(textoMonto) : Number.NaN;
  if (textoMonto === '' || textoMonto === null || textoMonto === undefined) {
    errores.monto = MENSAJES_VALIDACION.montoVacio;
  } else if (!Number.isFinite(monto)) {
    errores.monto = MENSAJES_VALIDACION.montoInvalido;
  } else if (monto <= 0) {
    errores.monto = MENSAJES_VALIDACION.montoNoPositivo;
  }

  const tipo = entrada.tipo;
  if (tipo !== 'ingreso' && tipo !== 'gasto') {
    errores.tipo = MENSAJES_VALIDACION.tipoInvalido;
  }

  const primero = errores.concepto ?? errores.monto ?? errores.tipo;
  if (primero) {
    return { ok: false, errores, mensaje: primero };
  }
  return { ok: true, datos: { concepto, monto, tipo: tipo as TipoMovimiento } };
}
