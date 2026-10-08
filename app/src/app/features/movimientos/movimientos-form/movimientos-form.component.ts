import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MovimientosService } from '../../../core/offline/movimientos.service';
import { NuevoMovimiento } from '../../../core/offline/movimiento.model';

@Component({
  selector: 'app-movimientos-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './movimientos-form.component.html',
  styleUrls: ['./movimientos-form.component.scss']
})
export class MovimientosFormComponent {

  concepto = '';
  monto = 0;
  tipo: 'ingreso' | 'gasto' = 'gasto';

  constructor(private movimientosService: MovimientosService) {}

  async guardar() {
    const datos: NuevoMovimiento = {
      concepto: this.concepto,
      monto: this.monto,
      tipo: this.tipo
    };

    await this.movimientosService.registrar(datos);

    this.concepto = '';
    this.monto = 0;
    this.tipo = 'gasto';
  }
}