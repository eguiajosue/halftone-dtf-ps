# Cómo genera DTPrep 1.1.4 el tramado: pasos

Complementa [AUDITORIA-DTPREP-ESTATICA.md](AUDITORIA-DTPREP-ESTATICA.md), [PATRONES-DTPREP.md](PATRONES-DTPREP.md) y [RENDIMIENTO-DTPREP.md](RENDIMIENTO-DTPREP.md).

## Método y herramientas

| Paso | Herramienta | Resultado |
|---|---|---|
| Identidad e inventario | REA `open_binary` + `inspect_artifact` | ZIP con 22 archivos, todos con hash verificado. SHA-256 `79152571…3f9bd8` |
| Extracción | REA `extract_artifact` | Copia en una carpeta temporal, con contención verificada. El `.ccx` no se modificó |
| Grafo de la aplicación | REA `analyze_javascript_application` (`main.js`, sin truncar) | 179 511 nodos AST, 8 779 relaciones de llamada, 51 539 de flujo de datos y 10 temporizadores. Cobertura parcial por la ofuscación (28 131 desconocidos) |
| Trazado de cadenas | REA `trace_application_feature` y `trace_feature` | **No sirvió**: el grafo de la aplicación no indexa literales, y `trace_feature` requiere Ghidra o IDA, que aquí no están configurados |
| Secuencia de comandos | Escáner de texto propio, de solo lectura, sobre los archivos extraídos por REA | Lista ordenada de los descriptores `batchPlay` de cada función |

Nada se ejecutó. Los nombres de capa y los valores numéricos son literales del código **(E)**. Algunos comandos están ofuscados (`Ll9ycv(0x…)`) y su identidad se deduce por el contexto **(H)**.

Funciones implicadas (nombres ofuscados):

| Función | Papel |
|---|---|
| `M7SMoV` | Botón Run: prepara el documento y abre el historial |
| `IwMBlSI` | Construye el árbol de capas: 118 descriptores en un solo `batchPlay` |
| `AM9XRc4` | Frecuencia → escala del patrón |
| `BhjnkU` | Ángulo del patrón |
| `nuoP51` | Hornea la trama elegida |
| `rIIVV1` | Niveles en vivo |
| `l_BZpI2` | Boost Shadow en vivo |
| `WNOqyNl` | Post Cleanup |
| `WkDG_og` | De-Fringe |
| `gtHxM_` | Salida final |

---

## Fase 0: preparación (`M7SMoV`)

1. Comprueba que el modo sea RGB o CMYK. Si no, muestra un aviso y se detiene.
2. Cambia el panel de Preparar (`step1`) a Ajustar (`step2`).
3. `duplicate` del documento con `merged:true`, con el nombre «*nombre* - DTPrep». Se trabaja en la copia.
4. `resizeImage(ancho_px, alto_px, 300, "dpi")`, donde los píxeles salen del valor × factor de la unidad × 300.
5. `suspendHistory("Lightning DTPrep")`.
6. Llama a `IwMBlSI` dentro de `executeAsModal`.

## Fase 1: entorno (`IwMBlSI`, antes del lote)

7. Lee la preferencia `placeRasterSmartObject` y la activa si estaba desactivada. Ajusta también la opción del portapapeles.
8. Si el panel Capas está visible, lo oculta (`commandID 1098`).
9. Lee los parámetros:
   - Blanco, negro y gamma de Niveles.
   - Boost Shadow.
   - Color de knockout y color de prenda desde `localStorage`, en formato `"rgb(r,g,b)"`.
   - Escala inicial `470.1 / LPI`.
   - Ángulo invertido de signo.
   - Modo de color (RGB o CMYK).
10. Localiza `MainPattern3.psd` en la carpeta del plugin y crea un token de sesión para colocarlo.

## Fase 2: árbol de capas (`IwMBlSI`, un solo `batchPlay` con 118 descriptores)

### 2.1 Arte y máscara de cobertura
| # | Comando | Detalle |
|---|---|---|
| 1 | `set layer` | Renombra la capa de origen |
| 3 | `duplicate` (H) | Copia del arte → **`MAIN ART`** |
| 4 | `make channel` en `mask` | Crea la máscara de capa (`userMaskEnabled`) |
| 5–6 | `make channel` con `calculation` | Calcula un canal desde la capa actual → canal **`MAIN MASK`**. Es la **cobertura del arte**, su alfa |
| 9 | `set layer` | Ajusta una propiedad de la capa (H) |
| 11 | **`newPlacedLayer`** | Convierte el arte en **objeto inteligente** |
| 12 | `convertMode → RGB` | Solo si el documento es CMYK |

### 2.2 Suavizado previo a la trama
| # | Comando | Detalle |
|---|---|---|
| 13 | **`gaussianBlur`** | Radio **1,4 px**, como filtro inteligente |
| 14 | **`surfaceBlur`** | Radio **20 px**, umbral **24**, como filtro inteligente. Aplana texturas finas sin perder los bordes |
| 15–16 | `hide filterFX #1` y `delete filterMask` | Deja el primer filtro inteligente oculto y quita la máscara de filtro |

