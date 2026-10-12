/**
 * Pruebas de ReproductorMedia con un elemento multimedia falso (jsdom no
 * reproduce audio ni video). El falso emite los mismos eventos que el real.
 */
import { ElementoMedia, ReproductorMedia, formatearTiempo } from './reproductor';

class MediaFalso extends EventTarget {
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  muted = false;
  readyState = 0;
  error: { code: number } | null = null;
  falloPlay: Error | null = null;
  llamadasPlay = 0;

  async play(): Promise<void> {
    this.llamadasPlay++;
    if (this.falloPlay) {
      throw this.falloPlay;
    }
    this.dispatchEvent(new Event('play'));
  }
  pause(): void {
    this.dispatchEvent(new Event('pause'));
  }
  emitir(tipo: string): void {
    this.dispatchEvent(new Event(tipo));
  }
  cargar(duracion: number): void {
    this.duration = duracion;
    this.readyState = 1;
    this.emitir('loadedmetadata');
  }
}

const crear = (alReproducir?: () => void): { r: ReproductorMedia; el: MediaFalso } => {
  const el = new MediaFalso();
  const r = new ReproductorMedia('audio', alReproducir);
  r.vincular(el as unknown as ElementoMedia);
  return { r, el };
};

describe('formatearTiempo', () => {
  it('formatea minutos y segundos, y horas si hacen falta', () => {
    expect(formatearTiempo(0)).toBe('00:00');
    expect(formatearTiempo(5.9)).toBe('00:05');
    expect(formatearTiempo(75)).toBe('01:15');
    expect(formatearTiempo(3725)).toBe('1:02:05');
  });

  it('devuelve --:-- para valores no válidos', () => {
    expect(formatearTiempo(Number.NaN)).toBe('--:--');
    expect(formatearTiempo(Number.POSITIVE_INFINITY)).toBe('--:--');
    expect(formatearTiempo(-1)).toBe('--:--');
  });
});

