/**
 * Pruebas del CRUD de Inicio con servicios simulados: validación del alta
 * rápida (alerta del botón +) y confirmación antes de eliminar.
 */
import { TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import type { AlertButton, AlertOptions } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

import { NetworkService } from '../../core/network/network.service';
import { ApiService } from '../../core/offline/api.service';
import { Movimiento, NuevoMovimiento } from '../../core/offline/movimiento.model';
import { MovimientosService } from '../../core/offline/movimientos.service';
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

  beforeEach(() => {
    alertas = [];
    toasts = [];
    altas = [];
    eliminados = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MovimientosService,
          useValue: {
            movimientos$: new BehaviorSubject([mov]),
            balance$: new BehaviorSubject(0),
            pendientes$: new BehaviorSubject(0),
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
        { provide: NetworkService, useValue: { modoOfflineDePrueba: false } },
        { provide: ApiService, useValue: { simularFallo: false } },
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
});
