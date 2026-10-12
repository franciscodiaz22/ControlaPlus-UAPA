/**
 * reproductor.ts — controles propios para un <audio> o <video> HTML5 (U7).
 * ---------------------------------------------------------------------------
 * Envuelve un HTMLMediaElement y expone su estado como signals para la
 * plantilla: estado, tiempo actual, duración, volumen, silencio y error.
 * El estado se actualiza con los eventos del propio elemento (play, pause,
 * timeupdate, ended, error…), así que refleja lo que realmente ocurre.
 *
 * No hay autoplay: solo reproduce cuando se llama a reproducir()/alternar(),
 * es decir, al pulsar un botón.
 */
import { computed, signal } from '@angular/core';

export type EstadoReproductor = 'cargando' | 'listo' | 'reproduciendo' | 'pausado' | 'terminado' | 'error';

/** Lo que usa el reproductor de un HTMLMediaElement (permite usar uno falso en pruebas). */
export type ElementoMedia = Pick<
  HTMLMediaElement,
  'play' | 'pause' | 'currentTime' | 'duration' | 'volume' | 'muted' | 'readyState' | 'error' | 'addEventListener' | 'removeEventListener'
>;

/** 75 → "01:15"; 3725 → "1:02:05"; valores no válidos → "--:--". */
export function formatearTiempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) {
    return '--:--';
  }
  const total = Math.floor(segundos);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

const TEXTO_ESTADO: Record<EstadoReproductor, string> = {
  cargando: 'Cargando…',
  listo: 'Listo para reproducir',
  reproduciendo: 'Reproduciendo',
  pausado: 'En pausa',
  terminado: 'Terminado',
  error: 'No disponible',
};

const EVENTOS = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'error', 'volumechange'] as const;

export class ReproductorMedia {
  readonly estado = signal<EstadoReproductor>('cargando');
  readonly actual = signal(0);
  readonly duracion = signal(0);
  readonly volumen = signal(1);
  readonly silenciado = signal(false);
  readonly error = signal<string | null>(null);

  readonly reproduciendo = computed(() => this.estado() === 'reproduciendo');
  readonly textoEstado = computed(() => TEXTO_ESTADO[this.estado()]);
  readonly textoTiempo = computed(() => `${formatearTiempo(this.actual())} / ${formatearTiempo(this.duracion())}`);

  private elemento?: ElementoMedia;
  /** Mientras se arrastra la barra, el tiempo que llega del elemento no la mueve. */
  private arrastrando = false;
  private readonly manejador = (evento: Event): void => this.alEvento(evento.type);

  /**
   * @param nombre "audio" o "video", para los mensajes.
   * @param alReproducir se llama justo antes de reproducir (la página pausa el otro medio).
   */
  constructor(
    readonly nombre: string,
    private readonly alReproducir: () => void = () => undefined,
  ) {}

  vincular(elemento: ElementoMedia): void {
    this.desvincular();
    this.elemento = elemento;
    for (const tipo of EVENTOS) {
      elemento.addEventListener(tipo, this.manejador);
    }
    this.volumen.set(elemento.volume);
    this.silenciado.set(elemento.muted);
    // Si los metadatos ya estaban cargados antes de vincular.
    if (elemento.readyState >= 1) {
      this.alEvento('loadedmetadata');
    }
  }

  desvincular(): void {
    if (this.elemento) {
      for (const tipo of EVENTOS) {
        this.elemento.removeEventListener(tipo, this.manejador);
      }
      this.elemento = undefined;
    }
  }

  async alternar(): Promise<void> {
    if (this.reproduciendo()) {
      this.pausar();
    } else {
      await this.reproducir();
    }
  }

  async reproducir(): Promise<void> {
    if (!this.elemento || this.estado() === 'error') {
      return;
    }
    this.alReproducir();
    if (this.estado() === 'terminado') {
      this.elemento.currentTime = 0;
    }
    try {
      await this.elemento.play();
    } catch (err) {
      // p. ej. NotAllowedError (política de reproducción) o NotSupportedError (formato).
      const nombre = (err as { name?: string } | null)?.name;
      this.error.set(
        nombre === 'NotAllowedError'
          ? `El dispositivo no permitió reproducir el ${this.nombre}. Pulsa de nuevo Reproducir.`
          : `No se pudo reproducir el ${this.nombre}.`,
      );
      if (nombre !== 'NotAllowedError') {
        this.estado.set('error');
      }
    }
  }

  pausar(): void {
    if (this.elemento && this.estado() === 'reproduciendo') {
      this.elemento.pause();
    }
  }

  /** Durante el arrastre de la barra de progreso. */
  empezarArrastre(): void {
    this.arrastrando = true;
  }

  /** Salta a `segundos` (al soltar o tocar la barra de progreso). */
  buscar(segundos: number): void {
    this.arrastrando = false;
    if (!this.elemento || !Number.isFinite(segundos)) {
      return;
    }
    const limite = this.duracion() > 0 ? this.duracion() : segundos;
    const destino = Math.min(Math.max(segundos, 0), limite);
    this.elemento.currentTime = destino;
    this.actual.set(destino);
    if (this.estado() === 'terminado' && destino < limite) {
      this.estado.set('pausado');
    }
  }

  /** Volumen entre 0 y 1. Subirlo quita el silencio. */
  cambiarVolumen(valor: number): void {
    if (!this.elemento || !Number.isFinite(valor)) {
      return;
    }
    const volumen = Math.min(Math.max(valor, 0), 1);
    this.elemento.volume = volumen;
    if (volumen > 0 && this.elemento.muted) {
      this.elemento.muted = false;
    }
    this.volumen.set(volumen);
    this.silenciado.set(this.elemento.muted);
  }

  alternarSilencio(): void {
    if (!this.elemento) {
      return;
    }
    this.elemento.muted = !this.elemento.muted;
    this.silenciado.set(this.elemento.muted);
  }

  /** Vuelve al inicio sin cambiar si se está reproduciendo o no. */
  reiniciar(): void {
    if (!this.elemento) {
      return;
    }
    this.elemento.currentTime = 0;
    this.actual.set(0);
    if (this.estado() === 'terminado') {
      this.estado.set('pausado');
    }
  }

  private alEvento(tipo: string): void {
    const el = this.elemento;
    if (!el) {
      return;
    }
    switch (tipo) {
      case 'loadedmetadata':
      case 'durationchange':
        this.duracion.set(Number.isFinite(el.duration) ? el.duration : 0);
        if (this.estado() === 'cargando') {
          this.estado.set('listo');
        }
        break;
      case 'timeupdate':
        if (!this.arrastrando) {
          this.actual.set(el.currentTime);
        }
        break;
      case 'play':
        this.error.set(null);
        this.estado.set('reproduciendo');
        break;
      case 'pause':
        if (this.estado() !== 'terminado' && this.estado() !== 'error') {
          this.estado.set('pausado');
        }
        break;
      case 'ended':
        this.estado.set('terminado');
        break;
      case 'volumechange':
        this.volumen.set(el.volume);
        this.silenciado.set(el.muted);
        break;
      case 'error':
        this.estado.set('error');
        this.error.set(this.mensajeError(el.error?.code));
        break;
    }
  }

  private mensajeError(codigo?: number): string {
    switch (codigo) {
      case 2:
        return `No se pudo descargar el ${this.nombre}.`;
      case 3:
        return `El archivo de ${this.nombre} está dañado o no se pudo decodificar.`;
      case 4:
        return `El formato del ${this.nombre} no es compatible o el archivo no existe.`;
      default:
        return `No se pudo cargar el ${this.nombre}.`;
    }
  }
}
