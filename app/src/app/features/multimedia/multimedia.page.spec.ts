/**
 * Pruebas de MultimediaPage. jsdom no reproduce medios: play()/pause() de
 * HTMLMediaElement se simulan para que emitan los eventos "play"/"pause".
 * La reproducción real se valida en Chrome y en Android.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { MultimediaPage } from './multimedia.page';

describe('MultimediaPage', () => {
  let fixture: ComponentFixture<MultimediaPage>;
  let pagina: MultimediaPage;
  let playOriginal: typeof HTMLMediaElement.prototype.play;
  let pauseOriginal: typeof HTMLMediaElement.prototype.pause;

  beforeEach(async () => {
    playOriginal = HTMLMediaElement.prototype.play;
    pauseOriginal = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    };

    await TestBed.configureTestingModule({
      imports: [MultimediaPage],
      providers: [provideIonicAngular()],
    }).compileComponents();
    fixture = TestBed.createComponent(MultimediaPage);
    pagina = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    HTMLMediaElement.prototype.play = playOriginal;
    HTMLMediaElement.prototype.pause = pauseOriginal;
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const audio = (): HTMLAudioElement => el().querySelector('audio')!;
  const video = (): HTMLVideoElement => el().querySelector('video')!;

  it('muestra los dos reproductores con archivos locales y sin autoplay', () => {
    expect(el().textContent).toContain('Guía de Controla+');
    expect(el().textContent).toContain('Tutorial de Controla+');
    expect(audio().getAttribute('src')).toBe('assets/media/guia-controla.wav');
    expect(video().getAttribute('src')).toBe('assets/media/tutorial-controla.webm');
    expect(audio().autoplay).toBe(false);
    expect(video().autoplay).toBe(false);
    expect(video().hasAttribute('playsinline')).toBe(true);
    expect(pagina.audio.estado()).toBe('cargando');
    expect(pagina.video.estado()).toBe('cargando');
  });

  it('el botón Reproducir del audio lo reproduce y cambia a Pausar', async () => {
    // el primer .play es el del audio (Ionic traslada el aria-label al botón interno)
    const boton = el().querySelector<HTMLElement>('ion-button.play')!;
    expect(boton.querySelector('ion-icon')?.getAttribute('name') ?? boton.innerHTML).toContain('play');
    boton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(pagina.audio.estado()).toBe('reproduciendo');
    // [name] se enlaza como propiedad del ion-icon
    expect((el().querySelector('ion-button.play ion-icon') as HTMLElement & { name?: string }).name).toBe('pause');
  });

  it('solo suena un medio: empezar el video pausa el audio y viceversa', async () => {
    await pagina.audio.reproducir();
    expect(pagina.audio.estado()).toBe('reproduciendo');
    await pagina.video.reproducir();
    expect(pagina.video.estado()).toBe('reproduciendo');
    expect(pagina.audio.estado()).toBe('pausado');
    await pagina.audio.reproducir();
    expect(pagina.video.estado()).toBe('pausado');
    expect(pagina.audio.estado()).toBe('reproduciendo');
  });

  it('al salir de la pantalla se pausa lo que esté sonando', async () => {
    await pagina.video.reproducir();
    pagina.ionViewWillLeave();
    expect(pagina.video.estado()).toBe('pausado');
    expect(pagina.audio.estado()).not.toBe('reproduciendo');
  });

  it('muestra un mensaje si un archivo no se puede cargar', () => {
    Object.defineProperty(video(), 'error', { value: { code: 4 }, configurable: true });
    video().dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(pagina.video.estado()).toBe('error');
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('no es compatible');
  });

  it('reiniciar deja el video al principio', () => {
    video().currentTime = 0;
    pagina.video.buscar(0);
    pagina.video.reiniciar();
    expect(video().currentTime).toBe(0);
    expect(pagina.video.actual()).toBe(0);
  });

  it('si la pantalla completa no está disponible, avisa sin fallar', async () => {
    await pagina.pantallaCompleta();
    fixture.detectChanges();
    expect(el().textContent).toContain('La pantalla completa no está disponible');
  });

  it('volumen (0–100 en el control) y silencio llegan al elemento', () => {
    pagina.cambiarVolumen(pagina.audio, new CustomEvent('ionInput', { detail: { value: 35 } }));
    expect(audio().volume).toBeCloseTo(0.35);
    pagina.audio.alternarSilencio();
    expect(audio().muted).toBe(true);
    fixture.detectChanges();
    expect(el().textContent).toContain('Silencio');
  });

  it('silenciar no borra el volumen: el control sigue mostrando el volumen real', () => {
    pagina.audio.cambiarVolumen(0.35);
    pagina.audio.alternarSilencio();
    fixture.detectChanges();
    const rango = el().querySelector('ion-range.rango-volumen') as HTMLElement & { value?: number };
    expect(rango.value).toBeCloseTo(35);
    pagina.audio.alternarSilencio();
    fixture.detectChanges();
    expect(audio().muted).toBe(false);
    expect(audio().volume).toBeCloseTo(0.35);
    expect(el().textContent).toContain('35%');
  });
});
