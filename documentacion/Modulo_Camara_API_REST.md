# 5.4 Módulo de cámara y API REST

**Responsable:** Ángel Diosiris Moscoso Viloria — Documentador/Tester

## 5.4.1 Problema que resuelve

El módulo debía demostrar que la aplicación podía utilizar la cámara del teléfono, leer un código QR y procesar el contenido obtenido. Durante la prueba se observó que la lectura mostraba el texto del código y una respuesta GET, pero no abría un QR que contenía una dirección web. También se detectó que algunos controles de la pantalla no respondían al tacto. El trabajo abordó esos problemas y documentó el alcance real de las operaciones REST, incluida la diferencia entre una respuesta simulada y una llamada a un servidor.

## 5.4.2 Objetivo del módulo

Integrar y probar en Android la cámara y la lectura QR, asegurar la interacción con los controles, y encaminar el resultado correctamente: ofrecer abrir las URLs web leídas, consultar por GET los códigos de datos y permitir registrar movimientos mediante POST. El módulo también debe conservar los registros localmente cuando no hay conectividad e identificar qué partes se probaron con servicios simulados.

## 5.4.3 Descripción de la solución

La pantalla QR invoca el escáner de Google ML Kit mediante el plugin de Capacitor. En la prueba realizada en el teléfono, el escaneo devolvió el contenido del código y mostró la sección de consulta GET. Al comprobar el comportamiento, se identificó que el contenido se trataba como un código de consulta aun cuando podía ser una URL. Se amplió el flujo para distinguir ambos tipos de contenido:

- Si el contenido es una URL con protocolo `http` o `https`, muestra el botón **Abrir enlace**. El usuario confirma la acción y el plugin Browser abre la dirección en el navegador del dispositivo. No se abre automáticamente un enlace desconocido.
- Si el contenido no es una URL web, se envía como parámetro `codigo` a la consulta GET `/qr/consultar`. La respuesta se muestra en la pantalla y, si contiene datos de un movimiento, se permite agregarlos a Inicio.
- Al registrar un movimiento, `MovimientosService` lo guarda primero en el almacenamiento local. Si hay conexión, lo envía mediante `POST /movimientos/lote`; si no, queda pendiente para sincronización posterior.

Durante la puesta en marcha Android también fue necesario resolver problemas del entorno de desarrollo (ADB no estaba en `PATH`, no se encontraba Java, Gradle no admitía el Java 25 incluido con Android Studio y el proyecto estaba en una ruta con caracteres no ASCII). Al investigar por qué no respondían los botones se encontró un `ion-router-outlet` redundante dentro de la plantilla de pestañas; al retirarlo, los eventos táctiles volvieron a llegar a los controles.

### API simulada y servidor real (actualización M6, 2026-10-12)

La app tiene dos modos de API, y cada respuesta indica de cuál proviene (`origen: 'simulado'` o `origen: 'servidor'`):

| Modo | Cómo se activa | Qué ocurre |
|---|---|---|
| **API simulada** (por defecto) | `ng serve`, `ng build` (`environment.ts` / `environment.prod.ts`: `usarServidorSimulado: true`) | `ApiService` responde localmente, sin red: GET en ~500 ms y POST en ~900 ms. Sirve para demostrar la interfaz y el flujo sin servidor, pero **no acredita** una transacción real. Los avisos dicen "API simulada" y la respuesta GET se titula "API SIMULADA". |
| **Servidor real** | `ng serve -c servidor` / `ng build -c servidor` (`environment.servidor.ts`: `apiUrl = http://localhost:3000`, `usarServidorSimulado: false`) | `HttpClient` hace GET y POST reales contra el servidor propio de pruebas `server/servidor.mjs`. La respuesta GET se titula "API" y lleva `"origen": "servidor"`, y el servidor registra cada petición en su consola. |

**Arranque del servidor real** (Node.js puro, sin dependencias; detalles en `server/README.md`):

