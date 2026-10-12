/**
 * Pruebas de ApiService (U10 · M6) con HttpTestingController: GET del QR,
 * POST del lote, respuestas, errores HTTP y modo simulado sin HTTP.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService, CONFIG_API } from './api.service';
import { Movimiento } from './movimiento.model';

const API = 'http://localhost:3000';

const movimiento = (id: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id,
  concepto: `Movimiento ${id}`,
  monto: 100,
  tipo: 'gasto',
  fecha: '2026-10-12T10:00:00.000Z',
  estado: 'pendiente',
  ...extra,
});

function montar(usarServidorSimulado: boolean): { api: ApiService; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CONFIG_API, useValue: { apiUrl: API, usarServidorSimulado } },
    ],
  });
  return { api: TestBed.inject(ApiService), http: TestBed.inject(HttpTestingController) };
}

describe('ApiService', () => {
  describe('servidor real', () => {
    let api: ApiService;
    let http: HttpTestingController;

    beforeEach(() => ({ api, http } = montar(false)));
    afterEach(() => http.verify());

    it('GET /qr/consultar con el parámetro codigo y respuesta marcada como servidor', async () => {
      const promesa = api.consultarQr('CP-CAFE');
      const req = http.expectOne((r) => r.url === `${API}/qr/consultar`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('codigo')).toBe('CP-CAFE');
      req.flush({ codigo: 'CP-CAFE', encontrado: true, datos: { concepto: 'Café', monto: 125, tipo: 'gasto' } });
      expect(await promesa).toEqual({
        codigo: 'CP-CAFE',
        encontrado: true,
        datos: { concepto: 'Café', monto: 125, tipo: 'gasto' },
        origen: 'servidor',
      });
    });

    it('GET: código no encontrado', async () => {
      const promesa = api.consultarQr('desconocido');
      http.expectOne(`${API}/qr/consultar?codigo=desconocido`).flush({ codigo: 'desconocido', encontrado: false });
      expect(await promesa).toEqual({ codigo: 'desconocido', encontrado: false, origen: 'servidor' });
    });

    it('POST /movimientos/lote con la lista completa como cuerpo (id, version, eliminado)', async () => {
      const lote = [movimiento('a'), movimiento('b', { version: 2, eliminado: true })];
      const promesa = api.enviarMovimientos(lote);
      const req = http.expectOne(`${API}/movimientos/lote`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(lote);
      req.flush({ recibidos: 2, aplicados: 1, eliminados: 1, ignorados: [] });
      await expect(promesa).resolves.toBeUndefined();
    });

    it('error HTTP: el GET y el POST rechazan (la sync lo trata como fallo y reintenta)', async () => {
      const get = api.consultarQr('X');
      http.expectOne((r) => r.url === `${API}/qr/consultar`).flush({ error: 'caído' }, { status: 503, statusText: 'Service Unavailable' });
      await expect(get).rejects.toMatchObject({ status: 503 });

      const post = api.enviarMovimientos([movimiento('a')]);
      http.expectOne(`${API}/movimientos/lote`).flush({ error: 'Lote no válido' }, { status: 400, statusText: 'Bad Request' });
      await expect(post).rejects.toMatchObject({ status: 400 });
    });

    it('servidor inalcanzable (error de red): rechaza', async () => {
      const post = api.enviarMovimientos([movimiento('a')]);
      http.expectOne(`${API}/movimientos/lote`).error(new ProgressEvent('error'));
      await expect(post).rejects.toMatchObject({ status: 0 });
    });
  });

  describe('modo simulado', () => {
    let api: ApiService;
    let http: HttpTestingController;

    beforeEach(() => ({ api, http } = montar(true)));
    afterEach(() => http.verify());

    it('GET y POST responden localmente sin ninguna petición HTTP', async () => {
      const consulta = await api.consultarQr('{"concepto":"Café QR","monto":125,"tipo":"gasto"}');
      expect(consulta.origen).toBe('simulado');
      expect(consulta.datos).toEqual({ concepto: 'Café QR', monto: 125, tipo: 'gasto' });
      await expect(api.enviarMovimientos([movimiento('a')])).resolves.toBeUndefined();
      http.expectNone(() => true);
    });

    it('simularFallo hace fallar el POST simulado, sin HTTP', async () => {
      api.simularFallo = true;
      await expect(api.enviarMovimientos([movimiento('a')])).rejects.toThrow('simulado');
      http.expectNone(() => true);
    });
  });
});
