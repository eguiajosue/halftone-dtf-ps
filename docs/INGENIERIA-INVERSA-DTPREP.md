# Ingeniería inversa de Lightning DTPrep 1.1.4: informe técnico

## 1. Alcance y método

| Dato | Valor |
|---|---|
| Objetivo | `LightningDTPrep_v114.ccx`, copia subida a la sesión. La ruta `C:\Plugins\…` está en el equipo del usuario y no es accesible desde el contenedor. |
| SHA-256 del `.ccx` | `79152571d15c0c518cd996e4363f291c88c61436c24295c9620d9f4c1f3e9bd8` |
| SHA-256 del árbol extraído (REA) | `e5adbc1adb54a2f5de8d5d891b796ac4e16bcf7e567a4d2c087ae400cb01fc73` |
| Herramienta | REA `analyze_javascript_application` por CLI (`rea-agents`), porque el servidor MCP de REA no está registrado en esta sesión. Evidence: `ev_808051ee6f29018fe9d7cb1331f689fb9f411a2e11751d978bec9903b2c8192c` |
| Otras técnicas | Lectura del manifest, del HTML y de `presets.js` (código legible), y parseo del formato PSD de los recursos (bloques `Patt` y `PtFl`). |
| Restricciones | No se modificaron ni ejecutaron los archivos originales. Todo lo de este informe es estático. El código de `main.js` (716 KB) y `main2.js` (245 KB) está ofuscado (control-flow flattening y cadenas cifradas) y no se desofuscó. |

Grados de evidencia usados en el informe:

- **[O] Observado:** está literalmente en el paquete.
- **[I] Inferido:** se deduce de evidencia indirecta.
- **[?] Desconocido:** requiere probarlo dentro de Photoshop.

## 2. Empaquetado y manifest [O]

| Campo | Valor | Implicación |
|---|---|---|
| `id` / `version` | `com.lp.DTPrep` / `1.1.4` | |
| `host` | PS ≥ 23.3.0, `apiVersion: 2`, `loadEvent: use`, `enableMenuRecording: false` | API moderna (`executeAsModal`). Sus acciones **no se graban** en el panel Acciones. |
| `manifestVersion` | 5 | UXP v5 |
| Entrypoint | Un panel `dtprep`, fijo de 280 × 590–620 px | Sin comandos de menú visibles en el manifest. |
| `network` | `https://www.lightningplugins.com`, `https://lightningplugins.com` | Solo para la licencia. |
| `launchProcess` | `.eps .svg .pdf .ai .psd` y esquema `https` | Abre la web y archivos de diseño. |
| `localFileSystem` | `request` | Lee y escribe en el data folder: presets y `license_backup.json`. |
| `clipboard` | `readAndWrite` | Para la clave de licencia [I]. |
| `allowCodeGenerationFromStrings` | `false` | Sin `eval`. |

## 3. Arquitectura de archivos [O]

| Archivo | Tamaño | Función |
|---|---:|---|
| `index.html` | 33 KB | Toda la interfaz (Spectrum UXP) y los diálogos. Carga `main2.js` y luego `main.js`. |
| `main2.js` | 245 KB | "Lightning Plugins Licensing System" (activar, desactivar, validar). Ofuscado. |
| `main.js` | 716 KB | Interfaz y lógica de proceso. Ofuscado. Llama a `entrypoints.setup` con `plugin`, `commands` y `panels`. |
| `presets.js` | 4 KB | Presets en `presets_LightningDTPrep.json` del data folder, con un preset `Default` inmutable. |
| `style.css` | 12 KB | Estilos del panel y de los sliders propios. |
| `MainPattern3.psd` / `MainPattern4.psd` | 40 / 65 KB | **Recursos de trama** (sección 6). |
| `icons/*`, `DTPREP_Logo3*.png` | — | Marca. |

Resultado de REA [O]:

- 3 archivos JS analizados, 242 362 nodos AST, 0 fallos de análisis.
- Dependencias: solo `uxp`, `photoshop` y `os`.
- 0 workers, 0 addons nativos, 0 WebAssembly, 0 bundles webpack.

