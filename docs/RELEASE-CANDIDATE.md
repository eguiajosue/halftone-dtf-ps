Corrección: las lecturas de composición completa y la exportación PNG omiten `layerID` en lugar de enviar un valor indefinido a Photoshop. Se conservan los IDs numéricos para lectura por capa. Incluye regresiones que reproducen la validación nativa.

Versión entregada con panel compacto, vistas nativas, presets de tallas, niveles, protección de detalles, procesamiento de imágenes grandes y lotes flexibles. Incluye preparación de distribución Adobe y acompañante de actualizaciones para Windows.

Archivos:
- `Halftone-DTF-0.6.2.ccx`: candidato de instalación para Photoshop 25.0 o superior.
- `Halftone-DTF-0.6.2-proyecto.zip`: proyecto completo con código y documentación.
- `Halftone-DTF-Updater-Windows.zip`: acompañante de Windows.
- `SHA256SUMS.txt`: checksum del CCX.

Validación automática: 119 pruebas JavaScript, 4 de distribución Python y 10 del acompañante en Windows aprobadas. Estas últimas simulan Adobe UPIA y no registran una tarea real.

El CCX es un candidato ZIP reproducible; todavía debe empaquetarse/comprobarse con las herramientas de Adobe. No se afirma instalación nativa, aprobación Marketplace ni validación de impresión física. Esta publicación es un prerelease y no es elegible para instalación automática. El acompañante solo instala releases estables validados con su metadata completa; hoy se detendrá si no existe uno.

Para probar el CCX: abre el archivo con Creative Cloud y revisa su instalación. Si Adobe rechaza el candidato, sigue la guía de empaquetado oficial. El usuario final de un CCX validado no requiere UXP Developer Tools.

Guía: https://github.com/eguiajosue/halftone-dtf-ps/blob/main/docs/INSTALACION-Y-ACTUALIZACIONES.md
