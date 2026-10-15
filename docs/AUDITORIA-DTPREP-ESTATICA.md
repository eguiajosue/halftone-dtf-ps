# Auditoría estática de DTPrep 1.1.4: semitonos, rendimiento e interfaz

Este documento complementa [AUDITORIA-DTPREP.md](AUDITORIA-DTPREP.md). Aquella auditoría partía de una grabación de pantalla; esta parte del análisis estático del paquete `LightningDTPrep_v114.ccx`.

- **Método:** inventario y extracción de solo lectura con REA, y lectura del código como texto. No se ejecutó ni se modificó el plugin.
- **Fuente:** `LightningDTPrep_v114.ccx`, SHA-256 `79152571d15c0c518cd996e4363f291c88c61436c24295c9620d9f4c1f3e9bd8`.
- **Alcance legal:** DTPrep es software comercial con todos los derechos reservados. Aquí solo se describen mecanismos y parámetros como referencia funcional. No se copia código, ni plantillas PSD, ni gráficos, ni textos, ni nada del sistema de licencias. Cualquier implementación en este repo debe seguir siendo propia.

Leyenda:
- **(E)** observado directamente en el código o los descriptores.
- **(H)** hipótesis razonada que hay que validar en Photoshop.

---

## 1. Arquitectura

| Archivo | Tamaño | Contenido |
|---|---|---|
| `manifest.json` | 2,3 KB | Manifest v5, PS ≥ 23.3, un panel `dtprep` de 280 × 590–620 px |
| `index.html` | 33 KB | Toda la UI: dos pantallas y seis diálogos |
| `style.css` | 11,6 KB | Tema claro/oscuro y sliders personalizados |
| `main2.js` | 246 KB | Se carga en `<head>`: licencias y utilidades |
| `main.js` | 717 KB | Se carga al final de `<body>`: UI y pipeline de Photoshop |
| `presets.js` | 3,8 KB | Presets en JSON. Sin ofuscar |
| `MainPattern3.psd`, `MainPattern4.psd` | 40 y 65 KB | Plantillas de patrón de trama (Round y Line) |

- **Ofuscación (E):** `main.js` y `main2.js` usan un array de cadenas rotado (`Ll9ycv(0x1c0)`) y aplanamiento del flujo de control. Las funciones quedan convertidas en generadores con `switch` sobre sumas de estado y bloques `with`. Por eso REA dejó unas 38 500 relaciones semánticas sin resolver.
- **Módulos (E):** `uxp` (`entrypoints`, `storage`), `photoshop` (`core.executeAsModal`, `action.batchPlay`, `app`), `os`, `./manifest.json` y `./presets.js`.
- **Procesado (E):** no hay ningún bucle de píxeles en JavaScript: ni `imaging.getPixels`/`putPixels`, ni WASM. Todo el procesado lo hace Photoshop con `batchPlay`: capas de relleno, objetos inteligentes, filtros inteligentes, capas de ajuste, modos de fusión y operaciones de canal.

---

## 2. Cómo está construida la interfaz

### 2.1 Tecnología
- **Componentes Spectrum nativos de UXP (E):** usa las etiquetas `sp-*` integradas en UXP (`sp-picker`, `sp-menu`, `sp-menu-item`, `sp-textfield type="number"`, `sp-checkbox`, `sp-radio-group`, `sp-radio`, `sp-button`, `sp-action-button`, `sp-body`, `sp-label`, `sp-detail`, `sp-heading`, `sp-link`, `sp-icon`).
  - No usa Spectrum Web Components ni ningún framework (React, Vue). No hay *bundler* de UI.
- **HTML estático (E):** las dos pantallas y los diálogos ya están escritos en `index.html`. El JS solo alterna `style.display` y lee o escribe `.value` y `.checked`.
- **Iconos (E):** SVG en línea (Spectrum Workflow Icons «ShowMenu», «Link» y «Unlink»). El color lo pone la clase `.fill`, que cambia según el tema.