REA advierte que las rutas ofuscadas quedan sin resolver: la ausencia de una llamada en este análisis **no prueba** que no exista.

## 4. Interfaz y herramientas

### Paso 1 (`#step1`) [O]

| Control (id) | Valores por defecto | Función |
|---|---|---|
| `presetPicker` + `btnPresetMenu` | "Default Preset" | Cargar, guardar y borrar presets (diálogo `presetNameInput`). |
| `currentPrintWidth/Height` | — | Tamaño actual a 300 DPI. |
| `scaleToWidth/Height` + `btnUnitMenu` | 10 × 10 | Escala objetivo. Unidades in, mm o cm (`unitPicker`, clave `dtprep_unit`). |
| `doHalftone`, `halftoneType` | activo, Round / Line | Tipo de trama. |
| `patternScaleInput` | 30 | Frecuencia en **LPI**. El nombre interno "patternScale" indica que se traduce a escala de motivo [I]. |
| `patternAngleInput` | 33 | Ángulo. |
| `doKnockout`, `fillcolor` | activo | Color a eliminar (knockout). |
| `shirtcolor`, `btnLinkColors` | negro | Color de prenda para la vista previa, vinculable al de knockout (`dtprep_colorsLinked`). |
| `btnPopulate` | — | **Run DTPREP**. |
| `btnSettings`, `btnHelp` | — | Licencia, unidades y ayuda. |
| `testalert`, `datealert` | — | Avisos "TEST MODE" y "BETA TRIAL COPY": modo de prueba y caducidad [I]. |

### Paso 2 (`#step2`, tras Run) [O]

| Control | Rango / valor por defecto | Función, según la ayuda incluida |
|---|---|---|
| `blackPointInput` / `Slider` | 0–253 / 7–10 | Oculta las zonas más oscuras (punto negro de niveles). |
| `grayPointInput` / `Slider` | 0,01–9,99 / 2,00 | Gamma de medios tonos. |
| `whitePointInput` / `Slider` | 2–255 / 100 | Oculta o muestra las zonas más claras. |
| `blackOutputInput` / `whiteOutputInput` | 0–255 / 0 y 255 | "Output Levels (Force Halftones)": niveles de salida que obligan a tramar. |
| `pathExpand` / `pathExpandInput` | 0–100 / 0 | "Boost Shadow Amount": refuerza sombras que la trama reduce. El nombre interno indica una expansión [I]. |
| `previewButtons` | Original / Shirt / Alpha / Mask | Vistas. |
| `postCleanup` | none / standard / high | Elimina puntos y líneas pequeñas. |
| `doDeFringe` | desactivado | "De-Fringe Color Edges". |
| `btnHalftone` → diálogo `*Edit` | igual que en el paso 1 | Re-tramar sin reiniciar (`pendingPatternScale/Angle`). |
| `btnDefaults` | — | Restablece los sliders. |
| `btnCancel` / `btnApply` | — | Descartar o hornear el resultado. |

Los sliders de niveles son componentes propios: `div` con tiradores `handleBlack/Mid/White` y eventos `mousedown`, `mousemove`, `mouseup` y `touch*` [O].

## 5. APIs UXP y Photoshop

Evidencia visible en el código ofuscado [O]:

- `require("photoshop")` (26), `require("uxp")` (3+), `require("os")`.
- `batchPlay` (9), `executeAsModal` (11), `suspendHistory` (2).
- Sin coincidencias visibles para `imaging`, `getPixels`, `putPixels` ni `putLayerMask`.

Que no se vean esas llamadas sugiere que trabaja con comandos nativos y no con buffers de píxeles [I]. Como las cadenas están cifradas, puede que existan sin ser visibles [?].

Comportamiento de carga observado en una sesión anterior, ejecutando una **copia** en un sandbox de Node. No se repitió aquí porque esta vez no se pidió ejecución:

