Candidato 0.7.3 de Halftone DTF para Photoshop 25.0 o superior (Windows). **Prerelease: no es una versión estable y no se instala solo.**

## Cambios de 0.7.3, 0.7.2 y 0.7.1 (sobre 0.7.0)
- 0.7.3: el panel ya no se bloquea si faltan los controles Spectrum (antes desactivaba todos los campos y botones); los errores de arranque salen en el aviso rojo y la cabecera muestra la versión.
- 0.7.2: las medidas parten del tamaño de la imagen original (a 300 ppp) y el ancho y el alto van anclados por proporción; botones **Actualizar documento** y **Tamaño original**.
- Corrige que las medidas, el cuentagotas y «Crear vista de semitonos» no respondieran cuando el documento se abre después del panel o cambia: el origen se vuelve a leer al usarlos y con los eventos de Photoshop, y el panel muestra un aviso visible («Sin origen: …») con el botón **Usar documento actual**.
- El selector de color se abre como diálogo interactivo.
- Los errores aparecen en un aviso superior.

## Novedades de 0.7.0
- **Edición en vivo como DTPrep:** el documento de trabajo usa el arte con máscara de capa y un relleno con el color de prenda. Mover niveles, trama o limpieza reescribe solo la máscara (¼ de los datos); las vistas Original / Prenda / Alfa cambian capas sin escribir píxeles. A 13 MP un ajuste baja de ~2,1 s a ~0,23 s de CPU (~0,03 s sin limpieza), medido sin la E/S de Photoshop.
- **Niveles en un solo slider** con tiradores negro / medios / blanco, y otro para la salida.
- **Calidad de impresión DTF:** compensación de ganancia de punto a partir de la carta de calibración, rellenar huecos menores en sombras y «sólido desde cobertura %».
- **Presets de fábrica** en Preparar (camiseta negra, blanca, vintage, líneas, solo quitar fondo) y **estimación de tinta y costo por pieza**.
- **Canal blanco** exportable en un PNG aparte, con contracción en mm que no borra el blanco bajo puntos pequeños; también **en lotes**.
- **Pliegos (gang sheet):** varios diseños a 300 ppp en un rollo de ancho fijo, con giro de 90°, separación, marcas de corte opcionales y reparto en varios pliegos.
- Panel de Preparar y Ajustar más compacto; lotes en el menú ☰.
- Corrección: los lotes ya no exportan con una capa de prenda opaca bajo el arte.

Detalle, mediciones y límites: `CHANGELOG.md`, `docs/AUDITORIA-DTPREP.md` y `docs/CALIBRACION-Y-CALIDAD-DTF.md`.

## Archivos
- `Halftone-DTF-0.7.3.ccx`: candidato de instalación (ZIP reproducible; no empaquetado por herramientas de Adobe).
- `Halftone-DTF-0.7.3-proyecto.zip`: código, documentación y controles ya compilados.
- `Halftone-DTF-Updater-Windows.zip`: acompañante de Windows.
- `SHA256SUMS.txt`: checksum del CCX.

## Qué está validado y qué no
- **Automático:** 187 pruebas JavaScript, 5 de distribución Python, escenarios de interfaz con Spectrum real en Chromium y las del acompañante Windows en CI. El host de Photoshop y Adobe UPIA están **simulados**.
- **No validado:** nada de esto se ha ejecutado en Photoshop real. Quedan por comprobar en Windows con Photoshop 25+: las operaciones de capa y máscara (`make channel`, `putLayerMask`, capa de relleno, `userMaskEnabled`), el arrastre del slider de niveles, la creación de documentos grandes de pliegos, el tiempo real por ajuste y el comportamiento del historial. Si Photoshop rechaza una operación de máscara, el panel lo avisa y vuelve al método anterior.
- **Sin validar físicamente:** adherencia, lavado, RIP, polaridad del canal blanco y calibración de tinta. Los valores iniciales de consumo de tinta son aproximados; calíbralos con tu impresora.
- Sin aprobación de Marketplace. No es elegible para actualización automática.

Instalación y actualizaciones: https://github.com/eguiajosue/halftone-dtf-ps/blob/main/docs/INSTALACION-Y-ACTUALIZACIONES.md