### 2.2 Estructura
- **`#step1`, Preparar (E):**
  - Preset y menú de presets.
  - *Current 300 DPI Print Size* (`currentPrintWidth/Height`).
  - *Scale to*: ancho y alto, con un menú de unidad (in, mm o cm).
  - Grupo *Halftone*: activar, Round o Line, *Frequency / Inch* y *Angle*.
  - *Color Knockout* y color de prenda, unidos por un botón de vínculo (`data-linked`).
  - Botones Ayuda, **Run DTPREP** y Ajustes.
  - Avisos de prueba y de beta.
- **`#step2`, Ajustar (E):**
  - Preset, knockout y colores.
  - *Default Sliders* y *Edit Halftones*.
  - Slider compuesto **Levels** (negro, gamma y blanco) y slider compuesto **Output Levels** (negro y blanco).
  - **Boost Shadow**.
  - Cuatro botones de vista (`data-preview-mode`: `original`, `shirt`, `alpha` y `mask`).
  - **Post Cleanup** (`none`, `standard` o `high`), **De-Fringe**, **Cancel** y **Apply**.
- **Diálogos (E):** son elementos `<dialog>` HTML que se abren de forma modal: ayuda (780 × 600), editar trama, mensaje genérico, guardar preset, unidades y activación.
- **Ancho fijo (E):** el panel mide 280 px de ancho fijo según el manifest. Por eso todo el diseño usa anchos absolutos de 240 a 260 px.

### 2.3 Sliders personalizados
- **Construcción (E):** son `div` posicionados. La pista (`.levels-track`) es un degradado lineal de negro a blanco, de 6 px de alto. Los tiradores (`.levels-handle`) son círculos de 20 px centrados con `translate(-50%,-50%)`.
- **Inputs ocultos (E):** cada slider conserva su `<input type="range">` original con `display:none`. Esos inputs son la fuente de la verdad, y sus valores se reflejan en los `<input type="number">` que hay debajo.
- **Eventos (E):**
  - Arrastre: `mousedown`, `mousemove` y `mouseup`, con equivalentes táctiles. `touchmove` usa `{passive:false}`.
  - Teclado: `keydown` en cada tirador, con `role="slider"` y `tabindex=0`.
  - Repintado: `resize`, y `refreshLevelsComposite` y `refreshOutputComposite` mediante `requestAnimationFrame` al entrar en el paso 2.
- **Comentario en el CSS (E):** «gap not supported in UXP; use margins». El espaciado se emula con márgenes.

### 2.4 Tema
- **Tema (E):** `@media (prefers-color-scheme: dark|darkest|light|lightest)` cambia el logotipo (`DTPREP_Logo3.png` o `DTPREP_Logo3dark.png`), el relleno de los SVG y el borde de los tiradores.
- **Iconos del manifest (E):** juegos `light` y `dark` a 1x y 2x para `chrome` y `pluginList`.

### 2.5 Estado y persistencia
- **Presets (E):** en el *data folder* del plugin, archivo `presets_LightningDTPrep.json`. El preset `Default` no se puede borrar ni sobrescribir. Valores por defecto: LPI 30, ángulo 33, niveles 7 / 2 / 100, Shadow 0, Round, Cleanup `standard`.
- **Último estado (E):** en `localStorage`, con las claves `dtprep_unit`, `dtprep_colorsLinked`, `fillcolor`, `fillcolor2`, `shirtcolor`, `halftoneType`, `patternAngle`, `doHalftone`, `whitePointInput`, `blackOutputInput`, `pathExpandInput`, `postCleanup` y `lastPreset`.
  - Los colores se guardan como `"rgb(r,g,b)"` y se recortan con `substring`.
  - Hay una clave con errata, `fillcolo2`, que se lee pero nunca se escribe.
- **Menú del panel (E):** se gestiona con el evento `uxpcommand` (unidades, presets, licencia).
- **Notificaciones (E):** `addNotificationListener` registra al menos el evento `open` de documento.

