# Rendimiento de DTPrep 1.1.4 (análisis estático)

Complementa [AUDITORIA-DTPREP-ESTATICA.md](AUDITORIA-DTPREP-ESTATICA.md).

- **Fuente:** `LightningDTPrep_v114.ccx`, SHA-256 `79152571…3f9bd8`, extraído en modo de solo lectura con REA y leído como texto, sin ejecutarlo.
- **Qué no incluye:** tiempos medidos en Photoshop. Las cifras de tiempo y memoria marcadas **(H)** son estimaciones. Las marcadas **(E)** son hechos observados en el código.

## 1. Resumen

DTPrep **no procesa píxeles en JavaScript**: hay 0 llamadas a `imaging.getPixels`, `putPixels` o WASM. Todo es `batchPlay`: 42 lotes `await batchPlay(...)` dentro de 29 envoltorios `executeAsModal`. Su rendimiento depende del motor de composición de Photoshop, no del JS.

| Fase | Coste dominante | Valoración |
|---|---|---|
| Run DTPREP | Duplicar, reescalar y filtros inteligentes (Desenfoque de superficie con radio 20) | Caro, pero ocurre una sola vez |
| Niveles en vivo | Recomponer una capa de ajuste | Muy rápido |
| Boost Shadow en vivo | **Recalcular *Sombras e iluminaciones* (radio 50) sobre el objeto inteligente** | El ajuste en vivo más caro |
| Frecuencia y ángulo | Volver a teselar dos capas de patrón y hornear `HALFTONE FLAT` | Medio |
| Cambio de vista | `show`/`hide` | Inmediato |
| Apply | Operaciones de selección a resolución completa, eliminar halos, umbral y duplicar documento | Caro, una sola vez |

## 2. Run DTPREP

**Secuencia (E):**
1. Duplica el documento con `merged:true`.
2. `resizeImage(w, h, 300 dpi)`.
3. `suspendHistory`.
4. Un `batchPlay` grande, de unos 60 descriptores, que construye todo el árbol de capas.
5. Escala y ángulo del patrón, y horneado.
6. `resumeHistory`.

**Optimizaciones (E):**
- **Oculta el panel Capas** durante Run, si está visible, con `performMenuCommand({commandID:1098})`, y lo restaura al terminar. Para saber si está visible consulta `panelList[14].visible`. Así evita que Photoshop redibuje miniaturas por cada capa creada.
- **Cambia temporalmente dos preferencias de usuario:**
  - `generalPreferences.placeRasterSmartObject`, para que `newPlacedLayer` y `placeEvent` se comporten de forma predecible.
  - Una opción del portapapeles (`smartClipboard`).

  Las restaura al final. Si Run falla a mitad, **las preferencias pueden quedar cambiadas** (H: no se ve ningún `finally` que las proteja).
- **Historial:** `suspendHistory` reduce todo a un paso, lo que ahorra memoria de estados y tiempo de instantáneas.
- **Lote único:** un solo `batchPlay` con muchos descriptores evita los viajes de ida y vuelta entre UXP y Photoshop.
- **Cronómetro:** en modo de prueba mide la duración con `performance.now()`. Hay 1 aparición.

**Costes (H):**
- *Desenfoque de superficie* con radio 20 y umbral 24 es el filtro más caro del pipeline: su coste crece con el radio y la resolución. A 13 MP probablemente se lleva la mayor parte de los ~3 s que se midieron en vídeo.
- *Desenfoque gaussiano* de 1,4 px es barato.
- Si el documento es CMYK, el objeto inteligente se convierte a RGB: es un paso más de conversión.

## 3. Ajustes en vivo

| Control | Disparo | Espera | Qué ejecuta |
|---|---|---|---|
| Levels y Output (3 + 2 tiradores y campos numéricos) | `input`/`change`/arrastre | **50 ms**, debounce final propio (`setTimeout` y `clearTimeout`) (E) | 1 `executeAsModal` → búsqueda de `Main Levels 1` → `set levels` y `clearEvent historyStates` en el mismo lote |
| Boost Shadow | Arrastre o campo | **100 ms** (E) | 1 `executeAsModal` → búsqueda de `MAIN ART 2` → `set filterFX` con **todo el filtro `adaptCorrect`** más la opacidad de fusión |
| Frecuencia (Edit Halftones) | `input` | **300 ms** (E); `change` sin espera | `set patternLayer.scale` en `HALFTONE ROUND` y `HALFTONE LINE` |
| Ángulo | `change` | Ninguna | `set patternLayer.angle` en las dos capas |
| Vista Original / Shirt / Alpha / Mask | Clic | Ninguna | `show`/`hide` |

Hallazgos:
1. **Boost Shadow es caro (E/H).**
   - Cada cambio vuelve a enviar el descriptor completo de *Sombras e iluminaciones*: cantidad 20 %, ancho tonal 100 % y radio 50, además de la opacidad.
   - Photoshop recalcula el filtro inteligente sobre todo el objeto inteligente, y con radio 50 a resolución completa el cálculo pesa.
   - **Corrección** a la auditoría anterior: no se cambia solo la opacidad.
   - Una implementación más eficiente aplicaría el filtro una vez y movería solo `blendOptions.opacity`.
2. **Niveles es barato (E).** Cambia una capa de ajuste por ID y Photoshop solo recompone.
3. **Se borra el historial en cada ajuste de niveles (E).** `clearEvent` sobre `historyStates` va en el mismo lote.
   - A favor: el historial no crece al arrastrar.
   - En contra: el usuario pierde todo el deshacer del documento de trabajo, y se añade una operación por actualización.