### 2.3 Color de knockout
| # | Comando | Detalle |
|---|---|---|
| 17–20 | `make contentLayer solidColorLayer` | **`Main Color`** con el color de knockout |
| 21 | `duplicate` | **`Main Color BG`** |
| 22–26 | `delete mask`, `move`, `select` | Ordena las capas |
| 27–28 | `set layer mode = difference` | La capa de color pasa a **Diferencia**: el píxel cercano al color de knockout queda casi negro |
| 29 | `hide` | Solo si el knockout está desactivado |

### 2.4 Niveles
| # | Comando | Detalle |
|---|---|---|
| 30–32 | `make adjustmentLayer levels` | Capa de ajuste de niveles, nombrada **`Main Levels 1`** (H por el nombre ofuscado; el nombre se confirma en la actualización en vivo) |
| 33 | `delete mask` | |
| 34–36 | `set levelsAdjustment` | Canal compuesto, `input:[negro, blanco]`, `gamma`. Valores por defecto 7 / 2 / 100 |

### 2.5 Segunda copia del arte y sombras
| # | Comando | Detalle |
|---|---|---|
| 38 | `duplicate` (H) | **`MAIN ART 2`** |
| 39–43 | `set layerEffects solidFill` en `MAIN ART` | Superposición de color **blanco** 255/255/255 al 100 %, **desactivada** (`enabled:false`). Queda preparada para las vistas |
| 44 | `make channel` en `mask` | Máscara de capa |
| 45–47 | **`applyImage`** desde `MAIN MASK` | Copia la cobertura del arte a la máscara de capa |
| 48–50 | `select MAIN ART 2` y `delete filterFX #1` | |
| 51–53 | **`adaptCorrect`** (*Sombras e iluminaciones*) | Sombras: cantidad 20 %, ancho 100 %, radio 50. Iluminaciones: 0 / 50 % / 0. Corrección de color 25, recorte 0,01 % |
| 54–56 | `set filterFX blendOptions` | **Opacidad = Boost Shadow** (0–100), modo normal |

### 2.6 Fondos de vista previa
| # | Comando | Detalle |
|---|---|---|
| 59–63 | `make contentLayer solidColorLayer` | **`SHIRT COLOR`**: relleno con el color de prenda, sobre `Main Color BG` |
| 64–65 | `delete mask` y `move` | |
| 66–71 | `make contentLayer solidColorLayer` | **`MASK BG BLACK`**: relleno negro 0/0/0, **oculto**. Es el fondo de la vista *Mask* |

### 2.7 El patrón de trama
| # | Comando | Detalle |
|---|---|---|
| 72 | `select Main Levels 1` | El patrón queda colocado justo encima de los niveles |
| 73–76 | **`placeEvent`** de `MainPattern3.psd` | Centrado (`QCSAverage`), desplazamiento 0, y después un comando ofuscado (H: convertir a objeto inteligente incrustado) |
| 77–78 | `set layer` | Nombre **`MainPattern1 SMART`**. Contiene las capas de patrón `HALFTONE ROUND` y `HALFTONE LINE`, con teselas de 64 × 64 px |
| 79–80 | `set layer mode = hardMix` | **Mezcla definida**: `resultado = (tono + umbral ≥ 255) ? 255 : 0`. **Aquí nace la trama** |
| 81–82 | `set layer` | `fillOpacity` **90 %** (ver la auditoría §4.5) |

### 2.8 Escala de grises antes del umbral
| # | Comando | Detalle |
|---|---|---|
| 84–90 | `make adjustmentLayer hueSaturation` | Con `colorize:true`, matiz, saturación y luminosidad a 0. Es una capa **`Main Desaturate`** que convierte en gris todo lo que hay debajo. Así el Hard Mix trabaja sobre luminancia y no sobre cada canal RGB por separado, lo que evita puntos de colores |

### 2.9 Agrupado y umbral final
| # | Comando | Detalle |
|---|---|---|
| 91–98 | `select` con `addToSelection` | Selecciona `MainPattern1 SMART`, `Main Levels 1`, `Main Color`, `MAIN ART` y `Main Desaturate` |
| 99–100 | `make layerSection` | **`MAIN GROUP 1`**, con todo lo anterior |
| 101–102 | `make layerSection` | **`Main Group Master`**, que envuelve al anterior |
| 103–105 | **`make adjustmentLayer thresholdClassEvent`** | **Umbral con nivel 30** sobre el grupo |
| 106–108 | `delete mask`, `select MAIN ART 2`, `delete filterMask` | |
| 109–110 | `groupEvent` | Crea una máscara de recorte |
| 111–114 | `set blendRange` en `MAIN GROUP 1` | ***Blend-if***: fuente con negro 10–10 y blanco 255, destino 0–255. Los píxeles de valor ≤ 10 se vuelven transparentes |
| 115–117 | `delete channel MAIN MASK` y `groupEvent "Main Threshold"` | Elimina el canal temporal y recorta el umbral |
| 118 | `select fitOnScreen` | Ajusta la vista |

## Fase 3: parámetros de trama (después del lote)