```bash
node server/servidor.mjs                 # desde la raíz del repositorio → http://localhost:3000
cd app && npx ng serve -c servidor       # navegador
# Android: npx ng build -c servidor && npx cap sync android, instalar el APK y
adb reverse tcp:3000 tcp:3000            # el localhost:3000 del teléfono llega al equipo
```

El servidor expone `GET /qr/consultar?codigo=`, `GET /movimientos` (para comprobar lo recibido) y `POST /movimientos/lote`. El lote es idempotente por `id`: ignora versiones antiguas, borra con `eliminado: true` y rechaza con `400`, sin guardar nada, un lote con elementos inválidos. Los datos se guardan en `server/datos.json`. En Android, `network_security_config.xml` permite HTTP sin cifrar **solo** hacia `localhost` y `10.0.2.2`.

## 5.4.4 Tecnologías utilizadas

- Angular 22 e Ionic 9 para las pantallas y los controles de la aplicación.
- Capacitor 8 como puente entre la aplicación web y las capacidades nativas del teléfono.
- `@capacitor-mlkit/barcode-scanning` para detectar códigos QR con Google ML Kit.
- `@capacitor/browser` para abrir de forma explícita enlaces HTTP(S) leídos.
- `HttpClient` de Angular para las solicitudes REST GET y POST cuando se desactiva el modo simulado (configuración `servidor`).
- Node.js puro (`node:http`, `node:fs`) para el servidor de pruebas `server/servidor.mjs`.
- Ionic Storage, RxJS y los servicios de red y sincronización para conservar movimientos y gestionar el flujo offline-first.

## 5.4.5 Implementación

1. Se sincronizó el proyecto con Capacitor y se preparó el escáner nativo para Android. La página comprueba plataforma y compatibilidad; en Android verifica si está disponible el módulo Google Barcode Scanner y solicita instalarlo si falta.
2. ML Kit procesa el formato QR. La página toma el `rawValue` del primer código detectado y lo presenta como contenido leído. En la prueba del teléfono se observó que el resultado del código y la respuesta GET aparecían en la pantalla.
3. Para responder a la expectativa de navegar a los QR con enlaces, se añadió la detección de URLs HTTP(S) y la acción **Abrir enlace** mediante Capacitor Browser. Se requiere pulsar el botón; el enlace no se abre automáticamente.
4. Los contenidos que no son URL continúan por `ApiService.consultarQr`. Si la respuesta simulada o del backend incluye datos, el usuario puede agregarlos como movimiento.
5. `MovimientosService.registrar` guarda primero el movimiento en el dispositivo. Si hay conexión llama a `ApiService.enviarMovimientos`; si no, conserva el movimiento pendiente para sincronizarlo posteriormente.
6. Al diagnosticar los botones, se comprobó que una salida redundante cubría el área del contenido. Se quitó el outlet adicional de `TabsPage` y su importación Angular no utilizada. La compilación y una prueba táctil del botón `+` confirmaron que el formulario de movimiento podía abrirse.
7. Se recompiló el proyecto web, se sincronizó con Android y Gradle generó el APK con el plugin Browser. La instalación se completó con `adb install -r` (código de salida 0 en la terminal del usuario).

## 5.4.6 Código relevante

**Lectura QR y selección del flujo** (`qr.page.ts`):

```ts
const { barcodes } = await BarcodeScanner.scan({
  formats: [BarcodeFormat.QrCode],
  autoZoom: true,
});

const texto = barcodes[0]?.rawValue?.trim();
if (texto) {
  this.resultado.set(texto);
  const enlace = this.detectarEnlace(texto);
  this.enlaceQr.set(enlace);
  if (enlace) {
    this.mensaje.set('Se detectó un enlace. Revísalo y pulsa Abrir enlace para continuar.');
  } else {
    await this.consultar(texto);
  }
}
```

La apertura se realiza solo desde la acción confirmada por el usuario:

```ts
async abrirEnlace(): Promise<void> {
  const url = this.enlaceQr();
  if (!url) return;
  await Browser.open({ url });
}

private detectarEnlace(texto: string): string | null {
  try {
    const url = new URL(texto);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
```

