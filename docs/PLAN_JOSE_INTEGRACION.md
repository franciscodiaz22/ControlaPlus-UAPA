# PLAN DE INTEGRACIÓN — JOSÉ DANIEL

> Proyecto: **Controla+** — Programación de Dispositivos Móviles, UAPA.
> Rama de trabajo: `feature/jose-integracion` (única rama permitida para este plan).
> Responsable: **José Daniel Marte** — Conectividad + Modo Offline + Integración técnica (líder técnico).
> Documento de control: se actualiza al terminar cada fase. Cada fase requiere autorización explícita antes de ejecutarse.

**Leyenda de estados:** `[ ]` Pendiente · `[~]` En progreso · `[x]` Completada · `[!]` Bloqueada / depende de otro integrante

---

## 1. Objetivo

Completar y dejar verificado, dentro de la app `app/` (Ionic 9 + Angular 22 + Capacitor 8), el módulo de:

- Detector de conectividad y estado online/offline en tiempo real.
- Indicador visual del estado de conexión.
- Almacenamiento local de movimientos (offline-first).
- Registro de movimientos sin conexión y cola de pendientes.
- Sincronización automática al recuperar la conexión.
- Integración técnica para que estos elementos funcionen con los módulos del resto del equipo.

Principio rector: **aprovechar el código existente**, con cambios pequeños, controlados y verificables. Nada de refactorizaciones innecesarias.

---

## 2. Estado inicial

Análisis realizado el **2026-09-30** sobre el commit `f827781` (árbol limpio).

### 2.1 Verificación base

- `npx ng build` (dentro de `app/`) → **compila sin errores** (bundle inicial 806 kB; chunks `home-page`, `compartir-page`, `tabs-page`).
- No existen pruebas unitarias (`*.spec.ts`) en `app/src`. Vitest está configurado (`angular.json` → `@angular/build:unit-test`, `src/test-setup.ts`).
- Las copias de la raíz `detector_red/src/app/core/network` y `modo_offline/src/app/core/offline` eran **idénticas** a las de `app/src/app/core/` al empezar (no se borran; ver sección 7).
- `AndroidManifest.xml` declara `INTERNET`. `ACCESS_NETWORK_STATE` lo aporta el propio plugin `@capacitor/network` al fusionar el manifiesto (confirmado en su `AndroidManifest.xml`; se verificará el manifiesto fusionado en 5.4; **no** se toca la configuración Android).

### 2.2 Lo que YA estaba implementado

| Elemento | Archivo | Estado |
|---|---|---|
| Detector de red sobre `@capacitor/network` (`getStatus` + `networkStatusChange`, `NgZone`, `isOnline$`, `estado$`, `refrescar()`) | `core/network/network.service.ts` | Funcional |
| Indicador visual: píldora ONLINE/OFFLINE + banner offline fijo + banner "Conexión restablecida" (3 s), accesible (`role`, `aria-live`) | `core/network/network-status.component.*` | Funcional (solo se muestra en Inicio) |
| Persistencia local con `@ionic/storage-angular` (IndexedDB/localStorage), clave `controlaplus.movimientos`, datos demo | `core/offline/offline-storage.service.ts` | Funcional |
| Modelo `Movimiento` con `estado: 'pendiente' \| 'sincronizado'` e `id` UUID (idempotencia) | `core/offline/movimiento.model.ts` | Funcional |
| Registro offline-first: guarda siempre local, envía si hay red, toast según caso | `core/offline/movimientos.service.ts` | Funcional |
| Cola de pendientes (= movimientos con `estado === 'pendiente'`), contador `pendientes$` en `MovimientosService` | `offline-storage.service.ts`, `movimientos.service.ts` | Funcional (el contador no se mostraba; resuelto en 2.2) |
| Sincronización automática en transición offline → online, bandera anti-paralelo, reintento a 6 s, `resultado$` | `core/offline/sync.service.ts` | Funcional con huecos (ver 2.3) |
| Cliente HTTP con servidor simulado (`usarServidorSimulado: true`) y `simularFallo` | `core/offline/api.service.ts`, `environments/*` | Funcional (simulado) |
| Catálogo de mensajes y toasts con estilo | `core/offline/mensajes.ts`, `theme/conectividad.scss` | Funcional |
| Arranque: `NetworkService.init()` y `SyncService` instanciado desde el inicio | `app.component.ts` | Funcional |
| Pantalla Inicio: balance, lista, etiqueta "⏳ Pendiente de sincronizar", botón + para registrar | `features/inicio/home.page.*` | Funcional |

### 2.3 Huecos detectados (y su estado)

1. ~~**No se sincroniza al arrancar la app.**~~ Si la app se cerró con pendientes y se abre con conexión, no había transición offline → online y los pendientes quedaban sin enviar. *Resuelto en 3.1.*
2. ~~**No se reacciona al volver del segundo plano.**~~ *Descartado en 1.3:* el plugin `@capacitor/network` 8.0.1 ya lo resuelve en Android. No requiere código.
3. ~~**Pérdida de datos por escrituras concurrentes** en `OfflineStorageService`.~~ *Confirmado (riesgo real, reproducible incluso con el motor real de Ionic Storage) y **resuelto en 2.1** con una cola de escrituras.*
4. **Reintento sin límite y con toast cada vez.** Con el servidor caído, `SyncService` reintenta cada 6 s indefinidamente y muestra un toast ámbar en cada intento. *Tarea 3.3.*
5. **Envío doble posible** entre `MovimientosService.registrar()` (envía el nuevo) y `SyncService.sincronizar()` (envía todos los pendientes, incluido ese). El servidor lo tolera por `id`, pero se puede evitar. *Tarea 3.4.*
6. ~~**Movimientos recibidos por Bluetooth** (`ble-receptor.service.ts`) se guardan como `pendiente` pero no disparan sincronización.~~ *Resuelto en 3.5 (sin tocar el módulo Bluetooth).*
7. ~~**Contador de pendientes** no se muestra en la UI.~~ *Resuelto en 2.2.*
8. ~~**`Network.getStatus()` sin manejo de error** en `init()`.~~ *Resuelto en 1.2.* Si fallaba, `init()` rechazaba y **nunca registraba el listener**.
9. **No hay pruebas unitarias** del módulo. *Tarea 5.1.*
10. **Evidencias**: las capturas de `capturas/` y `documentacion/capturas/` son del prototipo web, no de la app real. *Tarea 6.2.*
11. ~~**Doble sincronización posible**~~ *Resuelto en 3.1.* (Detectado en el análisis de 3.1): en `SyncService.sincronizar()` la bandera `sincronizando` se activa **después** de `await storage.pendientes()`, así que dos llamadas simultáneas (reconexión + reintento, o reconexión + arranque) pasan las dos y envían lo mismo dos veces, con dos toasts. No se pierden datos (el servidor deduplica por `id`).)

---

## 3. Fases del proyecto

Orden recomendado: **0 → 1 → 2 → 3 → 4 → 5 → 6**.

### FASE 0 — Planificación y análisis

| # | Tarea | Objetivo | Archivos | Acción | Verificación | Estado |
|---|---|---|---|---|---|---|
| 0.1 | Análisis del código existente | Saber qué hay y qué falta | `core/network/*`, `core/offline/*`, `features/inicio/*`, `app.component.ts`, `main.ts`, `environments/*`, `equipo/*.md` | Lectura completa + build base | Build OK, sección 2 redactada | [x] |
| 0.2 | Clasificar archivos (propios / compartidos / prohibidos) | Evitar tocar módulos ajenos | Secciones 5, 6 y 7 | Documentar | Revisión del usuario | [x] |
| 0.3 | Dependencias por integrante | Saber qué bloquea | Sección 4 | Documentar | Revisión del usuario | [x] |
| 0.4 | Crear este plan | Memoria persistente | `docs/PLAN_JOSE_INTEGRACION.md` | Crear | Archivo existe; `git status` solo mostraba este archivo | [x] |

### FASE 1 — Conectividad

| # | Tarea | Objetivo | Archivos | Acción | Verificación | Estado |
|---|---|---|---|---|---|---|
| 1.1 | Verificar detector actual | Confirmar comportamiento real antes de tocar nada | `core/network/*` (solo lectura) | Prueba temporal con Vitest + jsdom **fuera del proyecto** (scratchpad) usando la implementación web real de `@capacitor/network`; lectura del código Android del plugin | ✔ estado inicial; ✔ cambios online/offline en tiempo real sin repetidos; ✔ `connectionType: 'none'` offline; ✔ `refrescar()`; ✔ `init()` idempotente; ✔ banner de reconexión `true` → `false` a los 3 s. ✘ un fallo de `getStatus()` rompía `init()` → 1.2 | [x] |
| 1.2 | Manejo de error en `init()` | Que un fallo del plugin no deje la app sin detección de red | `core/network/network.service.ts` | `try/catch` independiente para `getStatus()` (conserva `navigator.onLine`) y para `addListener()`, con `console.warn`. Sin cambios de API | Prueba con plugin simulado: `init()` no rechaza, conserva el estado y **sigue recibiendo cambios**; pruebas de 1.1 en verde (6/6); `ng build` OK | [x] |
| 1.3 | Refrescar al volver del segundo plano | Estado correcto tras `resume` | — (sin cambios) | **Analizada: no requiere código.** El plugin Android (`NetworkPlugin.java`) detiene el monitoreo en `handleOnPause`; en `handleOnResume` lo reactiva (`registerDefaultNetworkCallback`, que emite `onCapabilitiesChanged` con la red actual → evento `networkStatusChange`) y además notifica si se perdió la conexión durante la pausa. En web, el navegador emite `online`/`offline` también en segundo plano. Añadir `@capacitor/app` duplicaría eventos | Confirmación en dispositivo pendiente en **5.3** (modo avión con la app en segundo plano, en ambos sentidos) | [x] |
| 1.4 | Indicador visible fuera de Inicio | Que el estado se vea en todas las pestañas | `layout/tabs/*` o `features/compartir/*` | **Solo proponer**; el componente ya es reutilizable (`<app-network-status vista="pill">`) | Acordado con Francisco | [!] Francisco |

### FASE 2 — Modo Offline y persistencia

| # | Tarea | Objetivo | Archivos | Acción | Verificación | Estado |
|---|---|---|---|---|---|---|
| 2.1 | Serializar escrituras en almacenamiento | Evitar pérdida de movimientos por escrituras solapadas (hueco 3) | `core/offline/offline-storage.service.ts` | Cola interna de promesas + método privado `escribir(transformar)`; `agregar`, `marcarSincronizados` y `limpiar` la usan. API pública, clave y formato sin cambios | Casos A–F sin pérdida (incluido el motor real), G–J (orden, cálculo en su turno, fallo de escritura, API); Fase 1 en verde; build OK; lint sin errores nuevos. Ver «Resultado de 2.1» | [x] |
| 2.2 | Mostrar contador de pendientes | Que el usuario vea la cola (hueco 7) | `features/inicio/home.page.ts/.html/.scss` | Línea ámbar en la tarjeta de balance con el `pendientes$` existente; oculta con 0. Ver «Resultado de 2.2» | Render de la plantilla real con servicios reales: 0 → oculto; 1 → singular; 3 → plural; reconexión → sync → desaparece. Build OK; lint sin errores nuevos | [x] |
| 2.3 | Verificar persistencia tras cierre | Confirmar que la cola sobrevive | — (sin cambios de código) | Prueba real en Chrome con la app compilada: registrar offline → cerrar el navegador → reabrir offline → reconectar. Ver «Resultado de 2.3» | Pendientes, contador, lista, balance e IndexedDB idénticos tras reabrir; al reconectar se sincronizan los 2 y el contador desaparece | [x] (navegador) · Android pendiente en 5.3 |
| 2.4 | Contrato de almacenamiento con el CRUD | Que el CRUD use el mismo almacenamiento y la cola | `core/offline/offline-storage.service.ts`, `movimiento.model.ts` | **Solo acordar** con Kilsy: qué métodos necesita (actualizar/eliminar) y cómo se sincronizan ediciones y borrados. No implementar CRUD | Acuerdo escrito en la sección 4 | [!] Kilsy |

#### Análisis de la tarea 2.1 (2026-09-30), sin modificar código

