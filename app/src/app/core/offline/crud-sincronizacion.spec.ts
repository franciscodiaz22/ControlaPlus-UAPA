/**
 * Pruebas de crear / actualizar / eliminar con la sincronización existente.
 * ---------------------------------------------------------------------------
 * Servicios reales (OfflineStorageService, MovimientosService, SyncService);
 * solo se simulan la red, la API, los toasts y el motor de almacenamiento
 * (en memoria, con latencia opcional). La persistencia tras reabrir usa el
 * motor real de Ionic Storage.
 */
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { NetworkService } from '../network/network.service';
import { ApiService } from './api.service';
import { Movimiento } from './movimiento.model';
import { MovimientosService } from './movimientos.service';
import { OfflineStorageService } from './offline-storage.service';
import { SyncService } from './sync.service';

const CLAVE = 'controlaplus.movimientos';

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Espera hasta que se cumpla la condición (o falla a los 3 s). */
async function hastaQue(condicion: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const limite = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > limite) {
      throw new Error('la condición no se cumplió a tiempo');
    }
    await esperar(10);
  }
}

class AlmacenFalso {
  datos = new Map<string, unknown>();
  retrasoMs = 0;
  async create(): Promise<this> {
    return this;
  }
  async get(clave: string): Promise<unknown> {
    const valor = this.datos.get(clave);
    return valor === undefined ? null : clonar(valor);
  }
  async set(clave: string, valor: unknown): Promise<void> {
    await esperar(this.retrasoMs);
    this.datos.set(clave, clonar(valor));
  }
  guardados(): Movimiento[] {
    return (this.datos.get(CLAVE) as Movimiento[]) ?? [];
  }
}

class RedFalsa {
  private readonly online = new BehaviorSubject<boolean>(true);
  readonly isOnline$ = this.online.asObservable();
  get isOnline(): boolean {
    return this.online.value;
  }
  conectar(valor: boolean): void {
    this.online.next(valor);
  }
}

class ApiFalsa {
  envios: Movimiento[][] = [];
  fallar = false;
  retrasoMs = 0;
  private bloqueo?: Promise<void>;
  private soltar?: () => void;
  bloquear(): void {
    this.bloqueo = new Promise((r) => (this.soltar = r));
  }
  liberar(): void {
    this.bloqueo = undefined;
    this.soltar?.();
  }
  async enviarMovimientos(lista: Movimiento[]): Promise<void> {
    this.envios.push(clonar(lista));
    if (this.bloqueo) {
      await this.bloqueo;
    } else {
      await esperar(this.retrasoMs);
    }
    if (this.fallar) {
      throw new Error('HTTP 503 (prueba)');
    }
  }
  /** Todos los elementos enviados, en orden. */
  enviados(): Movimiento[] {
    return this.envios.flat();
  }
}

const sincronizado = (id: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id,
  concepto: `Concepto ${id}`,
  monto: 100,
  tipo: 'gasto',
  fecha: '2026-10-01T10:00:00.000Z',
  estado: 'sincronizado',
  ...extra,
});

