# Rendimiento frente a DTPrep 1.1.4

Fuente: el paquete `LightningDTPrep_v114.ccx` (UXP, `com.lp.DTPrep`). Se inspeccionaron el manifest, la interfaz, `presets.js` (código legible) y los recursos incluidos. El código de proceso (`main.js`, 716 KB, y `main2.js`, 245 KB) está ofuscado a propósito y su licencia es "all rights reserved". No se desofuscó ni se reconstruyó su algoritmo: lo de abajo sale de identificadores visibles y de los recursos, no de su lógica.

## Cómo está construido DTPrep

| Evidencia | Qué indica |
|---|---|
| `require("photoshop")` (26 veces), `batchPlay` (9), `executeAsModal` (11), `suspendHistory` (2) | Todo el trabajo pasa por comandos nativos de Photoshop dentro de operaciones modales, con el historial agrupado. |
| Ninguna referencia visible a `imaging`, `getPixels`, `putPixels`, `putLayerMask`, `Worker` ni `WebAssembly`; un solo `Uint8Array` por archivo | No lee ni escribe píxeles desde JS. *Salvedad:* el ofuscador guarda cadenas codificadas, así que la ausencia es indicio fuerte, no prueba. |
| `MainPattern3.psd` / `MainPattern4.psd`: documentos de 1×1 px con recursos `8BIMPatt` y capas `PtFl` (relleno de motivo) llamados `DTPrep_Round` y `HALFTONE LINE` | La trama es un **motivo nativo de Photoshop**: un relleno de motivo escalado según la LPI y girado según el ángulo, combinado con niveles y máscara. Lo calcula Photoshop en C++/GPU, sin bucles por píxel en JS. |
| Panel fijo de 280 px, una sola dependencia (`uxp`/`photoshop`), sin frameworks | Interfaz mínima: no hay coste de arranque de UI. |

**Por qué se siente rápido:** cada ajuste es una edición nativa (motivo, niveles, máscara) y no hay transferencia de buffers entre JS y Photoshop.

## Diferencia con Halftone DTF

Halftone DTF calcula la trama en JS (`plugin/live-render.js`) y escribe la máscara con `imaging.putLayerMask`, y el color con `putPixels` cuando cambia. Eso da control exacto (curva de ganancia, rellenar huecos, limpieza por área real, canal blanco, estadísticas de tinta) que un motivo nativo no ofrece. Por eso no se reemplazó el motor, sino que se aceleraron sus etapas.

## Optimizaciones aplicadas (salida idéntica)

1. **Knockout con tabla de distancias** (`engine.keyFactor`, `keyTable`): la distancia al color clave solo depende del entero d² (0…195 075), así que el suavizado se tabula una vez. `Math.hypot` se reemplaza por `Math.sqrt(d²)`. En V8, `hypot` no siempre redondea bien: difiere de la raíz exacta en el 32 % de las ternas enteras. Además se omite `Math.pow` cuando gamma = 1.
2. **Recuperación sin asignaciones** (`matteOf`): antes se creaba un arreglo por píxel.
3. **Color sin objetos por píxel:** recuperación y realce (`boostInto`) en el sitio, con el mismo orden de operaciones que `engine.boostedColor`. Defringe sigue usando el camino general.
4. **Limpieza de partículas con atajo:** si un píxel de tinta toca a un vecino ya conservado (izquierda o fila superior), pertenece al mismo componente grande y no se recorre. Se eliminan exactamente las mismas islas.

Los umbrales de trama se probaron en bucles por forma, pero no mejoraron de forma estable y se dejaron como estaban. Solo se recalculan al cambiar LPI, ángulo o forma.

### Medición

CPU con Node 22, imagen sintética de 2965 × 4488 px (25 × 38 cm a 300 ppp), mediana de 5 a 7 repeticiones alternando versiones. El SHA-1 de cobertura, umbrales, máscara y color coincide con 0.7.0 en todos los escenarios. No incluye la E/S nativa de Photoshop.

| Etapa | 0.7.0 | Ahora |
|---|---:|---:|
| Cobertura con knockout + recuperar | 808 ms | 289 ms |
| Cobertura con knockout (línea) | 620 ms | 175 ms |
| Color con recuperar | 1681 ms | 552 ms |
| Color con recuperar + sombras + intensidad | 5205 ms | 1034 ms |
| Mover un nivel, limpieza Baja / Normal / Alta | 193 / 169 / 189 ms | 125 / 122 / 129 ms |
| Primer cálculo con knockout + recuperar (las cuatro etapas) | ~3,0 s | ~1,3 s |

## Siguiente paso recomendado (requiere Photoshop para validar)

Un **modo de previsualización nativo** al estilo DTPrep, solo para el arrastre de sliders:

- Un relleno de motivo de trama (patrones redondo y de línea generados una vez a la LPI y el ángulo actuales) con un ajuste de Umbral en un grupo recortado, que actúa como máscara mientras se arrastra.
- Al soltar el slider, el motor JS exacto escribe la máscara definitiva, como ahora.

Esto quitaría el `putLayerMask` de 13 MB de cada movimiento. Hay que medirlo en Photoshop antes de adoptarlo, porque el resultado del motivo nativo no coincide píxel a píxel con el motor (ganancia, huecos y limpieza).