**Causa.** En `offline-storage.service.ts`, `agregar()` y `marcarSincronizados()` seguían el patrón *leer → calcular → escribir* sin exclusión:
1. calculaban la lista nueva a partir de `movimientosSubject.value` (copia en memoria);
2. esperaban `storage.set()` (asíncrono);
3. solo entonces actualizaban la copia en memoria (`persistir()`).

Si una segunda escritura empezaba mientras la primera esperaba en el paso 2, calculaba sobre la lista **antigua** y, al terminar después, **sobrescribía** la primera, tanto en disco como en memoria.

**Quién escribe:** `MovimientosService.registrar()` (`agregar` + `marcarSincronizados`), `SyncService.sincronizar()` (`marcarSincronizados`) y `BleReceptorService.aceptar()` (`agregar`, módulo Compartir; no se toca).

**Simulación controlada** (Vitest + jsdom en el scratchpad, fuera del repo, con los servicios reales del proyecto):

| Caso | Situación | Resultado (antes de 2.1) |
|---|---|---|
| A | `agregar(M2)` y `marcarSincronizados([P1])` solapados | **M2 perdido** en disco y en memoria |
| B | Orden inverso | M2 se salvaba, pero **P1 volvía a `pendiente`** (se reenviaba; el servidor lo tolera por `id`) |
| C | Dos `agregar()` solapados | **Se perdía uno** de los dos |
| D | Mismas operaciones en secuencia | Sin pérdida (control) |
| E | Caso A con el **motor real** `@ionic/storage` 4.0.0 (localforage, driver `localStorageWrapper`), sin latencia artificial | **M2 perdido** |
| F | Flujo completo: `SyncService.sincronizar()` enviando P1; el usuario registra M2 con conexión y el servidor responde a la sync mientras M2 se guarda | **M2 perdido**; el usuario ya había visto el toast de "guardado"/"enviado" |

**Clasificación:** **riesgo real** (reproducible de forma determinista), **probabilidad baja** en uso manual (la ventana dura lo que tarda una escritura: milisegundos, más en teléfonos lentos y con listas grandes, porque cada escritura serializa la lista completa) y **consecuencia grave** (pérdida silenciosa de un movimiento).

**Impacto en Kilsy:** no toca su código (el CRUD aún no existe). Condición para el acuerdo 2.4: cualquier `actualizar`/`eliminar` debe añadirse **dentro** de `OfflineStorageService` usando `escribir()`; un almacén paralelo sobre la misma clave evitaría la cola.

#### Resultado de la tarea 2.1 (2026-09-30)

**Cambio realizado:** solo en `app/src/app/core/offline/offline-storage.service.ts`:
- Nuevo campo privado `cola: Promise<void> = Promise.resolve()`.
- Nuevo método privado `escribir(transformar)`: se encadena a `cola`, espera `listo`, calcula la lista con `transformar(movimientosSubject.value)` **en su turno** y llama a `persistir()`. Devuelve la promesa de ese turno (los errores llegan a quien llamó); `cola` guarda la versión con `catch`, para que un fallo no bloquee las escrituras siguientes.
- `agregar(mov)`, `marcarSincronizados(ids)` y `limpiar()` usan `escribir()`. La lógica de cada uno es la misma que antes.
- Sin cambios en: firmas públicas, `CLAVE_MOVIMIENTOS`, formato guardado, `inicializar()`, `persistir()`, `todos()`, `pendientes()`, datos demo, ni en ningún otro archivo.

**Pruebas** (Vitest + jsdom en el scratchpad, fuera del repo, con los servicios reales):

| Caso | Antes | Después |
|---|---|---|
| A · `agregar(M2)` + `marcarSincronizados([P1])` solapados | M2 perdido | ✔ `[M2:pendiente, P1:sincronizado]` en disco y en memoria |
| B · Orden inverso | P1 volvía a `pendiente` | ✔ `[M2:pendiente, P1:sincronizado]` |
| C · Dos `agregar()` solapados | Se perdía uno | ✔ ambos, en orden |
| D · Secuencial (control) | Correcto | ✔ igual |
| E · Motor real `@ionic/storage` 4.0.0 | M2 perdido | ✔ sin pérdida |
| F · Flujo sync + registrar (`SyncService` + `MovimientosService` reales) | M2 perdido | ✔ M2 presente y P1 `sincronizado` |
| G · 5 `agregar()` simultáneos | — | ✔ los 5, en orden |
| H · `marcarSincronizados` de un movimiento aún en cola | — | ✔ queda `sincronizado` (calcula en su turno) |
| I · Falla una escritura en medio de la cola | — | ✔ solo esa llamada rechaza; el estado no cambia; las siguientes se completan |
| J · API pública | — | ✔ mismos métodos y número de parámetros |
| Fase 1 (6 casos de red) | — | ✔ en verde |

Total: **16/16 en verde**. `ng build` OK. `ng lint`: 21 errores, los mismos de antes; el único de este archivo (`prefer-inject` del constructor) ya existía y solo cambió de línea (35 → 38).

#### Análisis de la tarea 2.2 (2026-09-30), sin modificar código

`MovimientosService.pendientes$: Observable<number>` ya existía (cuenta `estado === 'pendiente'` sobre la lista del almacenamiento, así que se actualiza solo con cada escritura). `HomePage` ya inyectaba `MovimientosService`, pero no exponía `pendientes$` y nadie lo usaba. Solo existía la etiqueta individual "⏳ Pendiente de sincronizar" por movimiento; no había un total. `features/inicio/` es de mi módulo (`equipo/JOSE_DANIEL.md`); no hacía falta tocar `theme/*`, `layout/tabs/*` ni `global.scss`.

#### Resultado de la tarea 2.2 (2026-09-30)

**Archivos modificados** (solo los autorizados):
- `features/inicio/home.page.ts`: `readonly pendientes$ = this.movimientos.pendientes$` y método `textoPendientes(n)` (singular/plural). El texto va aquí y no en `mensajes.ts` porque ese archivo no estaba autorizado.
- `features/inicio/home.page.html`: dentro de `.balance`, tras la línea "Incluye los movimientos…", un bloque `@if (pendientes$ | async; as n)` con `<p class="pendientes" role="status" aria-live="polite">`. Con 0 no se renderiza.
- `features/inicio/home.page.scss`: regla `.balance .pendientes` (margen 8 px arriba, `$mono`, 11 px, `$ambar`), con las variables existentes del archivo.
- Sin cambios en servicios, lógica, `mensajes.ts`, temas globales ni archivos de Francisco.

**Pruebas** (Vitest + jsdom en el scratchpad, fuera del repo; se renderiza la **plantilla real** de `HomePage` y `NetworkStatusComponent` con `MovimientosService`, `SyncService` y `OfflineStorageService` reales, y red/API/toasts simulados):

| Caso | Resultado |
|---|---|
| 0 pendientes | ✔ no existe el elemento `.pendientes`; la lista y la línea "Incluye los movimientos…" siguen igual |
| Offline, registrar 1 | ✔ "⏳ 1 movimiento pendiente de sincronizar"; la etiqueta por movimiento sigue apareciendo |
| Offline, registrar 3 | ✔ "⏳ 3 movimientos pendientes de sincronizar"; el balance se sigue calculando (RD$ 22,260.00) |
| Reconexión → `SyncService` sincroniza solo | ✔ una llamada a la API; el contador desaparece y no quedan etiquetas pendientes |
| Accesibilidad | ✔ `role="status"`, `aria-live="polite"` |
| Regresión Fase 1 + 2.1 | ✔ 16/16 |

Total: **19/19 en verde**. `ng build` OK. `ng lint`: 21 errores, los mismos de antes; los 2 de `home.page.html` (`*ngFor`, `*ngIf` previos) solo cambiaron de línea (22→26, 31→35); el nuevo bloque usa `@if` y no añade ninguno.

**Pendiente relacionado:** verificación visual en Android (5.3) y revisión visual de Francisco (4.3); portar la prueba a `home.page.spec.ts` en 5.1. Opcional, con autorización: mover el texto a `MENSAJES` en `mensajes.ts` por coherencia con el catálogo.

#### Resultado de la tarea 2.3 (2026-09-30), sin modificar código

**Veredicto:** la persistencia actual **funciona**. No se detectaron fallos ni hizo falta ninguna corrección.

**Cómo se comprobó — PRUEBA REAL en navegador** (no simulación de servicios):
- App **compilada** (`app/www`, build posterior a 2.2) servida en `localhost` por un servidor estático temporal.
- **Google Chrome real** (headless) con un perfil propio en el scratchpad, controlado por el protocolo de DevTools (CDP) con un script de Node, sin instalar nada. El script y el perfil están fuera del repo.
- Movimientos registrados **desde la interfaz** (botón +, alerta, escritura de texto, botón Gasto/Ingreso).
- Almacenamiento leído directamente de **IndexedDB** (`controlaplus_db` / `_ionickv`, clave `controlaplus.movimientos`).
- Cierre **completo** del navegador (`Browser.close`, con fin del proceso confirmado) y reapertura con el mismo perfil.

| Paso | Resultado observado |
|---|---|
| 1. Inicio con red | ONLINE; 3 movimientos demo `sincronizado`; sin contador; RD$ 24,850.00 |
| 2. Cortar la red (emulación offline de DevTools) | `navigator.onLine=false`, píldora OFFLINE y banner offline |
| 3–4. Registrar 2 (gasto 350, ingreso 1200) | 2 toasts "guardado en tu teléfono"; 2 etiquetas; contador "⏳ 2 movimientos pendientes de sincronizar"; RD$ 25,700.00; IndexedDB con ambos `pendiente` |
| 5. Cerrar el navegador completo | Proceso terminado |
| 6–9. Reabrir **sin conexión** | OFFLINE; **mismos 5 movimientos** y los 2 `[PENDIENTE]`; contador "2"; RD$ 25,700.00; IndexedDB idéntico |
| 10. Recuperar la conexión | ONLINE, banner "Conexión restablecida", toast "Sincronización completada: 2 movimientos enviados al servidor."; contador oculto; 0 etiquetas; IndexedDB con los 5 `sincronizado` |

**Qué fue real y qué fue emulado:**
- **Real:** app compilada, Chrome, IndexedDB, interfaz, cierre y reapertura del navegador, sincronización existente (`SyncService`) y el cliente `ApiService`.
- **Emulado:** (a) el corte de red, con la emulación offline de DevTools; (b) en la reapertura, para que la página pudiera cargarse desde `localhost`, `navigator.onLine` se forzó a `false` antes del arranque de la app y la emulación offline se activó justo después de cargar; (c) el servidor sigue siendo el **simulado** de la app (`usarServidorSimulado: true`).

**Evidencias:** 4 capturas (`1_inicio_online`, `2_offline_con_pendientes`, `3_reabierta_offline`, `4_tras_reconectar`) guardadas en el scratchpad de la sesión (fuera del repo). Se pueden copiar a `docs/evidencias/` en la Fase 6 si se autoriza.

**¿Requiere prueba en Android?** Sí, se mantiene en **5.3**. En Android, Ionic Storage usa el mismo motor (IndexedDB del WebView de Chromium, porque no hay driver SQLite configurado), así que la confianza es alta, pero falta confirmar: cierre forzado de la app desde "recientes", reinicio del teléfono y modo avión real.

**Observación:** esta prueba reabre **sin** conexión, como se pidió. Si la app se reabre **con** conexión y hay pendientes, hoy no se sincronizan hasta una transición offline → online (hueco 1, tarea 3.1).

### FASE 3 — Sincronización

