/**
 * Pruebas del protocolo de Compartir Cerca (U5): trocear y reensamblar el
 * mensaje, y validar lo recibido. TypeScript puro, sin Bluetooth.
 */
import { Movimiento } from '../offline/movimiento.model';
import {
  CONCEPTO_MAX,
  FIRMA_APP,
  LIMITE_MENSAJE_BYTES,
  MovimientoCompartido,
  Reensamblador,
  VERSION_PROTOCOLO,
  codificarMensaje,
  codificarRespuesta,
  crearMensaje,
  decodificarMensaje,
  decodificarRespuesta,
  trocear,
  validarMensaje,
} from './ble-protocolo';

const movimiento: Movimiento = {
  id: 'mov-1',
  concepto: 'Almuerzo en la cafetería — año 2026, ñandú',
  monto: 350.5,
  tipo: 'gasto',
  fecha: '2026-10-12T15:30:00.000Z',
  estado: 'sincronizado',
};
const mensaje = (): MovimientoCompartido => crearMensaje(movimiento, 'Pixel de Ana');

/** Pasa todos los paquetes por un reensamblador y devuelve el último resultado. */
function reensamblar(paquetes: Uint8Array[], r = new Reensamblador()): Uint8Array | null {
  let completo: Uint8Array | null = null;
  for (const p of paquetes) {
    completo = r.agregar(p);
  }
  return completo;
}

describe('ble-protocolo', () => {
  describe('trocear / reensamblar', () => {
    it('con el MTU mínimo (23) parte en paquetes de ≤ 20 bytes con cabecera [índice, total]', () => {
      const bytes = codificarMensaje(mensaje());
      const paquetes = trocear(bytes, 23);
      expect(paquetes.length).toBe(Math.ceil(bytes.length / 18));
      paquetes.forEach((p, i) => {
        expect(p.length).toBeLessThanOrEqual(20);
        expect(p[0]).toBe(i);
        expect(p[1]).toBe(paquetes.length);
      });
    });

    it('ida y vuelta: trocear → reensamblar → decodificar devuelve el mismo mensaje (tildes y ñ incluidas)', () => {
      for (const mtu of [23, 64, 185, 512]) {
        const completo = reensamblar(trocear(codificarMensaje(mensaje()), mtu));
        expect(decodificarMensaje(completo!)).toEqual(mensaje());
      }
    });

    it('un MTU grande cabe en un solo paquete; un MTU menor que 23 se trata como 23', () => {
      const bytes = codificarMensaje(mensaje());
      expect(trocear(bytes, 512).length).toBe(1);
      expect(trocear(bytes, 5).length).toBe(trocear(bytes, 23).length);
    });

    it('devuelve null hasta que llega el último paquete', () => {
      const paquetes = trocear(codificarMensaje(mensaje()), 23);
      const r = new Reensamblador();
      paquetes.slice(0, -1).forEach((p) => expect(r.agregar(p)).toBeNull());
      expect(r.agregar(paquetes.at(-1)!)).not.toBeNull();
    });

    it('un paquete fuera de orden descarta lo acumulado', () => {
      const paquetes = trocear(codificarMensaje(mensaje()), 23);
      const r = new Reensamblador();
      r.agregar(paquetes[0]);
      expect(r.agregar(paquetes[2])).toBeNull();
      // El resto ya no completa el mensaje sin volver a empezar por el 0.
      expect(reensamblar(paquetes.slice(3), r)).toBeNull();
    });

    it('un envío cortado a medias no contamina al siguiente (el índice 0 reinicia)', () => {
      const paquetes = trocear(codificarMensaje(mensaje()), 23);
      const r = new Reensamblador();
      r.agregar(paquetes[0]);
      r.agregar(paquetes[1]);
      expect(decodificarMensaje(reensamblar(paquetes, r)!)).toEqual(mensaje());
    });

    it('paquetes sin cabecera o con total 0 se descartan', () => {
      const r = new Reensamblador();
      expect(r.agregar(new Uint8Array([0]))).toBeNull();
      expect(r.agregar(new Uint8Array([0, 0, 65]))).toBeNull();
    });

    it('un mensaje más grande que el límite no se codifica ni se reensambla', () => {
      const grande = { ...mensaje(), de: 'x'.repeat(LIMITE_MENSAJE_BYTES) };
      expect(() => codificarMensaje(grande)).toThrow('demasiado grande');
      const bytes = new TextEncoder().encode(JSON.stringify(grande));
      expect(reensamblar(trocear(bytes, 512))).toBeNull();
    });

    it('respuestas: codificar/decodificar las cuatro y rechazar cualquier otra', () => {
      for (const r of ['aceptado', 'rechazado', 'duplicado', 'invalido'] as const) {
        expect(decodificarRespuesta(codificarRespuesta(r))).toBe(r);
      }
      expect(decodificarRespuesta(new TextEncoder().encode('ok'))).toBeNull();
    });
  });

  describe('validarMensaje: mensajes válidos', () => {
    it('acepta el mensaje creado a partir de un movimiento', () => {
      expect(validarMensaje(mensaje())).toEqual(mensaje());
    });

    it('limpia el concepto y el nombre, y completa los campos opcionales', () => {
      const v = validarMensaje({ ...mensaje(), concepto: '  Café  ', de: '  ', origenId: 7 });
      expect(v).toMatchObject({ concepto: 'Café', de: 'Teléfono Controla+', origenId: '' });
    });

    it('acepta un concepto de exactamente CONCEPTO_MAX caracteres e ingresos', () => {
      expect(validarMensaje({ ...mensaje(), concepto: 'a'.repeat(CONCEPTO_MAX), tipo: 'ingreso' })).not.toBeNull();
    });
  });

  describe('validarMensaje: mensajes inválidos', () => {
    const casos: [string, unknown][] = [
      ['null', null],
      ['texto', 'hola'],
      ['otra app', { ...mensaje(), app: 'OtraApp' }],
      ['otra versión', { ...mensaje(), v: VERSION_PROTOCOLO + 1 }],
      ['sin concepto', { ...mensaje(), concepto: undefined }],
      ['concepto vacío', { ...mensaje(), concepto: '   ' }],
      ['concepto demasiado largo', { ...mensaje(), concepto: 'a'.repeat(CONCEPTO_MAX + 1) }],
      ['monto 0', { ...mensaje(), monto: 0 }],
      ['monto negativo', { ...mensaje(), monto: -10 }],
      ['monto texto', { ...mensaje(), monto: '100' }],
      ['monto infinito', { ...mensaje(), monto: Infinity }],
      ['tipo desconocido', { ...mensaje(), tipo: 'transferencia' }],
      ['fecha inválida', { ...mensaje(), fecha: 'ayer' }],
      ['sin fecha', { ...mensaje(), fecha: undefined }],
    ];
    it.each(casos)('%s → null', (_nombre, crudo) => {
      expect(validarMensaje(crudo)).toBeNull();
    });

    it('bytes que no son JSON, o JSON sin la firma, se decodifican como null', () => {
      expect(decodificarMensaje(new TextEncoder().encode('{roto'))).toBeNull();
      expect(decodificarMensaje(new TextEncoder().encode(JSON.stringify({ app: FIRMA_APP })))).toBeNull();
    });
  });
});
