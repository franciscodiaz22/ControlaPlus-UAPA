# Felix Alejandro Mejia Villa

## Rama
`feature/felixgps`

La rama asignada al inicio, `feature/felix-gps`, quedó sin commits propios.

## Responsabilidad
GPS + Mapa.

## Área principal de trabajo
Dentro de `app/src/app/`:

- `features/mapa/` — pantalla Mapa y componente de mapa con GPS (`MapaPage`, `MapaUbicacionComponent`).

## Tareas principales
- Desarrollar GPS.
- Integrar el mapa.
- Implementar marcadores.
- Realizar las pruebas correspondientes.

## Antes de entregar
- Probar el módulo.
- Verificar que no haya errores.
- Tomar las evidencias necesarias.
- Hacer commit en su rama.
- Crear Pull Request hacia main.

---

## Aporte realizado

Commit `101c084` — *feat: agregar funcionalidad de mapa GPS* (2026-10-12):

- Ubicación actual con `@capacitor/geolocation` ("Mi ubicación").
- Seguimiento GPS en tiempo real, que se detiene al salir de la pantalla.
- Solicitud de permisos de ubicación y mensajes para permiso denegado, GPS desactivado y tiempo agotado.
- Mapa interactivo con Leaflet + OpenStreetMap.
- Marcador de la posición del usuario y marcadores con nombre y ventana emergente (popup).
- Permisos `ACCESS_COARSE_LOCATION` y `ACCESS_FINE_LOCATION` en el manifiesto de Android.
- Ruta y pestaña del mapa, y dependencia `leaflet`.

## Integración/complementación realizada por José

En la fase M7.7 (`d8cf716`), sin reescribir el módulo:

- integración del commit en `feature/jose-integracion` y resolución de conflictos con las pestañas existentes;
- el mapa muestra los movimientos que tienen ubicación y permite registrar un gasto o ingreso en un punto del mapa con el flujo normal de la app;
- 13 pruebas automáticas del componente del mapa y validación en el emulador Android;
- pulido posterior (`9e250bb`): se quitó el botón "Volver" de la pestaña y se aclaró que "Solo marcador" es temporal.

## Participación en pruebas, evidencias, documentación y defensa

- Pendiente: pruebas del GPS real en un teléfono físico y evidencias del módulo (capturas o vídeo).
- Defensa individual del módulo GPS + Mapa.
