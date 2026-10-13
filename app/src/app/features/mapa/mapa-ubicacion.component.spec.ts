/**
 * Pruebas de U6 (mapa + GPS) con servicios simulados: movimientos con
 * ubicación en el mapa, alta de movimientos desde un punto del mapa con
 * MovimientosService.registrar(), marcadores y manejo de errores del GPS.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular';
import type { AlertButton, AlertOptions } from '@ionic/angular';
import * as L from 'leaflet';
import { BehaviorSubject } from 'rxjs';

import { MENSAJES } from '../../core/offline/mensajes';
import { Movimiento, NuevoMovimiento } from '../../core/offline/movimiento.model';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { MENSAJES_VALIDACION } from '../movimientos/validacion';
import { MapaUbicacionComponent } from './mapa-ubicacion.component';

const conUbicacion: Movimiento = {
  id: 'm1',
  concepto: '<b>Colmado</b>',
  monto: 350,
  tipo: 'gasto',
  fecha: '2026-10-01T10:00:00.000Z',
  ubicacion: { latitud: 18.4861, longitud: -69.9312 },
  estado: 'pendiente',
};
const otroConUbicacion: Movimiento = {
  ...conUbicacion,
  id: 'm2',
  concepto: 'Pago cliente',
  tipo: 'ingreso',
  ubicacion: { latitud: 18.5, longitud: -69.95, simulada: true },
  estado: 'sincronizado',
};
const sinUbicacion: Movimiento = { ...conUbicacion, id: 'm3', concepto: 'Sin GPS', ubicacion: undefined };

/** Acceso a los miembros privados que usan las pruebas. */
interface Internos {
  mapa?: L.Map;
  capaMovimientos?: L.LayerGroup;
}