- **Notificaciones:** `action.addNotificationListener` para `open`, `close`, `layersFiltered`, `invokeCommand`, `imageSize`, `canvasSize`, `rotateEventEnum`, `crop`, `transform` y `trim`. Sirve para recalcular el tamaño de impresión.
- **Arranque:** `entrypoints.setup` con el panel `dtprep`.
- **Licencia:** lectura de `license_backup.json`. Sin licencia, Run muestra "Plugin Registration Error" y no ejecuta ningún `batchPlay`.

## 6. Recursos de trama: el núcleo del algoritmo [O]

Los PSD son documentos de 1×1 px. Contienen **motivos** (`8BIMPatt`) y **capas de relleno de motivo** (`PtFl`):

| PSD | Capas (relleno de motivo) | Motivos (64 × 64, escala de grises de 8 bits) | Parámetros guardados |
|---|---|---|---|
| `MainPattern3.psd` | `HALFTONE LINE`, `HALFTONE ROUND` | `DTPrep_Line.png`, `DTPrep_Round` | Escala 20 %, ángulo 22,5° |
| `MainPattern4.psd` | Las anteriores, más `HALFTONE ELLIPSE` y `HALFTONE DIAMOND` | Las anteriores, más `DTPrep Ellipse2` (64 × 58) y `DTPrep_Diamond2` | Escala 20 %, ángulo 22,5° |

Las teselas decodificadas son **mapas de umbral**:

- **Redonda, elipse y diamante:** valor 0 en el centro de la celda y 254 en las esquinas, con 254 o 255 niveles distintos.
- **Línea:** gradiente vertical de 8 a 249.

Esto establece la técnica [I, fuerte]: la trama se obtiene **comparando la cobertura de la imagen con un motivo de umbral tileado**.

- El motivo escalado define la celda: celda en px = 64 × escala. Con 20 % salen 12,8 px, unos 23 LPI a 300 DPI.
- La rotación del relleno da el ángulo.
- Para F LPI a 300 DPI: **escala = 300 / F / 64 × 100 %**. Por ejemplo, 30 LPI da 15,625 %.

Hallazgo: los motivos Ellipse y Diamond ya están en el paquete, pero la interfaz solo ofrece Round y Line. Parecen formas preparadas para una versión futura.

## 7. Persistencia [O, REA]

| Lugar | Contenido |
|---|---|
| `localStorage` | `doHalftone`, `halftoneType`, `patternAngle`, `pendingPatternScale/Angle`, `whitePoint(Input)`, `blackPoint`, `grayPoint`, `blackOutputInput`, `whiteOutputInput`, `pathExpand(Input)`, `postCleanup`, `fillcolor`, `fillcolor2`, `shirtcolor`, `dtprep_colorsLinked`, `dtprep_unit`, `lastPreset`. |
| Data folder | `presets_LightningDTPrep.json`, `license_backup.json`. |

Defecto observado: se lee la clave `fillcolo2` (con errata) además de `fillcolor2`. Probablemente una de las dos lecturas nunca encuentra el valor guardado.

## 8. Canal de proceso: reconstrucción para una implementación equivalente

Esta es una **propuesta de diseño propia** que encaja con la evidencia. No es el código de DTPrep: los pasos marcados [?] deben validarse en Photoshop.

1. **Preparar:** duplicar a un documento nuevo, RGB 8 bits, `imageSize` a 300 ppp y a la escala pedida. Todo dentro de `executeAsModal` con `hostControl.suspendHistory`, para tener un solo paso de historial.
2. **Cobertura:**
   - Transparencia de la capa a selección y de ahí a un canal: alfa = cobertura.
   - Con knockout: `colorRange` sobre el color de prenda (con tolerancia), invertir e intersecar.
