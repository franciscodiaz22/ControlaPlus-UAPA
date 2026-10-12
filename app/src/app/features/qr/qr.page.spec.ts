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
import { CAMARA_QR, CamaraQr, ESCANER_QR, EscanerQr, PLATAFORMA_QR, QR_EJEMPLO, QrPage } from './qr.page';

class EscanerFalso {
  soportado = true;
  moduloDisponible = true;
  lectura: string | undefined = '{"concepto":"Café QR","monto":125,"tipo":"gasto"}';
  error: unknown = null;
  escaneos = 0;
  instalaciones = 0;
  /** Lectura desde una foto: texto del QR de la imagen (undefined = sin QR). */
  lecturaImagen: string | undefined = '{"concepto":"Recibo QR","monto":80,"tipo":"gasto"}';
  errorImagen: unknown = null;
  imagenes: { path?: string; blob?: Blob }[] = [];

  async readBarcodesFromImage(opciones: { path?: string; blob?: Blob }) {
    this.imagenes.push(opciones);
    if (this.errorImagen) {
      throw this.errorImagen;
    }
    return { barcodes: this.lecturaImagen === undefined ? [] : [{ rawValue: this.lecturaImagen }] };
  }
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

/** @capacitor/camera falso: devuelve una foto (o falla) sin abrir nada. */
class CamaraFalsa {
  foto: { uri?: string; webPath?: string } | undefined = {
    uri: '/data/user/0/io.ionic.starter/cache/recibo.jpg',
    webPath: 'https://localhost/_capacitor_file_/data/user/0/io.ionic.starter/cache/recibo.jpg',
  };
  error: unknown = null;
  fotos = 0;
  galerias = 0;