---

## 3. Pipeline de **Run DTPREP**

La secuencia se reconstruyó a partir de los arrays de `batchPlay`, que se ejecutan en orden dentro de cada lote. Los nombres de capa son literales del código.

1. **Validación (E):** el modo debe ser `RGBColorMode` o CMYK. Si no, muestra el aviso «save the document as RGB or CMYK».
2. **Pantalla (E):** oculta `step1` y muestra `step2`.
3. **Documento de trabajo (E):** `duplicate` del documento con `merged:true`, con el nombre `«nombre» - DTPrep`. El original no se toca.
4. **Escala (E):** `document.resizeImage(w, h, 300, "dpi")`. Los píxeles salen de multiplicar el valor por el factor de la unidad y por 300.
5. **Historial (E):** `hostControl.suspendHistory(...)` agrupa todo en un único paso, «Lightning DTPrep».
6. **Construcción de capas, en un solo `batchPlay` (E):**
   - Canal **`MAIN MASK`**, creado con `make channel` y `calculation`. Es la máscara de cobertura del arte (alfa).
   - El arte se convierte en **objeto inteligente** (`newPlacedLayer`). Si el documento es CMYK, el contenido del objeto inteligente se pasa a RGB.
   - Filtros inteligentes de suavizado previo:
     - `gaussianBlur`, radio **1,4 px**.
     - `surfaceBlur`, radio **20 px**, umbral **24**. El filtro 1 queda oculto (`hide filterFX index 1`) y se borra su máscara de filtro.
   - **`Main Color`**: relleno sólido del color de knockout. Se duplica como **`Main Color BG`**, el fondo con el color de prenda.
   - Knockout: la capa de color se pone en fusión **`difference`** sobre el arte y se oculta si el knockout está desactivado.
   - **`Main Levels 1`**: capa de ajuste `levels` con negro, gamma y blanco de entrada.
   - **Sombras e iluminaciones** (`adaptCorrect`) como filtro inteligente:
     - Sombras: cantidad 20 %, ancho tonal 100 %, radio 50 px.
     - Iluminaciones: cantidad 0, ancho 50 %, radio 0.
     - Corrección de color 25, recorte de negro y blanco al 0,01 %.
     - La **opacidad de fusión de ese filtro** es el valor de **Boost Shadow** (0–100). En vivo, cada cambio vuelve a enviar el filtro completo junto con la opacidad, así que Photoshop lo recalcula. Ver [RENDIMIENTO-DTPREP.md](RENDIMIENTO-DTPREP.md).
   - `applyImage` de `MAIN MASK` sobre la máscara de capa de **`MAIN ART 2`**.
   - **Patrón**: `placeEvent` de la plantilla PSD como **`MainPattern1 SMART`**, en fusión **`hardMix`**.
   - Ajuste `hueSaturation` en modo colorear, saturación y luminosidad 0. Es una conversión a grises antes del umbral (H).
   - `fillOpacity` **90 %** en una capa intermedia (E). Ver §4.3.
   - Capas de patrón **`HALFTONE ROUND`** y **`HALFTONE LINE`** (`patternLayer`).
   - Grupo **`MAIN GROUP 1`** con *blend-if* (`blendRange`): fuente negra 10–10 y blanca 255, destino 0–255. Los píxeles de la capa con valor ≤ 10 dejan de mostrarse.
   - Grupo de recorte **`Main Threshold`**.
   - Ajustar a pantalla.
7. **Parámetros de trama (E):** se aplican la frecuencia y el ángulo, y después `bakePattern` (§4.4).
8. **Historial (E):** `resumeHistory`.
9. **Cronómetro (E):** en modo de prueba mide la duración con `performance.now()`.

La auditoría anterior midió en vídeo unos 3 s para este paso.

---

## 4. Cómo se generan los semitonos

