# Historial

## 0.6.4 RC — 2026-10-09

Integra Adobe Spectrum Web Components mediante wrappers oficiales de UXP: botones, acciones, casillas y campos HEX. Conserva el slider nativo y los campos numéricos/selectores compatibles con Photoshop 25. Preparación numerada, navegación por etapas, color y HEX visibles, vistas y limpieza segmentadas y acciones fijadas fuera del área desplazable. Opciones avanzadas accesibles a demanda; funciones de tallas, protección y lotes conservadas.

Tamaños mostrados con dos decimales, conservando precisión interna al cambiar unidad o actualizar el origen. Inicio bloqueado con diagnóstico si falta registrar Spectrum. Compilación reproducible con lockfile, licencias incluidas y dependencias de desarrollo excluidas del instalador.

129 pruebas JavaScript, 5 Python y 10 escenarios de interacción con Spectrum real en Chromium; CI comprueba además 10 pruebas del acompañante Windows. Capturas de navegador en `docs/INTERFAZ-SPECTRUM-0.6.4.md`. La nueva interfaz y su compatibilidad nativa deben validarse en Photoshop; sigue siendo RC.

## 0.6.3 RC — 2026-10-09

Rediseño del panel: botones y campos coherentes, indicadores de etapa, sliders de ancho completo, limpieza segmentada y vistas Original / Prenda / Trama / Máscara. Salida y sombras plegables; presets, cuentagotas, protección y lotes conservados. Versión del pie sincronizada con el manifest.

Ajustes sin inspector cerrado pasan directamente al resultado completo: evitan un cálculo de detalle y la pausa fija de 250 ms. La presentación reutiliza temporalmente el resultado RAM/disco, omite lecturas de origen/salida innecesarias y agrupa arrastres del divisor antes/después. No mantiene una segunda imagen completa en la caché del panel. Menos asignaciones por píxel y cálculo de umbral únicamente donde hace falta; calidad y 300 ppp conservados.

125 pruebas JavaScript y 4 Python aprobadas localmente; Windows verificado por CI. Comparación CPU de 4,19 MP con cinco repeticiones: 19–33 % menos tiempo según escenario, resultados idénticos. No mide I/O nativo de Photoshop. Evidencia y límites en `docs/UX-RENDIMIENTO-0.6.3.md`.

## 0.6.2 RC — 2026-10-09

Corrige el error nativo `Incorrect type for key: layerID. Expected: number` al leer composición/exportar: omite el campo opcional cuando no hay capa y valida los IDs explícitos. El host simulado ahora rechaza claves presentes con valores no numéricos; dos regresiones cubren composición, exportación y lectura por capa.

## 0.6.1 RC — 2026-10-09

Consulta de releases estables desde el menú; intervalo de ocho horas, desactivación, comprobación manual, timeout y fallos de red sin bloquear el trabajo. Identidad, versión, canal, procedencia y archivos del release validados. Permisos de red limitados y apertura HTTPS con consentimiento de UXP.

Acompañante independiente para Windows: instalación inicial y actualizaciones por tarea del usuario mediante Adobe UPIA, con Photoshop cerrado; verificación SHA-256/manifest, bloqueo de concurrencia, conservación de recibos y desactivación. No requiere Dev Tools al usuario, no eleva privilegios ni evade políticas. Su instalación real depende de un release estable oficialmente empaquetado y validado.

Preparación de fuentes para Adobe UDT y Marketplace con IDs separados; workflow que exige evidencia nativa y CCX coincidente antes de crear un borrador de release. No publica automáticamente en Marketplace. Validación real en Windows/Creative Cloud/Photoshop sigue pendiente.

## 0.6.0 RC — 2026-10-09

Panel compacto inspirado en las referencias: tamaño, trama y cuentagotas en preparación; niveles agrupados, vistas y limpieza en edición. Valores iniciales 30 LPI / 33°, entrada 7 / 2 / 100. Conserva presets, recetas, protección, imágenes grandes y lotes flexibles.

Original, Prenda, Alfa y Máscara se presentan en el lienzo de Photoshop, con capas de vista separadas del resultado imprimible y retirada antes de exportar. Comparación alineada entre bloques. Selector de color nativo con cancelación y compatibilidad con descriptores RGB/float.

108 pruebas automáticas aprobadas; ejecución y presentación nativa en Photoshop, empaquetado oficial e impresión física pendientes. Manifest de distribución con un único objeto host.

## 0.5.0 RC — 2026-10-09

Resuelve brechas de software de la auditoría 0.4.0: reducción por área, validación de exportación vacía y geometría aprobada, informes resistentes a fallo, cola durable/reanudación y preflight. Añade cancelación inicial, limpieza de caché y estimación manual de recursos.

Interfaz por etapas con preview primero, pestañas Trama/Color/Detalle y opciones avanzadas plegables. Vista general, detalle/navegación/zoom, comparación colocada a escala, máscara de protección y mapa eliminado.

Trama opcional, umbral binario, None, compensación de sombras y color, de-fringe localizado con radio/fuerza, sensibilidad/radio de protección. Recetas importables, perfiles de taller, cm/pulgadas, recorte virtual, adulto/infantil y cinco posiciones. Proyectos portátiles editables y lotes con asignaciones distintas por imagen.

Suite ampliada; prueba ejecutable dentro de Photoshop y control de evidencia para release estable. CCX generado localmente sigue siendo candidato sin instalación validada; pruebas físicas pendientes.

## 0.4.0 beta

Caché por bloques, protección automática/selección, comparación y lotes imágenes × tallas. 61 pruebas automáticas. Auditoría posterior identificó las brechas abordadas en 0.5.0.
