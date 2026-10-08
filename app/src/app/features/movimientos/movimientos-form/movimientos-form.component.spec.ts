import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { IonicStorageModule } from '@ionic/storage-angular';

import { MovimientosFormComponent } from './movimientos-form.component';

describe('MovimientosFormComponent', () => {

  let component: MovimientosFormComponent;
  let fixture: ComponentFixture<MovimientosFormComponent>;

  beforeEach(async () => {

    // Mismos providers que main.ts necesita para MovimientosService.
    await TestBed.configureTestingModule({
      imports: [MovimientosFormComponent],
      providers: [
        provideIonicAngular(),
        provideHttpClient(),
        importProvidersFrom(IonicStorageModule.forRoot({ name: 'controlaplus_db' })),
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MovimientosFormComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

});