describe('ReproductorMedia', () => {
  it('estado inicial: cargando, en 0, volumen del elemento y sin error', () => {
    const { r } = crear();
    expect(r.estado()).toBe('cargando');
    expect(r.actual()).toBe(0);
    expect(r.duracion()).toBe(0);
    expect(r.volumen()).toBe(1);
    expect(r.silenciado()).toBe(false);
    expect(r.error()).toBeNull();
    expect(r.textoTiempo()).toBe('00:00 / 00:00');
  });

  it('al cargar los metadatos queda listo con la duración', () => {
    const { r, el } = crear();
    el.cargar(44.4);
    expect(r.estado()).toBe('listo');
    expect(r.duracion()).toBe(44.4);
    expect(r.textoTiempo()).toBe('00:00 / 00:44');
  });

  it('toma los metadatos si ya estaban cargados al vincular', () => {
    const el = new MediaFalso();
    el.duration = 35;
    el.readyState = 1;
    const r = new ReproductorMedia('video');
    r.vincular(el as unknown as ElementoMedia);
    expect(r.estado()).toBe('listo');
    expect(r.duracion()).toBe(35);
  });

  it('alternar reproduce y pausa según los eventos del elemento', async () => {
    const { r, el } = crear();
    el.cargar(10);
    await r.alternar();
    expect(el.llamadasPlay).toBe(1);
    expect(r.estado()).toBe('reproduciendo');
    expect(r.reproduciendo()).toBe(true);
    await r.alternar();
    expect(r.estado()).toBe('pausado');
  });

  it('avisa antes de reproducir (para pausar el otro medio)', async () => {
    let avisos = 0;
    const { r, el } = crear(() => avisos++);
    el.cargar(10);
    await r.reproducir();
    expect(avisos).toBe(1);
  });

  it('actualiza el progreso con timeupdate, salvo mientras se arrastra la barra', () => {
    const { r, el } = crear();
    el.cargar(60);
    el.currentTime = 12.5;
    el.emitir('timeupdate');
    expect(r.actual()).toBe(12.5);
    expect(r.textoTiempo()).toBe('00:12 / 01:00');

    r.empezarArrastre();
    el.currentTime = 13;
    el.emitir('timeupdate');
    expect(r.actual()).toBe(12.5);
  });

  it('buscar salta a la posición y la limita a la duración', () => {
    const { r, el } = crear();
    el.cargar(60);
    r.empezarArrastre();
    r.buscar(30);
    expect(el.currentTime).toBe(30);
    expect(r.actual()).toBe(30);
    r.buscar(500);
    expect(el.currentTime).toBe(60);
    r.buscar(-4);
    expect(el.currentTime).toBe(0);
    // tras buscar se vuelve a seguir el tiempo del elemento
    el.currentTime = 1;
    el.emitir('timeupdate');
    expect(r.actual()).toBe(1);
  });

  it('cambia el volumen (0–1) y subirlo quita el silencio', () => {
    const { r, el } = crear();
    r.cambiarVolumen(0.4);
    expect(el.volume).toBe(0.4);
    expect(r.volumen()).toBe(0.4);
    r.alternarSilencio();
    expect(el.muted).toBe(true);
    expect(r.silenciado()).toBe(true);
    r.cambiarVolumen(0.7);
    expect(el.muted).toBe(false);
    expect(r.silenciado()).toBe(false);
    r.cambiarVolumen(3);
    expect(el.volume).toBe(1);
  });

  it('alterna el silencio', () => {
    const { r, el } = crear();
    r.alternarSilencio();
    expect(r.silenciado()).toBe(true);
    r.alternarSilencio();
    expect(r.silenciado()).toBe(false);
    expect(el.muted).toBe(false);
  });

  it('refleja cambios de volumen hechos fuera (volumechange)', () => {
    const { r, el } = crear();
    el.volume = 0.25;
    el.muted = true;
    el.emitir('volumechange');
    expect(r.volumen()).toBe(0.25);
    expect(r.silenciado()).toBe(true);
  });

  it('reiniciar vuelve al inicio; al terminar, reproducir empieza desde 0', async () => {
    const { r, el } = crear();
    el.cargar(30);
    el.currentTime = 30;
    el.emitir('timeupdate');
    el.emitir('ended');
    expect(r.estado()).toBe('terminado');
    r.reiniciar();
    expect(el.currentTime).toBe(0);
    expect(r.actual()).toBe(0);
    expect(r.estado()).toBe('pausado');

    el.currentTime = 30;
    el.emitir('ended');
    await r.reproducir();
    expect(el.currentTime).toBe(0);
    expect(r.estado()).toBe('reproduciendo');
  });

  it('error de carga: estado error, mensaje claro y no intenta reproducir', async () => {
    const { r, el } = crear();
    el.error = { code: 4 };
    el.emitir('error');
    expect(r.estado()).toBe('error');
    expect(r.error()).toContain('no es compatible');
    await r.reproducir();
    expect(el.llamadasPlay).toBe(0);
  });

  it('si play() lo rechaza la política del dispositivo, avisa sin bloquear el reproductor', async () => {
    const { r, el } = crear();
    el.cargar(10);
    el.falloPlay = Object.assign(new Error('bloqueado'), { name: 'NotAllowedError' });
    await r.reproducir();
    expect(r.error()).toContain('no permitió');
    expect(r.estado()).toBe('listo');
    el.falloPlay = null;
    await r.reproducir();
    expect(r.estado()).toBe('reproduciendo');
    expect(r.error()).toBeNull();
  });

  it('si play() falla por el archivo, queda en error', async () => {
    const { r, el } = crear();
    el.cargar(10);
    el.falloPlay = Object.assign(new Error('x'), { name: 'NotSupportedError' });
    await r.reproducir();
    expect(r.estado()).toBe('error');
    expect(r.error()).toBe('No se pudo reproducir el audio.');
  });

  it('desvincular deja de escuchar al elemento', () => {
    const { r, el } = crear();
    r.desvincular();
    el.cargar(10);
    expect(r.estado()).toBe('cargando');
  });
});
