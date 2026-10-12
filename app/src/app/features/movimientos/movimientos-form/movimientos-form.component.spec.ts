/**
 * Pruebas del formulario de alta/edición con servicios simulados:
 * validación visible, alta por registrar(), edición por actualizar()
 * conservando la ubicación, y vuelta a Inicio.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavController, ToastController, provideIonicAngular } from '@ionic/angular';

import { MovimientosService } from '../../../core/offline/movimientos.service';
import { OfflineStorageService } from '../../../core/offline/offline-storage.service';
import { Movimiento, NuevoMovimiento } from '../../../core/offline/movimiento.model';
import { MENSAJES_VALIDACION } from '../validacion';
import { MovimientosFormComponent } from './movimientos-form.component';

const guardado: Movimiento = {
  id: 'm1',
  concepto: 'Colmado',
  monto: 350,
  tipo: 'gasto',
  fecha: '2026-10-01T10:00:00.000Z',
  ubicacion: { latitud: 18.47, longitud: -69.89 },
  estado: 'sincronizado',
  version: 2,
};

describe('MovimientosFormComponent', () => {
  let fixture: ComponentFixture<MovimientosFormComponent>;
  let form: MovimientosFormComponent;
  let altas: NuevoMovimiento[];
  let ediciones: Movimiento[];
  let navegaciones: string[];

  async function montar(id?: string): Promise<void> {
    altas = [];
    ediciones = [];
    navegaciones = [];
    await TestBed.configureTestingModule({
      imports: [MovimientosFormComponent],
      providers: [
        provideIonicAngular(),
        {
          provide: MovimientosService,
          useValue: {
            registrar: async (d: NuevoMovimiento) => {
              altas.push(d);
            },
            actualizar: async (m: Movimiento) => {
              ediciones.push(m);
            },
          },
        },
        { provide: OfflineStorageService, useValue: { todos: async () => [structuredClone(guardado)] } },
        {
          provide: NavController,
          useValue: {
            navigateBack: async (url: string) => {
              navegaciones.push(url);
              return true;
            },
          },
        },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MovimientosFormComponent);
    form = fixture.componentInstance;
    if (id) {
      fixture.componentRef.setInput('id', id);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const texto = (): string => el().textContent ?? '';

  /** Escribe en los campos como lo haría el usuario y envía el formulario. */
  async function rellenarYEnviar(concepto: string, monto: string, tipo: 'ingreso' | 'gasto'): Promise<void> {
    const c = el().querySelector<HTMLInputElement>('#concepto')!;
    const m = el().querySelector<HTMLInputElement>('#monto')!;
    const t = el().querySelector<HTMLSelectElement>('#tipo')!;
    c.value = concepto;
    c.dispatchEvent(new Event('input'));
    m.value = monto;
    m.dispatchEvent(new Event('input'));
    t.value = tipo;
    t.dispatchEvent(new Event('change'));
    el().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('alta', () => {
    it('muestra los errores y no guarda con datos inválidos', async () => {
      await montar();
      expect(texto()).toContain('Nuevo movimiento');
      await rellenarYEnviar('   ', '0', 'gasto');
      expect(altas).toEqual([]);
      expect(navegaciones).toEqual([]);
      expect(texto()).toContain(MENSAJES_VALIDACION.conceptoVacio);
      expect(texto()).toContain(MENSAJES_VALIDACION.montoNoPositivo);
      expect(el().querySelector('#concepto')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('al corregir, los mensajes se actualizan solos', async () => {
      await montar();
      await rellenarYEnviar('', '10', 'gasto');
      expect(texto()).toContain(MENSAJES_VALIDACION.conceptoVacio);
      const c = el().querySelector<HTMLInputElement>('#concepto')!;
      c.value = 'Ya tiene concepto';
      c.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(texto()).not.toContain(MENSAJES_VALIDACION.conceptoVacio);
    });

    it('con datos válidos registra (limpios, con decimales) y vuelve a Inicio', async () => {
      await montar();
      await rellenarYEnviar('  Pago   cliente ', '1250.50', 'ingreso');
      expect(altas).toEqual([{ concepto: 'Pago cliente', monto: 1250.5, tipo: 'ingreso' }]);
      expect(navegaciones).toEqual(['/tabs/inicio']);
    });
  });

  describe('edición', () => {
    it('carga el movimiento guardado', async () => {
      await montar('m1');
      expect(texto()).toContain('Editar movimiento');
      expect(form.concepto).toBe('Colmado');
      expect(form.monto).toBe(350);
      expect(form.tipo).toBe('gasto');
      expect(texto()).toContain('La ubicación registrada de este movimiento se conserva');
    });

    it('cambia el tipo y conserva la ubicación y los datos de control', async () => {
      await montar('m1');
      await rellenarYEnviar('Colmado Don José', '400', 'ingreso');
      expect(altas).toEqual([]);
      expect(ediciones).toHaveLength(1);
      expect(ediciones[0]).toEqual({
        ...guardado,
        concepto: 'Colmado Don José',
        monto: 400,
        tipo: 'ingreso',
      });
      expect(ediciones[0].ubicacion).toEqual(guardado.ubicacion);
      expect(navegaciones).toEqual(['/tabs/inicio']);
    });

    it('no guarda cambios inválidos', async () => {
      await montar('m1');
      await rellenarYEnviar('Colmado', '-3', 'gasto');
      expect(ediciones).toEqual([]);
      expect(texto()).toContain(MENSAJES_VALIDACION.montoNoPositivo);
    });

    it('si el movimiento ya no existe lo indica y no muestra el formulario', async () => {
      await montar('no-existe');
      expect(texto()).toContain('Este movimiento ya no existe');
      expect(el().querySelector('form')).toBeNull();
    });
  });
});