| # | Tarea | Objetivo | Archivos | Acción | Verificación | Estado |
|---|---|---|---|---|---|---|
| 3.1 | Sincronizar al arrancar | Enviar pendientes de sesiones anteriores (hueco 1) y evitar la doble sincronización (hueco 11) | `app.component.ts` (compartido, a mi cargo) y `core/offline/sync.service.ts` | Tras `network.init()` → `sync.sincronizar('arranque')`; en `sincronizar()` activar la bandera antes del primer `await`. Ver «Análisis de la tarea 3.1» | Casos P1–P8 con el código real + regresión + build + lint + prueba real en Chrome (abrir con red y pendientes). Ver «Resultado de la tarea 3.1» | [x] (navegador) · Android en 5.3 |
| 3.2 | Sincronizar al volver al primer plano | Cubrir `resume` con pendientes (hueco 2) | — (no requiere código según el análisis) | Analizada: la reanudación ya está cubierta por el plugin + la transición de `SyncService` + el reintento existente; el único caso sin cubrir es general (pendientes creados online sin reintento, p. ej. BLE) y pertenece a **3.5**. Ver «Análisis de la tarea 3.2» | Simulación R1–R5 con el código real (32/32 con regresión); confirmación en Android en **5.3** | [x] **Cerrada sin código** (confirmado por el usuario). La reanudación queda cubierta por `@capacitor/network` + `NetworkService` + `SyncService`; los pendientes recibidos por Bluetooth son el hueco 6 → **3.5**; confirmación final en Android → **5.3** |
| 3.3 | Reintento con espera creciente y sin spam | Evitar el toast ámbar cada 6 s (hueco 4) | `core/offline/sync.service.ts`, `core/offline/mensajes.ts` | Espera creciente (6 s → 12 s → 24 s… tope 60 s); toast solo en el primer fallo de la racha; se reinicia al tener éxito | `simularFallo = true` → un solo toast; `simularFallo = false` → la sync termina en el siguiente reintento. Ver «Análisis de la tarea 3.3» y «Resultado de la tarea 3.3» | [x] |
| 3.4 | Evitar envío doble registro/sync | Un solo camino de envío (hueco 5) | `core/offline/movimientos.service.ts`, `sync.service.ts` | Propuesta tras el análisis: registro compartido de "ids en vuelo" en `SyncService` (`reservarEnvio`/`liberarEnvio`), usado por `sincronizar()` y `registrar()`; se descarta delegar todo en `SyncService`. Ver «Análisis de la tarea 3.4» | Consola: cada `id` se envía una sola vez por intento. D1–D10 con el código real + regresión: 52/52; prueba real en Chrome sin solapes. Ver «Resultado de la tarea 3.4» | [x] (navegador) · Android en 5.3 |
| 3.5 | Sincronizar cuando aparecen pendientes nuevos estando online | Cubrir movimientos recibidos por BLE (hueco 6) sin tocar el módulo Compartir | `core/offline/sync.service.ts` | `SyncService` observa el **aumento** de pendientes (tras la carga inicial, pausa de 300 ms, sin racha activa) y hace una segunda vuelta si llegaron pendientes durante un envío. Ver «Resultado de la tarea 3.5» | B1–B9 + regresión: 61/61; prueba real en Chrome (pantalla Compartir y botón Aceptar reales), 0 solapes | [x] (navegador) · Android en 5.3 |

> Nota: 3.4 y 3.5 se decidirán juntas al llegar a ellas (3.5 puede hacer innecesaria parte de 3.4). Se presentará la opción elegida antes de implementarla.

#### Análisis de la tarea 3.1 (2026-09-30), sin modificar código

**Arranque actual:** `main.ts` → `AppComponent`. Su constructor inyecta `SyncService`, que a su vez crea `OfflineStorageService` (empieza a abrir la base: `listo`) y se suscribe a `isOnline$.pipe(pairwise(), filter(false → true))`. Después llama `void network.init()`.

**1. Por qué no sincroniza al abrir con conexión.** `SyncService` solo reacciona a **transiciones** offline → online. `NetworkService` arranca con `navigator.onLine` (true) y `getStatus()` confirma true; `distinctUntilChanged` no emite nada nuevo, así que no hay transición ni sincronización. Solo sincroniza "por casualidad" si `navigator.onLine` decía false y el sistema dice true (caso ACT-2).

**2. Punto correcto del arranque:** justo **después de que `network.init()` termine**. Es el único momento en que se conoce el estado real de la red (y no la suposición de `navigator.onLine`). El almacenamiento no requiere espera extra, porque `pendientes()` ya espera a `listo`.

**3–4. Archivos:**
- `app/src/app/app.component.ts` (**compartido**, bajo mi responsabilidad como líder técnico): es donde se llama `init()` y el único punto que sabe cuándo termina. Cambio: `void this.network.init().then(() => this.sync.sincronizar('arranque'));`, que sustituye `void this.network.init();` y `void this.sync;` (que existía solo para evitar el aviso de "no usado"). Sin tocar rutas, providers ni plantilla.
  - Alternativa descartada: hacerlo dentro de `SyncService` obliga a cambiar también `NetworkService`, porque `init()` devuelve inmediatamente en la segunda llamada, antes de que termine la primera; habría que exponer la promesa de inicio. Serían más archivos y más lógica.
- `core/offline/sync.service.ts`: activar `sincronizando = true` **antes** del primer `await` y leer los pendientes dentro del `try/finally` que ya existe (la bandera siempre se libera). Necesario para que la sincronización de arranque no se duplique con la de reconexión (P4) ni con un reintento. Efecto colateral: si leer los pendientes falla, ahora sigue el camino de error existente (toast ámbar + reintento) en lugar de rechazar sin reintentar.

**5. Reutilización:** sí. Se usa el mismo `SyncService.sincronizar()`, con su toast, `resultado$`, reintento y cola de escrituras (2.1). No se crea una lógica paralela.

**6–7. Evitar la doble ejecución y los conflictos:**
- La sincronización de arranque se lanza **una vez**: `AppComponent` se construye una sola vez e `init()` es idempotente.
- Si coincide con otra (reconexión, reintento o manual), la bandera activada antes del primer `await` hace que la segunda devuelva 0 sin enviar nada.
- Si leer los pendientes falla, `finally` libera la bandera (P8).
- Registrar mientras sincroniza no pierde datos gracias a la cola de 2.1 (P6, P7).

**Simulación** (Vitest en el scratchpad con los servicios reales; la propuesta se probó en una **copia** de `SyncService`; el proyecto no se modificó):

| Caso | Resultado |
|---|---|
| ACT-1 · actual: pendientes + online al arrancar | ✘ no se envía nada (confirma el hueco 1) |
| ACT-2 · actual: `navigator` offline, sistema online | se envía (solo por la transición) |
| ACT-3 · actual: dos `sincronizar()` simultáneos | ✘ **envío doble** y 2 toasts (confirma el hueco 11) |
| P1 · 0 pendientes + online | ✔ no envía nada ni muestra toast |
| P2 · pendientes + online al arrancar | ✔ 1 envío, todos `sincronizado`, toast "Sincronización completada: 2…" |
| P3 · pendientes + offline al arrancar → online | ✔ nada al arrancar; 1 envío al conectar |
| P4 · caso borde: reconexión + arranque a la vez | ✔ **un solo** envío y un toast |
| P5 · reconexión + 2 manuales simultáneas | ✔ un solo envío |
| P6 · registrar mientras la sync de arranque envía | ✔ sin pérdida; envíos `[P1]` y `[M]` |
| P7 · registrar en el mismo instante del arranque | ✔ sin pérdida; sin duplicados en esta secuencia |
| P8 · falla la lectura de pendientes | ✔ la bandera se libera y la siguiente sync envía |

Regresión (Fase 1, 2.1, 2.2): ✔. Total del conjunto temporal: **30/30**.

**Nota (no es de 3.1):** si el usuario registra con conexión **justo antes** de que la sync lea los pendientes, ese movimiento podría enviarse dos veces (por `registrar()` y por la sync). No se pierden datos (`id` idempotente). Es el hueco 5, planificado en **3.4**.

**Impacto en otros integrantes:**
- `app.component.ts` es compartido, pero solo se encadena una llamada; no cambian rutas, providers ni la plantilla.
- **Ángel:** con pendientes, la app hará un POST al abrirse; relevante al conectar la API real (4.1).
- **Kilsy:** si el CRUD usa `OfflineStorageService`, sus pendientes también se sincronizarán al abrir (efecto deseado).
- **Francisco:** puede aparecer el toast existente "Sincronización completada" al abrir; no hay cambios visuales nuevos.
- Bluetooth y GPS: sin impacto.

**Pruebas tras implementar:** repetir P1–P8 y la regresión; `ng build`; `ng lint` sin errores nuevos; prueba real en Chrome (registrar offline → cerrar → **reabrir con red** → debe sincronizar sola, con toast, y el contador debe desaparecer); y Android en 5.3.

#### Resultado de la tarea 3.1 (2026-09-30)

**Archivos modificados** (solo los autorizados):
- `app/src/app/app.component.ts` (compartido): `void this.network.init().then(() => this.sync.sincronizar('arranque'));` sustituye a `void this.network.init();` y `void this.sync;`. Se añadió una línea al comentario de cabecera. Sin cambios en imports, plantilla, rutas ni providers.
- `app/src/app/core/offline/sync.service.ts`: en `sincronizar()`, `this.sincronizando = true` se activa **antes** del primer `await`, y la lectura de pendientes pasa dentro del `try/finally` existente (el `finally` libera siempre la bandera). Los toasts, `resultado$`, `programarReintento()` y el resto del método no cambian.

**Pruebas con el código real** (Vitest en el scratchpad; se construye el `AppComponent` real, cuyo constructor ejecuta el arranque, con el `SyncService`, `MovimientosService`, `OfflineStorageService` y `NetworkService` reales; plugin de red, API y toasts simulados):

| Verificación | Caso | Resultado |
|---|---|---|
| 0 pendientes + online → no sincroniza ni muestra aviso | P1 | ✔ |
| Pendientes + online al arrancar → una sola vez | P2 | ✔ 1 envío, todos `sincronizado`, 1 toast |
| Pendientes + offline al arrancar → no intenta; offline → online → una vez | P3 | ✔ 0 envíos al arrancar; 1 al conectar |
| Arranque + reconexión simultáneos → un solo envío | P4 | ✔ 1 envío, 1 toast |
| Dos `sincronizar()` simultáneos → un solo envío | P5 | ✔ |
| Registro durante la sincronización → no se pierde | P6, P7 | ✔ ambos `sincronizado` |
| Error leyendo pendientes → la bandera se libera | P8 | ✔ la siguiente sync envía |
| Regresión Fase 1 (6) + 2.1 (10) + 2.2 (3) | — | ✔ |

Total: **27/27 en verde**.

**Build y lint:** `ng build` OK. `ng lint`: 21 errores, **todos preexistentes**; `app.component.ts` y `sync.service.ts` tienen 0 errores antes y después del cambio. **Errores nuevos: 0.**

**Prueba real en Chrome** (app compilada tras el cambio, Chrome headless por CDP, IndexedDB real; mismo método que en 2.3):
1. Sesión 1: offline (emulación de DevTools) → registrar 2 movimientos → contador "2", IndexedDB con ambos `pendiente` → cerrar el navegador por completo.
2. Sesión 2: reabrir **con conexión**, sin ninguna emulación ni forzado → al cargar se ven los 2 pendientes; enseguida aparece el toast "Sincronización completada: 2 movimientos enviados al servidor.", el contador desaparece, quedan 0 etiquetas e IndexedDB tiene los 5 `sincronizado`.
3. Consola de la página: **un único** "SyncService: enviando 2 pendiente(s) · origen: arranque" (esperando 3 s más, no hubo un segundo envío).
- Captura `3_reabierta_con_red_sincronizada` en el scratchpad (fuera del repo). El servidor sigue siendo el simulado.

**Pendiente:** confirmar en Android (5.3). El caso "registrar con red justo antes de que la sync lea los pendientes" puede enviar un movimiento dos veces sin perder datos; es el hueco 5, tarea **3.4**, y no se tocó.

#### Análisis de la tarea 3.2 (2026-09-30), sin modificar código

**1. Qué pasa hoy al ir a segundo plano y volver** (leído en el código nativo instalado):
- `@capacitor/android` → `Bridge.onPause()` llama `handleOnPause()` de cada plugin. Como el proyecto incluye un plugin Cordova (`cordova-plugin-bluetoothle`), también llama `MockCordovaWebViewImpl.handlePause(keepRunning)`. Con `KeepRunning` en su valor por defecto (`true`), **no pausa los temporizadores JS** (`pauseTimers()` solo se llama si `keepRunning` es `false`). El reintento de `SyncService` (`setTimeout`) sigue vivo; Android puede retrasarlo, pero no lo anula.
- `AppComponent` **no** se reconstruye al reanudar; la sincronización de arranque (3.1) solo corre si Android mató el proceso y la app se abre de cero, y en ese caso sí cubre los pendientes.

