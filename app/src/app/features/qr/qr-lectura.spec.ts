/**
 * Pruebas de las reglas de lectura QR (U8): errores del escáner, contenido
 * leído y validación de los datos de un movimiento.
 */
import { analizarContenido, interpretarFallo, movimientoDesdeQr, rutaParaMlKit } from './qr-lectura';

describe('interpretarFallo', () => {
  it('cancelar no es un error: tipo cancelado con mensaje para reintentar', () => {
    const f = interpretarFallo(new Error('scan canceled.'));
    expect(f.tipo).toBe('cancelado');
    expect(f.mensaje).toContain('Escaneo cancelado');
  });

  it('reconoce permiso denegado, falta de módulo y falta de soporte', () => {
    expect(interpretarFallo(new Error('Camera permission denied')).tipo).toBe('permiso');
    expect(interpretarFallo(new Error('The Google Barcode Scanner Module is not available.')).tipo).toBe('modulo');
    expect(interpretarFallo(new Error('Not implemented on web.')).tipo).toBe('no-soportado');
  });

  it('cualquier otro error da un mensaje genérico en español, nunca el texto técnico', () => {
    const f = interpretarFallo(new Error('java.lang.IllegalStateException: boom'));
    expect(f.tipo).toBe('error');
    expect(f.mensaje).not.toContain('java');
    expect(interpretarFallo(undefined).tipo).toBe('error');
    expect(interpretarFallo('texto').tipo).toBe('error');
  });

  it('origen "foto": mensajes de la lectura desde una foto (@capacitor/camera)', () => {
    const cancelado = interpretarFallo(new Error("Couldn't choose media from the gallery because the process was canceled."), 'foto');
    expect(cancelado.tipo).toBe('cancelado');
    expect(cancelado.mensaje).toContain('No se eligió ninguna foto');
    expect(interpretarFallo(new Error("Couldn't access your photo gallery because access wasn't provided."), 'foto').tipo).toBe('permiso');
    expect(interpretarFallo(new Error("Couldn't take photo."), 'foto').mensaje).toBe('No se pudo obtener la foto. Inténtalo de nuevo.');
    // Sin mensaje propio para "foto" se usa el general.
    expect(interpretarFallo(new Error('No camera available.'), 'foto').tipo).toBe('no-soportado');
  });
});

describe('rutaParaMlKit', () => {
  it('ruta absoluta de Android → file://; las URI se mantienen; vacío → null', () => {
    expect(rutaParaMlKit('/data/user/0/app/cache/a.jpg')).toBe('file:///data/user/0/app/cache/a.jpg');
    expect(rutaParaMlKit('content://media/external/images/1')).toBe('content://media/external/images/1');
    expect(rutaParaMlKit('file:///sdcard/a.jpg')).toBe('file:///sdcard/a.jpg');
    expect(rutaParaMlKit('')).toBeNull();
    expect(rutaParaMlKit(undefined)).toBeNull();
  });
});

describe('analizarContenido', () => {
  it('vacío, nulo o solo espacios → vacío', () => {
    expect(analizarContenido('')).toEqual({ tipo: 'vacio' });
    expect(analizarContenido('   ')).toEqual({ tipo: 'vacio' });
    expect(analizarContenido(null)).toEqual({ tipo: 'vacio' });
    expect(analizarContenido(undefined)).toEqual({ tipo: 'vacio' });
  });

  it('solo las URL http(s) son enlaces', () => {
    expect(analizarContenido(' https://uapa.edu.do ')).toEqual({ tipo: 'enlace', texto: 'https://uapa.edu.do', url: 'https://uapa.edu.do/' });
    expect(analizarContenido('javascript:alert(1)').tipo).toBe('texto');
    expect(analizarContenido('mailto:a@b.do').tipo).toBe('texto');
  });

  it('el resto es texto (por ejemplo, el JSON de un movimiento)', () => {
    expect(analizarContenido('{"concepto":"Café","monto":125}')).toEqual({ tipo: 'texto', texto: '{"concepto":"Café","monto":125}' });
  });
});

describe('movimientoDesdeQr', () => {
  it('datos válidos → movimiento limpio', () => {
    expect(movimientoDesdeQr({ concepto: '  Café   QR ', monto: 125, tipo: 'gasto' })).toEqual({
      ok: true,
      datos: { concepto: 'Café QR', monto: 125, tipo: 'gasto' },
    });
  });

  it('sin datos o con datos inválidos → mensaje claro', () => {
    expect(movimientoDesdeQr(undefined)).toEqual({ ok: false, mensaje: 'El código no contiene datos de un movimiento.' });
    const r = movimientoDesdeQr({ concepto: 'Café', monto: -5, tipo: 'gasto' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.mensaje).toContain('mayor que 0');
  });
});
