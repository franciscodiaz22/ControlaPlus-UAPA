/**
 * ApiService — cliente HTTP hacia el servidor de Controla+
 * ---------------------------------------------------------------------------
 * Único punto por el que salen datos al backend. Con
 * `environment.usarServidorSimulado = true` responde localmente tras ~900 ms,
 * lo que permite probar el módulo sin un servidor real y forzar fallos desde
 * la interfaz para verificar el reintento automático.
 *
 * Con `usarServidorSimulado = false` (configuración `servidor`, M6) hace GET y
 * POST reales contra `apiUrl` (server/servidor.mjs). Cada petición real tiene
 * un límite de tiempo para que un servidor que no responde cuente como fallo
 * y la sincronización pueda reintentar.
 */
import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Movimiento } from './movimiento.model';

export interface ConfigApi {
  apiUrl: string;
  usarServidorSimulado: boolean;
}

/** Configuración de la API (por defecto, la del environment activo). */
export const CONFIG_API = new InjectionToken<ConfigApi>('CONFIG_API', {
  providedIn: 'root',
  factory: () => ({ apiUrl: environment.apiUrl, usarServidorSimulado: environment.usarServidorSimulado }),
});

/** Límite de una petición real; pasado este tiempo cuenta como fallo. */
export const LIMITE_PETICION_MS = 10000;

export interface ConsultaQr {
  codigo: string;
  encontrado: boolean;
  datos?: { concepto: string; monto: number; tipo: 'gasto' | 'ingreso' };
  origen: 'simulado' | 'servidor';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CONFIG_API);

  /** Solo para demostración: hace fallar el envío simulado. */
  simularFallo = false;

  async consultarQr(codigo: string): Promise<ConsultaQr> {
    if (this.config.usarServidorSimulado) {
      await firstValueFrom(timer(500));
      let datos: ConsultaQr['datos'];
      try {
        const payload = JSON.parse(codigo) as Partial<NonNullable<ConsultaQr['datos']>>;
        if (typeof payload.concepto === 'string' && typeof payload.monto === 'number') {
          datos = {
            concepto: payload.concepto,
            monto: payload.monto,
            tipo: payload.tipo === 'ingreso' ? 'ingreso' : 'gasto',
          };
        }
      } catch {
        datos = undefined;
      }
      return { codigo, encontrado: true, datos, origen: 'simulado' };
    }

    const respuesta = await firstValueFrom(
      this.http
        .get<Omit<ConsultaQr, 'origen'>>(`${this.config.apiUrl}/qr/consultar`, { params: { codigo } })
        .pipe(timeout(LIMITE_PETICION_MS)),
    );
    return { ...respuesta, origen: 'servidor' };
  }

  /**
   * Envía uno o varios movimientos. El servidor debe tratar el `id` como clave
   * idempotente: si el mismo movimiento llega dos veces (por ejemplo, tras un
   * reintento), no se duplica.
   *
   * Contrato de `/movimientos/lote` (altas, ediciones y eliminaciones):
   *  - Cada elemento es el movimiento completo; el servidor lo crea o lo
   *    reemplaza por su `id`.
   *  - `version` (ausente = 0) sube con cada cambio en el teléfono; el servidor
   *    puede ignorar un elemento con versión menor a la que ya tiene.
   *  - `eliminado: true` pide borrar ese `id` (si no existe, no es un error).
   * El servidor simulado acepta el lote sin mirar su contenido.
   */
  async enviarMovimientos(movimientos: Movimiento[]): Promise<void> {
    if (this.config.usarServidorSimulado) {
      await firstValueFrom(timer(900));
      if (this.simularFallo) {
        throw new Error('HTTP 503 Service Unavailable (simulado)');
      }
      return;
    }

    await firstValueFrom(
      this.http.post(`${this.config.apiUrl}/movimientos/lote`, movimientos).pipe(timeout(LIMITE_PETICION_MS)),
    );
  }
}
