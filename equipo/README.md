# Equipo Controla+

Controla+ es una sola aplicación (carpeta `app/`) desarrollada por 5 integrantes.
Cada integrante tiene un módulo propio y trabaja en su propia rama. Los cambios
se unen a `main` mediante Pull Request, revisados por el líder técnico.

## Integrantes, ramas y responsabilidades

Responsabilidades asignadas al inicio del proyecto (se conservan como evidencia del proceso):

| Integrante | Rama | Responsabilidad |
|---|---|---|
| José Daniel Marte | `feature/jose-integracion` | Conectividad + Modo Offline + Integración técnica |
| Francisco José Díaz Abreu | `feature/francisco-interfaz` | Interfaz + Multimedia |
| Felix Alejandro Mejia Villa | `feature/felixgps` | GPS + Mapa |
| Ángel Diosiris Moscoso Viloria | `feature/angel-camera-api` | Cámara/QR + API REST + Pruebas |
| Kilsy Maria Vasquez Rosario | `feature/kilsy-crud` | CRUD + Almacenamiento + Requisitos |

**Notas sobre ramas:**

- El trabajo de Félix está en `feature/felixgps`. La rama asignada al inicio, `feature/felix-gps`, quedó sin commits propios.
- `feature/francisco-interfaz` y `feature/angel-camera-api` no tienen commits propios: los aportes de Francisco están en `main` y los de Ángel llegaron por el PR #2 desde su fork.

Cada integrante tiene un archivo con sus tareas y aportes en esta carpeta:

- [JOSE_DANIEL.md](JOSE_DANIEL.md)
- [FRANCISCO.md](FRANCISCO.md)
- [FELIX.md](FELIX.md)
- [ANGEL.md](ANGEL.md)
- [KILSY.md](KILSY.md)

## Aportes registrados en el repositorio

Cada aporte se identifica por su commit (autor según git). Cuando José completó o
integró una parte iniciada por otro integrante, se indica como
**integración/complementación realizada por José**; el aporte original sigue
siendo de su autor.

| Integrante | Aporte original | Commits | Integración/complementación realizada por José |
|---|---|---|---|
| Francisco | AP4 · Módulo de conectividad WiFi (detector de red, modo offline, documentación técnica, diseño de interfaz, diagramas, capturas y prototipo) y Traspaso Cerca por Wi-Fi Direct (`traspaso_cerca/`, módulo independiente no integrado en `app/`) | `4d37c82`, `17a76e6` | Integración del código de conectividad y offline en `app/` (`976b311`) y ampliación posterior (Fases 1–4). En el área Interfaz + Multimedia, con autorización del equipo: navegación e interacciones (M3, `4bb638e`) e implementación de la pantalla Media de audio y video (M4, `da3c719`) |
| Félix | GPS, seguimiento, mapa Leaflet + OpenStreetMap, marcadores y permisos de ubicación | `101c084` | Integración en la app, movimientos con ubicación en el mapa y pruebas (M7.7, `d8cf716`) |
| Ángel | Módulo QR con ML Kit, consultas a la API, controles de prueba, captura GPS en el alta, preparación Android y documento del módulo | `acae169` (PR #2) | Manejo de errores y lectura QR desde foto (M5), API REST real y servidor propio (M6), pruebas automáticas |
| Kilsy | CRUD: editar y eliminar, formulario de movimientos y sus pruebas | `bdb6bb6` (PR #3) | Sincronización del CRUD (`6577d8f`), validación, formulario de alta y edición y confirmaciones (M2, `1f80c12`) |
| José | Compartir Cerca por Bluetooth LE, creación de la app integrada, sincronización (Fases 1–4), plan maestro e integración final | `976b311` (PR #1), `4c295f4` y commits M0–M9 | — |

El detalle de fases, pruebas y decisiones está en `docs/PLAN_JOSE_INTEGRACION.md`.

## Integración final

La integración final de todos los módulos se realiza en la rama
`feature/jose-integracion`, a cargo de José Daniel Marte como líder técnico.

## Participación común

Además de su módulo, los cinco integrantes participan, según corresponda, en:

- las pruebas de su módulo, incluidas las pruebas en teléfonos físicos que siguen pendientes;
- las evidencias (capturas y vídeos) de su módulo;
- la documentación de su módulo;
- la defensa individual de su módulo original.

Lo ya realizado en cada caso se indica en el archivo de cada integrante.

## Reglas del equipo

1. Cada integrante trabaja en su propia rama.
2. No trabajar directamente sobre `main`.
3. Cada integrante debe trabajar principalmente en su módulo.
4. No modificar innecesariamente el trabajo de otro integrante.
5. Probar los cambios antes de crear un Pull Request.
6. Los cambios se integran mediante Pull Request.
7. Si un cambio afecta código compartido, coordinarlo con el líder técnico.
8. Mantener la aplicación funcionando después de los cambios.

## Código compartido

Estos archivos afectan a toda la aplicación. Cualquier cambio en ellos debe
coordinarse con el líder técnico (José Daniel Marte):

- `app/src/app/app.component.ts`
- `app/src/app/app.routes.ts`
- `app/src/main.ts`
- `app/package.json`
