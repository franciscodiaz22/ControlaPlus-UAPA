# Archivos multimedia de Controla+ (U7)

Contenido **original**, preparado para el proyecto final de Controla+ (Programación de
Dispositivos Móviles, UAPA). No incluye material de terceros: no hay música, imágenes
ni grabaciones ajenas, por lo que no requiere licencias externas.

Lo usa la pantalla **Multimedia** (`src/app/features/multimedia/`), pestaña "Media".
Los archivos se empaquetan con la app y se reproducen sin conexión.

| Archivo | Uso | Formato | Duración | Tamaño |
|---|---|---|---|---|
| `guia-controla.wav` | Guía en audio: qué muestra Inicio, cómo registrar un movimiento, qué pasa sin conexión, cómo editar/eliminar y sincronizar, y otras funciones (Bluetooth, QR) | WAV PCM, 16 kHz, 16 bits, mono | 44,4 s | ≈ 1,4 MB |
| `tutorial-controla.webm` | Video tutorial "Cómo registrar un gasto": seis pantallas con capturas reales de la app y narración | WebM, video VP8 854 × 480 a 30 fps + audio Opus | 35,1 s | ≈ 1,1 MB |

## Cómo se prepararon

- **Narraciones** (audio y voz del video): texto escrito por el equipo, convertido a voz con
  el sintetizador de voz de Windows (System.Speech, voz *Microsoft Helena*, español de España).
- **Imágenes del video**: capturas de pantalla de la propia app Controla+ (pantalla de
  Inicio, alerta de nuevo movimiento, movimiento pendiente sin conexión, fila deslizable),
  compuestas con títulos y una barra de progreso.
- **Codificación del video**: grabación en Chrome con `canvas` + `MediaRecorder`
  (VP8/Opus). Después se añadió al archivo la duración (elemento `Duration` del WebM),
  que `MediaRecorder` no escribe, para que el reproductor muestre la duración y se pueda
  saltar a cualquier posición.

## Compatibilidad

WAV y WebM (VP8/Opus) se reproducen en Chrome y en el WebView de Android. Para sustituir
un archivo por otro grabado por el equipo, basta con mantener el mismo nombre (o cambiar
`rutaAudio` / `rutaVideo` en `multimedia.page.ts`). Para iOS/Safari convendría añadir
una versión MP4 (H.264/AAC) del video.
