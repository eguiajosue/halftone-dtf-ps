# Tamaños por talla, resolución y vistas — v0.5.0

Fecha de investigación: 9 de octubre de 2026.

## Fuentes primarias y alcance

- [Transfer Express: Design Sizes](https://www.transferexpress.com/design-sizes) propone áreas adultas estándar, máximas y jumbo y explica el escalado proporcional. El área estándar es 11 × 11 pulgadas; el área jumbo es 12.5 × 17 pulgadas.
- [STAHLS’: guía de colocación](https://assets.stahls.com/stahls/content/pdf/flyers/Stahls_Placement-PDF_042122.pdf) utiliza un área general de 12 × 14 pulgadas para frontal completo y espalda completa. Equivale a 30.48 × 35.56 cm.
- [BELLA+CANVAS: ficha del modelo 3001](https://www.bellacanvas.com/spec/3001.pdf) permite comprobar que las dimensiones de una prenda concreta cambian entre XS y 3XL. Esa ficha describe la prenda, no prescribe tamaños de estampado.

Ninguna de estas fuentes publica exactamente la siguiente tabla de estampado XS–3XL. La tabla es una **propuesta editorial de presets de taller**, derivada de las áreas generales y adaptada progresivamente al tamaño de prenda. No se presenta como recomendación oficial del fabricante. Las áreas grandes de 2XL/3XL requieren verificar capacidad de plancha y superficie plana de la playera.

## Presets implementados (cm)

| Talla | Área frontal completo, ancho × alto | Área espalda completa, ancho × alto |
|---|---:|---:|
| XS | 22 × 28 | 24 × 30 |
| S | 24 × 30 | 26 × 32 |
| M | 27 × 33 | 28 × 34 |
| L | 29 × 35 | 30 × 35.5 |
| XL | 30 × 35.5 | 30 × 35.5 |
| 2XL | 31 × 38 | 31 × 38 |
| 3XL | 31.5 × 40 | 31.5 × 40 |

Son cajas máximas para encajar el arte proporcionalmente. Un diseño cuadrado en frontal M queda en 27 × 27 cm, no 27 × 33. Un arte 2:3 en frontal M queda en 22 × 33 cm, porque la altura es el límite. Un diseño horizontal ancho puede alcanzar el ancho de la caja con altura mucho menor.

Los presets frontal y espalda de tallas grandes pueden coincidir: no es necesario aumentar indefinidamente con cada talla. Medir la prenda real es más útil que asumir equivalencia entre marcas, cortes, oversize, hombre y mujer. No se hace colocación automática respecto a cuello, costuras ni márgenes de plancha; el preset solo modifica el tamaño de salida.

“Completo” indica un estampado amplio en el torso dentro de la superficie de aplicación elegida, no un estampado continuo de borde a borde de toda la tela.

## Regla de proporción

La proporción se toma de ancho/alto del lienzo de origen, o del arte visible si se activa el recorte virtual. Cambiar ancho calcula alto y cambiar alto calcula ancho. No hay opción para desbloquear proporción porque el usuario pidió escalado proporcional.

`alto_cm = ancho_cm × alto_px_origen / ancho_px_origen`

`ancho_cm = alto_cm × ancho_px_origen / alto_px_origen`

El usuario puede ajustar libremente un lado dentro del presupuesto de memoria. El lado editado define la medida; el otro se recalcula incluso si llega un valor inconsistente por programación. Los píxeles finales se redondean a enteros. El desfase físico máximo normal es del orden de un píxel a 300 ppp (0.0847 mm), dependiendo del redondeo de ambos lados.

## Resolución y orden de operaciones

1. Leer píxeles nativos del origen, por franjas con margen de interpolación.
2. Remuestrear a las dimensiones en píxeles necesarias para la medida final y 300 ppp. El filtro integra área al reducir y utiliza bilineal al ampliar, con alfa premultiplicado para evitar contaminación RGB en bordes transparentes.
3. Calcular la trama con `celda_px = 300 / LPI`, sobre la imagen ya dimensionada.
4. Limpiar partículas y mantener alfa exclusivamente 0 o 255.
5. Crear documento RGB de 8 bits con resolución metadata 300 ppp y perfil sRGB.
6. Exportar PNG tras comprobar que el usuario no introdujo semitransparencias ni cambió resolución después de generar.

10 cm corresponde aproximadamente a 1181 px; 20 cm a 2362 px. El remuestreo amplía la matriz de píxeles, pero no recupera detalle inexistente. La reducción integra el área de origen para evitar aliasing; aun así descarta detalle que no cabe en la salida. Revisar al 100%.

## Cuatro vistas, una salida

- **Original:** recorte del arte dimensionado al tamaño final, antes de knockout y tramado. Sobre cuadrícula para representar transparencia nativa. Se puede muestrear color haciendo clic.
- **Resultado sobre fondo:** recorte tramado sobre el HEX elegido. El fondo se vincula por defecto al color eliminado; desmarcar la vinculación permite cambiarlo.
- **Trama/transparencia:** recorte de la salida, con cuadrícula para representar sus huecos. Los píxeles de la cuadrícula no se exportan.
- **Máscara:** representación del alfa final después de limpieza. Blanco = imprime y negro = transparente. No es la vista de canales CMYK ni de tinta blanca del RIP.

Al cambiar de vista o fondo se reutilizan los buffers del recorte. La máscara y los fondos se crean solo para visualización y nunca se insertan en el resultado. Se pueden cambiar incluso con knockout desactivado.

El recorte mide hasta 512 × 512 píxeles de salida. La fase de la trama coincide con el resultado completo. El detalle de edición utiliza halo para conservar decisiones de limpieza del núcleo; después del cálculo completo se muestra su recorte exacto. La imagen de visualización es JPEG compuesto; la salida exportada es PNG de alfa binario. El JPEG de la máscara puede mostrar artefactos de compresión: el buffer lógico de máscara sí es exclusivamente negro/blanco.

## Origen persistente y presupuesto de memoria

El plugin conserva el ID del documento seleccionado como origen para no volver a procesar accidentalmente el último resultado. Para trabajar en otro diseño, pulsa Usar documento actual. La capa elegida queda fijada por ID y se lee al preparar; si necesitas composición, elige el modo correspondiente.

Resultado máximo: 128 MP. Lectura nativa máxima por franja: 16 MP. Hasta 16 MP la sesión usa RAM. Por encima, la fuente redimensionada y el resultado se guardan en caché temporal por bloques de 512 px, con halos para la limpieza. Se subdividen lecturas nativas grandes. Ver LOTES-Y-MEMORIA.md. No constituye una garantía de consumo máximo del proceso de Photoshop.

## Comparación 0.4.0

Antes sobre prenda y Después sobre prenda comparten fondo y tamaño. Comparar muestra ambos con divisor ajustable. Son vistas adicionales a Original, Transparencia y Máscara, y no alteran el PNG. En lotes, cada talla usa su propia caja máxima editable y se trama después de dimensionarla; no se escala una versión ya tramada.

## Ampliación de presets 0.5.0

Adulto: pecho izquierdo 10 × 10 cm, manga 8 × 10 cm, nuca 8 × 5 cm, para todas las tallas. Infantil: frontal/espalda tallas 2/4/6/8/10/12 = 16 × 20, 17.5 × 22, 19 × 24, 20.5 × 26, 22 × 28 y 23.5 × 30 cm; otras posiciones usan 75% del área adulta. Son propuestas de ingeniería/taller, no una tabla publicada por las fuentes. Verificar sobre prenda real.

Las áreas pueden guardarse en recetas por marca/modelo y reutilizarse en lotes. Selección de cm/pulgadas conserva una medida canónica en cm sin acumular redondeos. Recorte virtual de márgenes mide alfa visible sin modificar fuente. Vista general/prenda y máscaras de eliminado/protegido amplían las vistas previas; ver README.