**2. Qué aporta `@capacitor/network` 8.0.1 (Android):**
- `handleOnPause`: guarda el estado previo y **detiene** el monitoreo (no llegan eventos en segundo plano).
- `handleOnResume`: vuelve a registrar `registerDefaultNetworkCallback`; Android entrega de inmediato `onCapabilitiesChanged` de la red actual → el plugin emite `networkStatusChange` con el estado real. Además, si al volver está desconectado y antes no, lo notifica explícitamente.

**3. Offline al pausar → online al volver:** el plugin emite `connected: true` → `NetworkService.isOnline$` pasa de `false` a `true` → `SyncService` detecta la transición y sincroniza. **Cubierto sin código nuevo** (R1).

**4. Online al pausar → online al volver:** el plugin emite `connected: true` otra vez; `distinctUntilChanged` lo filtra y **no hay sincronización** (R2). Es lo correcto si no hay pendientes.

**5. ¿Puede haber pendientes en ese caso?** Solo si se crearon **estando online**:
- Por **fallo de envío** (`registrar()` o `sincronizar()` fallidos): siempre dejan programado el **reintento**, que sigue funcionando en segundo plano o al volver → se envían (R4, con 6 s de espera real).
- Por **Bluetooth** (`BleReceptorService.aceptar()` guarda `pendiente` sin avisar a `SyncService`): quedan pendientes **con o sin segundo plano** (R5). No es un problema de la reanudación, es el **hueco 6 → tarea 3.5**.
- Si Android mata el proceso en segundo plano, al volver la app arranca de cero y **3.1** los envía.

**6. Reutilización:** si 5.3 demostrara un hueco real en Android, se cubriría llamando al mismo `sync.sincronizar('reanudar')` al recibir `App.addListener('resume')` de `@capacitor/app` (ya instalado y sincronizado en Android, sin instalar nada). La bandera de 3.1 evita el doble envío. Archivo previsto: `core/offline/sync.service.ts` (o `app.component.ts`). **No se propone hacerlo ahora**: duplicaría el disparo que ya hace el plugin, y 3.5 cubre el caso general.

**7. Decisión:** **3.2 no requiere implementación.** Cierre confirmado por el usuario el 2026-09-30, con la condición de confirmarlo en Android (5.3).

**Simulación** (Vitest en el scratchpad; `AppComponent`, `NetworkService`, `SyncService`, `MovimientosService` y `OfflineStorageService` **reales**; se emula el evento que emite el plugin Android al reanudar):

| Caso | Resultado |
|---|---|
| R1 · pausa offline con pendiente → vuelve online | ✔ 1 envío por la transición existente; todo `sincronizado` |
| R2 · online → online sin pendientes | ✔ ningún envío |
| R3 · online → vuelve offline → registra → online | ✔ 1 envío al reconectar |
| R4 · online → online con pendiente por fallo de envío | ✔ el evento no dispara nada, pero el **reintento** existente lo envía (~6 s) |
| R5 · online → online con pendiente recibido por BLE | queda `pendiente` → es el **hueco 6 / 3.5**, no depende de la reanudación |

Regresión: 27/27 anteriores ✔. Total: **32/32**. Qué es simulado: el evento del plugin y la API; la lectura del código nativo es del paquete instalado, no de una ejecución en Android.

**8. Pruebas en Android para confirmar (5.3):**
1. Registrar offline (modo avión) → Home → desactivar modo avión → volver a la app → debe sincronizar sola, con el toast, y el contador debe desaparecer.
2. Con red: app a segundo plano → activar modo avión → volver → píldora OFFLINE y banner.
3. Con red y `simularFallo = true` → registrar (queda pendiente) → poner `simularFallo = false` → segundo plano 30 s → volver → pendiente enviado por el reintento.
4. Con red → segundo plano → volver → sin toasts ni envíos extra (Logcat/`chrome://inspect`: sin "SyncService: enviando").
5. Registrar offline → cerrar la app desde "recientes" → activar la red → abrir → sincroniza por 3.1.
6. Registrar offline → segundo plano **largo** (o "No mantener actividades" en Opciones de desarrollador) → activar la red → volver → sincroniza (por 3.1 si el proceso murió, o por la transición si no).

#### Análisis de la tarea 3.3 (2026-09-30), sin modificar código

**Diagnóstico del comportamiento actual** (`core/offline/sync.service.ts`):
1. `programarReintento()` (público) cancela el temporizador anterior y programa **uno nuevo, siempre a 6 s** (`REINTENTO_SYNC_MS`, en `mensajes.ts`). Ya garantiza **un solo temporizador**, pero sin espera creciente ni contador.
2. El toast de error (`MENSAJES.toastSyncError`, ámbar) se muestra en **dos sitios**: en el `catch` de `SyncService.sincronizar()` (**en cada fallo**) y en el `catch` de `MovimientosService.registrar()` (fallo al enviar con red), que después llama a `sync.programarReintento()`.
3. **Racha de fallos:** cada fallo → toast + reintento a 6 s → nuevo fallo → toast… **indefinidamente**. Con el servidor simulado (900 ms) hay un toast ámbar cada ~7 s. Confirmado: 5 fallos → 5 toasts, reintento fijo de 6 s y el temporizador sigue vivo (prueba ACT).
4. Además, un éxito **no cancela** un reintento ya programado (dispara después sin pendientes; es inofensivo, pero innecesario).
5. Sin pendientes → `return 0` dentro del `try` → no hay toast ni reintento (correcto).
6. Si el reintento dispara sin red, `sincronizar()` devuelve 0 sin reprogramar; la cadena se retoma con la reconexión. Si dispara mientras otra sync está en curso (bandera de 3.1), devuelve 0 y el resultado de la sync en curso decide (si falla, reprograma).

**Propuesta técnica** — un solo archivo: `core/offline/sync.service.ts`.
- **Estado nuevo:** `private fallosSeguidos = 0` (0 = sin racha) y la constante `REINTENTO_MAX_MS = 60000` (local en `sync.service.ts`, para no tocar `mensajes.ts`; alternativa equivalente: ponerla junto a `REINTENTO_SYNC_MS` en `mensajes.ts`).
- **`programarReintento()`** (misma firma pública): **cuenta el fallo** (`fallosSeguidos++`) y espera `min(6000 · 2^(fallosSeguidos − 1), 60000)` → **6 s, 12 s, 24 s, 48 s, 60 s, 60 s…** Sigue cancelando el temporizador anterior (uno solo a la vez) y limpia la referencia al disparar.
- **Toast solo al inicio de la racha:** en el `catch` de `sincronizar()`, se muestra el toast **solo si `fallosSeguidos === 0`** antes de llamar a `programarReintento()`. Como `registrar()` también llama a `programarReintento()`, su fallo ya cuenta como inicio de racha: los reintentos siguientes **no repiten** el toast, y **no hace falta tocar `MovimientosService`**.
- **Fin de racha** (método privado `terminarRacha()`): `fallosSeguidos = 0` y cancelar el temporizador pendiente. Se llama tras un **envío correcto** y cuando **no hay pendientes** (la cola vacía significa que no hay nada que pueda fallar; por ejemplo, otro camino ya los envió).
- **Sin cambios en:** la bandera de 3.1, `resultado$` (sigue emitiendo cada intento), los toasts de éxito, la lógica de arranque/reconexión y los textos de `mensajes.ts`.

**Respuestas concretas:**
- *Otra sync mientras hay un reintento pendiente* (reconexión, arranque, manual): se ejecuta de inmediato. Si funciona → `terminarRacha()` cancela el reintento. Si falla → `programarReintento()` cancela el anterior y programa **uno** con la siguiente espera, sin toast.
- *Varios temporizadores:* imposible, porque `programarReintento()` siempre hace `clearTimeout` antes de `setTimeout`, y la bandera de 3.1 impide dos `sincronizar()` a la vez.
- *Impacto en 3.1 y reconexión:* ninguno funcional. Un fallo en el arranque o en la reconexión inicia la racha (toast + 6 s) igual que hoy; si ya había racha, no repite el toast y usa la siguiente espera.

**Riesgos y efectos secundarios:**
- **Racha que sobrevive a una desconexión:** si falla, se pierde la red y al volver falla otra vez, no se vuelve a mostrar el toast (sigue la misma racha, tal como pide la especificación: solo se reinicia con éxito). El banner offline/online sí informa del cambio de red. Alternativa, si se prefiere: reiniciar también la racha al perder la conexión (una línea más). **No se propone** salvo que lo pidas.
- **Espera máxima de 60 s:** con el servidor caído mucho tiempo, un pendiente puede tardar hasta 60 s en enviarse tras recuperarse el servidor. La reconexión y el arranque siguen enviando al instante.
- **`registrar()` sigue mostrando su propio toast** de error en cada registro fallido con red (no se toca `MovimientosService`). Pasa a ser el único toast de su racha. La unificación del envío es la tarea 3.4.
- La prueba manual del escenario D (fallo de sincronización) mostrará **un** toast en lugar de uno cada 6 s; las capturas del prototipo que muestran el toast no cambian.

**Simulación** (Vitest con **temporizadores falsos** en el scratchpad; la propuesta se probó en una **copia** de `SyncService` con `MovimientosService` y `OfflineStorageService` reales; el proyecto no se modificó; cada espera se comprueba al milisegundo: sin intento a `ms − 1` y con intento a `ms`):

| Caso | Resultado |
|---|---|
| ACT · código actual, racha de 5 fallos | ✘ reintento fijo de 6 s, **5 toasts**, sigue indefinidamente |
| F1–F5 · fallos seguidos | ✔ esperas exactas de 6 → 12 → 24 → 48 → 60 → 60 s; **1 toast** en total; 1 temporizador |
| F6 · éxito tras varios fallos | ✔ `sincronizado`, toast de éxito, **0 temporizadores** |
| F7 · tras un éxito, falla `registrar()` y sus reintentos | ✔ la racha empieza de nuevo en 6 s; solo el toast de `registrar()` |
| F7b · tras un éxito, falla `sincronizar()` | ✔ **toast de nuevo** y vuelta a 6 s |
| F8 · dos `sincronizar()` simultáneos que fallan | ✔ 1 envío, 1 temporizador, 1 toast |
| F9 · sin pendientes | ✔ sin envío, sin temporizador, sin toast |
| F10 · reconexión con reintento pendiente que funciona | ✔ 1 envío extra; el reintento se cancela; nada más en 120 s |
| F10b · reconexión con reintento pendiente que vuelve a fallar | ✔ un solo temporizador (12 s), sin toast |
| F11 · `registrar()` con red falla + 2 reintentos fallan | ✔ **1 toast** en total |

Regresión (Fase 1, 2.1, 2.2, 3.1, 3.2): ✔. Total: **42/42**.

**Pruebas previstas tras implementar:** repetir F1–F11 contra el `SyncService` real y la regresión completa; `ng build`; `ng lint` sin errores nuevos; prueba real en Chrome con `simularFallo = true` (un solo toast ámbar; en consola, los intentos aparecen a 6/12/24 s) y luego `simularFallo = false` (se envía en el siguiente reintento y aparece el toast de éxito).

#### Resultado de la tarea 3.3 (2026-09-30)

**Archivo modificado** (único autorizado): `app/src/app/core/offline/sync.service.ts`.
- Constante `REINTENTO_MAX_MS = 60000` y campo privado `fallosSeguidos = 0`.
- `programarReintento()` (misma firma pública): suma el fallo y espera `min(6000 · 2^(fallosSeguidos − 1), 60000)` → 6 s, 12 s, 24 s, 48 s y 60 s como máximo. Cancela el temporizador anterior (uno solo a la vez) y limpia la referencia al disparar.
- En el `catch` de `sincronizar()`, el toast de error solo se muestra si `fallosSeguidos === 0` (inicio de racha).
- Nuevo método privado `terminarRacha()` (pone el contador a 0 y cancela el reintento pendiente), llamado tras un envío correcto y cuando no hay pendientes.
- Se mantienen la bandera `sincronizando` de 3.1, el `try/finally`, `resultado$`, los toasts de éxito, el arranque y la reconexión. El código es idéntico a la copia validada en el análisis (salvo una línea de comentario).
- Sin cambios en `MovimientosService` (su toast y su llamada a `programarReintento()` siguen igual; se revisarán en 3.4), `mensajes.ts`, `app.component.ts`, `network.service.ts` ni `offline-storage.service.ts`.

**Pruebas con el `SyncService` REAL** (Vitest con temporizadores falsos; cada espera se comprueba al milisegundo):