**Consulta GET** (`api.service.ts`):

```ts
const respuesta = await firstValueFrom(
  this.http
    .get<Omit<ConsultaQr, 'origen'>>(`${this.config.apiUrl}/qr/consultar`, { params: { codigo } })
    .pipe(timeout(LIMITE_PETICION_MS)),
);
return { ...respuesta, origen: 'servidor' };
```

**Envío POST** (`api.service.ts`):

```ts
await firstValueFrom(
  this.http.post(`${this.config.apiUrl}/movimientos/lote`, movimientos).pipe(timeout(LIMITE_PETICION_MS)),
);
```

`this.config` (token `CONFIG_API`) toma `apiUrl` y `usarServidorSimulado` del environment activo. Ambas llamadas HTTP se ejecutan únicamente cuando `usarServidorSimulado` es `false`, es decir, con la configuración `servidor`. Con la configuración por defecto, `ApiService` responde localmente y no envía esas solicitudes. Cada petición real tiene un límite de 10 s para que un servidor que no responde cuente como fallo y la sincronización reintente.

La ruta de prueba del POST también permite simular un fallo sin conectarse a un servicio:

```ts
if (this.config.usarServidorSimulado) {
  await firstValueFrom(timer(900));
  if (this.simularFallo) {
    throw new Error('HTTP 503 Service Unavailable (simulado)');
  }
  return;
}
```

## 5.4.7 Evidencias de funcionamiento

Las capturas deben tomarse de la aplicación instalada en el teléfono y añadirse al informe final. No se encontraron capturas de cámara, GET ni POST guardadas en la carpeta de documentación del proyecto; por eso estos espacios se mantienen como pendientes y no se sustituyen por imágenes de otra funcionalidad. En la Figura 21 debe quedar visible el campo `origen` de la respuesta JSON (`simulado` o `servidor`); el encabezado de la pantalla por sí solo no distingue ambos casos en Android. En la Figura 22 debe verse el mensaje de resultado del registro.

**Figura 20. Funcionalidad de cámara/QR**

*[Insertar captura del teléfono con el escáner abierto y el código QR encuadrado, o con el contenido leído visible.]*

**Figura 21. Consulta GET**

*[Insertar captura del resultado GET para un QR de datos, incluyendo el campo `origen` del JSON (`simulado` o `servidor`). Los QR cuyo contenido es una URL muestran la opción Abrir enlace y no ejecutan esta consulta GET.]*

**Figura 22. Solicitud POST**

*[Insertar captura del movimiento agregado y del mensaje de resultado. Con la configuración por defecto, la evidencia corresponde a `API simulada (POST)`. Para la evidencia real, usar la configuración `servidor` con `server/servidor.mjs` en marcha y capturar también la consola del servidor (`POST /movimientos/lote → 200`) y `GET /movimientos` con el movimiento recibido.]*

## 5.4.8 Decisiones técnicas

- Se utiliza ML Kit para la lectura QR nativa y no se implementa el procesamiento de imagen manualmente; la lectura real se valida en la aplicación Android y no desde el navegador de escritorio.
- Los enlaces no se abren automáticamente: primero se muestra su contenido y se exige pulsar **Abrir enlace**. Solo se admiten URLs HTTP(S), lo que evita tratar esquemas arbitrarios como enlaces web.
- El tratamiento de enlaces se separa de la consulta de datos. Así, una URL no se interpreta por error como un identificador para `/qr/consultar`; un QR de datos conserva el GET.
- Los movimientos siguen el patrón offline-first: se guardan localmente antes de intentar el envío. Esto conserva el registro aunque no haya conectividad y permite sincronizarlo después.
- Se conserva el modo API simulada para pruebas de interfaz y del flujo. Se identifica como simulación y no se presenta como confirmación de que el servidor recibió una petición.
- Se eliminó el outlet redundante de la vista de pestañas para dejar que los gestos lleguen a los controles de las páginas.