### 4.1 Mecanismo: umbral por Hard Mix
- **Patrón (E):** la trama no se calcula en JS. Una capa de patrón con celdas en degradado (punto radial en *Round*, línea en *Line*) se combina con el tono del arte mediante **Mezcla definida** (*Hard Mix*). Las celdas salen de las plantillas `MainPattern3/4.psd`.
- **Fórmula (E):** en Hard Mix, cada canal vale 255 si `A + B ≥ 255` y 0 en caso contrario.
- **Resultado (H):**
  - El patrón actúa como **matriz de umbral repetida en cada celda**.
  - Donde el arte es más oscuro, se supera el umbral en una parte mayor de la celda, y el punto sale más grande.
  - El resultado es una **trama AM** clásica: frecuencia fija y tamaño de punto variable.
- **Máscara (E):** ese resultado binario es la máscara de transparencia (vista *Mask*). El RGB del arte queda intacto, como ya documentaba la auditoría anterior.

### 4.2 Frecuencia (LPI) y escala del patrón (E)

```
escala_patrón_% = redondear(470.1 / LPI, 2 decimales)
```

La misma escala se aplica a `HALFTONE ROUND` y a `HALFTONE LINE`.

| LPI | Escala del patrón | Celda a 300 ppp (300 / LPI) |
|---|---|---|
| 20 | 23,5 % | 15 px |
| 25 | 18,80 % | 12 px |
| 30 *(defecto)* | 15,67 % | 10 px |
| 35 | 13,43 % | 8,6 px |
| 40 | 11,75 % | 7,5 px |
| 45 | 10,45 % | 6,7 px |
| 50 | 9,40 % | 6 px |
| 60 | 7,84 % | 5 px |

- **Tamaño de la tesela (H):** si se cumple `celda = 300 / LPI`, la tesela del PSD mide unos `30000 / 470.1 ≈ 63,8 px` por celda al 100 %. Es decir, unos 64 px, con la constante calibrada para 300 ppp.
- **Por qué funciona (E):** el documento siempre se reescala a 300 ppp antes, así que la LPI equivale a líneas por pulgada físicas.
- **Debounce (E):** el campo de frecuencia en el diálogo *Edit Halftones* espera **300 ms** tras cada `input` antes de reaplicar la escala. Con `change`, la aplica al momento.

### 4.3 Ángulo (E)
- **Inversión del signo:** `angle = −|valor|`, y las dos ramas del ternario multiplican por −1. El efecto real es que **cualquier ángulo se invierte de signo**, así que 33 se aplica como −33 en `patternLayer.angle`.
  - Esto compensa el sentido de giro de Photoshop (H).
  - Como efecto secundario, un ángulo negativo en la UI acaba en positivo, y no hay forma de introducir el sentido contrario.
- **Por qué 33 (H):** 33° no es uno de los ángulos de serigrafía habituales (15, 45, 75), pero evita el moiré con las tramas a 0 y 45° y con el tejido de la prenda.

### 4.4 Horneado de la trama (`bakePattern`, E)
1. Borra la capa `HALFTONE FLAT` anterior si existe.
2. Muestra `HALFTONE ROUND` o `HALFTONE LINE` según el tipo.
3. Hace `copyToLayer`, la sube al frente, selecciona todo y rasteriza en una capa nueva con **`antiAliasNone`**. El resultado se llama **`HALFTONE FLAT`**.
4. Oculta las dos capas de patrón vivas.

Así se evita recalcular el relleno de patrón en cada cambio de niveles (H). Los bordes del punto quedan duros a nivel de píxel, sin semitonos de antialias que el RIP de DTF podría interpretar como tinta parcial.

