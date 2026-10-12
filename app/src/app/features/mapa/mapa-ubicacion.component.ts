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

  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private mapa?: L.Map;
  private marcadorUsuario?: L.Marker;
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
  }

  ngOnDestroy(): void {
    this.destruido = true;
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
      message: 'Escribe un nombre o una descripción para este punto.',
      inputs: [{ name: 'nombre', type: 'text', placeholder: 'Nombre o descripción' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Agregar',
          handler: (datos: { nombre?: string }) => {
            const nombre = datos.nombre?.trim();
            if (!nombre) {
              return false;
            }
            this.agregarMarcador(posicion, nombre);
            return true;
          },
        },
      ],
    });
    await alerta.present();
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