## 5.4.9 Problemas encontrados y soluciones

- **Cámara en navegador:** la web no puede demostrar el uso de la cámara nativa de Android. Se preparó y ejecutó el APK en el emulador/teléfono con el plugin ML Kit. La prueba QR reportada desde el teléfono mostró el contenido leído y la sección GET.
- **Aceleración del emulador:** el primer intento de `Pixel_6` informó que faltaba el driver de hipervisor. En una ejecución posterior el emulador arrancó con Windows Hypervisor Platform operativo; ADB identificó el dispositivo como `emulator-5554`.
- **ADB no reconocido y Java no configurado:** se utilizó `platform-tools/adb.exe` y se estableció `JAVA_HOME`. Android Studio incluía Java 25, que produjo `Unsupported class file major version 69`; se localizó y usó JBR 21 en `~/.jdks/jbr-21.0.11`.
- **Ruta de Windows con caracteres no ASCII:** Gradle rechazó la ruta `Programación Dispositivos móviles`. Para completar la compilación se añadió `android.overridePathCheck=true` en `app/android/gradle.properties`. La alternativa más robusta para futuras compilaciones es usar una ruta ASCII.
- **Botones del contenido no respondían:** el análisis de eventos mostró que el `ion-router-outlet` extra dentro de `ion-tabs` recibía el toque por encima del botón. Se retiró ese outlet y su importación; después la compilación Angular pasó y una pulsación real del FAB abrió la alerta de movimiento.
- **Un QR con URL mostraba el texto y respuesta GET:** el flujo inicial enviaba todo `rawValue` a `consultarQr`. Se añadió detección HTTP(S), el botón **Abrir enlace** y Capacitor Browser. La instalación del APK que incluye esta función se ejecutó desde la terminal con código de salida 0; queda por documentar una captura del enlace abierto.
- **Posible confusión entre API simulada y real:** en la configuración por defecto `usarServidorSimulado` sigue activado y `apiUrl` conserva un dominio `.example`, así que GET y POST son simulados. Desde M6 existe el servidor real `server/servidor.mjs` y la configuración `servidor`, que no usa el dominio `.example`. ADB informó que el teléfono se desconectó en uno de los intentos automáticos; posteriormente el usuario ejecutó `adb install -r` y la terminal mostró código de salida 0.

## 5.4.10 Resultado

El trabajo completó la lectura nativa de QR y verificó en el teléfono que el contenido leído aparecía en la pantalla. El flujo se ajustó después para distinguir URLs de datos: las primeras muestran **Abrir enlace**, mientras los segundos conservan la consulta GET. También se corrigió la capa de pestañas que impedía tocar controles; la alerta del botón `+` se comprobó mediante un toque en el emulador.

`npm run build` terminó correctamente tras los cambios de Angular. Capacitor sincronizó los plugins y Gradle generó correctamente el APK actualizado, incluido `@capacitor/browser`; el comando de instalación ejecutado posteriormente por el usuario terminó con código de salida 0.

**Alcance verificado y pendiente:** la lectura QR y la compilación Android se realizaron; el APK actualizado se instaló. La prueba de abrir un QR HTTP(S) con el botón nuevo aún debe fotografiarse. **GET y POST reales (M6, 2026-10-12):** con `server/servidor.mjs` y la configuración `servidor` se verificó lo siguiente:
- **Navegador (Chrome):** registro → `POST /movimientos/lote` → aparece en `GET /movimientos`; QR → `GET /qr/consultar` con `origen: servidor`; sin red → pendiente → al reconectar se envía el lote; edición y eliminación llegan al servidor; con el servidor caído el movimiento queda pendiente y se envía al volver; sin duplicados.
- **Emulador Android** (por `adb reverse`): GET, POST y lote de pendientes tras el modo avión, sin errores de HTTP sin cifrar ni de contenido mixto.

La configuración por defecto sigue siendo la API simulada. Faltan las capturas auténticas de las Figuras 20–22 y la prueba en un teléfono físico.