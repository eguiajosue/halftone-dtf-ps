# Criterios de semitonos DTF y decisiones del motor

Fecha: 8 de octubre de 2026. Versión inicial: 0.1.0 beta. Actualizado a 0.5.0 el 9 de octubre de 2026.

## Qué se puede garantizar y qué requiere ensayo

El archivo de salida puede garantizar alfa 0/255 y lineatura calculada a partir de los ppp del documento. Un tramado universalmente «perfecto» no existe: retención de puntos, pérdida de detalles y moiré dependen de tamaño final, cabezal, perfil RIP, tinta blanca, polvo, film, curado y transferencia. Esta versión necesita prueba en Photoshop y prueba física antes de producción.

## Fuentes primarias consultadas

1. Adobe, [Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging): lectura y escritura RGBA, conversión de perfil, límites recortados, niveles de caché y liberación explícita de memoria.
2. Adobe, [Convertir a Bitmap](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-modes/convert-an-image-to-bitmap-mode.html): frecuencia LPI, ángulo, formas y posibilidad de moiré al imprimir imágenes previamente tramadas.
3. STAHLS’, [UltraColor MAX, guía de arte DTF](https://blog.stahls.com/top-10-artwork-tips-for-ultracolor-max-direct-to-film-transfers/): problemas de bordes suaves y espesor mínimo de 0.018 pulgadas para SU sistema. Son aproximadamente 0.457 mm; no es una especificación de Mimaki ni un valor universal para polvo DTF.
4. STAHLS’, [UltraColor MAX](https://espanol.stahls.com/ultracolor-max-transfers): recomienda 300 ppp o más al tamaño solicitado y fondo transparente para ráster.
5. Lightning Plugins, [DTPrep](https://lightningplugins.com/dtprep/) y [DTPrep Web](https://dtprep.com/): referencia funcional de knockout, vista interactiva y eliminación de semitransparencia. No se utilizó código ni se reprodujo su algoritmo propietario.
6. Adobe, [Packaging](https://developer.adobe.com/photoshop/uxp/guides/distribution/packaging-your-plugin/): distribución CCX, empaquetado con UXP Developer Tool, instalación local y necesidad de ID registrado para Marketplace.
7. Adobe, [DocumentCreateOptions](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/objects/createoptions/documentcreateoptions): documento de salida RGB transparente con resolución y perfil especificados.
8. Adobe, [ExecuteAsModal](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal): ejecución exclusiva, progreso, cancelación y cierre automático de documentos incompletos.

## Flujo implementado

1. Leer una capa seleccionada o la composición visible; no se modifica el diseño original.
2. Convertir los píxeles leídos a sRGB de 8 bits. El resultado también es sRGB. Una fuente de gama amplia puede perder colores fuera de sRGB; revisar con el perfil de producción.
3. Redimensionar al tamaño final proporcional a 300 ppp, antes de obtener cobertura a partir del alfa existente. Si se activa knockout, multiplicar por un factor de separación respecto al color de prenda.
4. Ajustar niveles de entrada (negro, gamma de medios tonos, blanco) y niveles de salida sobre cobertura. La luminancia del RGB no se usa para convertir automáticamente todo el diseño a una separación monocroma.
5. Comparar cobertura con una función de trama agrupada periódica: redonda, elipse, cuadrada, diamante o líneas.
6. Escribir RGB de origen y alfa exclusivamente 0 o 255. La recuperación de color es opcional y modifica RGB intencionalmente.
7. Eliminar componentes aislados pequeños con conectividad de ocho vecinos.
8. Crear un documento transparente nuevo con el lienzo completo redimensionado y resolución fija de 300 ppp; exportar una copia PNG.

## Lineatura y fidelidad tonal

`celda_px = ppp_documento / LPI`. A 300 ppp y 35 LPI son 8.571 px por período. La cantidad de niveles disponibles a resolución baja es limitada; cambiar solo la metadata no crea detalle. La implementación rechaza menos de 4 px por período, pero superar esa barrera no garantiza buena calidad. Para mayor fidelidad, trabajar con al menos 8–12 px por período es un criterio de ingeniería a ensayar, no una norma de fabricante.

Las formas se normalizan por cobertura de área. Para círculos se usa la distribución del radio dentro de una celda cuadrada, incluyendo la zona de unión de puntos en sombras. Para elipse 2:1 se usa una tabla acumulativa numérica. Esto evita que «50%» cambie arbitrariamente entre formas. Las pruebas verifican ocupación con error menor a un punto porcentual sobre muestras de alta densidad. A resolución de salida real se espera error de cuantización.

El ángulo rota una sola máscara de cobertura, no cuatro canales CMYK. 45° es el punto de partida; la dirección positiva sigue coordenadas de imagen con Y hacia abajo. Para líneas, el ángulo corresponde a su dirección. No se promete equivalencia visual exacta con el cuadro de Bitmap de Photoshop.

35 LPI / 45° es un preset inicial elegido para pruebas, no una recomendación universal de Mimaki. Comparar 25, 35 y 45 LPI con el mismo tamaño de impresión. El RIP debe mantener el tamaño final. Escalar o remuestrear después del tramado cambia la lineatura física y puede crear semitransparencias.

## Eliminación de color

El selector acepta HEX sRGB, color frontal de Photoshop y muestra sobre el detalle original. La métrica es distancia euclidiana RGB normalizada, no Delta E perceptual. Tolerancia define la zona totalmente eliminada; transición define la rampa suave hasta conservar cobertura. Es una aproximación práctica y configurable.

La recuperación de color resuelve `C = a F + (1-a) G` con el menor alfa compatible con RGB dentro de gama. Es útil si el diseño contiene degradados contaminados por negro o blanco de la prenda. Es una inferencia sobre cómo se construyó el arte; no puede distinguir colores intencionalmente oscuros de colores mezclados. Por eso está desactivada por defecto. No reconstruye el contenido que ya quedó oculto por el fondo.

Eliminar un color de prenda también elimina detalles interiores de ese color. No es un algoritmo para seleccionar exclusivamente el fondo conectado al borde. Desactivar knockout cuando se requiera conservar detalles del mismo color.

## Limpieza None / Low / Standard / High

| Nivel | Piso de cobertura | Diámetro equivalente inicial |
|---|---:|---:|
| None | 0% | 0 mm |
| Low | 1% | 0.12 mm |
| Standard | 3% | 0.20 mm |
| High | 6% | 0.30 mm |

Los diámetros son presets experimentales de limpieza, NO mínimos de transferencia garantizados. La referencia de 0.457 mm de STAHLS’ puede resultar más conservadora; introducir 0.46 mm para comparar. High puede eliminar highlights y pequeños detalles legítimos.

Área mínima en píxeles: `ceil(pi * (mm * ppp / 25.4 / 2)^2)`. El filtro elimina componentes de área inferior a ese valor. No realiza erosión general y no elimina por accidente todos los puntos usando un filtro de desenfoque. Las líneas estrechas y largas, puentes y partículas conectadas pueden sobrevivir; no se certifica espesor mínimo de cada estructura.

## Vista previa y límites

Se procesa un recorte de hasta 512 × 512 píxeles de la imagen final a 300 ppp, después del redimensionado. La fase de trama se ancla al origen del documento. Se compone visualmente sobre color de prenda o cuadrícula y se codifica como JPEG solo para mostrarla en UXP; la salida sigue siendo RGBA binaria. La imagen en el panel puede reducirse para caber: revisar PNG al 100% en Photoshop para evaluar píxeles.

El detalle de edición 0.5.0 utiliza halo para conservar decisiones de limpieza en el núcleo; las vistas antiguas o fuera de la sesión no deben tomarse como aprobación exacta. En la etapa 2 se recalcula automáticamente desde una instantánea sin trama, con espera corta de entrada y cancelación de tareas reemplazadas. Tras calcular la imagen completa, la vista provisional se sustituye por el recorte exacto del resultado. No se relee el documento de origen en cada movimiento.

Límite de salida 0.5.0: 128 MP, con 16 MP máximos por lectura nativa individual. Hasta 16 MP de salida se usa RAM; por encima, bloques en disco y halos de limpieza conservan coherencia global. La lectura se subdivide si la escala exige demasiados píxeles nativos. Véase LOTES-Y-MEMORIA.md para prueba del halo, memoria, comparación y protección.

## Validación pendiente en producción

- Instalar CCX localmente en Creative Cloud y ejecutar panel en Windows / Photoshop 25+.
- Comprobar capas con máscara, estilos, opacidad y grupos, así como objeto inteligente; la interpretación depende de getPixels. En caso de diferencias, usar una copia rasterizada de la composición deseada.
- Comprobar transparencia, escala y perfil del PNG reabierto.
- Transferir carta con valores reales de film, polvo, tinta blanca y curado; registrar puntos retenidos y resultado tras lavado.
- Revisar moiré y retención a 25 / 35 / 45 LPI y distintos ángulos con el perfil RIP habitual.
- Determinar por ensayo el mínimo de partícula y línea que soporta la combinación de producción.

## Niveles y edición automática — 0.3.0

Fuentes primarias adicionales:

- Adobe, [Ajuste de niveles](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-corrections/adjust-levels-in-an-image.html): puntos negro/blanco de entrada, gamma de medios tonos y extremos de salida. También [Levels Adjustment](https://helpx.adobe.com/photoshop/using/levels-adjustment.html).
- Adobe, [sp-slider](https://developer.adobe.com/photoshop/uxp/2021/uxp/reference-spectrum/User%20Interface/sp-slider/): control nativo UXP y eventos input/change.
- Adobe, [Document](https://developer.adobe.com/photoshop/uxp/ps_reference/classes/document/): cierre sin guardar de documentos de trabajo al cancelar.

Adaptación de ingeniería: los niveles actúan sobre cobertura de tinta (alfa × separación de color), no sobre cada canal RGB. Para cobertura `c` entre 0 y 1, puntos de entrada `B < W`, gamma `g > 0` y extremos de salida `OB <= OW`:

```
t = clamp((255*c - B) / (W - B), 0, 1)
c_ajustada = (OB + (OW - OB) * t^(1/g)) / 255
```

Excepción intencional de knockout: `c == 0` continúa en cero aunque OB sea positivo. Esto impide que el negro de salida vuelva a imprimir el color que se había eliminado. Después se aplica piso de cobertura, umbral periódico y limpieza de componentes. Alfa final sigue siendo 0/255. Valores por defecto de niveles son una transformación identidad.

La instantánea RGBA se remuestrea una sola vez antes de abrir la edición. Cada trabajo procesa un detalle y después la imagen completa, con hooks de cancelación por filas y durante limpieza. Un controlador serial asigna revisiones crecientes: un trabajo reemplazado no publica nuevas vistas ni escribe después de un trabajo más nuevo. Una escritura ya iniciada se deja terminar antes del siguiente trabajo; Aplicar espera y recalcula la revisión final. No se garantiza actualización completa a cada movimiento o una tasa fija de fotogramas.

Pruebas: fórmula, extremos, gamma, output levels sobre áreas sólidas, huecos de knockout con OB elevado, RGB intacto, estado inválido, secuencia de controles, cambios rápidos, cancelación, orden de escritura y espera final. Los controles y el rendimiento necesitan validación en Photoshop real.

## Extensión 0.4.0

Comparación original/resultado sobre la misma prenda, protección automática/por selección y procesamiento secuencial de imágenes × tallas. El motor y la integración por bloques se verificaron con casos de borde, conectividad diagonal, máscara y cancelación. La prueba sintética >32 MP valida límites de buffers del motor; no equivale a medir el consumo ni rendimiento de Photoshop real. Consultar LOTES-Y-MEMORIA.md.

## Cambios matemáticos 0.5.0

Reducción: integración exacta del área rectangular de cada píxel de destino en cada eje que disminuye. Ampliación: bilineal. RGB se pondera por alfa antes de normalizar; no se promedian colores ocultos de píxeles transparentes. Reduce aliasing de rayas/puntos; no reproduce información que queda fuera de resolución.

Sin trama: cobertura ajustada ×255 ≥ umbral produce alfa 255; lo demás 0. None fuerza diámetro y piso a cero, pero conserva knockout/niveles y política binaria.

Sombras: luminancia L normalizada con coeficientes 0.2126/0.7152/0.0722; RGB se aproxima al blanco con factor amount/100 × (1−L)². Color: aumentar distancia respecto a media de canales y limitar 0–255. Ambos son 0 neutral y no modifican cobertura. Son decisiones propias; no se afirma paridad con DTPrep.

De-fringe: solo píxeles parcialmente cubiertos próximos a cobertura casi cero; buscar interior opaco con cobertura alta dentro de radio 1–4 px y mezclar su RGB según fuerza. Protección conserva RGB original; regiones sólidas no cambian. No corrige de forma universal todos los mattes.

Protección automática: alfa ≥250 y cobertura positiva, con transparencia o contraste RGB suficiente dentro de radio 1–4 px. Radio/sensibilidad pueden aumentar zonas sólidas; revisar máscara protegida. Selección ≥128 conserva color sólido aunque coincida con knockout. Advertencia de LPI/limpieza evalúa área mínima frente al área de celda y pérdida de píxeles de trama, no certifica mínimos de impresión.

Fuentes adicionales: Adobe [Document](https://developer.adobe.com/photoshop/uxp/ps_reference/classes/document/) para duplicate/changeMode y Adobe [FileSystemProvider](https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/) para tokens persistentes. La implementación de recuperación/proyecto es propia; validación nativa pendiente.
