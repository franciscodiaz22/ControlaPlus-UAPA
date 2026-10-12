
   /**
 * app.routes.ts — rutas de Controla+.
 * ---------------------------------------------------------------------------
 * Las pantallas cuelgan de TabsPage (barra de pestañas):
 *   /tabs/inicio     → Home de modo_offline (balance y movimientos)
 *   /tabs/compartir  → Compartir Cerca (BLE)
 *   /tabs/qr         → Escáner QR
 *   /tabs/multimedia → Audio y video locales (U7)
 *   /tabs/inicio/movimiento/nuevo → formulario de alta (CRUD, U9)
 *   /tabs/inicio/movimiento/:id   → formulario de edición (CRUD, U9)
 * Se deja además el alias /compartir para abrirla directamente, y /nuevo
 * redirige al formulario de alta.
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () =>
      import('./layout/tabs/tabs.page').then((m) => m.TabsPage),

    children: [
      {
        path: 'inicio',
        loadComponent: () =>
          import('./features/inicio/home.page').then((m) => m.HomePage),
      },

      {
        path: 'compartir',
        loadComponent: () =>
          import('./features/compartir/compartir.page').then(
            (m) => m.CompartirPage
          ),
      },

      {
        path: 'qr',
        loadComponent: () =>
          import('./features/qr/qr.page').then((m) => m.QrPage),
      },

      {
        path: 'multimedia',
        loadComponent: () =>
          import('./features/multimedia/multimedia.page').then((m) => m.MultimediaPage),
      },

      // Formulario de movimientos dentro de la pestaña Inicio (alta / edición).
      {
        path: 'inicio/movimiento/nuevo',
        loadComponent: () =>
          import('./features/movimientos/movimientos-form/movimientos-form.component').then(
            (m) => m.MovimientosFormComponent
          ),
      },

      {
        path: 'inicio/movimiento/:id',
        loadComponent: () =>
          import('./features/movimientos/movimientos-form/movimientos-form.component').then(
            (m) => m.MovimientosFormComponent
          ),
      },

      {
        path: '',
        redirectTo: 'inicio',
        pathMatch: 'full',
      },
    ],
  },

  {
    path: 'compartir',
    loadComponent: () =>
      import('./features/compartir/compartir.page').then(
        (m) => m.CompartirPage
      ),
  },

  {
    path: 'nuevo',
    redirectTo: 'tabs/inicio/movimiento/nuevo',
    pathMatch: 'full',
  },

  {
    path: '',
    redirectTo: 'tabs/inicio',
    pathMatch: 'full',
  },

  {
    path: '**',
    redirectTo: 'tabs/inicio',
  },
];