| Verificación | Caso | Resultado |
|---|---|---|
| 6 → 12 → 24 → 48 → 60 → 60 s; un solo toast; un solo temporizador | F1–F5 | ✔ |
| Un éxito cancela el temporizador y reinicia la racha | F6 | ✔ 0 temporizadores |
| Nuevo fallo tras un éxito → vuelve a 6 s (vía `registrar()`) | F7 | ✔ |
| Nuevo fallo de `sincronizar()` tras un éxito → toast de nuevo y 6 s | F7b | ✔ |
| Dos sincronizaciones simultáneas → sin duplicados | F8 | ✔ 1 envío, 1 temporizador, 1 toast |
| Sin pendientes → sin reintento | F9 | ✔ |
| Reconexión con reintento pendiente → no crea dos temporizadores | F10, F10b | ✔ (éxito: se cancela; fallo: 1 temporizador a 12 s) |
| `registrar()` falla + reintentos fallan → un solo toast | F11 | ✔ |
| Regresión Fase 1, 2.1, 2.2, 3.1, 3.2 | — | ✔ 32/32 |

Total: **41/41 en verde**.

**Build y lint:** `ng build` OK. `ng lint`: 21 errores, **todos preexistentes**; `sync.service.ts` tiene 0 errores antes y después. **Errores nuevos: 0.**

**Prueba real en Chrome** (build de **desarrollo** compilado en el scratchpad con `--output-path`, sin tocar `app/www`; Chrome headless por CDP; `simularFallo` activado y desactivado desde la API de depuración de Angular sobre la instancia real de `ApiService`):
1. Sin red se registran 2 movimientos → contador "2".
2. `simularFallo = true` y vuelve la red → la reconexión falla y se reintenta sola.
3. Esperas medidas en la consola (del fallo al siguiente envío): **6,4 s** (6 s + el toast del primer fallo), **12,0 s**, **24,0 s**, **48,0 s**. Estado interno tras 4 fallos: `fallosSeguidos = 4`, un temporizador activo.
4. Toasts desde la reconexión: **un solo** toast ámbar de error durante los 4 fallos.
5. `simularFallo = false` → el siguiente reintento (a los 48 s) sincroniza → toast "Sincronización completada: 2 movimientos enviados al servidor.", el contador desaparece, `fallosSeguidos = 0` y **ningún temporizador**.
6. 65 s de espera adicional: **0 envíos extra**.
- Capturas `1_racha_de_fallos` y `2_exito_tras_reintento` en el scratchpad (fuera del repo). El servidor sigue siendo el simulado.

**Pendiente:** confirmar en Android (5.3). El toast propio de `registrar()` al fallar con red se mantiene hasta la tarea 3.4.

#### Análisis de la tarea 3.4 (2026-09-30), sin modificar código

**Flujo actual de `MovimientosService.registrar()`:**
1. Crea el movimiento con `id` UUID y `estado: 'pendiente'`.
2. `await storage.agregar(mov)` → pasa por la cola de escrituras de 2.1. Desde que se persiste, **el movimiento es visible como pendiente** para cualquiera que lea `storage.pendientes()`.
3. **Sin red:** toast "guardado en tu teléfono" y termina; queda para `SyncService` (reconexión, arranque o reintento).
4. **Con red:** `await api.enviarMovimientos([mov])` → `marcarSincronizados([id])` → toast "Movimiento enviado al servidor.". Si falla: toast de error + `sync.programarReintento()` (que con 3.3 inicia o continúa la racha).
5. `registrar()` **no consulta ni usa** la bandera `sincronizando` de `SyncService`, que solo protege a `sincronizar()` de sí misma.

**Escenario exacto del duplicado** (confirmado con el código actual):
- `registrar()` ya guardó M y **está esperando la respuesta** de `enviarMovimientos([M])` (ventana de ~900 ms con el servidor simulado).
- En ese intervalo empieza `sincronizar()`, disparado por el **reintento** de 3.3 (servidor inestable), por la **sincronización de arranque** de 3.1 (registro justo al abrir la app) o por una llamada manual. La reconexión no aplica: si hubo reconexión, `registrar()` habría seguido el camino offline.
- `sincronizar()` lee los pendientes: M sigue `pendiente` (todavía no se ha marcado) → envía `[…, M]`. **M sale dos veces a la vez**, y aparecen dos toasts: "Movimiento enviado…" y "Sincronización completada: N…", con un N que cuenta M.
- El caso inverso (la sync ya leyó los pendientes antes de que M se guardara) **no** duplica: M no estaba en su lista.
- Consecuencia: **no se pierden datos** (con la cola de 2.1 ambos acaban marcando `sincronizado`) y el servidor lo deduplica por `id`, pero hay tráfico doble, un conteo del toast engañoso y, si la API real (Ángel) no fuera idempotente, **registros duplicados en el backend**.

**Alternativas evaluadas:**

| Opción | Descripción | Veredicto |
|---|---|---|
| A · No hacer nada | Confiar en la idempotencia por `id` del servidor | Descartada: depende del backend y deja el toast engañoso |
| B · `registrar()` delega todo en `SyncService` | Tras guardar, llamar `sync.sincronizar('registro')` | **Descartada**: si ya hay una sync en curso, la bandera hace que devuelva 0 y M esperaría al siguiente disparo (hasta 60 s con 3.3); habría que añadir un "volver a sincronizar al terminar"; además cambia los toasts ("Movimiento enviado…" pasaría a "Sincronización completada: N…") y el envío de uno pasaría a ser por lotes. Es más invasiva |
| C · `registrar()` no envía si hay una sync en curso | Consultar la bandera | Descartada: si la sync leyó los pendientes antes de guardar M, M no se envía hasta otro disparo |
| D · Marcar el movimiento como "enviando" en el almacenamiento | Nuevo estado en el modelo | Descartada: cambia el modelo y el formato guardado (afecta a BLE y a Kilsy) |
| **E · "Ids en vuelo" en memoria** | Un `Set` en `SyncService` con los ids que se están enviando; tanto `sincronizar()` como `registrar()` reservan antes de enviar y liberan al terminar | **Recomendada**: cambio pequeño, sin tocar el modelo, el almacenamiento ni los toasts |

**Solución recomendada (E):**
- `core/offline/sync.service.ts`:
  - campo privado `enVuelo = new Set<string>()`;
  - métodos públicos `reservarEnvio(ids): string[]` (reserva y devuelve solo los ids que nadie está enviando) y `liberarEnvio(ids)`;
  - en `sincronizar()`: tras leer los pendientes, si la cola está vacía → `terminarRacha()` como ahora; si no, se reservan y **solo se envían los reservados**. Si todos los está enviando `registrar()`, se devuelve 0 **sin** tocar la racha ni el temporizador de 3.3. `finally` libera los ids reservados. El toast y `resultado$` cuentan solo lo enviado.
- `core/offline/movimientos.service.ts` (camino con red de `registrar()`): antes de `enviarMovimientos([mov])`, `sync.reservarEnvio([mov.id])`. Si no se puede reservar (una sync ya lo lleva), no lo envía otra vez y termina (el toast de esa sync lo anuncia). `finally { sync.liberarEnvio([mov.id]) }`. Los toasts y la llamada a `programarReintento()` **no cambian**.
- Sin cambios en: `OfflineStorageService`, `ApiService`, el modelo, `mensajes.ts`, `app.component.ts`, `network.service.ts`, BLE ni módulos de otros.

**Qué se conserva:**
- Toasts: "Movimiento enviado al servidor." (registro con red), "guardado en tu teléfono" (sin red), error de `registrar()`, y en la sync el toast de éxito con el **N real enviado** y el de error solo al inicio de la racha (3.3).
- `resultado$`: igual, con `enviados` = lo realmente enviado.
- Contador de pendientes (2.2): igual; depende solo del `estado` guardado.
- Reintentos (3.3): igual, incluido que el fallo de `registrar()` inicia la racha (verificado: 1 toast, reintentos a 6 s y 12 s).
- Bandera de 3.1: igual; `enVuelo` es independiente y se libera en `finally`.

**Impacto en 3.1, 3.2 y 3.3:** 3.1 → el registro al abrir la app ya no se duplica con la sync de arranque (D9); 3.2 → sin cambios (no depende del envío); 3.3 → sin cambios (prueba "3.3 intacto").

**Riesgos:**
- Si una sync ya reservó M, `registrar()` termina **sin toast propio**; el aviso llega con el toast de la sync ("Sincronización completada: N…"). Es un caso de milisegundos.
- `enVuelo` vive en memoria: si la app muere a mitad de un envío, se pierde, lo cual es correcto porque el movimiento sigue `pendiente` y se reenvía al arrancar (3.1).
- `SyncService` gana dos métodos públicos. Es un cambio pequeño de API interna del módulo; nadie fuera de `core/offline` los usa.

**Simulación** (Vitest en el scratchpad; código **actual** frente a **copias** de `SyncService` y `MovimientosService` con la propuesta; `OfflineStorageService` real; el mock de la API detecta cualquier id enviado mientras ya estaba en vuelo):

| Caso | Actual | Propuesta |
|---|---|---|
| ACT-D4 · la sync empieza mientras `registrar()` envía M | ✘ **M enviado 2 veces a la vez**; toasts "enviado" y "Sincronización completada: 1" | — |
| ACT-D4b · igual, con P1 pendiente | ✘ la sync envía `[P1, M]` mientras `registrar()` envía `[M]` | — |
| D1 · registrar con red, sin sync | — | ✔ 1 envío, toast "enviado", `sincronizado` |
| D2 · registrar sin red → reconexión | — | ✔ toast "guardado", pendiente; 1 envío al reconectar |
| D3 · registrar mientras la sync envía P1 | — | ✔ `[P1]` y `[M]`, sin duplicados |
| D4 · la sync empieza mientras `registrar()` envía M | — | ✔ la sync devuelve 0 y **no** reenvía M; solo toast "enviado" |
| D4b · igual, con P1 pendiente | — | ✔ la sync envía solo `[P1]` (toast "…: 1"); `registrar()` envía `[M]` |
| D5 · 5 registros rápidos + sync en medio | — | ✔ cada id una vez, los 5 `sincronizado` |
| D6 · falla el envío directo | — | ✔ 1 toast de error; el reintento lo envía una vez; sin toast repetido |
| D7 · falla la sync de P1 mientras `registrar()` envía M | — | ✔ M `sincronizado`; P1 reintentado y enviado; sin duplicados |
| D8 · reconexión con pendientes + registro inmediato | — | ✔ P1, P2 y M una vez cada uno |
| D9/D10 · registro al arrancar (retrasos 0/5/20/60 ms) | ✘ duplicado con retrasos de 5, 20 y 60 ms | ✔ sin duplicados ni pérdidas en los 4 |
| 3.3 intacto · fallo de `registrar()` + reintentos fallidos | — | ✔ 1 toast; reintentos a 6 s y 12 s |

Regresión del resto (Fase 1, 2.1, 2.2, 3.1, 3.2, 3.3 con el código real): ✔. Total: **55/55**. Nota: la regresión de 3.1 y 3.3 corre contra el código real actual; tras implementar se repetirá completa contra el código modificado.

**Archivos que se modificarían:** `app/src/app/core/offline/sync.service.ts` y `app/src/app/core/offline/movimientos.service.ts` (ambos de mi módulo; ninguno compartido).

**Pruebas tras implementar:** D1–D10 y "3.3 intacto" contra el código real; regresión completa (Fase 1, 2.1, 2.2, 3.1 P1–P8, 3.2 R1–R5, 3.3 F1–F11); `ng build`; `ng lint` sin errores nuevos; prueba real en Chrome (build de desarrollo): con `simularFallo` activo para que haya reintentos, registrar un movimiento justo cuando dispara un reintento y comprobar en consola que ningún id se envía dos veces a la vez.

#### Resultado de la tarea 3.4 (2026-09-30)

**Archivos modificados** (solo los dos autorizados; ambos idénticos a las copias validadas en el análisis):
- `app/src/app/core/offline/sync.service.ts`:
  - campo privado `enVuelo = new Set<string>()`;
  - métodos públicos `reservarEnvio(ids): string[]` (reserva y devuelve los ids que nadie está enviando) y `liberarEnvio(ids)`;
  - en `sincronizar()`: tras leer los pendientes, si la cola está vacía → `terminarRacha()` como antes; si no, se reservan y **solo se envían los reservados**; si todos los está enviando `registrar()`, devuelve 0 sin tocar la racha ni el temporizador de 3.3; el `finally` libera los reservados además de la bandera de 3.1. El toast de éxito y `resultado$` cuentan solo lo enviado.
