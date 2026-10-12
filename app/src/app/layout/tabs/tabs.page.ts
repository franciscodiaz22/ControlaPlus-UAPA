/**
 * tabs.page.ts — barra de pestañas de Controla+: Inicio, Compartir, QR y Media.
 * Encima de la barra muestra los banners de conectividad en todas las pestañas.
 */
import { Component } from '@angular/core';
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { bluetoothOutline, homeOutline, playCircleOutline, qrCodeOutline } from 'ionicons/icons';
import { NetworkStatusComponent } from '../../core/network/network-status.component';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, NetworkStatusComponent],
  templateUrl: './tabs.page.html',
})
export class TabsPage {
  constructor() {
    addIcons({ homeOutline, bluetoothOutline, qrCodeOutline, playCircleOutline });
  }
}
