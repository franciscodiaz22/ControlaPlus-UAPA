# Controla+

Asignatura: Programación de Dispositivos Móviles (UAPA) · Proyecto final en equipo.

## Descripción

Controla+ es una aplicación móvil para el **control de gastos personales**, desarrollada con
**Ionic, Angular y Capacitor**. Permite registrar ingresos y gastos, y reúne en una sola app:

- almacenamiento local y funcionamiento **offline**, con sincronización automática;
- detección de la **conectividad** en tiempo real;
- intercambio de movimientos entre teléfonos por **Bluetooth LE**;
- **GPS** y **mapa** interactivo con los movimientos geolocalizados;
- **multimedia** local (audio y video);
- **cámara** y lectura de **códigos QR**;
- comunicación **REST** (GET y POST) con un servidor propio.

## Objetivo

- **Académico:** aplicar en un proyecto real las unidades U1–U10 de la asignatura (navegación,
  interfaz, conectividad, Bluetooth, GPS, multimedia, cámara, almacenamiento y servicios REST),
  trabajando en equipo con Git y ramas por integrante.
- **Funcional:** que el usuario pueda llevar el control de sus movimientos aunque no tenga
  Internet; los datos se guardan primero en el teléfono y se envían al servidor cuando vuelve la
  conexión, sin duplicados.

## Tecnologías utilizadas

Versiones tomadas de `app/package.json`.

| Área | Tecnología |
|---|---|
| Framework | Ionic 9 (`@ionic/angular` ^9.0.0), Angular 22.1.7, TypeScript ~6.0.0 |
| Nativo | Capacitor 8.5.2 (Android) |
| Almacenamiento | Ionic Storage (`@ionic/storage-angular`, sobre IndexedDB del navegador/WebView) |
| Conectividad | `@capacitor/network` |
| Bluetooth LE | `@capacitor-community/bluetooth-le` (emisor) y `cordova-plugin-bluetoothle` 6.7.4 (receptor/periférico) |
| GPS y mapa | `@capacitor/geolocation`, Leaflet ^1.9.4 + OpenStreetMap |
| Cámara y QR | `@capacitor/camera`, ML Kit (`@capacitor-mlkit/barcode-scanning`), `@capacitor/browser` |
| Multimedia | HTML5 `<audio>` y `<video>` con archivos locales |
| REST | `HttpClient` de Angular y servidor propio en Node.js (`server/`) |
| Pruebas y calidad | Vitest (`ng test`), ESLint (`angular-eslint`) |
| Control de versiones | Git y GitHub |

## Funcionalidades (U1–U10)

| Unidad | Qué incluye la app |
|---|---|
| **U1–U3** · Navegación, interfaz e interacciones | Barra de pestañas (Inicio, Compartir, QR, Media y Mapa) con carga diferida (`loadComponent`), formulario de alta y edición, filas deslizables con Editar/Eliminar, toque para editar, *pull-to-refresh*, toasts y confirmaciones. |
| **U4** · Conectividad y offline | Indicador ONLINE/OFFLINE y banner de conexión en todas las pestañas. Los movimientos se guardan siempre primero en el teléfono como **pendientes** y se sincronizan solos al recuperar la red, con reintentos de espera creciente (6 s → 60 s) y protección contra envíos duplicados. |
| **U5** · Bluetooth | **Compartir Cerca:** envía un movimiento a otro teléfono por Bluetooth LE; el receptor ve el movimiento y decide si lo acepta o lo rechaza. Lo aceptado queda pendiente y se sincroniza. **NFC no está implementado.** |
| **U6** · GPS y mapa | Ubicación actual, seguimiento GPS y mapa Leaflet/OpenStreetMap. El mapa muestra los movimientos que tienen ubicación y permite registrar un gasto o ingreso en un punto del mapa. Los marcadores "Solo marcador" son temporales y no se guardan. |
| **U7** · Multimedia | Pantalla "Media" con una guía en audio y un tutorial en video locales, con controles propios (reproducir, pausar, volumen, pantalla completa). |
| **U8** · Cámara / QR | Escáner QR con ML Kit y lectura de un QR desde una foto (cámara o galería). Un QR de movimiento se puede consultar y agregar; un QR con enlace se puede abrir. |
| **U9** · Almacenamiento y CRUD | Crear, consultar, editar y eliminar movimientos con persistencia local, validación de datos y sincronización de ediciones y eliminaciones (versionado). |
| **U10** · API REST | `GET /qr/consultar` y `POST /movimientos/lote` contra el servidor Node.js propio, o contra una API simulada en el modo por defecto. |

