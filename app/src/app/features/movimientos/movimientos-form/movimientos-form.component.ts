/**
 * MovimientosFormComponent — página de alta y edición de movimientos (U9).
 * ---------------------------------------------------------------------------
 * Formulario original de Kilsy convertido en página Ionic:
 *   /tabs/inicio/movimiento/nuevo  → alta (MovimientosService.registrar)
 *   /tabs/inicio/movimiento/:id    → edición (MovimientosService.actualizar)
 *
 * Valida con validarMovimiento(). Al editar se parte del movimiento guardado,
 * así que la ubicación y los datos de control se conservan tal cual. La
 * captura de ubicación (GPS / "Ubicación demo") sigue en la alerta del
 * botón (+) de Inicio y no se hace aquí.
 */
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular';

import { MovimientosService } from '../../../core/offline/movimientos.service';
import { OfflineStorageService } from '../../../core/offline/offline-storage.service';
import { Movimiento, TipoMovimiento } from '../../../core/offline/movimiento.model';
import { CONCEPTO_MAX, CampoMovimiento, validarMovimiento } from '../validacion';

@Component({
  selector: 'app-movimientos-form',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent],
  templateUrl: './movimientos-form.component.html',
  styleUrls: ['./movimientos-form.component.scss'],
})
export class MovimientosFormComponent implements OnInit {
  private readonly movimientosService = inject(MovimientosService);
  private readonly storage = inject(OfflineStorageService);
  private readonly navCtrl = inject(NavController);
  private readonly toastCtrl = inject(ToastController);

  /** Parámetro :id de la ruta; sin id el formulario es de alta. */
  readonly id = input<string>();

  concepto = '';
  monto: number | null = null;
  tipo: TipoMovimiento = 'gasto';

  readonly conceptoMax = CONCEPTO_MAX;
  readonly errores = signal<Partial<Record<CampoMovimiento, string>>>({});
  readonly cargando = signal(false);
  readonly noEncontrado = signal(false);
  readonly guardando = signal(false);

  /** Movimiento que se edita, tal como está guardado. */
  private original?: Movimiento;
  /** Tras el primer intento de guardar, los errores se actualizan al escribir. */
  private intentado = false;

  get modoEdicion(): boolean {
    return !!this.id();
  }

  get conservaUbicacion(): boolean {
    return !!this.original?.ubicacion;
  }

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (!id) {
      return;
    }
    this.cargando.set(true);
    const encontrado = (await this.storage.todos()).find((m) => m.id === id);
    if (encontrado) {
      this.original = encontrado;
      this.concepto = encontrado.concepto;
      this.monto = encontrado.monto;
      this.tipo = encontrado.tipo;
    } else {
      this.noEncontrado.set(true);
    }
    this.cargando.set(false);
  }

  /** Recalcula los mensajes mientras se corrige, solo después de intentar guardar. */
  revalidar(): void {
    if (this.intentado) {
      const r = this.validar();
      this.errores.set(r.ok ? {} : r.errores);
    }
  }

  async guardar(): Promise<void> {
    if (this.guardando()) {
      return;
    }
    this.intentado = true;
    const resultado = this.validar();
    if (!resultado.ok) {
      this.errores.set(resultado.errores);
      return;
    }
    this.errores.set({});
    this.guardando.set(true);
    try {
      if (this.original) {
        // Se parte del guardado: ubicación, fecha y estado no cambian aquí.
        await this.movimientosService.actualizar({ ...this.original, ...resultado.datos });
        await this.toast('Movimiento actualizado.');
      } else {
        await this.movimientosService.registrar(resultado.datos);
      }
      await this.volver();
    } finally {
      this.guardando.set(false);
    }
  }

  volver(): Promise<boolean> {
    return this.navCtrl.navigateBack('/tabs/inicio');
  }

  private validar() {
    return validarMovimiento({ concepto: this.concepto, monto: this.monto, tipo: this.tipo });
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
      cssClass: ['toast-controla', 'toast-cian'],
    });
    await toast.present();
  }
}
