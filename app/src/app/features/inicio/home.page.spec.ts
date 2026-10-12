/**
 * Pruebas de Inicio con servicios simulados: validación del alta rápida
 * (alerta del botón +), confirmación antes de eliminar, fila deslizable
 * (Editar/Eliminar) y pull-to-refresh.
 */
import { TestBed } from '@angular/core/testing';
import { AlertController, IonItemSliding, NavController, ToastController } from '@ionic/angular';
import type { AlertButton, AlertOptions } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

import { NetworkService } from '../../core/network/network.service';
import { ApiService } from '../../core/offline/api.service';
import { Movimiento, NuevoMovimiento } from '../../core/offline/movimiento.model';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { SyncService } from '../../core/offline/sync.service';
import { MENSAJES_VALIDACION } from '../movimientos/validacion';
import { HomePage } from './home.page';

const mov: Movimiento = {
  id: 'm1',
  concepto: 'Colmado',
  monto: 350,
  tipo: 'gasto',
  fecha: '2026-10-01T10:00:00.000Z',
  estado: 'sincronizado',
};

describe('HomePage (CRUD)', () => {
  let pagina: HomePage;
  let alertas: AlertOptions[];
  let toasts: string[];
  let altas: NuevoMovimiento[];
  let eliminados: string[];
  let sincronizaciones: string[];
  let navegaciones: unknown[];
  let enviadosSync: number;
  let pendientes: BehaviorSubject<number>;
  let red: { modoOfflineDePrueba: boolean; isOnline: boolean };

  /** Fila deslizable simulada: registra si se cerró. */
  const deslizable = (): IonItemSliding & { cerrada: boolean } => {
    const fila = {
      cerrada: false,
      close: async () => {
        fila.cerrada = true;
      },
    };
    return fila as unknown as IonItemSliding & { cerrada: boolean };
  };

  /** Evento ionRefresh simulado: registra si se completó. */
  const eventoRefresco = (): Event & { completado: () => boolean } => {
    let completado = false;
    const target = {
      complete: async () => {
        completado = true;
      },
    };
    return { target, completado: () => completado } as unknown as Event & { completado: () => boolean };
  };

  beforeEach(() => {
    alertas = [];
    toasts = [];
    altas = [];
    eliminados = [];
    sincronizaciones = [];
    navegaciones = [];
    enviadosSync = 0;
    pendientes = new BehaviorSubject(0);
    red = { modoOfflineDePrueba: false, isOnline: true };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MovimientosService,
          useValue: {
            movimientos$: new BehaviorSubject([mov]),
            balance$: new BehaviorSubject(0),
            pendientes$: pendientes,
            registrar: async (d: NuevoMovimiento) => {
              altas.push(d);
            },
            eliminar: async (id: string) => {
              eliminados.push(id);
            },
          },
        },
        {
          provide: AlertController,
          useValue: {
            create: async (opciones: AlertOptions) => {
              alertas.push(opciones);
              return { present: async () => undefined };
            },
          },
        },
        {
          provide: ToastController,
          useValue: {
            create: async ({ message }: { message: string }) => {
              toasts.push(message);
              return { present: async () => undefined };
            },
          },
        },
        { provide: NetworkService, useValue: red },
        { provide: ApiService, useValue: { simularFallo: false } },
        {
          provide: SyncService,
          useValue: {
            sincronizar: async (origen: string) => {
              sincronizaciones.push(origen);
              return enviadosSync;
            },
          },
        },
        {
          provide: NavController,
          useValue: {
            navigateForward: async (ruta: unknown) => {
              navegaciones.push(ruta);
              return true;
            },
          },
        },
      ],
    });
    pagina = TestBed.runInInjectionContext(() => new HomePage());
  });

  const boton = (texto: string): AlertButton =>
    (alertas[alertas.length - 1].buttons as AlertButton[]).find((b) => b.text === texto)!;
  const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  describe('eliminar', () => {
    it('pide confirmación mostrando el concepto como texto y no elimina todavía', async () => {
      await pagina.eliminarMovimiento(mov);
      expect(alertas).toHaveLength(1);
      expect(alertas[0].header).toBe('¿Eliminar movimiento?');
      expect(alertas[0].subHeader).toBe('Colmado');
      expect(eliminados).toEqual([]);
    });

    it('Cancelar no elimina', async () => {
      await pagina.eliminarMovimiento(mov);
      const cancelar = boton('Cancelar');
      expect(cancelar.role).toBe('cancel');
      expect(cancelar.handler).toBeUndefined();
      expect(eliminados).toEqual([]);
    });

    it('Eliminar confirma y elimina por id', async () => {
      await pagina.eliminarMovimiento(mov);
      await boton('Eliminar').handler!(undefined);
      await esperar();
      expect(eliminados).toEqual(['m1']);
    });
  });

  describe('alta rápida (alerta del botón +)', () => {
    it('con datos inválidos avisa y mantiene la alerta abierta', async () => {
      await pagina.nuevoMovimiento();
      const resultado = boton('Gasto').handler!({ concepto: '  ', monto: '' });
      await esperar();
      expect(resultado).toBe(false);
      expect(altas).toEqual([]);
      expect(toasts).toEqual([MENSAJES_VALIDACION.conceptoVacio]);
    });

    it('con datos válidos registra los datos limpios con el tipo del botón', async () => {
      await pagina.nuevoMovimiento();
      const resultado = boton('Ingreso').handler!({ concepto: ' Pago  cliente ', monto: '99.90' });
      await esperar();
      expect(resultado).toBe(true);
      expect(altas).toEqual([{ concepto: 'Pago cliente', monto: 99.9, tipo: 'ingreso', ubicacion: undefined }]);
    });
  });

  describe('fila deslizable (U3)', () => {
    it('Editar cierra la fila y abre el formulario de edición', async () => {
      const fila = deslizable();
      await pagina.editarMovimiento(mov, fila);
      expect(fila.cerrada).toBe(true);
      expect(navegaciones).toEqual([['/tabs/inicio/movimiento', 'm1']]);
    });

    it('Eliminar cierra la fila antes de pedir confirmación', async () => {
      const fila = deslizable();
      await pagina.eliminarMovimiento(mov, fila);
      expect(fila.cerrada).toBe(true);
      expect(alertas[0].header).toBe('¿Eliminar movimiento?');
      expect(eliminados).toEqual([]);
    });
  });

  describe('pull-to-refresh (U3)', () => {
    it('con red pide a SyncService la sincronización manual y completa el refresco', async () => {
      enviadosSync = 2;
      const evento = eventoRefresco();
      await pagina.refrescar(evento);
      expect(sincronizaciones).toEqual(['manual']);
      expect(evento.completado()).toBe(true);
      // el aviso de éxito lo da SyncService
      expect(toasts).toEqual([]);
    });

    it('sin pendientes avisa de que todo está sincronizado', async () => {
      const evento = eventoRefresco();
      await pagina.refrescar(evento);
      expect(sincronizaciones).toEqual(['manual']);
      expect(toasts).toEqual(['Todo está sincronizado.']);
      expect(evento.completado()).toBe(true);
    });

    it('si quedan pendientes sin enviar (fallo o sync en curso) no dice que todo está sincronizado', async () => {
      pendientes.next(3);
      const evento = eventoRefresco();
      await pagina.refrescar(evento);
      expect(toasts).toEqual([]);
      expect(evento.completado()).toBe(true);
    });

    it('sin red no intenta sincronizar, avisa y completa el refresco', async () => {
      red.isOnline = false;
      const evento = eventoRefresco();
      await pagina.refrescar(evento);
      expect(sincronizaciones).toEqual([]);
      expect(toasts).toEqual(['Sin conexión: los pendientes se enviarán al reconectar.']);
      expect(evento.completado()).toBe(true);
    });
  });
});
