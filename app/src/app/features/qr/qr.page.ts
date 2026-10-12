/**
 * QrPage — cámara / lector QR de Controla+ (U8).
 * ---------------------------------------------------------------------------
 * Módulo original de Ángel (lectura con ML Kit, enlaces, consulta GET y
 * "Agregar movimiento"), completado en M5 con:
 *  - estados visibles del escáner (preparando, instalando módulo, cámara
 *    abierta, leído, cancelado, error);
 *  - mensajes en español para cancelación, permisos, falta de cámara o del
 *    módulo de Google y errores de lectura (qr-lectura.ts);
 *  - "Escanear otro" y "Limpiar";
 *  - validación de los datos del QR antes de crear un movimiento y un solo
 *    alta por lectura;
 *  - modo web explícito: el navegador no abre la cámara; se ofrece un QR de
 *    ejemplo claramente identificado como prueba.
 *
 * En Android se usa el escáner de Google (ML Kit, BarcodeScanner.scan()):
 * abre su propia pantalla de cámara mediante Google Play Services, por lo que
 * la app no necesita declarar ni pedir el permiso CAMERA.
 *
 * El plugin se inyecta con ESCANER_QR (y la plataforma con PLATAFORMA_QR)
 * para poder sustituirlos en las pruebas.
 */
import { Component, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  BarcodeFormat,
  BarcodeScanner,
  BarcodeScannerPlugin,
  GoogleBarcodeScannerModuleInstallState,
} from '@capacitor-mlkit/barcode-scanning';
import { ApiService, ConsultaQr } from '../../core/offline/api.service';
import { MovimientosService } from '../../core/offline/movimientos.service';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { qrCodeOutline } from 'ionicons/icons';
import { analizarContenido, interpretarFallo, movimientoDesdeQr } from './qr-lectura';

export type EscanerQr = Pick<
  BarcodeScannerPlugin,
  'isSupported' | 'isGoogleBarcodeScannerModuleAvailable' | 'installGoogleBarcodeScannerModule' | 'scan' | 'addListener'
>;

export const ESCANER_QR = new InjectionToken<EscanerQr>('ESCANER_QR', {
  providedIn: 'root',
  factory: () => BarcodeScanner,
});

/** 'android' | 'ios' | 'web' */
export const PLATAFORMA_QR = new InjectionToken<string>('PLATAFORMA_QR', {
  providedIn: 'root',
  factory: () => Capacitor.getPlatform(),
});

export type EstadoQr = 'inactivo' | 'preparando' | 'instalando' | 'escaneando' | 'leido' | 'cancelado' | 'error';

const TEXTO_ESTADO: Record<EstadoQr, string> = {
  inactivo: 'Listo para escanear',
  preparando: 'Preparando el escáner…',
  instalando: 'Instalando el módulo de escaneo…',
  escaneando: 'Cámara abierta: apunta al código QR',
  leido: 'Código leído',
  cancelado: 'Escaneo cancelado',
  error: 'No se pudo leer',
};

/** QR de ejemplo para el modo de prueba web (no usa la cámara). */
export const QR_EJEMPLO = JSON.stringify({ app: 'ControlaPlus', tipo: 'gasto', concepto: 'Compra QR de prueba', monto: 250 });

@Component({
  selector: 'app-qr',
  standalone: true,
  imports: [IonButton, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar],
  templateUrl: './qr.page.html',
  styleUrls: ['./qr.page.scss'],
})
export class QrPage implements OnDestroy {
  private readonly escaner = inject(ESCANER_QR);
  private readonly plataforma = inject(PLATAFORMA_QR);
  private readonly api = inject(ApiService);
  private readonly movimientos = inject(MovimientosService);

  readonly modoWeb = this.plataforma !== 'android' && this.plataforma !== 'ios';

  readonly estado = signal<EstadoQr>('inactivo');
  readonly procesando = signal(false);
  readonly resultado = signal('');
  readonly mensaje = signal('');
  readonly enlaceQr = signal<string | null>(null);
  readonly consulta = signal('');
  readonly consultaDatos = signal<ConsultaQr | null>(null);
  /** Lectura de ejemplo del modo web (no es una lectura de cámara). */
  readonly esEjemplo = signal(false);
  /** Error de validación de los datos del QR (impide agregar el movimiento). */
  readonly errorDatos = signal('');
  readonly agregado = signal(false);
  readonly progresoModulo = signal<number | null>(null);

  private escuchaModulo?: PluginListenerHandle;

  constructor() {
    addIcons({ qrCodeOutline });
  }

  get textoEstado(): string {
    return TEXTO_ESTADO[this.estado()];
  }

  ngOnDestroy(): void {
    void this.escuchaModulo?.remove();
  }