## Módulos principales

- **Inicio:** balance, lista de movimientos, contador de pendientes, alta rápida (con GPS opcional) y acceso al formulario. Incluye controles de prueba para simular falta de conexión o un fallo de la API durante las demostraciones.
- **Compartir:** Compartir Cerca por Bluetooth LE (modos Recibir y Enviar).
- **QR:** escáner con la cámara y lectura desde una foto; consulta del código a la API.
- **Media:** reproducción local de audio y video.
- **Mapa:** GPS, mapa interactivo, marcadores y movimientos con ubicación.
- **Movimientos/CRUD:** formulario de alta y edición (`/tabs/inicio/movimiento/nuevo` y `/tabs/inicio/movimiento/:id`).
- **Backend REST:** servidor de pruebas en `server/servidor.mjs`.

## Estructura del proyecto

```text
ControlaPlus-UAPA/
├── app/                        Aplicación Ionic/Angular/Capacitor (código activo)
│   ├── src/app/
│   │   ├── core/
│   │   │   ├── network/        NetworkService e indicador de conexión (U4)
│   │   │   ├── offline/        Modelo, almacenamiento, MovimientosService, SyncService, ApiService (U4, U9, U10)
│   │   │   └── compartir/      Protocolo, emisor y receptor Bluetooth LE (U5)
│   │   ├── features/
│   │   │   ├── inicio/         Pantalla de inicio
│   │   │   ├── movimientos/    Formulario y validación (U9)
│   │   │   ├── compartir/      Pantalla Compartir Cerca (U5)
│   │   │   ├── qr/             Escáner y lectura de QR (U8)
│   │   │   ├── multimedia/     Audio y video (U7)
│   │   │   └── mapa/           GPS y mapa (U6)
│   │   ├── layout/tabs/        Barra de pestañas
│   │   └── app.routes.ts       Rutas
│   ├── src/environments/       Configuraciones: simulada (por defecto), prod y servidor
│   ├── src/assets/media/       Audio y video locales
│   ├── android/                Proyecto nativo Android (Capacitor)
│   └── package.json
├── server/                     Servidor REST de pruebas en Node.js (U10)
├── docs/                       Plan maestro de integración y finalización
├── documentacion/              Documentación técnica, diagramas y capturas del módulo de conectividad
├── equipo/                     Integrantes, ramas y tareas
└── (carpetas históricas)       Ver «Carpetas históricas»
```

## Instalación y ejecución

Requisitos: Git, Node.js con npm y, para Android, Android Studio / Android SDK (las
validaciones se hicieron con JDK 21).

```bash
# 1. Clonar el repositorio
git clone https://github.com/franciscodiaz22/ControlaPlus-UAPA.git
cd ControlaPlus-UAPA

# 2. Entrar en la aplicación
cd app

# 3. Instalar dependencias
npm install

# 4. Versión web (http://localhost:4200)
npm start

# 5. Compilar y sincronizar con Android
npm run build
npx cap sync android

# 6. Abrir en Android Studio para ejecutar en un emulador o teléfono
npx cap open android
# (alternativa por consola: cd android && ./gradlew assembleDebug)
```

Otros scripts de `package.json`: `npm test` (pruebas), `npm run lint` (lint) y `npm run watch`.

Por defecto la app usa la **API simulada** y carga tres movimientos de ejemplo la primera vez que
se abre (`cargarDatosDemo` en `src/environments/`).

## Servidor REST

`server/servidor.mjs` es un servidor propio en **Node.js puro** (sin dependencias, no necesita
`npm install`). Detalles completos en [`server/README.md`](server/README.md).

```bash
# Desde la raíz del repositorio
node server/servidor.mjs
# Escucha en http://localhost:3000 (variable opcional PUERTO)
```

| Método y ruta | Uso |
|---|---|
| `GET /qr/consultar?codigo=…` | Consulta un código QR (movimiento en JSON o códigos de ejemplo `CP-CAFE`, `CP-TRANSPORTE`, `CP-BECA`) |
| `GET /movimientos` | Lista de movimientos guardados |
| `POST /movimientos/lote` | Recibe un lote de movimientos (idempotente por `id`, con `version` y `eliminado`) |