3. **Niveles:** `levels` sobre el canal de cobertura con negro, gamma y blanco de entrada, más negro y blanco de salida. La salida > 0 obliga a tramar incluso los sólidos.
4. **Trama:**
   - Relleno de motivo (`contentLayer` → `patternLayer`) con la tesela de umbral, escala `300/LPI/64·100 %` y ángulo.
   - Máscara = cobertura > umbral. En Photoshop se puede hacer con *Apply Image* en modo Restar y luego `thresholdClassEvent` en 1, o con *Calculations* [?].
5. **Boost shadows:** expandir la máscara (`Maximum` de radio proporcional) solo donde la cobertura es alta [?].
6. **Limpieza:**
   - Standard: `median` o `dustAndScratches` de radio pequeño sobre la máscara.
   - High: radio mayor [?].
7. **De-fringe:** `defringe` de Photoshop (Matting) sobre el color [?].
8. **Vistas:**
   - Shirt: relleno sólido de prenda visible.
   - Alpha: relleno oculto.
   - Mask: mostrar el canal.
   - Original: máscara desactivada.
   - Son solo cambios de visibilidad o de estado de la máscara.
9. **Apply:** aplicar la máscara, borrar las capas auxiliares, exportar PNG con transparencia.

Lo que hace rápido este diseño: cada slider es una operación nativa sobre un canal de 8 bits y no hay copias de píxeles JS↔Photoshop.

## 9. Qué se verifica en estático y qué en Photoshop

| Funcionalidad | Estático | Requiere Photoshop |
|---|---|---|
| Permisos, red, tamaños del panel, versión mínima | ✔ verificado | — |
| Controles, rangos, valores por defecto, diálogos, textos de ayuda | ✔ verificado | Apariencia real de Spectrum |
| Persistencia (claves de `localStorage`, archivos del data folder) | ✔ verificado (REA) | Contenido real de los archivos |
| Formas de trama, teselas de umbral, escala y ángulo de los rellenos | ✔ verificado (parseo PSD) | — |
| Fórmula LPI → escala del motivo | Inferido | Confirmar el valor de escala que aplica Run |
| Uso de `batchPlay` / `executeAsModal` / `suspendHistory` | ✔ presencia | Qué descriptores exactos envía |
| Ausencia de Imaging API | Indicio (cadenas cifradas) | Confirmar |
| Knockout, niveles, boost, limpieza, defringe, vistas, Apply | Solo semántica de la interfaz | ✔ **Necesario**: registrar con Alchemist o con un listener de notificaciones mientras se usa, con licencia válida |
| Licencia y caducidad (`TEST MODE`, `BETA TRIAL`) | Presencia | Flujo completo |
| Rendimiento real | — | ✔ Necesario: medir en Photoshop |

Cómo capturar los descriptores reales en Photoshop, con licencia válida y sin tocar el plugin:

1. Instala Alchemist (UXP) y activa su escucha.
2. Ejecuta Run, mueve cada slider y cambia cada vista.
3. Exporta el registro.

`enableMenuRecording: false` impide usar el panel Acciones, pero no impide las notificaciones de eventos [?].

## 10. Comparación con Halftone DTF

| Aspecto | DTPrep 1.1.4 | Halftone DTF 0.7 |
|---|---|---|
| Cálculo de trama | Motivo nativo de umbral (C++/GPU) [I] | Motor JS exacto (`live-render.js`) |
| E/S por ajuste | Ninguna copia de píxeles [I] | `putLayerMask` de 1 B/px |
| Formas | Round y Line (Ellipse y Diamond en el paquete, ocultas) | 5 formas |
| Calidad controlable | Niveles, boost, 3 limpiezas, defringe | Además: ganancia de punto, rellenar huecos, sólido desde, limpieza por área en mm, canal blanco, tinta y costos, lotes, pliegos |
| Historial | `suspendHistory` | `suspendHistory` en bloques y vistas |

Recomendación: añadir a Halftone DTF una **vista previa nativa por motivo** (sección 8, pasos 4–8) mientras se arrastra, y conservar el motor JS exacto para el resultado final y la exportación. Los mapas de umbral se pueden generar con `engine.threshold` del propio repo (64 × 64 por forma), sin usar los recursos de DTPrep.
