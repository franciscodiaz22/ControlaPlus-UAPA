/**
 * Pruebas de BleReceptorService (U5) con un periférico falso y un
 * OfflineStorageService en memoria: recibir paquetes, aceptar (guardar como
 * pendiente), detectar duplicados y rechazar. Sin Bluetooth.
 */
import { TestBed } from '@angular/core/testing';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { Movimiento } from '../offline/movimiento.model';
import { OpcionesPeriferico, PERIFERICO_BLE, PerifericoBle } from './ble-periferico';
import {
  CP_SERVICIO_UUID,
  MovimientoCompartido,
  codificarMensaje,
  crearMensaje,
  decodificarRespuesta,
  trocear,
} from './ble-protocolo';
import { BleReceptorService } from './ble-receptor.service';

class PerifericoFalso implements PerifericoBle {
  opciones?: OpcionesPeriferico;
  alEscribir?: (valor: Uint8Array) => void;
  notificaciones: string[] = [];
  falloNotificar = false;

  async disponible() {
    return true;
  }
  async iniciar(opciones: OpcionesPeriferico, alEscribir: (valor: Uint8Array) => void) {
    this.opciones = opciones;
    this.alEscribir = alEscribir;
  }
  async notificar(valor: Uint8Array) {
    if (this.falloNotificar) {
      throw new Error('emisor desconectado');
    }
    this.notificaciones.push(decodificarRespuesta(valor) ?? '¿?');
  }
  async detener() {
    this.alEscribir = undefined;
  }
}

class StorageEnMemoria {
  datos: Movimiento[] = [];
  async todos() {
    return [...this.datos];
  }
  async agregar(m: Movimiento) {
    this.datos.push(m);
  }
}

const origen: Movimiento = {
  id: 'origen-1',
  concepto: 'Cena compartida',
  monto: 640,
  tipo: 'gasto',
  fecha: '2026-10-12T20:15:00.000Z',
  estado: 'sincronizado',
};

describe('BleReceptorService', () => {
  let receptor: BleReceptorService;
  let periferico: PerifericoFalso;
  let storage: StorageEnMemoria;

  const esperarMicrotareas = () => new Promise((r) => setTimeout(r, 0));
  /** El emisor escribe el mensaje troceado, como lo haría por BLE con MTU 23. */
  async function emitir(mensaje: MovimientoCompartido | object): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(mensaje));
    for (const p of trocear(bytes, 23)) {
      periferico.alEscribir!(p);
    }
    await esperarMicrotareas();
  }

  beforeEach(async () => {
    periferico = new PerifericoFalso();
    storage = new StorageEnMemoria();
    TestBed.configureTestingModule({
      providers: [
        { provide: PERIFERICO_BLE, useValue: periferico },
        { provide: OfflineStorageService, useValue: storage },
      ],
    });
    receptor = TestBed.inject(BleReceptorService);
    await receptor.iniciarRecepcion();
  });

  it('se anuncia con el servicio de Controla+ y es idempotente', async () => {
    expect(receptor.escuchando).toBe(true);
    expect(periferico.opciones?.servicio).toBe(CP_SERVICIO_UUID);
    const anterior = periferico.alEscribir;
    await receptor.iniciarRecepcion();
    expect(periferico.alEscribir).toBe(anterior);
  });

  it('reensambla los paquetes y deja el movimiento esperando la decisión, sin guardarlo aún', async () => {
    await emitir(crearMensaje(origen, 'Pixel de Ana'));
    expect(receptor.entrante$.getValue()).toMatchObject({ concepto: 'Cena compartida', monto: 640, de: 'Pixel de Ana' });
    expect(storage.datos).toEqual([]);
    expect(periferico.notificaciones).toEqual([]);
  });

  it('aceptar: guarda como pendiente con un id nuevo, responde "aceptado" y limpia el entrante', async () => {
    await emitir(crearMensaje(origen, 'Pixel de Ana'));
    expect(await receptor.aceptar()).toBe('aceptado');
    expect(storage.datos).toHaveLength(1);
    const guardado = storage.datos[0];
    expect(guardado).toMatchObject({
      concepto: 'Cena compartida',
      monto: 640,
      tipo: 'gasto',
      fecha: origen.fecha,
      estado: 'pendiente',
    });
    expect(guardado.id).not.toBe(origen.id);
    expect(guardado.id).toBeTruthy();
    expect(periferico.notificaciones).toEqual(['aceptado']);
    expect(receptor.entrante$.getValue()).toBeNull();
  });

  it('duplicado: si ya existe uno idéntico no se guarda otra vez y responde "duplicado"', async () => {
    await emitir(crearMensaje(origen, 'Pixel de Ana'));
    await receptor.aceptar();
    await emitir(crearMensaje(origen, 'Pixel de Ana'));
    expect(await receptor.aceptar()).toBe('duplicado');
    expect(storage.datos).toHaveLength(1);
    expect(periferico.notificaciones).toEqual(['aceptado', 'duplicado']);
    expect(receptor.entrante$.getValue()).toBeNull();
  });

  it('no es duplicado si cambia el monto, el tipo o la fecha', async () => {
    await emitir(crearMensaje(origen, 'A'));
    await receptor.aceptar();
    await emitir(crearMensaje({ ...origen, monto: 641 }, 'A'));
    expect(await receptor.aceptar()).toBe('aceptado');
    expect(storage.datos).toHaveLength(2);
  });

  it('rechazar: no guarda nada, responde "rechazado" y limpia el entrante', async () => {
    await emitir(crearMensaje(origen, 'Pixel de Ana'));
    await receptor.rechazar();
    expect(storage.datos).toEqual([]);
    expect(periferico.notificaciones).toEqual(['rechazado']);
    expect(receptor.entrante$.getValue()).toBeNull();
  });

  it('mensaje inválido: responde "invalido", avisa y no lo muestra', async () => {
    await emitir({ ...crearMensaje(origen, 'A'), monto: -5 });
    expect(receptor.entrante$.getValue()).toBeNull();
    expect(periferico.notificaciones).toEqual(['invalido']);
    expect(receptor.error$.getValue()).toContain('no válidos');
    expect(storage.datos).toEqual([]);
  });

  it('un segundo movimiento mientras se revisa el primero se rechaza solo', async () => {
    await emitir(crearMensaje(origen, 'A'));
    await emitir(crearMensaje({ ...origen, concepto: 'Otro' }, 'B'));
    expect(receptor.entrante$.getValue()?.concepto).toBe('Cena compartida');
    expect(periferico.notificaciones).toEqual(['rechazado']);
  });

  it('si el emisor ya se desconectó, aceptar igual guarda el movimiento y avisa del fallo', async () => {
    await emitir(crearMensaje(origen, 'A'));
    periferico.falloNotificar = true;
    expect(await receptor.aceptar()).toBe('aceptado');
    expect(storage.datos).toHaveLength(1);
    expect(receptor.error$.getValue()).toContain('No se pudo avisar al otro teléfono');
  });

  it('aceptar sin movimiento pendiente de revisión lanza un error', async () => {
    await expect(receptor.aceptar()).rejects.toThrow('no hay ningún movimiento');
  });

  it('detener deja de escuchar', async () => {
    await receptor.detener();
    expect(receptor.escuchando).toBe(false);
  });
});
