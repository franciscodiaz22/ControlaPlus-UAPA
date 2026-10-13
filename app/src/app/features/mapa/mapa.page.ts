import { Component, ViewChild } from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { MapaUbicacionComponent } from './mapa-ubicacion.component';

@Component({
  selector: 'app-mapa-page',
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    MapaUbicacionComponent,
  ],
  templateUrl: './mapa.page.html',
  styleUrl: './mapa.page.scss',
})
export class MapaPage {
  @ViewChild(MapaUbicacionComponent)
  private mapa?: MapaUbicacionComponent;

  ionViewWillLeave(): void {
    void this.mapa?.detenerSeguimiento();
  }
}