- `app/src/app/core/offline/movimientos.service.ts` (camino con red de `registrar()`): antes de `enviarMovimientos([mov])` se llama `sync.reservarEnvio([mov.id])`; si no se puede reservar (una sync ya lo lleva), no lo reenvía y termina; `finally { sync.liberarEnvio([mov.id]) }`. Los toasts y `programarReintento()` no cambian.
- Sin cambios en `OfflineStorageService` (2.1), el modelo, `mensajes.ts`, `app.component.ts`, `network.service.ts`, Bluetooth, GPS ni módulos de otros.

**Pruebas con el código REAL** (Vitest en el scratchpad; `SyncService`, `MovimientosService` y `OfflineStorageService` reales; el mock de la API detecta cualquier id enviado mientras ya estaba en vuelo):

| Caso | Resultado |
|---|---|
| D1 · registrar con red, sin sync | ✔ 1 envío; toast "Movimiento enviado al servidor." |
| D2 · registrar sin red → reconexión | ✔ pendiente + toast "guardado"; 1 envío al reconectar |
| D3 · registrar mientras la sync envía P1 | ✔ ambos `sincronizado`; ningún duplicado |
| D4 / D4b · la sync empieza mientras `registrar()` envía M | ✔ M se envía una sola vez; con P1 pendiente la sync envía solo `[P1]` |
| D5 · 5 registros rápidos + sync en medio | ✔ cada id una vez; los 5 `sincronizado` |
| D6 · falla el envío directo | ✔ queda pendiente; 1 toast de error; el reintento (6 s) lo envía una vez |
| D7 · falla la sync | ✔ sin duplicados; P1 queda pendiente y se envía en el reintento |
| D8 · reconexión con pendientes + registro inmediato | ✔ cada id una vez |
| D9/D10 · registrar al arrancar (retrasos 0/5/20/60 ms) | ✔ sin duplicados ni pérdidas (con el código anterior había duplicado con 5, 20 y 60 ms) |
| 3.3 intacto · fallo de `registrar()` + reintentos fallidos | ✔ 1 toast; reintentos a 6 s y 12 s |
| Regresión: Fase 1 (6), 2.1 (10), 2.2 (3), 3.1 P1–P8 (8), 3.2 R1–R5 (5), 3.3 F1–F11 (9) | ✔ (incluye: éxito cancela el temporizador, un toast por racha, bandera de 3.1) |

Total: **52/52 en verde**.

**Build y lint:** `ng build` OK. `ng lint`: 21 errores, **todos preexistentes**; `sync.service.ts` y `movimientos.service.ts` tienen 0 errores antes y después. **Errores nuevos: 0.**

**Prueba real en Chrome** (build de **desarrollo** compilado en el scratchpad con `--output-path`; Chrome headless por CDP; la instancia real de `ApiService` se envolvió **en memoria**, desde la API de depuración de Angular, para detectar ids enviados mientras ya estaban en vuelo; **ningún cambio de prueba en el repositorio**):

| Caso | Qué se hizo | Resultado |
|---|---|---|
| A | Registrar M1 por la interfaz y llamar `sincronizar()` 200 ms después | La sync devolvió 0; envíos `[M1]`; 1 toast "enviado"; **0 solapes** |
| B | P1 pendiente por un fallo (reintento a 6 s), registrar M2 y sincronizar durante su envío | Envíos `[M2]` y `[P1]`; toasts "enviado" y "Sincronización completada: 1…"; al llegar los 6 s, ningún envío extra; **0 solapes** |
| C | 5 registros simultáneos + `sincronizar()` en medio | La sync devolvió 0; 5 envíos de un id cada uno; los 5 `sincronizado`; **0 solapes** |
| D | El **reintento real** de 3.3 dispara mientras `registrar()` envía M3 | El reintento envió solo `[P2]`; M3 enviado una vez por `registrar()`; **0 solapes** |

En todos los casos, al terminar: `enVuelo` vacío, sin temporizador, `fallosSeguidos = 0`, contador de pendientes oculto. Capturas `1_caso_B` y `2_caso_D` en el scratchpad (fuera del repo). El servidor sigue siendo el simulado.

**Pendiente para Android (5.3):** repetir en el dispositivo el registro con red mientras hay un reintento en curso (con `simularFallo` en una build de pruebas) y confirmar en `chrome://inspect` que ningún id aparece en dos envíos simultáneos.

#### Resultado de la tarea 3.5 (2026-09-30) — análisis e implementación en una sola ejecución

**Qué se encontró (hueco confirmado):**
- `BleReceptorService.aceptar()` (módulo Compartir) guarda el movimiento recibido con `storage.agregar()` como `pendiente` (id nuevo con `generarId()`), responde al emisor y termina. **No avisa a `SyncService`** ni existe ningún otro mecanismo que lo haga. Su comentario dice que "SyncService lo sube al servidor igual que uno registrado a mano", pero eso solo ocurría con una reconexión, un arranque (3.1) o un reintento (3.3) ya programado.
- Con la app en línea, un movimiento aceptado por Bluetooth quedaba **pendiente indefinidamente** hasta el siguiente de esos eventos (caso R5 de 3.2).

**Qué se modificó** — solo `app/src/app/core/offline/sync.service.ts`; **no** se tocó el módulo Bluetooth (`core/compartir/*`, `features/compartir/*`), ni `OfflineStorageService`, `MovimientosService`, el modelo, `mensajes.ts` ni otros módulos:
1. **Observador de pendientes nuevos** (en el constructor): tras la carga inicial del almacenamiento (`storage.todos()`, para no tomar lo guardado como nuevo), se observa `storage.movimientos$` → número de pendientes → `pairwise` → solo cuando **aumenta** → `debounceTime(300 ms)` → si **no hay racha de fallos** (`fallosSeguidos === 0`), `sincronizar('pendientes nuevos')`.
   - La pausa de 300 ms (`ESPERA_PENDIENTES_NUEVOS_MS`) agrupa varios seguidos y deja que `registrar()` reserve primero su propio envío (3.4), así que el registro normal con red sigue igual: un solo envío directo y el toast "Movimiento enviado al servidor.".
   - Con una racha activa, se respeta el backoff: el reintento de 3.3 incluye el pendiente nuevo, sin intentos extra.
   - Sin conexión, `sincronizar()` no hace nada; lo enviará la reconexión.
2. **Segunda vuelta tras un envío correcto:** si al terminar quedan pendientes que no están en vuelo (p. ej. llegó uno por Bluetooth mientras se enviaba y su aviso chocó con la bandera de 3.1), se programa `sincronizar('pendientes nuevos')` en cuanto se libera la bandera.
3. Comentario de cabecera actualizado (reintento creciente y pendientes nuevos).
- Se conservan: la cola de escrituras de 2.1, la bandera y el arranque de 3.1, el backoff y el control de toasts de 3.3, y `enVuelo` de 3.4.

**Pruebas con código REAL** (Vitest en el scratchpad; `BleReceptorService.aceptar()`, `OfflineStorageService`, `SyncService`, `MovimientosService` y `AppComponent` reales; se simulan el periférico BLE nativo, la red, la API y los toasts; la API detecta ids enviados mientras ya estaban en vuelo):

| Caso | Resultado |
|---|---|
| B1 · BLE recibido sin conexión | ✔ queda `pendiente`; sin intentos de envío; respuesta al emisor intacta |
| B2 · BLE recibido con conexión | ✔ entra solo en la sincronización: 1 envío, `sincronizado`, toast "Sincronización completada: 1…" |
| B3 · BLE pendiente + reconexión | ✔ 1 envío |
| B4 · BLE pendiente guardado + arranque con red (3.1, `AppComponent` real) | ✔ 1 envío (sin doble disparo con el observador) |
| B5 · BLE durante una racha de fallos (3.3) | ✔ ningún intento extra; el reintento de 6 s envía `[P1, BT1]` sin duplicar; 1 toast de error |
| B6 · BLE recibido mientras la sync envía otros | ✔ segunda vuelta: los 3 enviados una vez, ninguno perdido |
| B7 · `enVuelo` (3.4): `registrar()` en vuelo + BLE a la vez | ✔ cada id una vez; toast "enviado" intacto |
| B8 · registro normal con servidor lento (900 ms) | ✔ sin cambios: solo el envío directo y su toast |
| B9 · el mismo movimiento BLE dos veces | ✔ "duplicado"; un solo envío |
| Regresión: Fase 1 (6), 2.1 (10), 2.2 (3), 3.1 (8), 3.2 (5), 3.3 (9), 3.4 (11) | ✔ |

Total: **61/61 en verde**. El caso **R5** de 3.2, que documentaba este hueco ("queda pendiente"), se actualizó a la nueva expectativa: se sincroniza una vez.

**Build y lint:** `ng build` OK. `ng lint`: 21 errores, **todos preexistentes**; `sync.service.ts` tiene 0 errores antes y después. **Errores nuevos: 0.**

**Prueba real en Chrome** (build de **desarrollo** en el scratchpad; Chrome headless por CDP; pestaña **Compartir** abierta con el botón real de la barra de pestañas; el movimiento entrante se inyecta en `receptor.entrante$`, que es lo que entregaría la radio BLE ya reensamblado, y se pulsa el **botón real "Aceptar"**; la instancia real de `ApiService` se envolvió en memoria para detectar solapes; **nada de prueba en el repositorio**):

| Caso | Resultado |
|---|---|
| 1 · Aceptar con conexión | Envío `[BT-online]` con origen "pendientes nuevos"; `sincronizado`; toast "Sincronización completada: 1…" |
| 2 · Aceptar sin conexión → reconexión | `BT-offline` queda `pendiente` sin envíos; al volver la red, un envío por "reconexión"; `sincronizado` |
| 3 · Aceptar **mientras** la reconexión envía `[P1, P2]` (`sincronizando = true` en ese momento) | Envíos `[P2, P1]` y luego `[BT-en-medio]` (segunda vuelta); todo `sincronizado` |

En los tres: **0 solapes**; al final `enVuelo` vacío, sin temporizador y `fallosSeguidos = 0`. Capturas `1_bt_con_conexion` y `2_bt_durante_sync` en el scratchpad.

**Limitaciones:**
- En el navegador no hay radio ni periférico BLE: la llegada del mensaje por radio y su reensamblado no se probaron aquí (solo lo que ocurre desde `entrante$`). El toast "No se pudo avisar al otro teléfono…" que aparece en Chrome es el comportamiento **existente** del módulo sin periférico, no un efecto de 3.5.
- El servidor sigue siendo el simulado.

**Pendiente para Android (5.3):** con dos teléfonos reales, (a) aceptar un movimiento con red → debe aparecer "Sincronización completada: 1…" y desaparecer el contador en Inicio; (b) aceptar sin red → pendiente → activar la red → se sincroniza; (c) aceptar mientras hay una sincronización en curso → se envía después, una sola vez (comprobar en `chrome://inspect`).

### FASE 4 — Integración técnica

