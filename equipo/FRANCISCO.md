# Francisco José Díaz Abreu

## Rama
`feature/francisco-interfaz`

La rama no tiene commits propios: sus aportes al repositorio están en `main`.

## Responsabilidad
Interfaz + Multimedia.

## Área principal de trabajo
Dentro de `app/src/app/`:

- `layout/tabs/` — barra de pestañas y estructura general de navegación.
- `features/multimedia/` — pantalla Media (audio y video). Es parte del área asignada a Francisco; la pantalla la implementó José con autorización del equipo (M4).

Los estilos globales están en `app/src/theme/`.

## Tareas principales
- Diseñar y mantener la interfaz.
- Desarrollar el módulo multimedia.
- Mantener la consistencia visual de la aplicación.

## Antes de entregar
- Probar el módulo.
- Verificar que no haya errores.
- Tomar las evidencias necesarias.
- Hacer commit en su rama.
- Crear Pull Request hacia main.

---

## Aporte realizado

**Commit `4d37c82`** — *Controla+ · AP4 Módulo de conectividad WiFi* (2026-09-09), primer commit del repositorio:

- Detector de estado de red (`detector_red/`): servicio de red e indicador ONLINE/OFFLINE.
- Modo offline (`modo_offline/`): almacenamiento local, cola de pendientes, sincronización y prototipo web.
- Documentación técnica del módulo y documento de diseño de interfaz (`documentacion/*.docx`).
- Diagramas de flujo y arquitectura (`documentacion/diagramas/`) y capturas (`documentacion/capturas/`).
- Prototipo interactivo (`index.html`).

**Commit `17a76e6`** — *Actualización Tarea Semana 5, probar el WI-FI DIRECT* (2026-09-16):

- Módulo Traspaso Cerca (`traspaso_cerca/`): transferencia de archivos entre dos teléfonos por Wi-Fi Direct. Se conserva como módulo independiente; no está integrado en `app/`.

## Participación en documentación

- Documentación técnica, documento de diseño de interfaz, diagramas y capturas del módulo de conectividad (AP4), incluidos en `4d37c82`.

## Integración/complementación realizada por José

- El código de conectividad y modo offline de la AP4 se integró en la aplicación `app/` (`976b311`) y José lo amplió en las Fases 1–4 (persistencia, reintentos, protección contra duplicados y sincronización con Bluetooth).
- En el área de Interfaz + Multimedia, con autorización del equipo, José completó la navegación e interacciones de la interfaz (M3, `4bb638e`) e implementó la pantalla Media de audio y video (M4, `da3c719`).

## Pendientes y defensa

- Pendiente: pruebas en un teléfono físico y evidencias de la interfaz y de Media.
- Defensa individual de su módulo original (Interfaz + Multimedia) y de sus aportes de conectividad y Wi-Fi Direct.
