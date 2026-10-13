# Ángel Diosiris Moscoso Viloria

## Rama
`feature/angel-camera-api`

La rama no tiene commits propios: el trabajo se entregó mediante el Pull Request #2 desde su fork (`diosiris-hub/mis-modificaciones`).

## Responsabilidad
Cámara/QR + API REST + Pruebas.

## Área principal de trabajo
Dentro de `app/src/app/`:

- `features/qr/` — pantalla QR (cámara y lectura de códigos).
- `core/offline/api.service.ts` — consultas a la API REST.
- Pruebas: los archivos de prueba están junto a cada módulo (`*.spec.ts`).

Documento del módulo: `documentacion/Modulo_Camara_API_REST.md`.

## Tareas principales
- Desarrollar cámara o QR según la solución definida para el proyecto.
- Implementar la integración con la API REST.
- Realizar pruebas y documentarlas.

## Antes de entregar
- Probar el módulo.
- Verificar que no haya errores.
- Tomar las evidencias necesarias.
- Hacer commit en su rama.
- Crear Pull Request hacia main.

---

## Aporte realizado

Commit `acae169` — *Integra modificaciones y modulo QR* (2026-10-05, PR #2):

- Pantalla QR con el escáner de Google ML Kit (`@capacitor-mlkit/barcode-scanning`).
- Consulta GET `/qr/consultar` (simulada) y opción "Agregar movimiento" desde el QR.
- Distinción entre un QR de datos y un QR con enlace web ("Abrir enlace" con `@capacitor/browser`).
- Controles de prueba en Inicio: modo offline de prueba y simulación de fallo de la API.
- Captura GPS opcional al registrar un movimiento y campo `ubicacion` del modelo `Movimiento`.
- Modo de prueba web en Compartir.
- Corrección de la barra de pestañas que impedía tocar los controles.
- Preparación del entorno Android (ADB, Java y Gradle) para compilar e instalar el APK.
- Documento `documentacion/Modulo_Camara_API_REST.md` (sección 5.4).

## Participación en pruebas y documentación

Según su documento del módulo:

- prueba de lectura QR en el teléfono (el contenido leído y la sección GET aparecían en pantalla);
- compilación del APK e instalación con `adb install -r`;
- comprobación de los controles táctiles tras corregir la barra de pestañas;
- documentación del alcance real de las operaciones REST (API simulada frente a servidor).

## Integración/complementación realizada por José

- M5 (`bbab905`, `5991351`): manejo de errores del escáner y lectura de un QR desde una foto (cámara o galería).
- M6 (`0a60ce7`): API REST real con el servidor propio `server/servidor.mjs` y la configuración `servidor`; actualización de su documento con esa parte.
- Pruebas automáticas del módulo QR y de la API (`qr.page.spec.ts`, `qr-lectura.spec.ts`, `api.service.spec.ts`).

## Pendientes y defensa

- Pendiente: escáner en vivo y foto de un QR real en un teléfono físico, y las capturas de las Figuras 20–22 de su documento.
- Defensa individual del módulo Cámara/QR + API REST.
