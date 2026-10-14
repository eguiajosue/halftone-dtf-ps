# Auditoría frente a DTPrep (referencia de uso)

Fuente: una grabación de pantalla de DTPrep (Lightning Plugins) en Photoshop, de 84 s y sin audio, comparada con el repositorio en 0.6.4 RC.

## Cómo trabaja DTPrep

1. **Una pantalla para preparar:** preset, *Current 300 DPI Print Size*, escala en cm proporcional, trama activa con forma (Round/Line), LPI con su equivalente en LPC, ángulo, color de knockout y color de prenda vinculado, y el botón **Run**.
2. **Run** tarda unos 3 s y crea un documento nuevo con dos capas:
   - `Main Color BG`: relleno sólido con el color de la prenda.
   - `MAIN ART`: el arte con una **máscara de capa** donde vive la trama. El RGB del arte queda intacto.
3. **Una pantalla para ajustar:** Levels (7 / 2 / 100), Output levels (0 / 255), Boost Shadows, vistas Original / Shirt / Alpha / Mask, Pixel Cleaner None / Standard / High, De-Fringe, y Cancel / Apply.
4. **En vivo:** mover un slider solo rehace la máscara. Cambiar de vista es inmediato porque solo muestra u oculta el relleno o la máscara.
5. **Apply** genera el documento final con transparencia, y el panel vuelve a la pantalla 1.

## Hallazgos en 0.6.4

| Problema | Impacto |
|---|---|
| Cada movimiento de slider ejecutaba `processRGBA` completo: knockout, potencia, trigonometría por píxel y limpieza con búsqueda completa. | Unos 2 s de CPU a 25 × 38 cm (13 MP) |
| Cada actualización escribía RGBA completo con `putPixels`, aunque niveles y trama solo cambian el alfa. | 4 B/px por ajuste |
| Las vistas Prenda / Original / Máscara reconstruían una capa opaca a resolución completa en cada ajuste. | 4 B/px más por ajuste; cambiar de vista era lento |
| Retrasos encadenados: espera de 100 ms y, con el inspector abierto, detalle provisional más una pausa de 250 ms. | Latencia percibida |
| Panel de Ajustar con desplazamiento, salida y sombras ocultas, y lotes en la pantalla principal. | Más clics que DTPrep |

## Cambios aplicados

### Documento de trabajo con relleno y máscara
Implementado en `plugin/native-layers.js` y `plugin/host.js`.

- **Capas:** `Arte · …` es una capa de píxeles con máscara de capa; debajo está `Color de prenda · vista (no se exporta)`, una capa de relleno sólido.
- **Escritura del color:** el RGB se escribe al iniciar y solo se vuelve a escribir cuando cambian Recuperar color, Sombras, Intensidad o Halos (en Halos, también los niveles).
- **Escritura de la máscara:** niveles, trama y limpieza escriben solo la máscara con `imaging.putLayerMask`, de 1 B/px. Antes se escribían unos 8 B/px.
- **Vistas como estado de capas:**

  | Vista | Relleno | Máscara |
  |---|---|---|
  | Prenda | visible | activa |
  | Alfa | oculto | activa |
  | Original | oculto | desactivada |
  | Antes sobre prenda | visible | desactivada |

  Máscara y Comparar siguen usando la capa temporal anterior.
- **Aplicar:** elimina el relleno y la máscara, y escribe una única capa con alfa 0/255, idéntica al motor completo (comprobado en las pruebas).
- **Respaldo:** si Photoshop rechaza alguna operación nativa, la sesión vuelve sola al método anterior y muestra un aviso. Las sesiones por bloques (más de 16 MP) y la protección de detalles siguen usando el motor completo.

### Motor en caché
Implementado en `plugin/live-render.js`.

- **Por etapas:** cobertura base (alfa y knockout) y umbrales de trama en 16 bits por píxel, cada uno guardado en caché según sus parámetros. Los niveles son una tabla de 65 536 entradas. La máscara se calcula como `lut[cobertura] > umbral`.
- **Limpieza acotada:** la búsqueda se detiene en cuanto un componente alcanza el área mínima o toca uno ya conservado. Elimina exactamente las mismas islas que el motor completo.
- **Precisión:** coincide con `processRGBA` salvo en 0 a 2 píxeles de cada 72 000, por el redondeo a 16 bits en el borde exacto de un punto (`tests/live-render.test.js`).

Medición en CPU con Node 22 (sin la lectura y escritura nativas de Photoshop), en una imagen de 2965 × 4488 px (25 × 38 cm a 300 ppp):

| Operación | ms |
|---|---|
| `processRGBA` completo (método anterior, en cada ajuste) | ~2100 |
| Primer cálculo de la sesión nueva | ~1800 |
| Mover un nivel, limpieza Normal | ~230 |
| Mover un nivel, sin limpieza | ~32 |

### Interfaz al estilo DTPrep
- **Preparar:**
  - Muestra el *Tamaño actual a 300 ppp*.
  - Muestra el equivalente en LPC bajo la lineatura.
  - "Procesar lote" pasa al menú ☰.
- **Ajustar:**
  - Los colores de knockout y de prenda ocupan dos filas, con el vínculo "Prenda = eliminado".
  - Niveles unificados como en DTPrep: un solo slider con tres tiradores (negro, medios, blanco) y otro con dos para la salida (negro, blanco), con sus valores debajo (`plugin/levels-slider.js`). El tirador de medios se dibuja en 0,5^gamma entre negro y blanco, igual que en Photoshop (gamma 2 queda a un cuarto). Se puede arrastrar, hacer clic en la pista para mover el tirador más cercano o usar las flechas del teclado.
  - Sombras queda siempre visible.
  - La vista **Alfa** se llama igual que en DTPrep.
  - Espera de 40 ms antes de recalcular (antes 100 ms).
- **Sin borrar nada:** lotes, recetas, proyectos, inspector, protección, rendimiento, actualizaciones y ayuda siguen accesibles en el menú ☰ o en los paneles plegables.

## Pendiente de validar en Photoshop (Windows, 25.0 o superior)
- `make channel` con `revealAll`, `imaging.putLayerMask` con imagen en escala de grises de 1 canal, y `make contentLayer solidColorLayer` junto con `Layer.move` (PLACEAFTER).
- `set layer userMaskEnabled` y `set solidColorLayer` sobre la capa de relleno seleccionada.
- Arrastre del slider de niveles con eventos de puntero de UXP y el degradado de la pista (si UXP no dibuja `linear-gradient`, se ve gris liso).
- Tiempo real de cada ajuste a 13 MP y comportamiento del historial.
- Si cualquiera de estas operaciones falla, el panel avisa y usa el método anterior. Registrar la evidencia en `release-validation.json`.
