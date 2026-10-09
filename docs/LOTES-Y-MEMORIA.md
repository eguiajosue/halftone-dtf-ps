# Lotes, memoria y recuperación — 0.5.0

## Bloques y consumo

Umbral RAM: 16 MP. Máximo de salida: 128 MP. Caché temporal de origen inmutable/resultado y selección opcional, bloques 512 × 512. Nunca se requiere un buffer RGBA completo del lienzo grande en JavaScript. Lecturas nativas ≤16 MP se subdividen antes de leer; una reducción extrema de un solo píxel integra su área en bloques de 512.

Para área mínima A, un componente eliminable tiene <A píxeles y no puede extenderse más de A−1 pasos de conectividad 8 desde el núcleo. Halo = A−1 + máximo del radio de protección y del tratamiento de borde. Así la limpieza y RGB del núcleo coinciden con el cálculo completo, incluidos componentes diagonales y tratamiento localizado. Fase de trama global con centros de píxel.

En disco se escribe una capa oculta; reemplazo/historial se agrupan con rollback si se cancela. Contadores de píxeles se suman solo sobre núcleos. Número de componentes globales eliminados = null para evitar duplicar componentes de halos. La validación de rollback real queda pendiente.

La estimación de caché es 8 bytes/píxel (9 con selección). Trabajo de bloque se estima en 32 MB; RAM en 14 bytes/píxel. Son estimaciones de ingeniería, no consumo medido ni límite total de Photoshop. Se añade margen de caché y 4 bytes/píxel para salida; no incluyen scratch, documentos, historia ni proyectos guardados. Presupuesto manual 0 significa espacio no comprobado.

Aplicar/cancelar y finalizar una variante liberan cachés. El botón de limpieza borra solo carpetas temporales que cumplen nombre, marca y esquema del plugin, y no están activas. Un fallo de limpieza en lote detiene la ejecución para no acumular recursos. Las cachés no son proyectos de recuperación.

## Cola y asignaciones

1–500 archivos, hasta 20000 variantes. Configuración común o excepciones por imagen: familia adulta/infantil, tallas, posiciones, receta y HEX. Ninguna talla excluye la imagen. Una receta permite niveles distintos por imagen. Frontal+espalda son variantes independientes y pueden usar cajas distintas.

PNG/JPG/TIFF/PSD/BMP usan composición visible. Conversión RGB/8 opcional crea una copia, no guarda cambios en el original; getPixels/salida usan sRGB. La conversión del modo inicial usa Photoshop y su configuración, por lo que debe revisarse con perfiles reales. Selección capturada no se comparte entre archivos.

Preflight abre cada fuente y revisa planes, modo, ampliación y recursos. Se cierra solo lo que el plugin abrió. Procesar realiza preflight previo, pero un error de una fuente se registra y se pueden producir variantes sanas. Presupuesto manual insuficiente bloquea esa variante antes de crear la sesión.

## Registro durable

`trabajo.json` conserva fuentes identificadas, configuraciones y nombres iniciales; se escribe antes de procesamiento. `avance/00000001.json`, etc., son registros incrementales. Antes de guardar PNG se registra su tamaño/nombre definitivo; después se confirma su estado. No se sobrescriben registros o salidas anteriores.

Si ocurre interrupción, abre **Reanudar un lote guardado** y selecciona la carpeta de ejecución. Tokens persistentes locales pueden recuperar permisos; si fallan, vuelve a elegir originales. Se comparan nombre/tamaño/fecha de modificación. No detecta una modificación que preserve todos esos metadatos.

Un PNG existente con dimensiones registradas se reabre en Photoshop y comprueba RGB/8, 300 ppp, alfa binario y tinta. Un PNG válido permite cubrir una interrupción ocurrida entre guardado y checkpoint. Uno dañado se conserva y se genera `_r2`, `_r3`, etc. No se compara su hash con el resultado calculado: no edites las salidas hasta concluir el trabajo.

Se ignoran registros incompletos con aviso y se revisan salidas; rutas, índices y dimensiones importadas se validan. Los ajustes del trabajo guardado quedan fijados durante reanudación. CSV/JSON son reportes derivados; su falla muestra avisos sin convertir PNG sanos en errores ni invalidar el registro. Los reportes de reanudación llevan un sufijo nuevo.

Detener conserva resultados completos. Se cancela entre lecturas/bloques y antes de guardar; un guardado nativo iniciado puede terminar. Apertura/cierre/publicación se serializan. Fallos de fuente/variante se aíslan; fallos de recursos que impedirían limpieza detienen la cola.

## Proyecto editable

Guardar desde edición conserva instantánea RGBA ya dimensionada, selección, receta y checksums FNV-1a por bloque en una carpeta propia. El manifiesto se escribe al terminar. Error/cancelación intenta borrar solo la carpeta incompleta creada. Reabrir copia a caché nueva y valida bloque/ruta/longitud/checksum. FNV detecta corrupción accidental; no es firma ni defensa criptográfica contra modificación deliberada.

El origen guardado permite recalcular desde píxeles previos al knockout, no desde la trama. La medida queda ligada a la instantánea; reabrir no restaura capas nativas o detalle que se descartó en el remuestreo. Para otra medida vuelve al original. Un proyecto permanente puede requerir 4 bytes/píxel, más selección y espacio de trabajo temporal.

## Fuentes técnicas

Adobe: [Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging), [ExecuteAsModal](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal), [Document](https://developer.adobe.com/photoshop/uxp/ps_reference/classes/document/) y [FileSystemProvider](https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/). Implementación nativa por validar en el equipo objetivo.
