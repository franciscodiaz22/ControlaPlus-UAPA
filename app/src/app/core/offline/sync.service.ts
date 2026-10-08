/**
 * SyncService — Entregable 2 · Sincronización automática
 * ---------------------------------------------------------------------------
 * Observa NetworkService y, cada vez que la conexión pasa de offline → online,
 * envía al servidor todos los movimientos pendientes. También se usa para los
 * reintentos programados cuando un envío falla, y cuando aparecen pendientes
 * nuevos con la app en línea (p. ej. movimientos aceptados por Bluetooth).
 *
 * Reglas:
 *  - Nunca hay dos sincronizaciones en paralelo (bandera `sincronizando`).
 *  - Si falla, informa con un toast ámbar al empezar la racha y reintenta con
 *    espera creciente (6 s … 60 s) mientras siga habiendo conexión.
 *  - Al terminar con éxito muestra "Sincronización completada: N ...".
 */
import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, filter, map, pairwise } from 'rxjs/operators';
import { NetworkService } from '../network/network.service';
import { OfflineStorageService } from './offline-storage.service';
import { ApiService } from './api.service';
import { DURACION_TOAST_MS, MENSAJES, REINTENTO_SYNC_MS } from './mensajes';
import { environment } from '../../../environments/environment';

export interface ResultadoSync {
  origen: string;
  enviados: number;
  error?: string;
}

/** Espera máxima entre reintentos. */
const REINTENTO_MAX_MS = 60000;

/**
 * Pausa antes de sincronizar pendientes nuevos: agrupa varios seguidos y deja
 * que registrar() reserve primero su propio envío directo (3.4).
 */