describe('CRUD + sincronización', () => {
  let almacen: AlmacenFalso;
  let red: RedFalsa;
  let api: ApiFalsa;
  let storage: OfflineStorageService;
  let movimientos: MovimientosService;
  let sync: SyncService;

  async function montar(inicial: Movimiento[], online = true): Promise<void> {
    almacen = new AlmacenFalso();
    almacen.datos.set(CLAVE, clonar(inicial));
    red = new RedFalsa();
    red.conectar(online);
    api = new ApiFalsa();
    TestBed.configureTestingModule({
      providers: [
        { provide: Storage, useValue: almacen },
        { provide: NetworkService, useValue: red },
        { provide: ApiService, useValue: api },
        {
          provide: ToastController,
          useValue: { create: async () => ({ present: async () => undefined }) },
        },
      ],
    });
    storage = TestBed.inject(OfflineStorageService);
    sync = TestBed.inject(SyncService);
    movimientos = TestBed.inject(MovimientosService);
    await storage.todos();
    await esperar(0); // el watcher de SyncService se suscribe tras la carga
  }

  const guardado = (id: string): Movimiento | undefined => almacen.guardados().find((m) => m.id === id);

  // ---------------------------------------------------------------- CREAR
  describe('crear (flujo existente)', () => {
    it('offline: queda pendiente y se envía una vez al reconectar', async () => {
      await montar([], false);
      const m = await movimientos.registrar({ concepto: 'Colmado', monto: 50, tipo: 'gasto' });
      expect(guardado(m.id)?.estado).toBe('pendiente');
      expect(api.envios.length).toBe(0);

      red.conectar(true);
      await hastaQue(() => guardado(m.id)?.estado === 'sincronizado');
      expect(api.enviados().map((x) => x.id)).toEqual([m.id]);
    });

    it('online: se envía directo y el watcher no lo duplica', async () => {
      await montar([]);
      api.retrasoMs = 500; // el watcher (300 ms) dispara con registrar() aún en vuelo
      const m = await movimientos.registrar({ concepto: 'Luz', monto: 900, tipo: 'gasto' });
      expect(guardado(m.id)?.estado).toBe('sincronizado');
      await esperar(400);
      expect(api.envios.length).toBe(1);
    });
  });

  // ----------------------------------------------------------- ACTUALIZAR
  describe('actualizar', () => {
    it('offline: cambia los datos, queda pendiente con versión nueva y no envía', async () => {
      await montar([sincronizado('a')], false);
      await movimientos.actualizar({ ...sincronizado('a'), concepto: 'Editado', monto: 250 });
      expect(guardado('a')).toMatchObject({ concepto: 'Editado', monto: 250, estado: 'pendiente', version: 1 });
      await esperar(400);
      expect(api.envios.length).toBe(0);
    });

    it('un movimiento sincronizado: el watcher envía la versión nueva y queda sincronizado', async () => {
      await montar([sincronizado('a')]);
      await movimientos.actualizar({ ...sincronizado('a'), concepto: 'Editado' });
      await hastaQue(() => guardado('a')?.estado === 'sincronizado');
      expect(api.enviados()).toEqual([expect.objectContaining({ id: 'a', concepto: 'Editado', version: 1 })]);
    });

    it('un movimiento pendiente: se envía una sola vez con los datos más recientes', async () => {
      await montar([sincronizado('p', { estado: 'pendiente' })], false);
      await movimientos.actualizar({ ...sincronizado('p'), concepto: 'Primera' });
      await movimientos.actualizar({ ...sincronizado('p'), concepto: 'Segunda' });
      red.conectar(true);
      await hastaQue(() => guardado('p')?.estado === 'sincronizado');
      expect(api.enviados()).toEqual([expect.objectContaining({ id: 'p', concepto: 'Segunda', version: 2 })]);
    });

    it('durante un envío de SyncService: no se marca sincronizado y se reenvía en la segunda pasada', async () => {
      await montar([sincronizado('p', { estado: 'pendiente' })]);
      api.bloquear();
      const envio = sync.sincronizar('manual');
      await hastaQue(() => api.envios.length === 1);

      await movimientos.actualizar({ ...sincronizado('p'), concepto: 'Editado en vuelo' });
      api.liberar();
      await envio;
      expect(guardado('p')?.estado).toBe('pendiente');

      await hastaQue(() => guardado('p')?.estado === 'sincronizado');
      expect(api.enviados().map((m) => [m.concepto, m.version ?? 0])).toEqual([
        ['Concepto p', 0],
        ['Editado en vuelo', 1],
      ]);
      expect(guardado('p')).toMatchObject({ concepto: 'Editado en vuelo', version: 1 });
    });

    it('durante el envío directo de registrar(): vuelve a la sincronización', async () => {
      await montar([]);
      api.bloquear();
      const registro = movimientos.registrar({ concepto: 'Nuevo', monto: 10, tipo: 'ingreso' });
      await hastaQue(() => api.envios.length === 1);
      const id = api.envios[0][0].id;

      await movimientos.actualizar({ ...api.envios[0][0], monto: 20 });
      api.liberar();
      await registro;

      await hastaQue(() => guardado(id)?.estado === 'sincronizado');
      expect(api.enviados().map((m) => m.monto)).toEqual([10, 20]);
      expect(guardado(id)).toMatchObject({ monto: 20, version: 1 });
    });

    it('una copia antigua del diálogo no pisa estado, versión, fecha ni eliminado', async () => {
      await montar([sincronizado('a')], false);
      const copiaDelDialogo = clonar(guardado('a')!);
      await movimientos.actualizar({ ...sincronizado('a'), concepto: 'Otra edición' }); // versión 1

      await movimientos.actualizar({
        ...copiaDelDialogo,
        concepto: 'Desde el diálogo',
        estado: 'sincronizado',
        version: 0,
        fecha: '1999-01-01T00:00:00.000Z',
      });
      expect(guardado('a')).toMatchObject({
        concepto: 'Desde el diálogo',
        estado: 'pendiente',
        version: 2,
        fecha: '2026-10-01T10:00:00.000Z',
      });
      expect(guardado('a')?.eliminado).toBeUndefined();
    });

    it('no resucita un movimiento eliminado ni crea uno inexistente', async () => {
      await montar([sincronizado('a')], false);
      await movimientos.eliminar('a');
      await movimientos.actualizar({ ...sincronizado('a'), concepto: 'Tarde' });
      await movimientos.actualizar(sincronizado('no-existe'));
      expect(almacen.guardados()).toEqual([expect.objectContaining({ id: 'a', eliminado: true, version: 1 })]);
      expect(await storage.todos()).toEqual([]);
    });
  });

  // ------------------------------------------------------------- ELIMINAR
  describe('eliminar', () => {
    it('offline: desaparece de las vistas, cuenta como pendiente y no envía', async () => {
      await montar([sincronizado('a', { tipo: 'ingreso', monto: 1000 }), sincronizado('b')], false);
      const balanceAntes = await firstValueFrom(movimientos.balance$);

      await movimientos.eliminar('a');
      expect(guardado('a')).toMatchObject({ eliminado: true, estado: 'pendiente', version: 1 });
      expect((await storage.todos()).map((m) => m.id)).toEqual(['b']);
      expect((await firstValueFrom(storage.movimientos$)).map((m) => m.id)).toEqual(['b']);
      expect((await storage.pendientes()).map((m) => m.id)).toEqual(['a']);
      expect(await firstValueFrom(movimientos.pendientes$)).toBe(1);
      expect(await firstValueFrom(movimientos.balance$)).toBe(balanceAntes - 1000);
      await esperar(400);
      expect(api.envios.length).toBe(0);
    });

    it('un movimiento sincronizado: el watcher envía la eliminación y luego se borra', async () => {
      await montar([sincronizado('a'), sincronizado('b')]);
      await movimientos.eliminar('a');
      await hastaQue(() => !guardado('a'));
      expect(api.enviados()).toEqual([expect.objectContaining({ id: 'a', eliminado: true, version: 1 })]);
      expect(almacen.guardados().map((m) => m.id)).toEqual(['b']);
    });

    it('un movimiento pendiente nunca enviado: también viaja como eliminación', async () => {
      await montar([], false);
      const m = await movimientos.registrar({ concepto: 'Error', monto: 5, tipo: 'gasto' });
      await movimientos.eliminar(m.id);
      expect(await firstValueFrom(movimientos.pendientes$)).toBe(1);

      red.conectar(true);
      await hastaQue(() => !guardado(m.id));
      expect(api.enviados()).toEqual([expect.objectContaining({ id: m.id, eliminado: true })]);
    });

    it('durante un envío: no reaparece y la eliminación se envía después', async () => {
      await montar([sincronizado('p', { estado: 'pendiente' })]);
      api.bloquear();
      const envio = sync.sincronizar('manual');
      await hastaQue(() => api.envios.length === 1);

      await movimientos.eliminar('p');
      api.liberar();
      await envio;
      expect(await storage.todos()).toEqual([]);
      expect(guardado('p')).toMatchObject({ eliminado: true, estado: 'pendiente' });

      await hastaQue(() => !guardado('p'));
      expect(api.enviados().map((m) => !!m.eliminado)).toEqual([false, true]);
    });

    it('si la API falla: la marca se conserva oculta y se envía en el reintento', async () => {
      await montar([sincronizado('a')]);
      api.fallar = true;
      await movimientos.eliminar('a');
      await hastaQue(() => api.envios.length === 1);
      await esperar(50);
      expect(guardado('a')).toMatchObject({ eliminado: true, estado: 'pendiente' });
      expect(await storage.todos()).toEqual([]);

      api.fallar = false;
      await sync.sincronizar('reintento');
      expect(guardado('a')).toBeUndefined();
      expect(api.envios.length).toBe(2);
    });

    it('la marca persiste al cerrar y reabrir (motor real de Ionic Storage)', async () => {
      const nombre = `controlaplus_prueba_${Date.now()}`;
      const servicio1 = new OfflineStorageService(new Storage({ name: nombre }));
      await servicio1.limpiar();
      await servicio1.agregar(sincronizado('a'));
      await servicio1.agregar(sincronizado('b'));
      await servicio1.eliminar('a');

      // "Reabrir": motor y servicio nuevos sobre la misma base de datos.
      const servicio2 = new OfflineStorageService(new Storage({ name: nombre }));
      expect((await servicio2.todos()).map((m) => m.id)).toEqual(['b']);
      expect(await servicio2.pendientes()).toEqual([
        expect.objectContaining({ id: 'a', eliminado: true, estado: 'pendiente', version: 1 }),
      ]);
      await servicio2.limpiar();
    });
  });

  // ---------------------------------------------------------- COLA / DUPLICADOS
  describe('cola de escritura y envíos', () => {
    it('operaciones CRUD solapadas no se pisan', async () => {
      await montar([sincronizado('a'), sincronizado('b'), sincronizado('c', { estado: 'pendiente' })], false);
      almacen.retrasoMs = 20;
      const c = (await storage.pendientes())[0];

      await Promise.all([
        storage.agregar(sincronizado('n', { estado: 'pendiente' })),
        storage.actualizar({ ...sincronizado('a'), concepto: 'A editado' }),
        storage.eliminar('b'),
        storage.marcarSincronizados([c]),
        storage.actualizar({ ...sincronizado('a'), monto: 777 }),
      ]);

      const final = almacen.guardados();
      expect(final.map((m) => m.id)).toEqual(['n', 'a', 'b', 'c']);
      expect(guardado('a')).toMatchObject({ concepto: 'Concepto a', monto: 777, version: 2, estado: 'pendiente' });
      expect(guardado('b')).toMatchObject({ eliminado: true, version: 1 });
      expect(guardado('c')?.estado).toBe('sincronizado');
      expect(guardado('n')?.estado).toBe('pendiente');
    });

    it('marcarSincronizados es compatible con datos antiguos sin version', async () => {
      await montar([sincronizado('viejo', { estado: 'pendiente' })], false);
      const [viejo] = await storage.pendientes();
      expect(viejo.version).toBeUndefined();
      expect(await storage.marcarSincronizados([viejo])).toEqual([]);
      expect(guardado('viejo')?.estado).toBe('sincronizado');
    });

    it('varios disparos a la vez (arranque, reconexión, watcher) envían cada cambio una sola vez', async () => {
      await montar([sincronizado('a'), sincronizado('b'), sincronizado('c')], false);
      await movimientos.actualizar({ ...sincronizado('a'), concepto: 'A2' });
      await movimientos.eliminar('b');
      api.retrasoMs = 100;

      red.conectar(true);
      void sync.sincronizar('arranque');
      void sync.sincronizar('manual');
      await hastaQue(async () => (await storage.pendientes()).length === 0);
      await esperar(400);

      expect(api.enviados().map((m) => m.id).sort()).toEqual(['a', 'b']);
      expect(almacen.guardados().map((m) => m.id)).toEqual(['a', 'c']);
    });
  });
});