**API simulada frente a servidor real:**

- La configuración por defecto (`environment.ts`) usa la **API simulada**: `ApiService` responde
  localmente, sin red, y la app lo indica como simulación.
- La configuración **`servidor`** (`environment.servidor.ts`, `apiUrl = http://localhost:3000`)
  hace las peticiones GET y POST reales contra el servidor:

```bash
cd app
npx ng serve -c servidor          # navegador
npx ng build -c servidor          # Android, luego:
npx cap sync android
adb reverse tcp:3000 tcp:3000     # el localhost:3000 del teléfono llega al equipo
```

Android solo permite HTTP sin cifrar hacia `localhost` y `10.0.2.2`
(`app/android/app/src/main/res/xml/network_security_config.xml`).

## Pruebas y calidad

Estado en la rama `feature/jose-integracion`:

- **170/170 pruebas unitarias** en verde (`npm test`).
- `ng build` correcto.
- Lint limpio en los archivos modificados en las últimas fases. El lint global aún marca avisos de
  estilo anteriores (`prefer-control-flow`, `prefer-inject`) en código ya existente.
- `git diff --check` limpio.

Las pruebas en teléfonos físicos no están completas (ver «Estado del proyecto»).

## Android y Web

La aplicación se ha validado en el **navegador** y en el **emulador Android** (Pixel 6, Android 17
/ API 37): conectividad y modo offline, sincronización, CRUD, multimedia, lectura de QR desde foto,
API REST contra el servidor, GPS y mapa, y el anuncio del receptor Bluetooth.

La validación en **teléfono físico** sigue pendiente, en particular la transferencia Bluetooth
entre dos teléfonos, el escáner QR en vivo y el GPS real.

## Equipo

| Integrante | Rol / responsabilidad |
|---|---|
| José Daniel Marte | Líder técnico · Conectividad, modo offline, sincronización e integración técnica |
| Francisco José Díaz Abreu | Interfaz + Multimedia |
| Felix Alejandro Mejia Villa | GPS + Mapa |
| Ángel Diosiris Moscoso Viloria | Cámara/QR + API REST + Pruebas |
| Kilsy Maria Vasquez Rosario | CRUD + Almacenamiento + Requisitos |

Ramas y tareas de cada integrante: [`equipo/`](equipo/README.md).

## Capturas

Las capturas de las pantallas finales (Inicio, Compartir, QR, Media y Mapa) están pendientes de
añadirse junto con las evidencias del proyecto.

Las imágenes que existen hoy en `capturas/` y `documentacion/capturas/` corresponden al prototipo
del módulo de conectividad (pantallas online, offline con pendiente, reconexión y fallo de
sincronización), no a la versión final de la app.

## Carpetas históricas

En la raíz se conservan, como referencia, entregas y prototipos anteriores que **no forman parte
del código activo** (el código que se compila está en `app/`):

| Carpeta / archivo | Contenido |
|---|---|
| `detector_red/` | Entregable 1: detector de estado de red |
| `modo_offline/` | Entregable 2: modo offline y sincronización |
| `compartir_cerca/` | Primera versión del módulo Compartir Cerca (Bluetooth LE) |
| `traspaso_cerca/` | Módulo de transferencia por Wi-Fi Direct (no integrado en la app) |
| `index.html` | Prototipo interactivo del módulo de conectividad |
| `capturas/` | Capturas del prototipo |

Documentación:

- `docs/`: plan maestro de integración y finalización (`PLAN_JOSE_INTEGRACION.md`).
- `documentacion/`: documentos técnicos y de diseño (.docx), diagramas y la documentación del
  módulo de cámara y API (`Modulo_Camara_API_REST.md`).

## Estado del proyecto

El proyecto está en la **fase final de integración y pulido**: las unidades U1–U10 están
implementadas e integradas en la rama `feature/jose-integracion` y validadas con pruebas
automáticas, en el navegador y en el emulador Android.

Quedan pendientes:

- las validaciones en teléfonos físicos;
- las evidencias (capturas y vídeos);
- la documentación final.

NFC no está implementado.