1. **`AM9XRc4(LPI)`:** `set patternLayer.scale = round(470.1 / LPI, 2)` en `HALFTONE ROUND` y `HALFTONE LINE`. Con 30 LPI sale 15,67 %, y la celda mide unos 10 px a 300 ppp.
2. **`BhjnkU(ángulo)`:** `set patternLayer.angle = −ángulo` en las dos capas. Con 33° se aplica −33°.
3. **`nuoP51(tipo)`, el horneado:**
   1. Borra la capa `HALFTONE FLAT` anterior.
   2. Muestra `HALFTONE <TIPO>`, la duplica (`copyToLayer`) y la mueve al frente.
   3. Selecciona todo y rasteriza en una capa nueva **sin antialias** (`antiAliasNone`), llamada **`HALFTONE FLAT`**.
   4. Oculta `HALFTONE ROUND` y `HALFTONE LINE`.
4. Lanza dos `executeAsModal` más: sincroniza la visibilidad del patrón según «Enable Halftone» (`LbQtxrf`) y aplica el estado de vista.
5. `resumeHistory`.
6. Restaura la preferencia de colocar objetos inteligentes y el panel Capas.

## Fase 4: ajustes en vivo

| Control | Función | Qué cambia |
|---|---|---|
| Levels y Output | `rIIVV1`, 50 ms de debounce | `set levels` en `Main Levels 1` (`input`, `gamma`, `output`) y `clearEvent historyStates` |
| Boost Shadow | `l_BZpI2`, 100 ms | `set filterFX #1` en `MAIN ART 2`: el filtro `adaptCorrect` completo y su opacidad |
| Frecuencia | `AM9XRc4`, 300 ms | Escala de las dos capas de patrón y horneado de nuevo (H) |
| Ángulo | `BhjnkU` | Ángulo de las dos capas de patrón |
| Round o Line | `nuoP51` | Vuelve a hornear `HALFTONE FLAT` |
| Vistas | — | `show`/`hide` de `SHIRT COLOR`, `MASK BG BLACK`, la máscara y el patrón |

## Fase 5: Apply

1. Reescribe la máscara con `synchronousExecution` y `quality:"draft"`.
2. **Post Cleanup** (`WNOqyNl`), si no es None:
   1. Espera 100 ms.
   2. Carga la máscara como selección.
   3. Calado: `LPI ≥ 40 ? 1 : 1 + 0.1·(40 − LPI)` px, +0,5 si es High.
   4. `contract` y luego `expand` de 1 px (Standard) o 2 px (High). Es una apertura morfológica.
   5. Invierte la selección (H) y rellena de negro, y deselecciona.
3. **De-Fringe** (`WkDG_og`), si está activo:
   1. Aplica la máscara.
   2. Comando de 8 px (H: *Eliminar halos*).
   3. Recrea la máscara desde la transparencia.
4. **Salida** (`gtHxM_`):
   1. Comando con `level:128` (H: umbral al 50 %).
   2. Selecciona el canal RGB.
   3. **Duplica el documento** con un sufijo de nombre.

---

## Resumen del algoritmo

```
arte ──► objeto inteligente ─► desenfoque gaussiano 1,4 px ─► desenfoque de superficie r20/t24
     └─► [knockout: Diferencia con el color elegido]
     └─► Niveles (7 / 2,00 / 100, salida 0–255)            ← tono
     └─► Desaturar (Tono/Saturación con colorear, todo a 0) ← luminancia
     └─► patrón 64 px (Round euclidiano o Line) al 470,1/LPI %, ángulo −θ,
         en MEZCLA DEFINIDA con opacidad de relleno al 90 % ← umbral por celda = trama AM
     └─► Umbral 30 sobre el grupo y blend-if ≤ 10           ← limpia el gris residual a 0/255
     └─► resultado binario ► máscara de capa del arte (el RGB queda intacto)
Sombras: copia del arte con Sombras e iluminaciones, a la opacidad de Boost Shadow
Apply: apertura morfológica (calado, contraer, expandir) ► eliminar halos 8 px ► umbral 128 ► documento nuevo
```

## Qué está verificado y qué no

**Verificado (E):**
- El orden de los 118 descriptores del lote principal.
- Los nombres de capas y canales.
- Los valores 1,4 / 20 / 24 / 20 / 100 / 50 / 25 / 0,01 / 90 % / 30 / 10 / 128 / 8 px.
- `470.1 / LPI` y el signo invertido del ángulo.
- Los modos `difference` y `hardMix`.
- `colorize` en Tono/Saturación.
- `antiAliasNone`.

**Deducido (H):**
- Identidad de los comandos ofuscados: duplicar, convertir a objeto inteligente incrustado, eliminar halos, invertir selección y el comando con `level:128`.
- Nombre de la capa de niveles en el momento de crearla.
- Efecto exacto de la opacidad de relleno al 90 % y del Umbral 30 sobre la curva de tono a punto.

**Requiere Photoshop:**
- Comprobar el árbol de capas resultante en el panel Capas.
- Grabar con ScriptListener una ejecución de Run para confirmar los comandos ofuscados.
- Medir la curva de tono a punto con una rampa de grises.
