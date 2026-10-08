/**
 * OfflineStorageService — Entregable 2 · Persistencia local
 * ---------------------------------------------------------------------------
 * Guarda los movimientos en el dispositivo con @ionic/storage-angular.
 * Ionic Storage elige el mejor motor disponible (SQLite en nativo si está el
 * driver, IndexedDB en el WebView/navegador y localStorage como último
 * recurso), por lo que los datos sobreviven al cierre de la app.
 *
 * Patrón offline-first: la app SIEMPRE escribe aquí primero. La cola de
 * sincronización no es una estructura aparte: son los movimientos cuyo
 * `estado` es 'pendiente'.
 */
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Movimiento } from './movimiento.model';

/** Clave única bajo la que se guarda la lista completa. */
const CLAVE_MOVIMIENTOS = 'controlaplus.movimientos';

/** Lo que ve el usuario: todo menos las eliminaciones aún sin confirmar. */
const visibles = (lista: Movimiento[]): Movimiento[] => lista.filter((m) => !m.eliminado);

/** Lo que falta enviar al servidor: altas, ediciones y eliminaciones. */
const pendientes = (lista: Movimiento[]): Movimiento[] =>
  lista.filter((m) => m.estado === 'pendiente');

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private storage: Storage | null = null;

  /**
   * Copia en memoria de la lista completa, incluidas las eliminaciones aún no
   * confirmadas por el servidor (`eliminado: true`).
   */
  private readonly movimientosSubject = new BehaviorSubject<Movimiento[]>([]);

  /** Última lista persistida para evitar escrituras redundantes y spam del log. */
  private ultimaListaPersistida: Movimiento[] | null = null;

  /** La vista se suscribe aquí; emite cada vez que cambia la lista. Sin eliminados. */
  readonly movimientos$: Observable<Movimiento[]> = this.movimientosSubject.pipe(map(visibles));

  /** Cola de sincronización observable: pendientes, eliminaciones incluidas. */
  readonly pendientes$: Observable<Movimiento[]> = this.movimientosSubject.pipe(map(pendientes));

  /** Promesa que se resuelve cuando el motor de almacenamiento está listo. */
  private readonly listo: Promise<void>;

  /** Última escritura encolada; cada escritura nueva se encadena a esta. */
  private cola: Promise<void> = Promise.resolve();

  constructor(private readonly ionicStorage: Storage) {
    this.listo = this.inicializar();
  }

  private async inicializar(): Promise<void> {
    // create() abre (o crea) la base de datos; es obligatorio antes de usarla.
    this.storage = await this.ionicStorage.create();
    const guardados = (await this.storage.get(CLAVE_MOVIMIENTOS)) as Movimiento[] | null;
    
    if (guardados && guardados.length) {
      this.ultimaListaPersistida = [...guardados];
      this.movimientosSubject.next(this.ultimaListaPersistida);
    } else if (environment.cargarDatosDemo) {
      await this.persistir(this.datosDemo());
    }
  }

  /** Todos los movimientos visibles (sin eliminados), del más reciente al más antiguo. */
  async todos(): Promise<Movimiento[]> {
    await this.listo;
    return visibles(this.movimientosSubject.value);
  }

  /** Cola de sincronización: los que aún no llegaron al servidor, eliminaciones incluidas. */
  async pendientes(): Promise<Movimiento[]> {
    await this.listo;
    return pendientes(this.movimientosSubject.value);
  }

  /** Inserta al principio de la lista y persiste. */
  async agregar(mov: Movimiento): Promise<void> {
    await this.escribir((lista) => [mov, ...lista]);
  }

  /**
   * Marca el movimiento como eliminado y lo deja pendiente: deja de mostrarse,
   * pero se borra del dispositivo solo cuando el servidor confirma la
   * eliminación (ver marcarSincronizados).
   */
  async eliminar(id: string): Promise<void> {
    await this.escribir((lista) =>
      lista.map((m) =>
        m.id === id && !m.eliminado
          ? { ...m, eliminado: true, estado: 'pendiente' as const, version: (m.version ?? 0) + 1 }
          : m,
      ),
    );
  }

  /**
   * Aplica los datos editables (concepto, monto, tipo, ubicación) sobre la
   * versión guardada, en su turno de la cola. Los datos de control (estado,
   * versión, fecha, eliminado) nunca se toman de `cambios`, así que una copia
   * antigua de la vista no los pisa. Queda pendiente con una versión nueva.
   */
  async actualizar(cambios: Movimiento): Promise<void> {
    await this.escribir((lista) =>
      lista.map((m) =>
        m.id === cambios.id && !m.eliminado
          ? {
              ...m,
              concepto: cambios.concepto,
              monto: cambios.monto,
              tipo: cambios.tipo,
              ubicacion: cambios.ubicacion,
              estado: 'pendiente' as const,
              version: (m.version ?? 0) + 1,
            }
          : m,
      ),
    );
  }

  /**
   * Confirma los movimientos enviados (tras un envío exitoso). Cada uno se
   * marca 'sincronizado' (o, si era una eliminación, se borra) solo si la
   * versión guardada sigue siendo la enviada. Devuelve los ids que cambiaron
   * durante el envío y siguen pendientes.
   */
  async marcarSincronizados(enviados: Movimiento[]): Promise<string[]> {
    const versionEnviada = new Map(enviados.map((m) => [m.id, m.version ?? 0]));
    let siguenPendientes: string[] = [];
    await this.escribir((lista) => {
      siguenPendientes = [];
      return lista.flatMap((m) => {
        if (!versionEnviada.has(m.id)) {
          return [m];
        }
        if ((m.version ?? 0) !== versionEnviada.get(m.id)) {
          siguenPendientes.push(m.id);
          return [m];
        }
        return m.eliminado ? [] : [{ ...m, estado: 'sincronizado' as const }];
      });
    });
    return siguenPendientes;
  }

  /** Borra todo (útil en pruebas). */
  async limpiar(): Promise<void> {
    await this.escribir(() => []);
  }

  /**
   * Encola una escritura: espera a que termine la anterior y calcula la lista
   * nueva en su turno, a partir del estado ya actualizado. Así dos escrituras
   * solapadas (p. ej. registrar mientras termina una sincronización) no se
   * pisan. Un fallo se devuelve a quien llamó, pero no detiene la cola.
   */
  private escribir(transformar: (lista: Movimiento[]) => Movimiento[]): Promise<void> {
    const turno = this.cola.then(async () => {
      await this.listo;
      await this.persistir(transformar(this.movimientosSubject.value));
    });
    this.cola = turno.catch(() => undefined);
    return turno;
  }

  private async persistir(lista: Movimiento[]): Promise<void> {
    await this.storage!.set(CLAVE_MOVIMIENTOS, lista);
  
    this.movimientosSubject.next(lista);
  }

  /** Movimientos de ejemplo para la demostración (misma data del prototipo). */
  private datosDemo(): Movimiento[] {
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    const a = (d: Date, h: number, m: number): string => {
      const x = new Date(d);
      x.setHours(h, m, 0, 0);
      return x.toISOString();
    };
    return [
      { id: 'demo-1', concepto: 'Supermercado La Sirena', monto: 1250, tipo: 'gasto', fecha: a(hoy, 10, 20), estado: 'sincronizado' },
      { id: 'demo-2', concepto: 'Pago recibido — Cliente', monto: 5000, tipo: 'ingreso', fecha: a(hoy, 8, 5), estado: 'sincronizado' },
      { id: 'demo-3', concepto: 'Farmacia Carol', monto: 480, tipo: 'gasto', fecha: a(ayer, 18, 40), estado: 'sincronizado' },
    ];
  }
}
