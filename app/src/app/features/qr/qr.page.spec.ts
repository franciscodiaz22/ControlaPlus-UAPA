/**
 * Pruebas de QrPage con un escáner falso (ESCANER_QR) y servicios simulados:
 * estados, lectura, enlaces, cancelación, errores, módulo de Google, modo web
 * y alta del movimiento leído.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { ApiService, ConsultaQr } from '../../core/offline/api.service';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { NuevoMovimiento } from '../../core/offline/movimiento.model';
import { ESCANER_QR, EscanerQr, PLATAFORMA_QR, QR_EJEMPLO, QrPage } from './qr.page';

class EscanerFalso {
  soportado = true;
  moduloDisponible = true;
  lectura: string | undefined = '{"concepto":"Café QR","monto":125,"tipo":"gasto"}';
  error: unknown = null;
  escaneos = 0;
  instalaciones = 0;
  escuchas: ((e: { state: number; progress?: number }) => void)[] = [];

  async isSupported() {
    return { supported: this.soportado };
  }
  async isGoogleBarcodeScannerModuleAvailable() {
    return { available: this.moduloDisponible };
  }
  async installGoogleBarcodeScannerModule() {
    this.instalaciones++;
  }
  async scan() {
    this.escaneos++;
    if (this.error) {
      throw this.error;
    }
    return { barcodes: this.lectura === undefined ? [] : [{ rawValue: this.lectura }] };
  }
  async addListener(_evento: string, f: (e: { state: number; progress?: number }) => void) {
    this.escuchas.push(f);
    return { remove: async () => undefined };
  }
}

describe('QrPage', () => {
  let fixture: ComponentFixture<QrPage>;
  let pagina: QrPage;
  let escaner: EscanerFalso;
  let altas: NuevoMovimiento[];

  async function montar(plataforma: string): Promise<void> {
    escaner = new EscanerFalso();
    altas = [];
    await TestBed.configureTestingModule({
      imports: [QrPage],
      providers: [
        provideIonicAngular(),
        { provide: ESCANER_QR, useValue: escaner as unknown as EscanerQr },
        { provide: PLATAFORMA_QR, useValue: plataforma },
        {
          provide: ApiService,
          useValue: {
            consultarQr: async (codigo: string): Promise<ConsultaQr> => {
              let datos: ConsultaQr['datos'];
              try {
                datos = JSON.parse(codigo);
              } catch {
                datos = undefined;
              }
              return { codigo, encontrado: true, datos, origen: 'simulado' };
            },
          },
        },
        { provide: MovimientosService, useValue: { registrar: async (d: NuevoMovimiento) => void altas.push(d) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(QrPage);
    pagina = fixture.componentInstance;
    fixture.detectChanges();
  }

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const actualizar = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  describe('Android', () => {
    beforeEach(() => montar('android'));

    it('estado inicial: listo para escanear, sin resultado', () => {
      expect(pagina.estado()).toBe('inactivo');
      expect(texto()).toContain('Listo para escanear');
      expect(texto()).toContain('CÁMARA · ML KIT');
    });

    it('lee un QR de movimiento, muestra el resultado y la consulta GET, y permite agregarlo una vez', async () => {
      await pagina.escanear();
      await actualizar();
      expect(escaner.escaneos).toBe(1);
      expect(pagina.estado()).toBe('leido');
      expect(texto()).toContain('Café QR');
      expect(texto()).toContain('RESPUESTA GET · API SIMULADA');
      expect(texto()).toContain('Escanear otro');

      await pagina.agregarMovimiento();
      await pagina.agregarMovimiento();
      await actualizar();
      expect(altas).toEqual([{ concepto: 'Café QR', monto: 125, tipo: 'gasto' }]);
      expect(texto()).toContain('Movimiento agregado');
    });

    it('un enlace se muestra con "Abrir enlace" y sin consulta GET', async () => {
      escaner.lectura = 'https://uapa.edu.do';
      await pagina.escanear();
      await actualizar();
      expect(pagina.enlaceQr()).toBe('https://uapa.edu.do/');
      expect(pagina.consulta()).toBe('');
      expect(texto()).toContain('Abrir enlace');
    });

    it('datos de movimiento inválidos: avisa y no permite agregarlo', async () => {
      escaner.lectura = '{"concepto":"","monto":0,"tipo":"gasto"}';
      await pagina.escanear();
      await actualizar();
      expect(pagina.errorDatos()).toContain('no son válidos');
      expect(texto()).not.toContain('Agregar movimiento');
      await pagina.agregarMovimiento();
      expect(altas).toEqual([]);
    });

    it('QR vacío o sin lectura: error claro', async () => {
      escaner.lectura = '   ';
      await pagina.escanear();
      expect(pagina.estado()).toBe('error');
      expect(pagina.mensaje()).toContain('vacío');
      escaner.lectura = undefined;
      await pagina.escanear();
      expect(pagina.estado()).toBe('error');
    });

    it('cancelar deja el estado "cancelado" con un mensaje en español, sin romper', async () => {
      escaner.error = new Error('scan canceled.');
      await pagina.escanear();
      await actualizar();
      expect(pagina.estado()).toBe('cancelado');
      expect(texto()).toContain('Escaneo cancelado');
      expect(texto()).not.toContain('scan canceled');
      expect(pagina.procesando()).toBe(false);
    });

    it('permiso denegado y errores de cámara se explican en español', async () => {
      escaner.error = new Error('Camera permission denied');
      await pagina.escanear();
      expect(pagina.mensaje()).toContain('permiso');
      escaner.error = new Error('Failed to open camera');
      await pagina.escanear();
      expect(pagina.estado()).toBe('error');
      expect(pagina.mensaje()).toContain('No se pudo abrir la cámara');
    });

    it('sin cámara compatible: no intenta escanear', async () => {
      escaner.soportado = false;
      await pagina.escanear();
      expect(escaner.escaneos).toBe(0);
      expect(pagina.mensaje()).toContain('no tiene una cámara compatible');
    });

    it('sin el módulo de Google: lo instala, muestra el progreso y avisa al terminar', async () => {
      escaner.moduloDisponible = false;
      await pagina.escanear();
      expect(escaner.instalaciones).toBe(1);
      expect(escaner.escaneos).toBe(0);
      expect(pagina.estado()).toBe('instalando');
      escaner.escuchas[0]({ state: 2, progress: 40 });
      expect(pagina.progresoModulo()).toBe(40);
      escaner.escuchas[0]({ state: 4, progress: 100 });
      expect(pagina.estado()).toBe('inactivo');
      expect(pagina.mensaje()).toContain('instalado');
    });

    it('"Escanear otro" y "Limpiar" vuelven al estado inicial', async () => {
      await pagina.escanear();
      pagina.limpiar();
      expect(pagina.estado()).toBe('inactivo');
      expect(pagina.resultado()).toBe('');
      expect(pagina.consultaDatos()).toBeNull();
      escaner.lectura = 'Texto libre';
      await pagina.escanear();
      expect(escaner.escaneos).toBe(2);
      expect(pagina.resultado()).toBe('Texto libre');
    });
  });

  describe('Web', () => {
    beforeEach(() => montar('web'));

    it('no simula en silencio: "Escanear QR" explica que la cámara real está en Android', async () => {
      expect(texto()).toContain('MODO DE PRUEBA WEB');
      await pagina.escanear();
      await actualizar();
      expect(escaner.escaneos).toBe(0);
      expect(pagina.resultado()).toBe('');
      expect(texto()).toContain('el escáner real funciona en la app Android');
    });

    it('el QR de ejemplo se marca como prueba sin cámara', async () => {
      await pagina.probarEjemplo();
      await actualizar();
      expect(escaner.escaneos).toBe(0);
      expect(pagina.resultado()).toBe(QR_EJEMPLO);
      expect(pagina.esEjemplo()).toBe(true);
      expect(texto()).toContain('EJEMPLO, SIN CÁMARA');
      expect(texto()).toContain('no se usó la cámara');
    });
  });
});