describe('MapaUbicacionComponent (U6)', () => {
  let fixture: ComponentFixture<MapaUbicacionComponent>;
  let componente: MapaUbicacionComponent;
  let lista: BehaviorSubject<Movimiento[]>;
  let altas: NuevoMovimiento[];
  let alertas: AlertOptions[];
  let toasts: string[];
  let cerrarAlerta: (role: string) => void;
  const geolocalizacionOriginal = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

  beforeEach(() => {
    lista = new BehaviorSubject<Movimiento[]>([conUbicacion, otroConUbicacion, sinUbicacion]);
    altas = [];
    alertas = [];
    toasts = [];
    TestBed.configureTestingModule({
      imports: [MapaUbicacionComponent],
      providers: [
        {
          provide: MovimientosService,
          useValue: {
            movimientos$: lista,
            registrar: async (d: NuevoMovimiento) => {
              altas.push(d);
            },
          },
        },
        {
          provide: AlertController,
          useValue: {
            create: async (opciones: AlertOptions) => {
              alertas.push(opciones);
              const cerrada = new Promise<{ role?: string }>((resolver) => {
                cerrarAlerta = (role) => resolver({ role });
              });
              return { present: async () => undefined, onDidDismiss: () => cerrada };
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
      ],
    });
    fixture = TestBed.createComponent(MapaUbicacionComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    if (geolocalizacionOriginal) {
      Object.defineProperty(navigator, 'geolocation', geolocalizacionOriginal);
    } else {
      delete (navigator as { geolocation?: unknown }).geolocation;
    }
  });

  const internos = (): Internos => componente as unknown as Internos;
  const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const marcadoresMovimiento = (): L.Marker[] =>
    (internos().capaMovimientos?.getLayers() ?? []) as L.Marker[];
  const boton = (texto: string): AlertButton =>
    (alertas[alertas.length - 1].buttons as AlertButton[]).find((b) => b.text === texto)!;

  /** Activa "Agregar marcador" y pulsa el mapa en un punto. */
  const pulsarMapa = async (lat: number, lng: number): Promise<void> => {
    componente.alternarAgregarMarcador();
    internos().mapa!.fire('click', { latlng: L.latLng(lat, lng) });
    await esperar();
  };

  /** Simula navigator.geolocation (implementación web de @capacitor/geolocation). */
  const simularGps = (
    resultado: { coords: Partial<GeolocationCoordinates> } | { code: number; message: string }
  ): void => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback, error: PositionErrorCallback) =>
          'coords' in resultado
            ? ok({ coords: resultado.coords, timestamp: Date.now() } as GeolocationPosition)
            : error(resultado as GeolocationPositionError),
      },
    });
  };

  describe('movimientos con ubicación', () => {
    it('dibuja solo los movimientos con ubicación y omite los que no tienen', () => {
      const marcadores = marcadoresMovimiento();
      expect(marcadores).toHaveLength(2);
      expect(marcadores.map((m) => m.options.title)).toEqual(['<b>Colmado</b>', 'Pago cliente']);
      expect(componente.movimientosEnMapa()).toBe(2);
    });

    it('se actualiza con movimientos$ (alta, edición o eliminación)', () => {
      lista.next([sinUbicacion]);
      expect(marcadoresMovimiento()).toHaveLength(0);
      expect(componente.movimientosEnMapa()).toBe(0);

      lista.next([otroConUbicacion]);
      expect(marcadoresMovimiento()).toHaveLength(1);
    });

    it('el popup muestra concepto como texto, monto, tipo y la etiqueta de pendiente', () => {
      const popup = marcadoresMovimiento()[0].getPopup()!.getContent() as HTMLElement;
      expect(popup.querySelector('strong')!.textContent).toBe('<b>Colmado</b>');
      expect(popup.querySelector('b')).toBeNull();
      expect(popup.textContent).toContain('- RD$');
      expect(popup.textContent).toContain('Gasto');
      expect(popup.textContent).toContain(MENSAJES.etiquetaPendiente);

      const sincronizado = marcadoresMovimiento()[1].getPopup()!.getContent() as HTMLElement;
      expect(sincronizado.textContent).toContain('+ RD$');
      expect(sincronizado.textContent).not.toContain(MENSAJES.etiquetaPendiente);
    });

    it('ignora coordenadas no válidas sin romper el mapa', () => {
      lista.next([{ ...conUbicacion, ubicacion: { latitud: Number.NaN, longitud: 10 } }]);
      expect(marcadoresMovimiento()).toHaveLength(0);
    });

    it('deja de escuchar movimientos$ al destruirse', () => {
      fixture.destroy();
      expect(lista.observed).toBe(false);
    });
  });

  describe('marcadores y alta desde el mapa', () => {
    it('registra un gasto en el punto pulsado con MovimientosService.registrar()', async () => {
      await pulsarMapa(18.123456789, -69.987654321);
      expect(alertas).toHaveLength(1);

      const resultado = (boton('Gasto').handler as (d: unknown) => boolean)({ nombre: '  Farmacia  ', monto: '480' });

      expect(resultado).toBe(true);
      expect(altas).toEqual([
        {
          concepto: 'Farmacia',
          monto: 480,
          tipo: 'gasto',
          ubicacion: { latitud: 18.123457, longitud: -69.987654 },
        },
      ]);
    });

    it('registra un ingreso', async () => {
      await pulsarMapa(18.5, -69.9);
      (boton('Ingreso').handler as (d: unknown) => boolean)({ nombre: 'Venta', monto: '1000' });
      expect(altas[0].tipo).toBe('ingreso');
    });

    it('no registra con datos no válidos y mantiene la alerta abierta', async () => {
      await pulsarMapa(18.5, -69.9);
      const resultado = (boton('Gasto').handler as (d: unknown) => boolean)({ nombre: 'Venta', monto: '' });
      await esperar();

      expect(resultado).toBe(false);
      expect(altas).toHaveLength(0);
      expect(toasts).toEqual([MENSAJES_VALIDACION.montoVacio]);
    });

    it('"Solo marcador" agrega el marcador sin crear movimiento', async () => {
      await pulsarMapa(18.5, -69.9);
      const resultado = (boton('Solo marcador').handler as (d: unknown) => boolean)({ nombre: 'Parada' });

      expect(resultado).toBe(true);
      expect(altas).toHaveLength(0);
      expect(componente.mensajeEstado()).toBe('Marcador agregado: Parada.');
    });

    it('al cancelar el diálogo actualiza el estado y desactiva el modo marcador', async () => {
      await pulsarMapa(18.5, -69.9);
      cerrarAlerta('backdrop');
      await esperar();

      expect(componente.agregandoMarcador()).toBe(false);
      expect(componente.mensajeEstado()).toBe('Colocación de marcadores cancelada.');
    });
  });

  describe('GPS', () => {
    it('muestra la ubicación actual', async () => {
      simularGps({ coords: { latitude: 18.4861, longitude: -69.9312, accuracy: 5 } });
      await componente.centrarEnMiUbicacion();

      expect(componente.coordenadas()?.latitude).toBe(18.4861);
      expect(componente.error()).toBe('');
      expect(componente.mensajeEstado()).toBe('Ubicación actualizada con el GPS del dispositivo.');
    });

    it('avisa si se deniega el permiso', async () => {
      simularGps({ code: 1, message: 'User denied Geolocation' });
      await componente.centrarEnMiUbicacion();
      expect(componente.error()).toContain('Permiso de ubicación denegado');
    });

    it('avisa si el GPS está desactivado', async () => {
      simularGps({ code: 2, message: 'Position unavailable' });
      await componente.centrarEnMiUbicacion();
      expect(componente.error()).toContain('Comprueba que el GPS');
    });
  });
});