| # | Tarea | Objetivo | Archivos | Acción | Verificación | Estado |
|---|---|---|---|---|---|---|
| 4.0 | Validación de integración del módulo | Comprobar que Conectividad + Offline + Sync (fases 1–3) funcionan juntos dentro de la app | `app.component.ts`, `core/network/*`, `core/offline/*`, `features/inicio/*` y el flujo de `ble-receptor.service.ts` (solo lectura) | Revisión del código integrado, batería de integración I1–I6, regresión completa y prueba de punta a punta en Chrome. **Sin cambios de código** (no se encontró ningún problema de integración). Ver «Resultado de la Fase 4 (4.0)» | 67/67 automatizadas; 21/21 verificaciones en Chrome real; build OK; 0 errores de lint nuevos | [x] (navegador) · Android en 5.3 |
| 4.1 | Integración con la API REST | Pasar del servidor simulado al real | `core/offline/api.service.ts`, `environments/*` | Acordar con Ángel endpoint, formato e idempotencia por `id`. `ApiService` pasa a delegar en su cliente o se mantiene como único punto de salida | Con `usarServidorSimulado: false` la sync llega al backend | [!] Ángel |
| 4.2 | Integración con CRUD | CRUD y offline sobre el mismo almacenamiento | según el acuerdo 2.4 | Revisar el PR de Kilsy y adaptar solo lo necesario en `core/offline` | Crear/editar/eliminar offline y sincronizar | [!] Kilsy |
| 4.3 | Integración con la interfaz | Consistencia visual del indicador, el contador y los toasts | `core/network/network-status.component.scss`, `theme/conectividad.scss`, `features/inicio/home.page.scss` | Si Francisco define tokens globales, cambiar los colores fijos por esos tokens | Revisión visual con Francisco | [!] Francisco |
| 4.4 | Integración con GPS/Mapa | Comportamiento del mapa sin red | módulo de Félix (no se toca) | Ofrecer `NetworkService.isOnline$` para que el mapa muestre un aviso offline. Si los movimientos guardan ubicación, acordar el cambio de `movimiento.model.ts` | El mapa sin red no rompe la app | [!] Félix |
| 4.5 | Rutas y arranque al integrar módulos | Mantener `app.routes.ts`, `app.component.ts` y `main.ts` coherentes | archivos compartidos | Revisar los PR del equipo; añadir rutas/providers solo cuando llegue cada módulo | `ng build` OK tras cada merge | [ ] Continua: se activa cuando lleguen los PR del equipo (hoy no hay módulos nuevos que integrar) |
| 4.6 | Build y lint limpios | Base estable | — | `npx ng build`, `npx ng lint` | Sin errores. **Estado actual (revalidado en la Fase 4):** build OK; lint con **21 errores previos** (no introducidos por este plan): 19 `prefer-control-flow` en plantillas (`network-status.component.html` 3, `home.page.html` 2, `compartir.page.html` 14 → este último no es mío) y 2 `prefer-inject` (`network.service.ts`, `offline-storage.service.ts`). Corregir solo los de mis archivos, con autorización | [ ] |
| 4.7 | Política de carpetas duplicadas de la raíz | Evitar divergencia entre `detector_red/`, `modo_offline/` y `app/` | — | Solo decidir con el usuario (no borrar). Opción: marcarlas como históricas en su README. Nota: tras 1.2, 2.1, 2.2 y la Fase 3 ya **no** son idénticas a `app/` | Decisión registrada | [ ] |

#### Resultado de la Fase 4 (4.0 — validación de integración) (2026-10-01)

**Qué se revisó:** el código integrado de `AppComponent` (arranque), `NetworkService`, `NetworkStatusComponent`, `OfflineStorageService` (cola de 2.1), `MovimientosService` (registro y reserva de 3.4), `SyncService` (arranque 3.1, reintentos 3.3, `enVuelo` 3.4, pendientes nuevos y segunda vuelta 3.5), el contador de `HomePage` (2.2) y el flujo `BleReceptorService.aceptar()` → almacenamiento → sync (este último solo en lectura).

**Qué se encontró:** **ningún problema de integración.** Todos los disparadores de sincronización (arranque, reconexión, reintento, pendientes nuevos, segunda vuelta, manual) pasan por el mismo `sincronizar()`, protegido por la bandera de 3.1 y por `enVuelo` de 3.4; las escrituras pasan por la cola de 2.1. Se analizó en el código un caso límite teórico: una racha de fallos sin temporizador, que bloquearía el disparo de "pendientes nuevos" hasta la siguiente reconexión, arranque o fallo. Solo se alcanzaría con una coincidencia de milisegundos entre un reintento, una sync filtrada y un registro en vuelo cuyos pendientes ya se hubieran enviado; no se reprodujo en ninguna prueba y se resuelve solo en el siguiente evento. Se documenta y **no se cambia código**.

**Qué se modificó:** **nada** en el código de la app durante la Fase 4.

**Pruebas automatizadas** (Vitest en el scratchpad, código real):
- Nueva batería de **integración I1–I6** (`AppComponent` + `NetworkService` real con eventos del plugin simulados + `NetworkStatusComponent` + almacenamiento + `MovimientosService` + `SyncService` + `BleReceptorService`):

| Caso | Resultado |
|---|---|
| I1 · arranque con red y pendientes (manual + BLE) | ✔ init → **una sola** sync de arranque con los 2; contador 0; píldora ONLINE; estado interno limpio |
| I2 · arranque con red sin pendientes | ✔ ningún envío ni toast |
| I3 · online → offline (manual + BLE pendientes; contador 2; píldora OFFLINE) → online | ✔ una sync de reconexión con los 2; banner de reconexión; contador 0; sin duplicados |
| I4 · cerrar y reabrir (mismo "disco") | ✔ los pendientes sobreviven y se envían una vez al arrancar |
| I5 · servidor caído: registro + BLE durante la racha | ✔ sin intento extra; reintento a 6 s falla, a 12 s funciona y envía los 2; 1 toast de error; sin temporizadores al final |
| I6 · todo a la vez (arranque con pendientes, 3 registros, 2 BLE, parpadeo de red y sync manual) | ✔ los 7 movimientos enviados **exactamente una vez** y `sincronizado`; estable en 3 ejecuciones |

- Regresión completa: Fase 1 (6), 2.1 (10), 2.2 (3), 3.1 (8), 3.2 (5), 3.3 (9), 3.4 (11), 3.5 (9).
- **Total: 67/67 en verde.**

**Build y lint:** `ng build` OK. `ng lint`: **21 errores, todos preexistentes** (los mismos archivos que en el estado inicial: `network-status.component.html`, `network.service.ts`, `offline-storage.service.ts`, `home.page.html`, `compartir.page.html`). **Errores nuevos: 0.**

**Prueba de punta a punta en Chrome real** (build de desarrollo en el scratchpad; Chrome headless por CDP; interfaz real: botón +, alerta, pestañas Inicio/Compartir y botón **Aceptar** de Compartir; IndexedDB real; **cierre completo del navegador** y reapertura con el mismo perfil; la API real se envolvió en memoria para detectar solapes; nada de prueba en el repositorio) — **21/21 verificaciones ✔**:
1. Arranque con red: píldora ONLINE, sin banner ni contador.
2. Registro manual con red: 1 envío directo + toast "enviado".
3. Sin red: píldora OFFLINE + banner offline.
4–6. Registro manual + Bluetooth sin red: contador "2 pendientes", 2 etiquetas, ningún intento de envío, ambos `pendiente` en IndexedDB.
7. Cierre completo del navegador.
8–10. Reapertura con red: **un único** envío "2 pendiente(s) · origen: arranque"; contador oculto; todo `sincronizado` en IndexedDB.
11–14. Servidor caído: registro + Bluetooth durante la racha → sin intento extra, contador 2, **un** toast de error; el reintento de 6 s envía los dos juntos; después, sin temporizador y racha reiniciada.
15–17. Reconexión: banner "Conexión restablecida" + ONLINE, un envío, contador oculto; el banner desaparece a los ~3 s.
18–21. Concurrencia (3 registros + Bluetooth + sync manual): **0 solapes**, cada movimiento enviado exactamente una vez, los 10 movimientos de la prueba `sincronizado` en IndexedDB y estado final limpio (`enVuelo` vacío, sin temporizador).
- Capturas `1_offline_manual_y_bluetooth`, `2_reabierta_sincronizada` y `3_estado_final` en el scratchpad (fuera del repo).
- Al revisar la prueba, la verificación 20 esperaba 9 movimientos por un error de cuenta del propio script; eran 10. Se corrigió el script y se repitió completa: 21/21.

**Limitaciones del navegador:**
- Corte de red **emulado** (DevTools), no modo avión.
- Sin radio BLE: el mensaje entra ya reensamblado en `receptor.entrante$`; desde ahí todo es real. El toast "No se pudo avisar al otro teléfono…" es el comportamiento existente sin periférico.
- Servidor **simulado** (`usarServidorSimulado: true`); el backend real depende de Ángel (4.1).
- `simularFallo` se activó desde la API de depuración de Angular (solo build de desarrollo).
- Segundo plano/reanudación nativa: no aplica en el navegador (3.2).

**Pendiente para Android (5.3)** — validaciones que solo pueden hacerse en el dispositivo:
- Modo avión real (perder y recuperar red) con el indicador, el contador y la sincronización.
- Cierre forzado desde "recientes", reinicio del teléfono y reapertura (persistencia en IndexedDB del WebView).
- Segundo plano/reanudación (casos 1–6 de 3.2).
- Reintento con el servidor caído y racha (3.3); registro con red durante un reintento (3.4).
- Bluetooth real entre dos teléfonos (3.5): aceptar con y sin red, y durante una sync.
- Permiso `ACCESS_NETWORK_STATE` en el manifiesto fusionado (5.4).

**Estado de la Fase 4:** la **validación de integración de mi módulo (4.0) está completa en navegador**. La fase **no se marca como completada** porque 4.1–4.4 dependen de Ángel, Kilsy, Francisco y Félix, 4.5 se activa con los PR del equipo, y 4.6 (corregir los errores de lint de mis archivos) y 4.7 (política de carpetas duplicadas) esperan tu decisión.

### FASE 5 — Pruebas y validación

| # | Tarea | Objetivo | Archivos | Acción | Verificación | Estado |
|---|---|---|---|---|---|---|
| 5.1 | Pruebas unitarias del módulo | Cobertura mínima de la lógica | nuevos `*.spec.ts` junto a `network.service.ts`, `offline-storage.service.ts`, `sync.service.ts`, `movimientos.service.ts`, `home.page.ts` | Vitest con mocks de `@capacitor/network`, `Storage` y `ApiService` (sin instalar paquetes). Base disponible: las pruebas temporales de las fases 1–3 (red, cola de escrituras, contador y arranque) se pueden portar | `npx ng test` en verde | [ ] |
| 5.2 | Pruebas manuales en navegador | Escenarios A–D del diseño | — | DevTools offline/online + `simularFallo`. Ya se hizo una prueba real en Chrome para 2.3 | Checklist A (online), B (offline con pendiente), C (reconexión), D (fallo de sync) | [ ] |
| 5.3 | Pruebas en Android | Validar en un dispositivo real | — | `npx @ionic/cli build` + `npx cap sync android` (copia la web, no cambia la configuración) + modo avión | Mismos escenarios + cierre forzado/reapertura + reinicio del teléfono + segundo plano (1.3) | [ ] |
| 5.4 | Verificar permisos fusionados | Confirmar `ACCESS_NETWORK_STATE` | manifiesto fusionado de Gradle (solo lectura) | Revisar | Permiso presente | [ ] |
| 5.5 | Coordinar con el plan de pruebas general | Que las pruebas del módulo entren en el informe de Ángel | — | Entregar checklist y resultados | Ángel las incluye | [!] Ángel |

### FASE 6 — Documentación y evidencias

| # | Tarea | Objetivo | Archivos | Acción | Verificación | Estado |
|---|---|---|---|---|---|---|
| 6.1 | Documento técnico del módulo | Explicar la arquitectura y los flujos actuales | `docs/` (nuevo archivo del módulo) | Redactar: servicios, cola, sync, disparadores, cómo probar | Revisión del usuario | [ ] |
| 6.2 | Capturas de la app real | Evidencias con y sin conexión | `docs/evidencias/` (nuevo) | Capturas de los escenarios A–D en navegador y Android (ya hay 4 de navegador de 2.3 en el scratchpad) | Imágenes presentes | [ ] |
| 6.3 | Actualizar diagramas si cambió el flujo | Coherencia doc/código | `documentacion/diagramas/*.mmd` | Añadir los disparadores nuevos (arranque, pendientes nuevos) | El diagrama refleja el código | [ ] |
| 6.4 | Actualizar este plan y `equipo/JOSE_DANIEL.md` si aplica | Cierre | este archivo | Marcar estados finales | Todas las tareas propias en `[x]` | [ ] |

---

## 4. Dependencias con otros integrantes

### Dependencias de Kilsy (CRUD + Almacenamiento + Requisitos)
- El almacenamiento de movimientos vive en `core/offline/` (mío). El CRUD debe **reutilizar** `OfflineStorageService` en lugar de crear un segundo almacén, para que la cola de pendientes siga siendo única.
- Cualquier `actualizar`/`eliminar` debe añadirse **dentro** de `OfflineStorageService` usando el método `escribir()` (cola de 2.1); guardar por fuera sobre la misma clave evitaría la cola y reabriría el riesgo de pérdida.
- Hay que acordar cómo se sincronizan ediciones y borrados (hoy la cola solo contempla **altas**; el estado solo es `pendiente | sincronizado`).
- Cualquier campo nuevo en `Movimiento` (categoría, notas, etc.) afecta a `movimiento.model.ts`, a `ble-protocolo.ts` y a la API → coordinar.
- Requisitos: sus requisitos funcionales deben incluir los del modo offline (RF de conectividad) para que el documento de requisitos sea coherente.

