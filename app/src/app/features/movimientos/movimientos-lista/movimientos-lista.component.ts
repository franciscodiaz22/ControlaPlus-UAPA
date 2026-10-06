import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

import { MovimientosService } from '../../../core/offline/movimientos.service';
import { Movimiento } from '../../../core/offline/movimiento.model';

@Component({
  selector: 'app-movimientos-lista',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './movimientos-lista.component.html',
  styleUrls: ['./movimientos-lista.component.scss']
})
export class MovimientosListaComponent {

  movimientos$: Observable<Movimiento[]>;

  constructor(private movimientosService: MovimientosService) {
    this.movimientos$ = this.movimientosService.movimientos$;
  }

  async eliminar(id: string) {
  await this.movimientosService.eliminar(id);
}
}