  async takePhoto() {
    this.fotos++;
    if (this.error) {
      throw this.error;
    }
    return { type: 0, saved: false, ...this.foto };
  }
  async chooseFromGallery() {
    this.galerias++;
    if (this.error) {
      throw this.error;
    }
    return { results: this.foto ? [{ type: 0, saved: false, ...this.foto }] : [] };
  }
}

describe('QrPage', () => {
  let fixture: ComponentFixture<QrPage>;
  let pagina: QrPage;
  let escaner: EscanerFalso;
  let camara: CamaraFalsa;
  let altas: NuevoMovimiento[];

  async function montar(plataforma: string): Promise<void> {
    escaner = new EscanerFalso();
    camara = new CamaraFalsa();
    altas = [];
    await TestBed.configureTestingModule({
      imports: [QrPage],
      providers: [
        provideIonicAngular(),
        { provide: ESCANER_QR, useValue: escaner as unknown as EscanerQr },
        { provide: CAMARA_QR, useValue: camara as unknown as CamaraQr },
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

    describe('leer QR desde una foto', () => {
      it('muestra las opciones "Tomar foto" y "Elegir de la galería"', () => {
        expect(texto()).toContain('LEER QR DESDE UNA FOTO');
        expect(texto()).toContain('Tomar foto');
        expect(texto()).toContain('Elegir de la galería');
      });

      it('tomar foto con un QR: ML Kit lee la imagen y sigue el mismo flujo (GET y alta una vez)', async () => {
        await pagina.leerDesdeFoto('camara');
        await actualizar();
        expect(camara.fotos).toBe(1);
        expect(escaner.escaneos).toBe(0);
        expect(escaner.imagenes).toEqual([
          { path: 'file:///data/user/0/io.ionic.starter/cache/recibo.jpg', formats: ['QR_CODE'] },
        ]);
        expect(pagina.estado()).toBe('leido');
        expect(pagina.desdeFoto()).toBe(true);
        expect(pagina.fotoVista()).toContain('recibo.jpg');
        expect(texto()).toContain('DESDE UNA FOTO');
        expect(texto()).toContain('Recibo QR');
        expect(texto()).toContain('RESPUESTA GET · API SIMULADA');

        await pagina.agregarMovimiento();
        await pagina.agregarMovimiento();
        expect(altas).toEqual([{ concepto: 'Recibo QR', monto: 80, tipo: 'gasto' }]);
      });

      it('galería con un QR de enlace: "Abrir enlace" sin consulta GET', async () => {
        escaner.lecturaImagen = 'https://uapa.edu.do';
        await pagina.leerDesdeFoto('galeria');
        await actualizar();
        expect(camara.galerias).toBe(1);
        expect(pagina.enlaceQr()).toBe('https://uapa.edu.do/');
        expect(pagina.consulta()).toBe('');
        expect(texto()).toContain('Abrir enlace');
      });

      it('cancelar la cámara o la galería: estado "cancelado", sin leer imagen', async () => {
        camara.error = new Error("Couldn't take photo because the process was canceled.");
        await pagina.leerDesdeFoto('camara');
        await actualizar();
        expect(pagina.estado()).toBe('cancelado');
        expect(texto()).toContain('No se eligió ninguna foto');
        expect(texto()).not.toContain('canceled');

        camara.error = null;
        camara.foto = undefined;
        await pagina.leerDesdeFoto('galeria');
        expect(pagina.estado()).toBe('cancelado');
        expect(escaner.imagenes).toEqual([]);
        expect(pagina.procesando()).toBe(false);
      });

      it('foto sin código QR: error claro y sin resultado', async () => {
        escaner.lecturaImagen = undefined;
        await pagina.leerDesdeFoto('galeria');
        await actualizar();
        expect(pagina.estado()).toBe('error');
        expect(pagina.resultado()).toBe('');
        expect(texto()).toContain('No se encontró ningún código QR en la foto');
      });

      it('imagen inválida o error al procesarla: mensaje en español', async () => {
        escaner.errorImagen = new Error('The image could not be loaded.');
        await pagina.leerDesdeFoto('galeria');
        expect(pagina.estado()).toBe('error');
        expect(pagina.mensaje()).toContain('No se pudo procesar la imagen');
        expect(pagina.mensaje()).not.toContain('could not');
      });

      it('QR con datos de movimiento inválidos: avisa y no permite agregarlo', async () => {
        escaner.lecturaImagen = '{"concepto":"Recibo","monto":-3,"tipo":"gasto"}';
        await pagina.leerDesdeFoto('camara');
        await actualizar();
        expect(pagina.errorDatos()).toContain('no son válidos');
        expect(texto()).not.toContain('Agregar movimiento');
        await pagina.agregarMovimiento();
        expect(altas).toEqual([]);
      });

      it('permiso denegado y errores de cámara se explican en español', async () => {
        camara.error = new Error("Couldn't access your photo gallery because access wasn't provided.");
        await pagina.leerDesdeFoto('galeria');
        expect(pagina.estado()).toBe('error');
        expect(pagina.mensaje()).toContain('No hay permiso para usar la cámara o la galería');
        camara.error = new Error("Couldn't take photo.");
        await pagina.leerDesdeFoto('camara');
        expect(pagina.mensaje()).toBe('No se pudo obtener la foto. Inténtalo de nuevo.');
        camara.error = new Error('No camera available.');
        await pagina.leerDesdeFoto('camara');
        expect(pagina.mensaje()).toContain('no están disponibles');
      });

      it('"Limpiar" quita la foto y el resultado; el escáner en vivo sigue funcionando', async () => {
        await pagina.leerDesdeFoto('camara');
        pagina.limpiar();
        expect(pagina.fotoVista()).toBeNull();
        expect(pagina.desdeFoto()).toBe(false);
        await pagina.escanear();
        expect(escaner.escaneos).toBe(1);
        expect(pagina.desdeFoto()).toBe(false);
        expect(pagina.resultado()).toContain('Café QR');
      });
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

    it('foto en un navegador sin lector de imágenes (BarcodeDetector): lo explica sin abrir la cámara', async () => {
      escaner.soportado = false;
      await pagina.leerDesdeFoto('galeria');
      expect(camara.galerias).toBe(0);
      expect(pagina.estado()).toBe('error');
      expect(pagina.mensaje()).toContain('Este navegador no puede buscar códigos QR en imágenes');
    });

    it('foto en un navegador con lector: envía la imagen como blob y muestra el resultado', async () => {
      camara.foto = { webPath: 'data:image/png;base64,iVBORw0KGgo=' };
      await pagina.leerDesdeFoto('galeria');
      expect(escaner.imagenes.length).toBe(1);
      expect(escaner.imagenes[0].blob).toBeDefined();
      expect(escaner.imagenes[0].path).toBeUndefined();
      expect(pagina.resultado()).toContain('Recibo QR');
      expect(pagina.esEjemplo()).toBe(false);
    });
  });
});