### Dependencias de Ángel (Cámara/QR + API REST + Pruebas)
- Contrato del backend: URL base, endpoint de envío por lotes (hoy `POST {apiUrl}/movimientos/lote`), respuesta y **idempotencia por `id`**.
- Decidir si `ApiService` (en `core/offline/`) se mantiene como único punto de salida o delega en el cliente REST de Ángel.
- Cambio de `usarServidorSimulado` a `false` en `environments/*` cuando exista backend.
- Tras 3.1, con pendientes la app hará un POST al abrirse.
- Pruebas: inclusión de mis pruebas unitarias y del checklist manual en su plan/informe de pruebas.
- Si el QR genera movimientos, deben entrar por `MovimientosService.registrar()` para heredar el modo offline.

### Dependencias de Francisco (Interfaz + Multimedia)
- Mostrar el indicador ONLINE/OFFLINE en otras pestañas (`layout/tabs/` es suyo; `features/compartir/` vino de su PR).
- Tokens de color globales: el indicador y el contador de pendientes usan colores del propio módulo (`--cp-*`, variables SCSS de Inicio).
- Revisión visual del contador de pendientes añadido en 2.2.
- Multimedia (fotos de recibos, etc.): si se adjuntan archivos a movimientos, definir si se guardan/sincronizan offline (afectaría a la cola).
- Observación (no la resuelvo): el `README.md` raíz indica "Autor: Francisco Díaz" y describe solo la AP4; puede requerir actualización por el equipo.

### Dependencias de Félix (GPS + Mapa)
- El mapa probablemente necesita Internet para las teselas: debería usar `NetworkService.isOnline$` para mostrar un aviso en lugar de fallar.
- Si los movimientos guardan ubicación, acordar el campo en `movimiento.model.ts` y su sincronización.

---

## 5. Archivos de mi módulo

Todos bajo `app/src/`:

- `app/core/network/network.service.ts`
- `app/core/network/network-status.component.ts` / `.html` / `.scss`
- `app/core/offline/offline-storage.service.ts` (propio, pero **usado por otros** → ver sección 6)
- `app/core/offline/movimientos.service.ts`
- `app/core/offline/sync.service.ts`
- `app/core/offline/mensajes.ts`
- `app/core/offline/movimiento.model.ts` (propio, pero **usado por otros** → ver sección 6)
- `app/core/offline/api.service.ts` (propio, pero **se solapa con la API REST de Ángel** → ver sección 6)
- `app/features/inicio/home.page.ts` / `.html` / `.scss`
- `theme/conectividad.scss`
- `docs/PLAN_JOSE_INTEGRACION.md` y la documentación futura de mi módulo en `docs/`

---

## 6. Archivos compartidos

Se modifican solo si es necesario, **avisando antes** y explicando el motivo.

| Archivo | Por qué es compartido |
|---|---|
| `app/src/app/app.component.ts` | Arranque de toda la app (a mi cargo como líder técnico) |
| `app/src/app/app.routes.ts` | Rutas de todos los módulos |
| `app/src/main.ts` | Providers globales (HTTP, Storage) |
| `app/src/environments/environment.ts`, `environment.prod.ts` | URL de la API y banderas: afectan a Ángel |
| `app/src/app/core/offline/movimiento.model.ts` | Lo usan `core/compartir/*` (BLE) y lo usará el CRUD |
| `app/src/app/core/offline/offline-storage.service.ts` | Lo usan `ble-receptor.service.ts` y `compartir.page.ts`; lo usará el CRUD |
| `app/src/app/core/offline/api.service.ts` | Punto de salida al backend (API REST de Ángel) |
| `app/src/global.scss` | Importa los temas de todos |
| `app/package.json`, `package-lock.json` | Dependencias de todos (no se tocan en este plan) |

---

## 7. Archivos que no debo modificar

- `app/src/app/core/compartir/**` y `app/src/app/features/compartir/**` (Compartir Cerca / BLE).
- `app/src/app/layout/tabs/**` (Francisco).
- `app/src/theme/controla.scss`, `app/src/theme/compartir.scss`, `app/src/theme/variables.scss` (interfaz).
- `app/android/**`, `app/capacitor.config.ts`, `app/angular.json`, `app/tsconfig*.json`, `app/eslint.config.js`, `app/ionic.config.json`.
- `app/package.json`, `app/package-lock.json` (sin instalar ni cambiar versiones).
- Carpetas de la raíz `detector_red/`, `modo_offline/`, `compartir_cerca/`, `traspaso_cerca/`, `capturas/` (no borrar ni editar sin orden expresa).
- `equipo/*.md` de otros integrantes; `documentacion/*.docx`.
- Cualquier módulo futuro de Kilsy, Ángel, Francisco o Félix.

---

## 8. Criterios para considerar mi módulo terminado

1. El indicador refleja el estado real de la red en navegador y Android (incluido volver del segundo plano).
2. Un movimiento registrado sin conexión se guarda, muestra "⏳ Pendiente de sincronizar" y sobrevive al cierre de la app.
3. Se ve cuántos movimientos están pendientes.
4. Los pendientes se sincronizan solos al reconectar, al abrir la app con red y al volver al primer plano con red.
5. Un fallo del servidor no pierde datos, reintenta con espera creciente y no satura de avisos.
6. No se pierden movimientos por escrituras concurrentes ni se sincroniza dos veces lo mismo.
7. `npx ng build` y `npx ng lint` sin errores; pruebas unitarias del módulo en verde.
8. Escenarios A–D verificados en navegador y Android, con capturas.
9. Documentación técnica y diagramas actualizados.
10. Dependencias con el equipo acordadas o registradas como pendientes externos (no bloquean el cierre de lo que es mío).

---

## 9. Registro de cambios

| Fecha | Fase | Cambio | Archivos |
|---|---|---|---|
| 2026-09-30 | 0 | Análisis del módulo, build base verificado, creación del plan. Sin cambios en código de la app | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 1 | 1.1 verificado con prueba temporal (fuera del repo). 1.2: `init()` tolera fallos de `getStatus()` y de `addListener()` sin dejar de escuchar cambios. 1.3 cerrada sin código (el plugin ya maneja pausa/reanudación). Build OK; lint sin errores nuevos | `app/src/app/core/network/network.service.ts`, `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 2 (análisis 2.1) | Riesgo de pérdida por escrituras concurrentes confirmado con simulación (casos A–F). Solución propuesta. Sin cambios en código | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 2 (2.1) | Cola de escrituras en `OfflineStorageService` (`cola` + `escribir()`); `agregar`, `marcarSincronizados` y `limpiar` la usan. 16/16 pruebas, build OK, sin errores de lint nuevos | `app/src/app/core/offline/offline-storage.service.ts`, `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 2 (análisis 2.2) | Análisis del contador de pendientes. Sin cambios en código | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 2 (2.2) | Contador de pendientes en Inicio con el `pendientes$` existente (`@if`, oculto con 0). 19/19 pruebas, build OK, sin errores de lint nuevos | `app/src/app/features/inicio/home.page.ts`, `home.page.html`, `home.page.scss`, `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 2 (2.3) | Verificación real en Chrome (app compilada, IndexedDB, cierre completo del navegador): la persistencia funciona y la sync al reconectar también. Sin cambios en código | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (análisis 3.1) | Causa confirmada (sin transición al arrancar online) y nuevo hueco 11 (doble sync por la bandera tardía). Propuesta en `app.component.ts` + `sync.service.ts` validada en una copia (P1–P8, 30/30 con regresión). Sin cambios en código | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | — | Reconstrucción íntegra de este documento: las actualizaciones automáticas de 2.2 y 3.1 habían duplicado bloques por un error de sustitución de texto (el `$` de nombres como `pendientes$`). Contenido restaurado sin cambios de fondo. No afectó al código de la app | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (3.1) | Sincronización al arrancar (`init()` → `sincronizar('arranque')`) y bandera `sincronizando` activada antes del primer `await` dentro de `try/finally`. 27/27 pruebas con el código real, build OK, 0 errores de lint nuevos, prueba real en Chrome (reabrir con red → 1 envío, contador oculto) | `app/src/app/app.component.ts`, `app/src/app/core/offline/sync.service.ts`, `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (análisis 3.2) | Reanudación ya cubierta (plugin + transición + reintento; timers JS no se pausan con `KeepRunning` por defecto). Único caso sin cubrir = BLE (3.5). Simulación R1–R5, 32/32. Se propone cerrar 3.2 sin código. Sin cambios en código | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (3.2) | 3.2 cerrada **sin código** por decisión del usuario. BLE → 3.5; confirmación en Android → 5.3 | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (análisis 3.3) | Confirmado: reintento fijo de 6 s y un toast por fallo, sin fin. Propuesta en `sync.service.ts` (contador de racha, espera 6→12→24→48→60 s, toast solo al inicio, fin de racha con éxito o cola vacía) validada en una copia: F1–F11, 42/42 con regresión. Sin cambios en código | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (3.3) | Reintento con espera creciente (6→12→24→48→60 s), toast solo al inicio de la racha, `terminarRacha()` con éxito o cola vacía. 41/41 con el código real, build OK, 0 errores de lint nuevos, prueba real en Chrome (esperas 6,4/12/24/48 s, 1 toast de error, 0 temporizadores ni envíos extra tras el éxito) | `app/src/app/core/offline/sync.service.ts`, `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (análisis 3.4) | Duplicado confirmado (la sync empieza mientras `registrar()` envía). Opciones A–E evaluadas; recomendada E ("ids en vuelo" en `SyncService`, usada también por `registrar()`). Simulación D1–D10 + "3.3 intacto": 55/55. Sin cambios en código | `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-09-30 | 3 (3.4) | "Ids en vuelo": `SyncService` (`enVuelo`, `reservarEnvio`, `liberarEnvio`; solo envía lo reservado) y `registrar()` (reserva/libera su id). 52/52 con el código real, build OK, 0 errores de lint nuevos, prueba real en Chrome (casos A–D, 0 solapes) | `app/src/app/core/offline/sync.service.ts`, `app/src/app/core/offline/movimientos.service.ts`, `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-10-01 | 3 (3.5) | Hueco BLE confirmado (`aceptar()` guarda pendiente sin avisar a la sync). `SyncService` observa el aumento de pendientes (300 ms, sin racha) y hace segunda vuelta tras un envío. Sin tocar el módulo Bluetooth. 61/61, build OK, 0 errores de lint nuevos, prueba real en Chrome con la pantalla Compartir (3 casos, 0 solapes) | `app/src/app/core/offline/sync.service.ts`, `docs/PLAN_JOSE_INTEGRACION.md` |
| 2026-10-01 | 4 (4.0) | Validación de integración del módulo **sin cambios de código** (no se encontró ningún problema). Batería de integración I1–I6 + regresión: 67/67; build OK; 0 errores de lint nuevos; prueba de punta a punta en Chrome real con cierre/reapertura: 21/21. Fase 4 abierta por dependencias (4.1–4.4) y decisiones pendientes (4.5–4.7) | `docs/PLAN_JOSE_INTEGRACION.md` |

---

## 10. Próximo paso

**Estado:** Fases 0–3 completadas en navegador en lo que depende de mí (1.4 y 2.4 bloqueadas por Francisco y Kilsy; 3.2 cerrada sin código). Fase 4: validación de integración (4.0) completada sin cambios de código; 4.1–4.4 bloqueadas por otros integrantes; 4.5 continua; 4.6 y 4.7 esperan decisión. Todo lo funcional queda pendiente de confirmar en Android (5.3).

**Esperando autorización del usuario.** No se inicia la Fase 5 automáticamente. Decisiones abiertas que puedes tomar cuando quieras: 4.6 (corregir los errores de lint de mis archivos: 3 en `network-status.component.html`, 2 en `home.page.html`, `prefer-inject` en `network.service.ts` y `offline-storage.service.ts`) y 4.7 (qué hacer con las carpetas duplicadas de la raíz).
