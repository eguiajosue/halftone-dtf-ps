# UX y rendimiento · 0.6.3 RC

## Diagnóstico

El editor presentaba tres sliders de entrada en columnas estrechas, botones con demasiados bordes y jerarquía poco clara. El pie mostraba 0.6.0 aunque el manifest era 0.6.2. Esto no identificaba correctamente la versión instalada.

Cada cambio calculaba un recorte antes del resultado completo y esperaba 250 ms incluso con el inspector cerrado. Para mostrar la vista se releían todos los bloques desde Photoshop después de haber escrito ese mismo resultado; también se leía el origen en vistas que solo necesitan la salida. Durante el arrastre del divisor se solicitaban presentaciones completas sucesivas. El motor creaba vistas de arrays por píxel y calculaba umbrales innecesarios en zonas sólidas.

## Cambios de interfaz

- Botones de altura uniforme, fondos discretos, bordes más suaves y foco visible; azul reservado a la acción principal.
- Etapa visible en la cabecera: Preparar, Ajustar, Exportar o Lotes.
- Negro, Medios y Blanco en filas de ancho completo; valor numérico a la derecha.
- Salida y sombras desplegable para mantener el editor compacto. Los valores se conservan aunque se cierre el apartado.
- Vistas Original / Prenda / Trama / Máscara y limpieza Sin / Baja / Normal / Alta con selección visible y `aria-pressed`.
- Se conservan tamaño proporcional, presets adulto/infantil, cuentagotas, protección, inspección, recetas, proyectos y lotes con imágenes/tallas variables.
- Versión del pie y diagnóstico leída desde el manifest.

El layout usa flex y controles Spectrum UXP, sin CSS Grid, animaciones ni cambios de framework. La geometría de renderizado nativo debe comprobarse en Photoshop; no se confunde una representación en navegador con una captura nativa.

## Cambios de procesamiento

1. Con inspector cerrado se calcula directamente el resultado completo. Con inspector abierto se conserva el flujo de detalle previo y las cancelaciones existentes.
2. La vista recibe un almacén temporal del resultado RAM/disco durante su callback esperado; no conserva ese almacén en `session.preview` ni en la caché del panel. La caché en disco se dispone después de terminar la presentación.
3. Original no lee la salida. Prenda y Máscara no leen el origen. Cambios posteriores de vista usan la capa nativa cuando no hay resultado temporal disponible.
4. Arrastres del divisor y cambios de fondo se agrupan durante 80 ms; los botones de vista siguen actuando inmediatamente. Los sliders de procesamiento mantienen la cola existente que prioriza el último ajuste.
5. El panel deshabilita todos los controles solamente cuando cambia su estado de trabajo, evitando recorrerlos todos en cada evento del slider.
6. El diagnóstico separa `processingAndWriteMs`, `presentationMs` y `updateMs` total para medir el recorrido real dentro de Photoshop.
7. Asignaciones directas por canal y omisión del umbral en cobertura sólida, conservando las funciones tonales exactas y la fase global de trama.

La salida sigue a 300 ppp, alfa 0/255 y resolución completa. La vista es una capa separada que se elimina antes de aplicar/exportar.

## Comparación reproducible

`node scripts/benchmark.js /ruta/engine-0.6.2.js`

Motor anterior: commit `aa59750414d24b09a4a8a89d3d42a7ede73976ff`, archivo `plugin/engine.js`. Node v24.19.0; fuente sintética determinista 2048 × 2048 (4,19 MP), calentamiento, cinco repeticiones y mediana, alternando orden antes/después. El filtro de partículas se desactiva en estas mediciones para aislar cálculo de trama. Las comprobaciones funcionales sí cubren limpieza.

| Escenario | 0.6.2 | 0.6.3 | Reducción |
| --- | ---: | ---: | ---: |
| solid | 314.2 ms | 230.3 ms | 26.7 % |
| knockout | 409.6 ms | 275.3 ms | 32.8 % |
| gradient | 485.3 ms | 375.4 ms | 22.7 % |
| checkerboard | 57.7 ms | 47.0 ms | 18.6 % |

El SHA-256 de la salida coincide en todos los escenarios grandes. Los datos sin redondear están en [BENCHMARK-0.6.3.json](BENCHMARK-0.6.3.json). No es una promesa de velocidad total dentro de Photoshop: no incluye remuestreo, disco, Imaging API, creación de capas ni actualización visual nativa.

## Verificación

125 pruebas JavaScript y 4 Python aprobadas localmente; CI verifica también las 10 pruebas del acompañante de Windows. Las regresiones nuevas cubren:

- Equivalencia con 0.6.2 en cinco formas y seis combinaciones de niveles, recuperación, limpieza, defringe, compensación, protección de bordes y selección: RGBA, máscaras y estadísticas.
- Composición exacta de alfa parcial sobre prenda/cuadrícula.
- Ruta RAM/disco sin preview provisional ni pausa; vista de máscara sin `getPixels` adicional y sin leer el origen.
- Cancelación antes de commit y Original sin lectura de salida.
- Selección de limpieza, etapa/versión correctas y agrupación del arrastre de comparación.

Pendiente de medir en Photoshop: tiempos totales en artes reales, memoria/scratch y aspecto de controles Spectrum a 300/340 px, escalado Windows y panel acoplado/flotante. Continúa como RC; se mantienen los requisitos existentes para una release estable.