### 4.5 Niveles y salida («Force Halftones»)
- **Actualización en vivo (E):** un único `set` sobre la capa de ajuste `Main Levels 1`, localizada por su ID, con `levelsAdjustment` sobre el canal compuesto: `input:[negro, blanco]`, `gamma`, `output:[negroSalida, blancoSalida]`.
- **Validación (E):** si el negro es mayor o igual que el blanco, cancela la actualización y lo registra en la consola.
- **Salida (H):** con la salida restringida (por ejemplo 0–255 frente a 20–235), el tono nunca llega a 0 ni a 255 antes del Hard Mix. Así siempre aparece un punto mínimo en las luces y un hueco mínimo en las sombras. Eso es lo que la UI llama «forzar semitonos».
- **Rangos (E):** negro 0–253, gamma 0,01–9,99, blanco 2–255. Valores por defecto 7 / 2 / 100, y salida 0 / 255.
  - Con blanco 100 y gamma 2, el plugin satura agresivamente hacia «sin tinta» en las luces medias.
  - Es decir, el valor por defecto está pensado para que **solo las zonas oscuras y saturadas** generen color sólido.
- **Opacidad de relleno al 90 % (H):** probablemente actúa como sesgo del umbral de Hard Mix, porque Photoshop pondera la mezcla definida por la opacidad de relleno y eso desplaza la curva de tono a punto.

### 4.6 Post Cleanup: apertura morfológica de la máscara (E)

| Opción | `postLevel` |
|---|---|
| None | 0 (no hace nada) |
| Standard | 1 |
| High | 2 |

**Calado** (para dejar el borde suave antes de la apertura):

```
calado_px = LPI ≥ 40 ? 1 : 1 + 0.1 · (40 − LPI)      // 2 decimales
            + 0.5 si la opción es High
```

| LPI | Standard | High |
|---|---|---|
| 20 | 3,0 px | 3,5 px |
| 30 | 2,0 px | 2,5 px |
| 40 o más | 1,0 px | 1,5 px |

**Secuencia sobre la máscara:**
1. Espera **100 ms**.
2. Carga la máscara como selección.
3. `feather(calado)`.
4. `contract(postLevel px)` y luego `expand(postLevel px)`. Esto es una **apertura morfológica**, que elimina islas y líneas de menos de unos `2 · postLevel` px.
5. Invierte la selección (H) y rellena de negro al 100 % en modo normal.
6. Deselecciona.

**Resultado:** se borran de la máscara los puntos y filamentos sueltos, que en DTF no se adhieren bien.

**Persistencia (E):** el nivel se guarda en `localStorage.postCleanup`.

### 4.7 De-Fringe (E)
1. Deselecciona.
2. **Aplica** la máscara a los píxeles (`delete mask` con `apply:true`).
3. Aplica un comando con **ancho de 8 px**. Es, con toda probabilidad, *Capa ▸ Halos ▸ Eliminar halos* (H).
4. Recrea la máscara desde la transparencia.

Se aplica solo en **Apply** y solo si la casilla está activa.

### 4.8 Apply (E/H)
1. Reescribe la máscara según el estado actual (`synchronousExecution:true` y `paintOptions:{immediateUpdate:true, quality:"draft"}`).
2. Aplica Post Cleanup, después De-Fringe si está activo, y después la finalización.
3. La finalización ejecuta un comando con **`level:128`**. Es casi seguro un umbral al 50 % que binariza la máscara o el alfa (H).
4. Selecciona el canal RGB y **duplica el documento** con un sufijo de nombre: ese es el documento de salida.

---

## 5. Rendimiento

