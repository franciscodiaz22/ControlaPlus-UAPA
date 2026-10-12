/**
 * Pruebas de validarMovimiento(): reglas compartidas por Inicio y el formulario.
 */
import { CONCEPTO_MAX, MENSAJES_VALIDACION, validarMovimiento } from './validacion';

describe('validarMovimiento', () => {
  it('acepta datos válidos y limpia los espacios del concepto', () => {
    expect(validarMovimiento({ concepto: '  Colmado   Don   José  ', monto: '350', tipo: 'gasto' })).toEqual({
      ok: true,
      datos: { concepto: 'Colmado Don José', monto: 350, tipo: 'gasto' },
    });
  });

  it('conserva los decimales del monto (número o texto)', () => {
    const texto = validarMovimiento({ concepto: 'Café', monto: '12.75', tipo: 'gasto' });
    const numero = validarMovimiento({ concepto: 'Café', monto: 0.5, tipo: 'ingreso' });
    expect(texto.ok && texto.datos.monto).toBe(12.75);
    expect(numero.ok && numero.datos.monto).toBe(0.5);
  });

  it('el concepto es obligatorio (vacío o solo espacios)', () => {
    for (const concepto of ['', '    ', undefined, 42]) {
      const r = validarMovimiento({ concepto, monto: 10, tipo: 'gasto' });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.errores.concepto).toBe(MENSAJES_VALIDACION.conceptoVacio);
    }
  });

  it(`el concepto admite hasta ${CONCEPTO_MAX} caracteres (los que acepta Compartir Cerca)`, () => {
    expect(validarMovimiento({ concepto: 'a'.repeat(CONCEPTO_MAX), monto: 1, tipo: 'gasto' }).ok).toBe(true);
    const largo = validarMovimiento({ concepto: 'a'.repeat(CONCEPTO_MAX + 1), monto: 1, tipo: 'gasto' });
    expect(!largo.ok && largo.errores.concepto).toBe(MENSAJES_VALIDACION.conceptoLargo);
    // los espacios sobrantes no cuentan
    expect(validarMovimiento({ concepto: `  ${'a'.repeat(CONCEPTO_MAX)}  `, monto: 1, tipo: 'gasto' }).ok).toBe(true);
  });

  it('el monto debe existir, ser un número finito y mayor que 0', () => {
    const casos: [unknown, string][] = [
      ['', MENSAJES_VALIDACION.montoVacio],
      ['   ', MENSAJES_VALIDACION.montoVacio],
      [null, MENSAJES_VALIDACION.montoVacio],
      [undefined, MENSAJES_VALIDACION.montoVacio],
      ['abc', MENSAJES_VALIDACION.montoInvalido],
      [Number.NaN, MENSAJES_VALIDACION.montoInvalido],
      [Number.POSITIVE_INFINITY, MENSAJES_VALIDACION.montoInvalido],
      [0, MENSAJES_VALIDACION.montoNoPositivo],
      ['0', MENSAJES_VALIDACION.montoNoPositivo],
      [-5, MENSAJES_VALIDACION.montoNoPositivo],
    ];
    for (const [monto, mensaje] of casos) {
      const r = validarMovimiento({ concepto: 'Prueba', monto, tipo: 'gasto' });
      expect(!r.ok && r.errores.monto).toBe(mensaje);
    }
  });

  it('el tipo debe ser ingreso o gasto', () => {
    const r = validarMovimiento({ concepto: 'Prueba', monto: 10, tipo: 'otro' });
    expect(!r.ok && r.errores.tipo).toBe(MENSAJES_VALIDACION.tipoInvalido);
  });

  it('informa todos los errores y usa el primero como mensaje', () => {
    const r = validarMovimiento({ concepto: '', monto: 0, tipo: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errores).sort()).toEqual(['concepto', 'monto', 'tipo']);
      expect(r.mensaje).toBe(MENSAJES_VALIDACION.conceptoVacio);
    }
  });
});
