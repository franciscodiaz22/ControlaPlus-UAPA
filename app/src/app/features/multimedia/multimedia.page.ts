/**
 * MultimediaPage — audio y video locales con controles propios (U7).
 * ---------------------------------------------------------------------------
 * Módulo de Multimedia (responsable original: Francisco José Díaz Abreu).
 * Reproduce dos archivos de src/assets/media (guía en audio y tutorial en
 * video) con HTML5 <audio>/<video> y controles de Ionic: reproducir/pausar,
 * barra de progreso con salto, tiempo y duración, volumen y silencio; el
 * video además se puede reiniciar y poner en pantalla completa si el
 * dispositivo lo permite.
 *
 * Reglas: sin autoplay; solo suena un medio a la vez; todo se pausa al salir
 * de la pantalla; si un archivo no carga se muestra un mensaje.
 */
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { IonButton, IonContent, IonHeader, IonIcon, IonRange, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  expandOutline,
  filmOutline,
  headsetOutline,
  pause,
  play,
  refreshOutline,
  volumeHighOutline,
  volumeMuteOutline,
} from 'ionicons/icons';
import { ReproductorMedia } from './reproductor';

/** Valor de un evento de ion-range (número; con dual-knobs sería un objeto). */
type EventoRango = CustomEvent<{ value: number | { lower: number; upper: number } }>;

const valor = (evento: Event): number => {
  const v = (evento as EventoRango).detail.value;
  return typeof v === 'number' ? v : v.lower;
};

@Component({
  selector: 'app-multimedia',
  standalone: true,
  imports: [NgTemplateOutlet, DecimalPipe, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonRange],
  templateUrl: './multimedia.page.html',
  styleUrls: ['./multimedia.page.scss'],
})
export class MultimediaPage implements AfterViewInit, OnDestroy {
  @ViewChild('elAudio', { static: true }) private readonly audioRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('elVideo', { static: true }) private readonly videoRef!: ElementRef<HTMLVideoElement>;

  readonly rutaAudio = 'assets/media/guia-controla.wav';
  readonly rutaVideo = 'assets/media/tutorial-controla.webm';

  /** Al empezar uno, se pausa el otro. */
  readonly audio = new ReproductorMedia('audio', () => this.video.pausar());
  readonly video = new ReproductorMedia('video', () => this.audio.pausar());

  /** Aviso cuando la pantalla completa no está disponible. */
  readonly avisoPantalla = signal<string | null>(null);

  constructor() {
    addIcons({
      play,
      pause,
      headsetOutline,
      filmOutline,
      volumeHighOutline,
      volumeMuteOutline,
      refreshOutline,
      expandOutline,
    });
  }

  ngAfterViewInit(): void {
    this.audio.vincular(this.audioRef.nativeElement);
    this.video.vincular(this.videoRef.nativeElement);
  }

  /** Ionic: al cambiar de pestaña o volver atrás. */
  ionViewWillLeave(): void {
    this.pausarTodo();
  }

  ngOnDestroy(): void {
    this.pausarTodo();
    this.audio.desvincular();
    this.video.desvincular();
  }

  pausarTodo(): void {
    this.audio.pausar();
    this.video.pausar();
  }

  /** ion-range de progreso: soltar o tocar salta a esa posición. */
  buscar(reproductor: ReproductorMedia, evento: Event): void {
    reproductor.buscar(valor(evento));
  }

  /**
   * ion-range de volumen: 0–100. Se ignoran los eventos que no cambian el
   * volumen (el control los emite al actualizar su valor desde la plantilla);
   * así un "eco" no quita el silencio ni pisa el volumen.
   */
  cambiarVolumen(reproductor: ReproductorMedia, evento: Event): void {
    const volumen = valor(evento) / 100;
    if (Math.abs(volumen - reproductor.volumen()) < 0.005) {
      return;
    }
    reproductor.cambiarVolumen(volumen);
  }

  /** Pantalla completa del video si el WebView/navegador lo permite; si no, solo avisa. */
  async pantallaCompleta(): Promise<void> {
    this.avisoPantalla.set(null);
    const video = this.videoRef.nativeElement as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    try {
      if (typeof video.requestFullscreen === 'function' && document.fullscreenEnabled) {
        await video.requestFullscreen();
      } else if (typeof video.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
      } else {
        throw new Error('sin soporte');
      }
    } catch {
      this.avisoPantalla.set('La pantalla completa no está disponible en este dispositivo.');
    }
  }
}