const ESPERA_PENDIENTES_NUEVOS_MS = 300;

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly network = inject(NetworkService);
  private readonly storage = inject(OfflineStorageService);
  private readonly api = inject(ApiService);
  private readonly toastCtrl = inject(ToastController);

  private sincronizando = false;
  private reintento?: ReturnType<typeof setTimeout>;
  /** Fallos seguidos de la racha actual (0 = sin racha). */
  private fallosSeguidos = 0;
  /** Ids que se están enviando ahora mismo (por esta sync o por registrar()). */
  private readonly enVuelo = new Set<string>();

  private readonly resultadoSubject = new Subject<ResultadoSync>();
  /** Permite a la UI o a las pruebas observar cada intento. */
  readonly resultado$ = this.resultadoSubject.asObservable();

  constructor() {
    // Transición false → true = se recuperó la conexión.
    this.network.isOnline$
      .pipe(
        pairwise(),
        filter(([antes, ahora]) => !antes && ahora),
      )
      .subscribe(() => {
        void this.sincronizar('reconexión');
      });

    // Pendientes nuevos con la app ya en línea (p. ej. un movimiento aceptado
    // por Bluetooth, una edición o una eliminación): entran en la
    // sincronización normal. Se observa desde después de la carga inicial,
    // para no tomar lo guardado como nuevo.
    void this.storage.todos().then(() => {
      this.storage.pendientes$
        .pipe(
          map((lista) => lista.length),
          pairwise(),
          filter(([antes, ahora]) => ahora > antes),
          debounceTime(ESPERA_PENDIENTES_NUEVOS_MS),
        )
        .subscribe(() => {
          // Con una racha de fallos en curso, el reintento (3.3) ya se encarga.
          if (this.fallosSeguidos === 0) {
            void this.sincronizar('pendientes nuevos');
          }
        });
    });
  }

  /**
   * Envía los pendientes. Devuelve cuántos se sincronizaron.
   * Es seguro llamarlo en cualquier momento: si no hay conexión o no hay
   * pendientes, no hace nada.
   */
  async sincronizar(origen = 'manual'): Promise<number> {
    if (this.sincronizando || !this.network.isOnline) {
      return 0;
    }
    // Se marca ANTES del primer await: dos llamadas simultáneas (arranque,
    // reconexión, reintento) no pueden pasar a la vez. finally la libera.
    this.sincronizando = true;
    let reservados: string[] = [];
    try {
      const todos = await this.storage.pendientes();
      if (!todos.length) {
        this.terminarRacha();
        return 0;
      }
      // No se envían los que registrar() ya está enviando.
      reservados = this.reservarEnvio(todos.map((m) => m.id));
      const pendientes = todos.filter((m) => reservados.includes(m.id));
      if (!pendientes.length) {
        return 0;
      }

      console.log(`SyncService: enviando ${pendientes.length} pendiente(s) · origen: ${origen}`);
      await this.api.enviarMovimientos(pendientes);
      // Los editados o eliminados durante el envío siguen pendientes.
      const cambiados = await this.storage.marcarSincronizados(pendientes);
      const mensaje = environment.usarServidorSimulado
        ? `Prueba completada: ${pendientes.length} movimiento(s) aceptado(s) por la API simulada.`
        : MENSAJES.toastSyncOk(pendientes.length);
      await this.toast(mensaje, 'cian');
      this.terminarRacha();
      this.resultadoSubject.next({ origen, enviados: pendientes.length });
      // Si mientras se enviaba llegaron más pendientes (p. ej. por Bluetooth)
      // o cambió alguno de los enviados, se hace otra vuelta en cuanto se
      // libere la bandera.
      const quedan =
        cambiados.length > 0 ||
        (await this.storage.pendientes()).some((m) => !this.enVuelo.has(m.id));
      if (quedan) {
        setTimeout(() => void this.sincronizar('pendientes nuevos'), 0);
      }
      return pendientes.length;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      console.warn('SyncService: fallo al sincronizar →', mensaje);
      // El aviso solo se muestra al empezar una racha de fallos.
      if (this.fallosSeguidos === 0) {
        await this.toast(MENSAJES.toastSyncError, 'ambar');
      }
      this.resultadoSubject.next({ origen, enviados: 0, error: mensaje });
      this.programarReintento();
      return 0;
    } finally {
      this.liberarEnvio(reservados);
      this.sincronizando = false;
    }
  }

  /**
   * Registra un fallo y reintenta con espera creciente: 6 s, 12 s, 24 s, 48 s
   * y luego 60 s como máximo. Solo hay un temporizador a la vez.
   */
  programarReintento(): void {
    this.fallosSeguidos++;
    const espera = Math.min(REINTENTO_SYNC_MS * 2 ** (this.fallosSeguidos - 1), REINTENTO_MAX_MS);
    if (this.reintento) {
      clearTimeout(this.reintento);
    }
    this.reintento = setTimeout(() => {
      this.reintento = undefined;
      void this.sincronizar('reintento');
    }, espera);
  }

  /**
   * Reserva para envío los ids que nadie está enviando y devuelve esos ids.
   * La usan sincronizar() y MovimientosService.registrar() para no enviar
   * el mismo movimiento dos veces a la vez.
   */
  reservarEnvio(ids: string[]): string[] {
    const libres = ids.filter((id) => !this.enVuelo.has(id));
    libres.forEach((id) => this.enVuelo.add(id));
    return libres;
  }

  /** Libera los ids reservados cuando termina su envío (con éxito o no). */
  liberarEnvio(ids: string[]): void {
    ids.forEach((id) => this.enVuelo.delete(id));
  }

  /** Fin de la racha de fallos: reinicia el contador y cancela el reintento pendiente. */
  private terminarRacha(): void {
    this.fallosSeguidos = 0;
    if (this.reintento) {
      clearTimeout(this.reintento);
      this.reintento = undefined;
    }
  }

  private async toast(message: string, variante: 'cian' | 'ambar' | 'oscuro'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: DURACION_TOAST_MS,
      position: 'bottom',
      cssClass: ['toast-controla', `toast-${variante}`],
    });
    await toast.present();
  }
}