4. **Búsqueda recursiva por nombre (E).** Cada actualización llama a una función que recorre `activeDocument.layers` de forma recursiva comparando nombres. Hay 16 llamadas en el código.
   - Cada acceso a `.layers` o `.name` cruza el puente DOM de UXP.
   - Con pocas capas el coste es despreciable. Cachear el ID de capa tras Run lo eliminaría.
5. **Serialización (E/H).** Cada actualización abre su propio `executeAsModal`.
   - El debounce reduce el número de llamadas, pero no hay cola ni fusión de peticiones pendientes.
   - Si Photoshop está ocupado con un modal, la llamada nueva falla o espera. El error se captura con `try/catch` y solo se registra (H), así que puede perderse un valor intermedio, aunque el siguiente evento lo corrige.
6. **Repintado de la UI (E).** Hay 11 `requestAnimationFrame` para recolocar tiradores, de modo que el repintado de la interfaz no bloquea el `batchPlay`.

## 4. Apply

Cuatro `executeAsModal` **en secuencia** (E):
1. Reescribir la máscara: `synchronousExecution:true` y `paintOptions:{immediateUpdate:true, quality:"draft"}`.
2. Post Cleanup:
   - Espera fija de **100 ms**.
   - Carga la máscara como selección.
   - Calado de 1 a 3,5 px y `contract`/`expand` de 1 o 2 px, todo a resolución completa.
   - Inversión y relleno.
3. De-Fringe, si está activo: aplicar la máscara, eliminar halos de 8 px y recrear la máscara.
4. Umbral 128 y **duplicar el documento** de salida.

Costes (H):
- Las operaciones de selección (calado, contraer, expandir) son lineales en píxeles y rápidas.
- Eliminar halos de 8 px y el duplicado final son lo más caro.
- Las cuatro llamadas modales en serie añaden latencia fija de entrada y salida del modal.

## 5. Memoria (H)

Estimación en 8 bits RGB a 13 MP (25 × 38 cm a 300 ppp), donde una capa raster completa ocupa unos 39 MB y un canal unos 13 MB:

| Elemento | Aprox. |
|---|---|
| Documento original abierto | ≥ 39 MB |
| Documento de trabajo: `MAIN ART 2` (objeto inteligente con documento incrustado y caché de 2 filtros inteligentes) | 80–160 MB |
| `HALFTONE FLAT`, raster | 39 MB |
| 2 capas de patrón | Pequeñas, se teselan |
| Canal `MAIN MASK` y máscara de capa | 26 MB |
| Rellenos y ajustes | Despreciable |
| Documento de salida tras Apply | ≥ 52 MB (RGBA) |

Con los tres documentos abiertos, el total puede superar 250–350 MB a 13 MP. A 50 MP o más, o en 16 bits, escala de forma proporcional.

## 6. Sobrecoste del propio JS

- **Ofuscación (E):** el aplanamiento del flujo de control usa generadores, `switch` sobre sumas de estado y bloques `with`.
  - `with` impide optimizar el JIT en esas funciones (H).
  - En manejadores de UI el coste es de microsegundos frente a los milisegundos de `batchPlay`. No es un cuello de botella.
- **Registro (E):** hay unos 270 `console.*`, incluidos los de las rutas en vivo, a veces con objetos completos (respuestas de `batchPlay`, presets).
  - Con el depurador UDT abierto se nota. Sin él, el coste es menor (H).
- **Temporizador permanente (E):** un `setInterval` cada **500 ms** mantiene el foco del panel con un `focusKeeper` fuera de pantalla mientras hay sesión activa. Es barato, pero corre siempre.
- **`localStorage` (E):** unas 20 escrituras de estado, síncronas y pequeñas.

## 7. Recomendaciones para halftone-dtf-ps

1. **No volver a enviar filtros caros en vivo.** Si se usa un filtro inteligente para las sombras, conviene aplicarlo una vez y mover solo la opacidad.
2. **Cachear los IDs de capa** tras Preparar en lugar de buscar por nombre en cada ajuste.
3. **Una cola de última petición** sobre `executeAsModal`: si llega un valor mientras hay un modal en curso, se guarda solo el último y se aplica al terminar. Es mejor que confiar solo en el debounce.
4. **Esperas cortas y diferenciadas:**
   - Unos 40–50 ms para niveles, que es lo que ya usa 0.7.0.
   - Unos 100–150 ms para operaciones caras.
   - Sin esperas fijas tipo `sleep` antes del cleanup.
5. **Proteger las preferencias con `try/finally`** si se cambia alguna preferencia de Photoshop durante Preparar.
6. **No borrar el historial completo.** Mejor agrupar cada sesión de edición con `suspendHistory`.
7. **Ocultar el panel Capas** durante la construcción inicial, siempre que se pueda restaurar con garantía. Es una técnica legítima y barata.
8. **Medir en Photoshop real**, a 13 MP y a 50 MP:
   - Duración de Run desglosada por lote.
   - Latencia de niveles y de sombras.
   - Duración de Apply.
   - Pico de memoria con 3 documentos abiertos.

   Registrar los resultados en `release-validation.json` junto a `BENCHMARK-0.6.3.json`.

## 8. Qué requiere pruebas en Photoshop

- Tiempos reales de Run, de *Sombras e iluminaciones* en vivo y de Apply, y la influencia de la GPU.
- Si `clearEvent historyStates` reduce la memoria de forma medible.
- El comportamiento cuando se encadenan modales durante un arrastre rápido.
- Si las preferencias quedan cambiadas tras un error en Run.
- La memoria real del objeto inteligente con dos filtros inteligentes.