  /** Abre la cámara (escáner de Google) y procesa el código leído. */
  async escanear(): Promise<void> {
    if (this.procesando()) {
      return;
    }
    this.limpiar();
    if (this.modoWeb) {
      this.estado.set('error');
      this.mensaje.set(
        'El navegador no abre la cámara en esta versión: el escáner real funciona en la app Android. Puedes usar «Probar con un QR de ejemplo».',
      );
      return;
    }

    this.procesando.set(true);
    this.estado.set('preparando');
    try {
      const { supported } = await this.escaner.isSupported();
      if (!supported) {
        this.fallo('Este dispositivo no tiene una cámara compatible con el escáner QR.');
        return;
      }
      if (this.plataforma === 'android') {
        const { available } = await this.escaner.isGoogleBarcodeScannerModuleAvailable();
        if (!available) {
          await this.instalarModulo();
          return;
        }
      }

      this.estado.set('escaneando');
      const { barcodes } = await this.escaner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
      await this.procesar(barcodes[0]?.rawValue, false);
    } catch (err) {
      const fallo = interpretarFallo(err);
      this.estado.set(fallo.tipo === 'cancelado' ? 'cancelado' : 'error');
      this.mensaje.set(fallo.mensaje);
    } finally {
      this.procesando.set(false);
    }
  }

  /** Modo web: procesa un QR de ejemplo, identificado como prueba. */
  async probarEjemplo(): Promise<void> {
    if (this.procesando()) {
      return;
    }
    this.limpiar();
    this.procesando.set(true);
    try {
      await this.procesar(QR_EJEMPLO, true);
    } finally {
      this.procesando.set(false);
    }
  }

  /** Vuelve al estado inicial (resultado, mensajes y datos). */
  limpiar(): void {
    this.estado.set('inactivo');
    this.resultado.set('');
    this.mensaje.set('');
    this.enlaceQr.set(null);
    this.consulta.set('');
    this.consultaDatos.set(null);
    this.esEjemplo.set(false);
    this.errorDatos.set('');
    this.agregado.set(false);
  }

  async abrirEnlace(): Promise<void> {
    const url = this.enlaceQr();
    if (!url) {
      return;
    }
    try {
      await Browser.open({ url });
    } catch {
      this.mensaje.set('No se pudo abrir el enlace en el navegador.');
    }
  }

  /** Crea el movimiento del QR (una sola vez por lectura y solo con datos válidos). */
  async agregarMovimiento(): Promise<void> {
    if (this.agregado()) {
      return;
    }
    const validado = movimientoDesdeQr(this.consultaDatos()?.datos);
    if (!validado.ok) {
      this.errorDatos.set(validado.mensaje);
      return;
    }
    this.agregado.set(true);
    await this.movimientos.registrar(validado.datos);
    this.mensaje.set('Movimiento del QR agregado a Inicio.');
  }

  private async procesar(valor: string | null | undefined, ejemplo: boolean): Promise<void> {
    const contenido = analizarContenido(valor);
    if (contenido.tipo === 'vacio') {
      this.fallo('El código QR está vacío o no contiene texto legible. Prueba con otro código.');
      return;
    }
    this.estado.set('leido');
    this.esEjemplo.set(ejemplo);
    this.resultado.set(contenido.texto);
    if (contenido.tipo === 'enlace') {
      this.enlaceQr.set(contenido.url);
      this.mensaje.set('Se detectó un enlace. Revísalo y pulsa «Abrir enlace» para continuar.');
      return;
    }
    await this.consultar(contenido.texto);
    if (ejemplo) {
      this.mensaje.set('Lectura de ejemplo (modo de prueba web): no se usó la cámara. En Android se abre la cámara real.');
    }
  }

  private async consultar(codigo: string): Promise<void> {
    try {
      const respuesta = await this.api.consultarQr(codigo);
      this.consultaDatos.set(respuesta);
      this.consulta.set(JSON.stringify(respuesta, null, 2));
      if (respuesta.datos) {
        const validado = movimientoDesdeQr(respuesta.datos);
        this.errorDatos.set(validado.ok ? '' : validado.mensaje);
      }
    } catch (error) {
      this.consulta.set(error instanceof Error ? error.message : 'La consulta GET no se pudo completar.');
    }
  }

  /** Android: instala el módulo de Google y muestra el progreso. */
  private async instalarModulo(): Promise<void> {
    this.estado.set('instalando');
    this.progresoModulo.set(0);
    this.mensaje.set('Se está instalando el módulo de escaneo de Google. Cuando termine, pulsa «Escanear QR» otra vez.');
    await this.escuchaModulo?.remove();
    this.escuchaModulo = await this.escaner.addListener('googleBarcodeScannerModuleInstallProgress', (evento) => {
      if (evento.progress !== undefined) {
        this.progresoModulo.set(evento.progress);
      }
      if (evento.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
        this.progresoModulo.set(null);
        this.estado.set('inactivo');
        this.mensaje.set('Módulo de escaneo instalado. Pulsa «Escanear QR».');
      } else if (
        evento.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
        evento.state === GoogleBarcodeScannerModuleInstallState.CANCELED
      ) {
        this.progresoModulo.set(null);
        this.fallo('No se pudo instalar el módulo de escaneo de Google. Revisa la conexión e inténtalo de nuevo.');
      }
    });
    await this.escaner.installGoogleBarcodeScannerModule();
  }

  private fallo(mensaje: string): void {
    this.estado.set('error');
    this.mensaje.set(mensaje);
  }
}
