Interfaz renovada con Adobe Spectrum Web Components y wrappers oficiales UXP: botones, acciones, casillas y campos HEX. Preparación numerada, controles espaciados, colores identificados, sliders amplios y Aplicar/Cancelar siempre visibles al desplazar los ajustes. Tamaños mostrados con dos decimales sin perder precisión interna.

Conserva presets por talla, cuentagotas, vistas y comparación en el lienzo, protección de detalles, imágenes grandes, proyectos, recetas y lotes flexibles. Mantiene las optimizaciones del motor de 0.6.3. No se atribuye una mejora adicional de velocidad al cambio de biblioteca.

Archivos:
- `Halftone-DTF-0.6.4.ccx`: candidato de instalación para Photoshop 25.0 o superior.
- `Halftone-DTF-0.6.4-proyecto.zip`: código, documentación y controles ya compilados.
- `Halftone-DTF-Updater-Windows.zip`: acompañante de Windows.
- `SHA256SUMS.txt`: checksum del CCX.

Validación automática: 129 pruebas JavaScript, 5 de distribución Python, 10 escenarios de interfaz con Spectrum real en Chromium y 10 del acompañante Windows. El host Photoshop y Adobe UPIA se simulan en estas pruebas; no instalan ni registran tareas reales. El paquete incluye Spectrum y licencias sin node_modules ni navegador.

El CCX es un candidato ZIP reproducible; todavía debe empaquetarse/comprobarse con herramientas de Adobe. No se afirma aprobación Marketplace ni validación física. Es un prerelease y no es elegible para instalación automática. El acompañante solo instala releases estables validados con metadata completa.

La nueva interfaz debe revisarse en Photoshop, especialmente sliders nativos, foco, teclado y panel mínimo. Capturas y método: https://github.com/eguiajosue/halftone-dtf-ps/blob/main/docs/INTERFAZ-SPECTRUM-0.6.4.md

Guía de instalación: https://github.com/eguiajosue/halftone-dtf-ps/blob/main/docs/INSTALACION-Y-ACTUALIZACIONES.md
