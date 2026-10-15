# Informe técnico: Lightning DTPrep v1.1.4 (análisis estático)

Archivo: `C:\Plugins\LightningDTPrep_v114.ccx`
SHA-256: `79152571d15c0c518cd996e4363f291c88c61436c24295c9620d9f4c1f3e9bd8`
Método: inventario y extracción de solo lectura con REA a una carpeta temporal, más lectura estática. Nada se ejecutó y el `.ccx` original no se modificó.

## 0. Aviso legal y alcance

- `License.txt`: "Copyright (c) 2025 Jason Murphy. All rights reserved." El plugin es comercial y tiene activación de licencia propia.
- Una implementación equivalente debe ser **clean-room**: se replica el comportamiento y la interfaz funcional descritos aquí, sin copiar código, PSD de patrón, logotipos, iconos ni textos de ayuda.
- Este informe **no cubre ni apoya** la reproducción o elusión del sistema de licencias (ver §7). Tu versión debe tener su propio modelo de licencia, o ninguno.

## 1. Paquete (22 archivos, 384 KB comprimido)

| Archivo | Tamaño | Función |
|---|---|---|
| manifest.json | 2.3 KB | Manifest v5, panel único |
| index.html | 33 KB | UI completa (paneles, diálogos) con Spectrum UXP (`sp-*`) |
| style.css | 11.6 KB | Estilos, sliders de niveles personalizados |
| main.js | 717 KB | Lógica principal, **ofuscada** (array de cadenas, nombres tipo `Ll9ycv(0x1c0)`) |
| main2.js | 246 KB | Carga previa en `<head>`: licencias y utilidades. También ofuscada |
| presets.js | 3.8 KB | Persistencia de presets, **legible sin ofuscar** |
| MainPattern3.psd, MainPattern4.psd | 40 y 65 KB | Plantillas de patrón de semitono (round / line) |
| DTPREP_Logo3*.png, icons/* | | Marca e iconos |

No hay `node_modules`, ni WASM, ni binarios nativos. Todo el procesado se hace con comandos de Photoshop.

## 2. manifest.json

- `id` `com.lp.DTPrep`; host `PS` mínimo `23.3.0`; `apiVersion` 2; `loadEvent` `use`; `manifestVersion` 5.
- Entrypoint: **un panel** `dtprep`, tamaño fijo de 280 px de ancho y alto de 590 a 620.
- Permisos:
  - `clipboard: readAndWrite`
  - `network`: `lightningplugins.com` y `www.lightningplugins.com`
  - `localFileSystem: request`
  - `launchProcess`: extensiones `.eps .svg .pdf .ai .psd` y esquema `https`
  - `allowCodeGenerationFromStrings: false`
- Para tu versión: `localFileSystem: request` hace falta solo si usas selectores de archivo. `getDataFolder()` no lo requiere. `network` y `launchProcess` solo si añades licencias o enlaces externos.

## 3. Arquitectura

```
index.html ──► main2.js (head)      licencias, utilidades (ofuscado)
           └─► main.js  (fin body)  UI + pipeline PS (ofuscado)
                  └─ require("./presets.js") ──► uxp.storage.localFileSystem.getDataFolder()
                  └─ require("photoshop") .core.executeAsModal / .action.batchPlay / listeners
                  └─ require("os"), require("./manifest.json")
```

Módulos `require` detectados: `uxp`, `photoshop`, `os`, `./manifest.json`, `./presets.js`.

### 3.1 Flujo de la interfaz (dos pasos)

- **Paso 1** (`#step1`) tiene estos controles:
  - Selector y menú de presets.
  - Tamaño de impresión actual a 300 DPI y campos "Scale to" (ancho × alto) con unidad (in, mm o cm).
  - Casilla Halftone con tipo `Round` o `Line`, frecuencia (LPI, 30 por defecto) y ángulo (33 por defecto).
  - Casilla Color Knockout con color, y color de camiseta o fondo para la vista previa. Un botón "link" liga ambos colores.
  - Botones de ayuda, **Run DTPREP** y ajustes.
- **Paso 2** (`#step2`), tras ejecutar, es el modo de edición en vivo:
  - Preset, knockout y colores.
  - Botones "Default Sliders" y "Edit Halftones".
  - **Levels** compuesto (negro, gamma, blanco): `blackPoint` 0–253, `grayPoint` 0.01–9.99 y `whitePoint` 2–255.
  - **Output Levels** (negro y blanco de salida, 0–255) para forzar semitonos.
  - **Boost Shadow** (0–100).
  - Previsualización: Original, Shirt, Alpha y Mask.
  - Post Cleanup: none, standard o high.
  - De-Fringe Color Edges, y botones Cancel y Apply.
- Diálogos: ayuda, editar semitono, mensaje, guardar preset, unidades y activación de licencia.

### 3.2 Presets (`presets.js`, código legible)

- Archivo en el data folder del plugin: `presets_LightningDTPrep.json`. El nombre sale de quitar los espacios al `name` del manifest.
- Un único objeto JSON `{ nombre: {…parámetros} }`.
- Preset `Default` inmutable: no se puede sobrescribir ni borrar. Si falta o le faltan claves, se re-siembra y se persiste.
- Valores por defecto:

```
patternScaleInput 30, patternAngleInput 33,
whitePointInput 100, blackPointInput 7, grayPointInput 2,
pathExpandInput 0, doHalftone true, doKnockout true,
halftoneType 'Round', shirtcolor 'rgb(0,0,0)', fillcolor2 'rgb(0,0,0)',
postCleanup 'standard'
```

- API del módulo: `getPresets`, `savePreset`, `deletePreset`, `listPresets` y `loadPreset`. `loadPreset` cae a `Default` si el nombre no existe.

### 3.3 Eventos de UI observados

- `click` en botones.
- `change`, `sp-change` e `input` en campos y pickers.
- `keydown` en los handles de los sliders.
- `mousedown`, `mousemove`, `mouseup`, `touchstart`, `touchmove` y `touchend` para los sliders de niveles personalizados (tres handles en Levels, dos en Output, uno en Shadow).
- `resize`.
- `uxpcommand`: evento del menú del panel o flyout (unidades, presets).
- Listener `photoshop.action.addNotificationListener` para el evento `open`, entre otros. La lista completa no pudo resolverse porque los nombres están ofuscados.
- `executeAsModal` se usa en todas las operaciones sobre el documento. El `commandName` es "Lightning DTPrep".

## 4. Llamadas a Photoshop (`batchPlay`)

Descriptores `_obj` encontrados en `main.js`, en orden de aparición en el código. **No es el orden de ejecución.**

`select, set, get, make, delete, move, show, hide, duplicate, fill, convertMode, copyToLayer, ungroup` y `showColorPicker`. Además:

| Área | Descriptores |
|---|---|
| Capas | `layer`, `layerSection`, `groupEvent`, `contentLayer`, `solidColorLayer`, `patternLayer`, `adjustmentLayer`, `newPlacedLayer`, `placeEvent`, `blendOptions` |
| Canales y máscaras | `channel`, `calculation`, `applyImageEvent` |
| Tonos y color | `levels`, `levelsAdjustment`, `hueSaturation`, `adaptCorrect`, `adaptCorrectTones`, `RGBColor` |
| Filtros | `gaussianBlur`, `surfaceBlur`, `filterFX` |
| Selección | `feather`, `contract`, `expand` |
| Preferencias | `generalPreferences` |

## 5. Funcionalidad deducida por herramienta

Marcado como (E) lo respaldado por evidencia estática directa (UI, presets, descriptores) y (H) lo que es hipótesis.

1. **Escala a tamaño de impresión** (E): lee el tamaño del documento, lo muestra en pulgadas a 300 DPI y convierte a mm o cm. El remuestreo se hará con el `imageSize` de Photoshop (H).
2. **Semitono** (E): se deduce de `patternLayer`, `newPlacedLayer` y los dos `MainPattern*.psd`. Una plantilla de patrón (Round o Line) se coloca o escala según LPI y ángulo y se combina con la imagen en tonos de gris (H). `patternScaleInput` y `patternAngleInput` son los parámetros.
3. **Color Knockout** (E/H): genera una máscara o selección del color elegido y la elimina para dejar transparencia. `fillcolor` define el color. Probablemente usa `calculation` y `channel` o una selección por color (H).
4. **Vista previa** (E): Original, Shirt (capa sólida con el color de camiseta), Alpha y Mask. Se implementa mostrando y ocultando capas con `show` y `hide`, con `solidColorLayer` para el fondo.
5. **Levels** (E): una capa de ajuste `levels` con entrada negro, gamma y blanco, más salida negro y blanco. Los sliders actualizan la capa en vivo.
6. **Boost Shadow** (E/H): `pathExpandInput` 0–100 con `expand`, `contract` y `feather`, o un ajuste `adaptCorrectTones`. El nombre sugiere expandir zonas oscuras. **El algoritmo exacto no se recuperó.**
7. **Post Cleanup** (E/H): none, standard o high. Elimina puntos y líneas pequeños tras el semitono, probablemente con `surfaceBlur`, `gaussianBlur` y `levels` de umbral (H).
8. **De-Fringe** (E/H): limpia el borde de color del knockout (`contract` o `feather`) (H).
9. **Apply y Cancel** (E): aplican el resultado y limpian el grupo de capas temporal con `delete`, `groupEvent` y `ungroup`. También gestionan `convertMode` para soportar RGB y CMYK.
10. **Presets** (E): ver §3.2.

## 6. Qué se puede verificar con análisis estático

**Sí, estático:**
- Estructura del manifest y permisos, la UI completa (`index.html`, `style.css`) y los rangos y valores por defecto.
- El sistema de presets, que es legible.
- La lista de tipos de comando Photoshop usados.
- Las rutas de datos del plugin y el único dominio de red.

**Parcial o no recuperado estáticamente:**
- La secuencia exacta de `batchPlay` y sus parámetros: `main.js` está ofuscado con un array de cadenas rotado. REA marcó 38 510 relaciones semánticas como desconocidas y cobertura parcial.
- Los algoritmos concretos (ángulo del patrón, cómo se escala la plantilla, fórmula de Boost Shadow, valores de umbral de cleanup y de-fringe).
- Qué hace `adaptCorrect`, `surfaceBlur` y `applyImageEvent` dentro del pipeline.

**Requieren pruebas dentro de Photoshop (23.3+):**
- Comportamiento real de cada herramienta, con registro del historial o Actions y del panel de capas. Puedes usar el **ScriptListener** o el depurador **UXP Developer Tool** con tu propia copia del plugin o con tu propia implementación.
- Resultados visuales: calidad del semitono, knockout y cleanup.
- RGB frente a CMYK, bits por canal, documentos grandes y rendimiento del modal.
- Comportamiento de `uxpcommand`, el flyout y los eventos de apertura de documentos.
- Compatibilidad entre versiones de Photoshop.

## 7. Licencias (solo descripción, no replicar)

`main2.js` contiene un cliente de activación contra `https://lightningplugins.com/lic_v2/lic_v2.php`. La UI tiene Activate y Deactivate, muestra email e instancia y tiene banners "TEST MODE" y "BETA TRIAL COPY". No se analizó en detalle ni se documentan aquí sus parámetros o su protocolo.

## 8. Plan para una implementación propia (clean-room)

1. `manifest.json` v5 con un panel y los permisos mínimos.
2. UI Spectrum UXP con la misma estructura de dos pasos (la estructura de interacción no está protegida; los textos, gráficos e iconos sí).
3. `presets.js` propio con el mismo esquema JSON, que es una convención de datos simple.
4. Pipeline Photoshop, **diseñado y calibrado por ti**:
   - Grabar con ScriptListener un flujo manual equivalente (escala, semitono, knockout, levels).
   - Parametrizarlo con `batchPlay` dentro de `executeAsModal`.
   - Generar tu propio patrón de semitono (o con `patternLayer`) en vez de usar los PSD de la plantilla original.
5. Previsualización en vivo con una capa de ajuste `levels` actualizada con debounce.
6. Pruebas de las secciones del §6 con documentos RGB y CMYK.

## 9. Limitaciones

- Análisis estático. Nada se ejecutó.
- El código principal está ofuscado: el pipeline concreto no está documentado aquí con exactitud.
- Las secciones marcadas (H) son hipótesis a validar dentro de Photoshop.
