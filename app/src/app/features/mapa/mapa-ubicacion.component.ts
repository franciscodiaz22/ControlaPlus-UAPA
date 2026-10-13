import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { AlertController, IonButton, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, locateOutline, navigateOutline } from 'ionicons/icons';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { MENSAJES } from '../../core/offline/mensajes';
import { Movimiento, TipoMovimiento } from '../../core/offline/movimiento.model';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { validarMovimiento } from '../movimientos/validacion';

@Component({
  selector: 'app-mapa-ubicacion',
  standalone: true,
  imports: [DecimalPipe, IonButton, IonIcon],
  templateUrl: './mapa-ubicacion.component.html',
  styleUrl: './mapa-ubicacion.component.scss',
})
export class MapaUbicacionComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapa', { static: true }) private readonly elementoMapa!: ElementRef<HTMLDivElement>;

  readonly siguiendo = signal(false);
  readonly solicitandoSeguimiento = signal(false);
  readonly cargandoUbicacion = signal(false);
  readonly agregandoMarcador = signal(false);
  readonly mensajeEstado = signal('Pulsa «Mi ubicación» para centrar el mapa en tu posición.');
  readonly error = signal('');
  readonly coordenadas = signal<Position['coords'] | null>(null);
  /** Movimientos con ubicación dibujados en el mapa (los que no tienen ubicación se omiten). */
  readonly movimientosEnMapa = signal(0);

  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly movimientos = inject(MovimientosService);
  private mapa?: L.Map;
  private marcadorUsuario?: L.Marker;
  private capaMovimientos?: L.LayerGroup;
  private suscripcionMovimientos?: Subscription;
  private encuadrado = false;
  private watchId: string | null = null;
  private destruido = false;

  constructor() {
    addIcons({ addCircleOutline, locateOutline, navigateOutline });
  }

  ngAfterViewInit(): void {
    if (this.mapa) {
      return;
    }

    this.mapa = L.map(this.elementoMapa.nativeElement, {
      scrollWheelZoom: true,
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(this.mapa);

    this.mapa.on('click', this.alHacerClicEnMapa);
    requestAnimationFrame(() => this.mapa?.invalidateSize());

    // Movimientos guardados (OfflineStorageService vía MovimientosService) con ubicación.
    this.capaMovimientos = L.layerGroup().addTo(this.mapa);
    this.suscripcionMovimientos = this.movimientos.movimientos$.subscribe((lista) =>
      this.mostrarMovimientos(lista)
    );
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.suscripcionMovimientos?.unsubscribe();
    void this.detenerSeguimiento();
    this.mapa?.off('click', this.alHacerClicEnMapa);
    this.mapa?.remove();
    this.mapa = undefined;
  }

  async centrarEnMiUbicacion(): Promise<void> {
    if (this.cargandoUbicacion()) {
      return;
    }

    this.cargandoUbicacion.set(true);
    this.error.set('');
    try {
      if (!(await this.permisoUbicacionConcedido())) {
        this.error.set('Se denegó el permiso de ubicación. Habilítalo en los ajustes del dispositivo o navegador.');
        return;
      }

      const posicion = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      this.actualizarUbicacion(posicion, true);
      this.mensajeEstado.set('Ubicación actualizada con el GPS del dispositivo.');
    } catch (error: unknown) {
      this.error.set(this.mensajeError(error));
    } finally {
      this.cargandoUbicacion.set(false);
    }
  }

  async alternarSeguimiento(): Promise<void> {
    if (this.watchId) {
      await this.detenerSeguimiento();
      this.mensajeEstado.set('Seguimiento GPS detenido.');
      return;
    }

    if (this.solicitandoSeguimiento()) {
      return;
    }

    this.solicitandoSeguimiento.set(true);
    this.error.set('');
    let falloAlIniciar = false;
    let idSeguimiento: string | null = null;
    try {
      if (!(await this.permisoUbicacionConcedido())) {
        this.error.set('Se denegó el permiso de ubicación. Habilítalo en los ajustes del dispositivo o navegador.');
        return;
      }

      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        (posicion, error) => {
          if (error) {
            falloAlIniciar = true;
            this.error.set(this.mensajeError(error));
            this.siguiendo.set(false);
            if (idSeguimiento) {
              const id = idSeguimiento;
              idSeguimiento = null;
              this.watchId = null;
              void Geolocation.clearWatch({ id });
            }
            return;
          }
          if (posicion) {
            this.actualizarUbicacion(posicion, true);
            this.mensajeEstado.set('Seguimiento GPS activo.');
          }
        }
      );
      idSeguimiento = id;

      if (this.destruido || falloAlIniciar) {
        await Geolocation.clearWatch({ id });
        return;
      }

      this.watchId = id;
      this.siguiendo.set(true);
    } catch (error: unknown) {
      this.error.set(this.mensajeError(error));
    } finally {
      this.solicitandoSeguimiento.set(false);
    }
  }

  alternarAgregarMarcador(): void {
    this.agregandoMarcador.update((activo) => !activo);
    this.mensajeEstado.set(
      this.agregandoMarcador()
        ? 'Pulsa sobre el mapa para colocar un marcador.'
        : 'Colocación de marcadores cancelada.'
    );
  }

  private readonly alHacerClicEnMapa = (evento: L.LeafletMouseEvent): void => {
    if (this.agregandoMarcador()) {
      void this.pedirNombreMarcador(evento.latlng);
    }
  };

  private async pedirNombreMarcador(posicion: L.LatLng): Promise<void> {
    this.agregandoMarcador.set(false);
    const alerta = await this.alertCtrl.create({
      header: 'Agregar marcador',
      message:
        'Escribe un nombre o una descripción para este punto. «Solo marcador» es temporal: no se guarda y se pierde al cerrar la app. Con un monto puedes guardarlo como movimiento (gasto o ingreso) en esta ubicación.',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre o descripción' },
        { name: 'monto', type: 'number', placeholder: 'Monto en RD$ (opcional)', min: 1 },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Solo marcador',
          handler: (datos: { nombre?: string }) => {
            const nombre = datos.nombre?.trim();
            if (!nombre) {
              return false;
            }
            this.agregarMarcador(posicion, nombre);
            return true;
          },
        },
        { text: 'Gasto', handler: (datos) => this.registrarMovimiento(datos, 'gasto', posicion) },
        { text: 'Ingreso', handler: (datos) => this.registrarMovimiento(datos, 'ingreso', posicion) },
      ],
    });
    void alerta.onDidDismiss().then(({ role }) => {
      if (role === 'cancel' || role === 'backdrop') {
        this.mensajeEstado.set('Colocación de marcadores cancelada.');
      }
    });
    await alerta.present();
  }

  /**
   * Registra un movimiento en el punto elegido con el flujo normal de la app:
   * MovimientosService.registrar() → guardado 'pendiente' → SyncService → API.
   * El marcador aparece al llegar el movimiento por movimientos$.
   */
  private registrarMovimiento(
    datos: { nombre?: string; monto?: string },
    tipo: TipoMovimiento,
    posicion: L.LatLng
  ): boolean {
    const resultado = validarMovimiento({ concepto: datos.nombre, monto: datos.monto, tipo });
    if (!resultado.ok) {
      void this.toast(resultado.mensaje);
      return false; // mantiene la alerta abierta
    }
    void this.movimientos.registrar({
      ...resultado.datos,
      ubicacion: { latitud: Number(posicion.lat.toFixed(6)), longitud: Number(posicion.lng.toFixed(6)) },
    });
    this.mensajeEstado.set(`Movimiento registrado en este punto: ${resultado.datos.concepto}.`);
    return true;
  }

  private mostrarMovimientos(lista: Movimiento[]): void {
    const capa = this.capaMovimientos;
    if (!capa || !this.mapa) {
      return;
    }

    capa.clearLayers();
    const puntos: L.LatLng[] = [];
    for (const movimiento of lista) {
      const ubicacion = movimiento.ubicacion;
      if (!ubicacion || !Number.isFinite(ubicacion.latitud) || !Number.isFinite(ubicacion.longitud)) {
        continue;
      }
      const punto = L.latLng(ubicacion.latitud, ubicacion.longitud);
      puntos.push(punto);
      L.marker(punto, {
        title: movimiento.concepto,
        icon: L.divIcon({
          className: `controla-marcador-movimiento controla-marcador-${movimiento.tipo}`,
          html: '<span></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .bindPopup(this.contenidoMovimiento(movimiento))
        .addTo(capa);
    }
    this.movimientosEnMapa.set(puntos.length);

    // La primera vez, si aún no se pidió el GPS, se encuadran los movimientos.
    if (!this.encuadrado && puntos.length && !this.coordenadas()) {
      this.encuadrado = true;
      if (puntos.length === 1) {
        this.mapa.setView(puntos[0], 16);
      } else {
        this.mapa.fitBounds(L.latLngBounds(puntos), { padding: [32, 32], maxZoom: 16 });
      }
    }
  }

  private contenidoMovimiento(movimiento: Movimiento): HTMLElement {
    const contenido = document.createElement('div');
    const titulo = document.createElement('strong');
    titulo.textContent = movimiento.concepto;
    const monto = document.createElement('div');
    const signo = movimiento.tipo === 'ingreso' ? '+' : '-';
    monto.textContent = `${signo} RD$ ${movimiento.monto.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} · ${movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}`;
    contenido.append(titulo, monto);
    if (movimiento.estado === 'pendiente') {
      const pendiente = document.createElement('div');
      pendiente.textContent = MENSAJES.etiquetaPendiente;
      contenido.append(pendiente);
    }
    return contenido;
  }

  private async toast(message: string): Promise<void> {
    // Misma línea gráfica que los toasts de Inicio y MovimientosService.
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      cssClass: ['toast-controla', 'toast-oscuro'],
    });
    await toast.present();
  }

  private agregarMarcador(posicion: L.LatLng, nombre: string): void {
    if (!this.mapa) {
      return;
    }

    const contenido = document.createElement('div');
    const titulo = document.createElement('strong');
    titulo.textContent = nombre;
    const coordenadas = document.createElement('div');
    coordenadas.textContent = `${posicion.lat.toFixed(6)}, ${posicion.lng.toFixed(6)}`;
    contenido.append(titulo, coordenadas);

    L.marker(posicion, {
      title: nombre,
      icon: L.divIcon({
        className: 'controla-marcador-punto',
        html: '<span></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    })
      .addTo(this.mapa)
      .bindPopup(contenido);
    this.mensajeEstado.set(`Marcador agregado: ${nombre}.`);
  }

  private actualizarUbicacion(posicion: Position, centrar: boolean): void {
    const punto = L.latLng(posicion.coords.latitude, posicion.coords.longitude);
    this.coordenadas.set(posicion.coords);

    if (this.mapa) {
      if (centrar) {
        this.mapa.setView(punto, Math.max(this.mapa.getZoom(), 16));
      }
      if (this.marcadorUsuario) {
        this.marcadorUsuario.setLatLng(punto);
      } else {
        this.marcadorUsuario = L.marker(punto, {
          title: 'Mi ubicación actual',
          icon: L.divIcon({
            className: 'controla-marcador-usuario',
            html: '<span></span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(this.mapa);
      }
    }
  }

  private async permisoUbicacionConcedido(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    let permisos = await Geolocation.checkPermissions();
    if (permisos.location !== 'granted' && permisos.coarseLocation !== 'granted') {
      permisos = await Geolocation.requestPermissions();
    }
    return permisos.location === 'granted' || permisos.coarseLocation === 'granted';
  }

  async detenerSeguimiento(): Promise<void> {
    const id = this.watchId;
    this.watchId = null;
    this.siguiendo.set(false);
    if (id) {
      await Geolocation.clearWatch({ id });
    }
  }

  private mensajeError(error: unknown): string {
    let codigo: unknown;
    let detalle = '';
    if (typeof error === 'object' && error !== null) {
      codigo = 'code' in error ? error.code : undefined;
      detalle = 'message' in error && typeof error.message === 'string' ? error.message : '';
    }

    const texto = detalle.toLowerCase();
    if (codigo === 1 || /permission|denied|not allowed/.test(texto)) {
      return 'Permiso de ubicación denegado. Habilítalo en los ajustes del dispositivo o navegador.';
    }
    if (
      codigo === 2 ||
      /location services|location provider|position unavailable|gps.*(off|disabled)|not enabled/.test(texto)
    ) {
      return 'No se pudo obtener la ubicación. Comprueba que el GPS o los servicios de ubicación estén activados.';
    }
    if (codigo === 3 || /timed? ?out|timeout/.test(texto)) {
      return 'La ubicación tardó demasiado. Comprueba la señal GPS e inténtalo de nuevo.';
    }
    return detalle
      ? `No se pudo obtener la ubicación: ${detalle}`
      : 'No se pudo obtener la ubicación. Comprueba el GPS y los permisos.';
  }
}