| Aspecto | Qué hace DTPrep | Efecto |
|---|---|---|
| Motor | Solo `batchPlay`: capas, filtros y fusiones nativas | Cero coste de JS por píxel. Photoshop compone de forma nativa, con GPU cuando la hay (H) |
| Ajuste de niveles | Un `set levels` sobre una capa de ajuste | Casi instantáneo. Photoshop solo recompone |
| Boost Shadow | Vuelve a enviar el filtro *Sombras e iluminaciones* completo (radio 50) junto con la opacidad, con 100 ms de debounce | Recalcula el filtro inteligente en cada cambio: es el ajuste en vivo más caro |
| Cambio de vista | `show`/`hide` de capas | Inmediato, sin escribir píxeles |
| Historial en Run | `suspendHistory`/`resumeHistory` | Un único paso. Evita miles de estados |
| Historial en vivo | Tras cada ajuste de niveles lanza `clearEvent` sobre `historyStates` (E) | **Borra todo el historial del documento de trabajo.** Ahorra memoria, pero el usuario pierde el deshacer |
| Apply | `synchronousExecution` y `quality:"draft"` con repintado inmediato | Prioriza la respuesta al pintar |
| Esperas | Debounce de 300 ms en la escala de trama y espera fija de 100 ms antes del cleanup | Latencia perceptible pero acotada |
| Filtros previos | `surfaceBlur` r20/t24 y `gaussianBlur` 1,4 en un objeto inteligente | Lo más caro de Run en imágenes grandes (H). Se calcula una sola vez |
| Trama horneada | `HALFTONE FLAT` rasterizada sin antialias | Evita volver a teselar el patrón |
| Ofuscación | Aplanamiento con generadores y `with` | `with` impide optimizar el JIT en esas funciones (H). En el JS de UI el coste es pequeño frente al de Photoshop |
| Registro | Muchos `console.log` en rutas críticas | Coste menor (H) |

---

## 6. Comparación con este repo (0.7.0 RC)

| Tema | DTPrep 1.1.4 | halftone-dtf-ps |
|---|---|---|
| Cálculo de trama | Nativo: patrón con Hard Mix | Motor JS en caché (`live-render.js`): `lut[cobertura] > umbral` |
| Escritura por ajuste | Ninguna (cambia descriptores) | `putLayerMask`, 1 B/px |
| Escala y frecuencia | Reescalado a 300 ppp y patrón al `470.1/LPI` % | Salida fija a 300 ppp |
| Limpieza | Apertura morfológica con calado según LPI | Islas por área mínima, con búsqueda acotada |
| Halos | Comando nativo de Photoshop, 8 px | «Halos» propio |
| Historial | Suspende y luego **borra** | Pendiente de validar |
| Independencia del host | Depende de PSD de patrón y de comandos de Photoshop | Motor portable y testeable en Node |

**Ideas aplicables sin copiar** (son técnicas estándar de Photoshop):
1. **Niveles como capa de ajuste nativa** delante de la máscara. Así mover un slider deja de costar CPU en JS. A cambio, la máscara se calcularía en Photoshop y no en el motor propio.
2. **Hard Mix contra una matriz de umbral** generada por el propio plugin, sin las plantillas de DTPrep, como modo de vista rápida. Después se hornea con el motor JS en Apply para garantizar un resultado 0/255 determinista.
3. Hacer depender el radio del cleanup de la LPI, como en §4.6, en lugar de usar un área fija.
4. **No** borrar el historial en cada ajuste. Si hace falta memoria, conviene agrupar los cambios con `suspendHistory` por sesión de edición.
5. Exponer el signo del ángulo de forma explícita para evitar la inversión silenciosa de §4.3.

---

## 7. Qué está verificado y qué no

**Verificado estáticamente:**
- Manifest, UI, CSS, presets y claves de `localStorage`.
- Nombres de capas y canales.
- Constantes (`470.1/LPI`, 1,4 px, r20/t24, *Sombras e iluminaciones* 20/100/50/25, blend-if 10, opacidad de relleno 90 %, calado, `postLevel`, De-Fringe 8 px, nivel 128).
- Debounce de 300 ms y espera de 100 ms.
- `suspendHistory` y `clearEvent historyStates`.

**Requiere Photoshop:**
- La forma real de las celdas en las plantillas PSD (perfil del degradado) y si la tesela mide de verdad unos 64 px.
- La curva tono → punto resultante, incluido el efecto de la opacidad de relleno al 90 %.
- La identidad exacta de los comandos ofuscados marcados (H): *Eliminar halos*, umbral 128 e invertir selección.
- Los tiempos reales a 13 MP y a más de 50 MP, y el uso de GPU.
- El comportamiento en CMYK y en 16 bits.
- El efecto de borrar el historial.
