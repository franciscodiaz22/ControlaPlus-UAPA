/**
 * Configuración "servidor" (U10 · M6): la app habla con el backend real de
 * pruebas (`server/servidor.mjs`) en lugar de la API simulada.
 *
 *   node server/servidor.mjs        (desde la raíz del repositorio)
 *   ng serve -c servidor            (navegador)
 *   ng build -c servidor            (Android: + `adb reverse tcp:3000 tcp:3000`)
 */
export const environment = {
  production: false,
  /** URL base del backend de pruebas (server/servidor.mjs). */
  apiUrl: 'http://localhost:3000',
  /** false → GET y POST reales contra `apiUrl`. */
  usarServidorSimulado: false,
  /** Carga tres movimientos de ejemplo la primera vez que se abre la app. */
  cargarDatosDemo: true,
};
