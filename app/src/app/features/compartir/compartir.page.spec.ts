/**
 * Pruebas del ciclo de vida de Compartir Cerca (U5): al salir de la pestaña
 * (ionViewWillLeave) el receptor deja de anunciarse por BLE. Usa el
 * BleReceptorService real con un periférico falso; sin Bluetooth.
 */
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

import { BleEmisorService } from '../../core/compartir/ble-emisor.service';
import { OpcionesPeriferico, PERIFERICO_BLE, PerifericoBle } from '../../core/compartir/ble-periferico';
import { BleReceptorService } from '../../core/compartir/ble-receptor.service';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { OfflineStorageService } from '../../core/offline/offline-storage.service';
import { CompartirPage } from './compartir.page';

/** Periférico falso: registra si está anunciándose. */
class PerifericoFalso implements PerifericoBle {
  anunciando = false;
  detenciones = 0;

  async disponible() {
    return true;
  }
  async iniciar(_opciones: OpcionesPeriferico, _alEscribir: (valor: Uint8Array) => void) {
    this.anunciando = true;
  }
  async notificar() {
    /* Sin emisor en estas pruebas. */
  }
  async detener() {
    this.anunciando = false;
    this.detenciones++;
  }
}

describe('CompartirPage (ciclo de vida BLE)', () => {
  let pagina: CompartirPage;
  let periferico: PerifericoFalso;
  let receptor: BleReceptorService;
  let limpiezasEmisor: number;

  const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  /** Simula Android: el modo de prueba web solo existe en el navegador. */
  const comoNativo = (): void => {
    (pagina as unknown as { modoPrueba: boolean }).modoPrueba = false;
  };

  beforeEach(() => {
    periferico = new PerifericoFalso();
    limpiezasEmisor = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: PERIFERICO_BLE, useValue: periferico },
        {
          provide: BleEmisorService,
          useValue: {
            receptores$: new BehaviorSubject([]),
            conectado$: new BehaviorSubject(null),
            limpiar: async () => {
              limpiezasEmisor++;
            },
          },
        },
        {
          provide: OfflineStorageService,
          useValue: { movimientos$: new BehaviorSubject([]), todos: async () => [] },
        },
        { provide: MovimientosService, useValue: {} },
        {
          provide: ToastController,
          useValue: { create: async () => ({ present: async () => undefined }) },
        },
      ],
    });
    receptor = TestBed.inject(BleReceptorService);
    pagina = TestBed.runInInjectionContext(() => new CompartirPage());
    comoNativo();
  });

  it('"Recibir" empieza a anunciarse', async () => {
    await pagina.recibir();

    expect(pagina.modo()).toBe('recibir');
    expect(receptor.escuchando).toBe(true);
    expect(periferico.anunciando).toBe(true);
  });

  it('al cambiar de pestaña deja de anunciarse y vuelve al menú', async () => {
    await pagina.recibir();

    pagina.ionViewWillLeave();
    await esperar();

    expect(periferico.anunciando).toBe(false);
    expect(periferico.detenciones).toBe(1);
    expect(receptor.escuchando).toBe(false);
    expect(limpiezasEmisor).toBe(1);
    expect(pagina.modo()).toBe('menu');
  });

  it('al volver a la pestaña se puede recibir otra vez', async () => {
    await pagina.recibir();
    pagina.ionViewWillLeave();
    await esperar();

    await pagina.recibir();

    expect(periferico.anunciando).toBe(true);
  });

  it('desde el menú, salir no hace nada', async () => {
    pagina.ionViewWillLeave();
    await esperar();

    expect(periferico.detenciones).toBe(0);
    expect(limpiezasEmisor).toBe(0);
    expect(pagina.modo()).toBe('menu');
  });
});
