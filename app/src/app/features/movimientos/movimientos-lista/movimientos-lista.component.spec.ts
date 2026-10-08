import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { IonicStorageModule } from '@ionic/storage-angular';

import { MovimientosListaComponent } from './movimientos-lista.component';

describe('MovimientosListaComponent', () => {
  let component: MovimientosListaComponent;
  let fixture: ComponentFixture<MovimientosListaComponent>;

  beforeEach(() => {
    // Mismos providers que main.ts necesita para MovimientosService.
    TestBed.configureTestingModule({
      imports: [MovimientosListaComponent],
      providers: [
        provideIonicAngular(),
        provideHttpClient(),
        importProvidersFrom(IonicStorageModule.forRoot({ name: 'controlaplus_db' })),
      ],
    });

    fixture = TestBed.createComponent(MovimientosListaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
