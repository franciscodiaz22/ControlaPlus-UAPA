# Servidor de pruebas de Controla+ (U10 · REST GET + POST)

Backend propio y mínimo para verificar las peticiones REST reales de la app (decisión D4 = A del plan maestro). Es **Node.js puro**: no tiene dependencias ni necesita `npm install`.

## Arranque

Desde la raíz del repositorio (Node 18 o posterior):

```bash
node server/servidor.mjs
# Controla+ API de pruebas escuchando en http://localhost:3000
```

Variables opcionales:

| Variable | Por defecto | Uso |
|---|---|---|
| `PUERTO` | `3000` | Puerto HTTP |
| `DATOS` | `server/datos.json` | Archivo JSON donde se guardan los movimientos (está en `.gitignore`) |

Cada petición se escribe en la consola (método, ruta, código de respuesta y resumen del lote).

## Endpoints

| Método y ruta | Respuesta |
|---|---|
| `GET /qr/consultar?codigo=…` | `{ codigo, encontrado, datos? }`. Reconoce el JSON de un movimiento (`{"concepto":…,"monto":…,"tipo":…}`) y los códigos de ejemplo `CP-CAFE`, `CP-TRANSPORTE` y `CP-BECA`. Sin `codigo` → `400` |
| `GET /movimientos` | Lista de movimientos guardados (sin los eliminados), ordenados por fecha |
| `POST /movimientos/lote` | Aplica un lote y responde `{ recibidos, aplicados, eliminados, ignorados[] }` |

Contrato de `POST /movimientos/lote` (el mismo que documenta `ApiService`):

- El cuerpo es una **lista** de movimientos completos (`id`, `concepto`, `monto`, `tipo`, `fecha`, …).
- **Idempotente por `id`:** reenviar el mismo movimiento no lo duplica; se crea o se reemplaza.
- **`version`** (ausente = 0): un elemento con una versión menor que la guardada se ignora y se informa en `ignorados`. Esto también vale para un `id` ya eliminado, que así no "resucita".
- **`eliminado: true`** borra ese `id`. Si no existe, no es un error.
- **Validación:** si algún elemento no es válido, se responde `400` con `detalles` y **no se guarda nada** del lote. También dan `400` un cuerpo que no es JSON o que no es una lista.
- El campo `estado` (pendiente/sincronizado) es solo del teléfono y no se guarda.

CORS está abierto (`Access-Control-Allow-Origin: *`) y responde a la petición `OPTIONS` previa, para que funcione desde `ng serve`.

## Usar la app contra el servidor

La configuración por defecto de la app sigue usando la **API simulada**. Para hablar con este servidor se usa la configuración `servidor` (`src/environments/environment.servidor.ts`: `apiUrl = http://localhost:3000`, `usarServidorSimulado = false`):

```bash
cd app
npx ng serve -c servidor        # navegador
npx ng build -c servidor        # para Android
```

**Android (emulador o teléfono por USB):**

```bash
cd app
npx ng build -c servidor
npx cap sync android
# compilar e instalar el APK (Android Studio o gradlew assembleDebug + adb install -r)
adb reverse tcp:3000 tcp:3000   # el localhost:3000 del teléfono llega al equipo
```

El manifiesto solo permite HTTP sin cifrar hacia `localhost` y `10.0.2.2` (`res/xml/network_security_config.xml`). Para cualquier otro host se exige HTTPS.

## Prueba rápida con curl

```bash
curl "http://localhost:3000/qr/consultar?codigo=CP-CAFE"
curl -X POST http://localhost:3000/movimientos/lote -H "Content-Type: application/json" \
  -d '[{"id":"demo-1","concepto":"Prueba","monto":50,"tipo":"gasto","fecha":"2026-10-12T10:00:00Z"}]'
curl http://localhost:3000/movimientos
```
