# Panel compacto y vistas en Photoshop — 0.6.0 RC

Implementación basada en las seis capturas del usuario. El panel sustituye la miniatura principal por controles compactos y usa el lienzo de Photoshop para revisar el diseño. Mantiene identidad propia y el motor independiente del proyecto.

## Implementado

- Preparación: tamaño vinculado en cm/pulgadas, modo A medida / Por talla, adulto/infantil y posiciones; forma de trama, LPI, ángulo y knockout con cuentagotas nativo. El documento se detecta al iniciar. Origen, recorte y rendimiento están en el menú.
- Edición: color a eliminar y color de prenda vinculables, tres niveles de entrada y dos de salida con sliders nativos y números, compensación de sombras, limpieza y de-fringe. Editar trama, Más color y Detalles abren controles adicionales.
- Valores iniciales de las referencias: redonda, 30 LPI, 33°, entrada 7 / 2 / 100, salida 0 / 255, sombras 0 y limpieza Normal. Preferencias previas y recetas no se sobrescriben. Valores iniciales restablece los cinco niveles.
- Original / Prenda / Alfa / Máscara cambian el lienzo a resolución final. La comparación emplea una división global, incluso al atravesar un bloque de procesamiento. Las vistas auxiliares y el mockup a escala permanecen en Inspeccionar.
- Las vistas opacas usan una capa temporal propia. La capa imprimible conserva sus RGBA. Alfa retira la vista; Aplicar también la retira antes de liberar la sesión y permitir exportar. Una vista incompleta se revierte mediante historial suspendido.
- El selector nativo admite cuentagotas sobre el lienzo, entrada precisa de color y cancelación. En edición muestra temporalmente Original, y al cerrar restaura el modo elegido y recalcula con el color aceptado. Admite las variantes green/grain y RGB float de Photoshop.
- Se mantienen procesamiento grande por bloques, selección/contornos protegidos, recetas, proyectos y lotes de cantidad variable con tallas y excepciones. Medidas de tallas y parámetros comunes del lote están plegados de inicio.
- Manifest con un objeto host de Photoshop para empaquetado de distribución.

Los controles del lienzo de Photoshop permiten acercar al 100% para revisar puntos; el inspector JPEG es opcional. No se añade interpolación al alfa final ni se escala una trama terminada: cada tamaño se prepara antes del tramado a 300 ppp.

## Calidad y rendimiento

El motor sigue utilizando fase global, umbrales normalizados por forma, instantánea del origen y alfa 0/255. Las nuevas vistas no alteran esos cálculos. El parecido de las referencias orienta el flujo y la presentación, pero una captura no permite deducir ni validar el algoritmo propietario ni la adhesión física del transfer.

Los cambios de sliders reemplazan cálculos anteriores y actualizan automáticamente el resultado. En archivos grandes, completar una revisión y generar su vista puede tomar tiempo. La presentación se escribe por bloques y agrega una capa temporal de resolución completa en Photoshop. No se promete latencia fija ni una cantidad universal de LPI para todas las imágenes.

## Validación realizada

108 pruebas automáticas aprobadas con motor real y host simulado. Casos nuevos: valores iniciales y controles compartidos; vistas sin recalcular trama; retirada antes de liberar/exportar; RGBA imprimible preservado; rollback de una vista fallida; divisor en límites de bloques; descriptores y cancelación de color.

Las regresiones existentes incluyen máscaras binarias, tamaño proporcional, calidad tonal, RAM/disco, continuidad de bloques, protección, proyectos, cancelación, exportación y reanudación de lotes. También se verifica sintaxis, referencias de controles y manifest. `release:check` sigue bloqueando una release estable sin evidencia nativa/física.

## Verificación pendiente en Photoshop

1. Instalar el CCX, abrir un RGB/8 bits y comprobar panel a 300/340 px de ancho. Revisar tamaños, controles agrupados, foco, teclado y accesibilidad de extras.
2. Probar cuentagotas en preparación y edición: negro, blanco, colores oscuros, cancelar y cambio de perfil. Confirmar que cancelar conserva color y vista anteriores.
3. Alternar cuatro vistas y comparación a 100%; mover sliders rápidamente. Verificar última revisión, escala y ausencia de capas temporales abandonadas.
4. Probar RGB/8 bits de más de 32 MP, caché en disco, cancelación y cierre de documentos. Registrar memoria, tiempos y respuesta del panel.
5. Aplicar desde Máscara o Prenda: debe quedar una sola capa imprimible, sin fondo de vista. Exportar y verificar 300 ppp, medida física y alfa binario.
6. Probar lote con distintas tallas, posiciones y una excepción por archivo, detener y reanudar.
7. Imprimir la carta y un arte real con la configuración de RIP/film/polvo/prenda; revisar punto mínimo, degradados, trazos finos y adhesión.

Photoshop no está disponible en el entorno de desarrollo usado. No se presenta la validación simulada como instalación nativa ni como aprobación de producción. El CCX es un candidato de prueba; las actualizaciones desde GitHub/Marketplace siguen siendo la siguiente fase.

Fuentes técnicas: [batchPlay](https://developer.adobe.com/photoshop/uxp/ps_reference/media/batchplay/), [Layer](https://developer.adobe.com/photoshop/uxp/ps_reference/classes/layer/), [selector RGB y campos heredados](https://forums.creativeclouddeveloper.com/t/color-picker-return-error-rgbfloatcolor-uses-grain-label-instead-of-green/4853), [empaquetado UXP](https://developer.adobe.com/uxp/guides/how-to/distribution/package/).
