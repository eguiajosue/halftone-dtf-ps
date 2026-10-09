# Trazabilidad de la auditoría — implementación 0.5.0 RC

Fecha: 2026-10-09. Referencia: Auditoría Halftone DTF 0.4.0 vs Lightning DTPrep. Se encontró el documento Markdown de esa auditoría; no se dispuso de un PDF adicional. Las capturas públicas y la investigación anterior sirven como referencia funcional, no especificación de un algoritmo propietario.

“Implementado” describe código y pruebas automáticas. Cada comportamiento nativo sigue sujeto al protocolo de Photoshop; no se considera cerrado P0.

| Hallazgo / mejora | Cambio | Evidencia y límite |
|---|---|---|
| P0: instalar, host real, transferencia | Prueba nativa desde Ayuda, protocolo y gate de release | Pendiente en equipo real; CCX candidato. |
| P1: aliasing al reducir | Área integrada por eje, alfa premultiplicado; bilineal al ampliar | Rayas finas, transparencia, recortes y reducción extrema probados. |
| P1: exportar vacío | Cuenta tinta de composición actual antes de PNG | Regresión host; PNG nativo pendiente. |
| P1: tamaño aprobado alterado | Plan aprobado retenido tras Aplicar; compara tamaño/resolución | Regresión de cambio manual. |
| P1: reportes frágiles / reanudar | Registros incrementales antes/después de PNG, recuperación y CSV/JSON independientes | Pruebas de interrupción, archivo dañado y CSV fallido; reinicio nativo pendiente. |
| P1: LPI/limpieza pierden tonos | None, advertencia preventiva/por pérdida y mapa eliminado | Reproduce fallo de 75 LPI/Standard y permite comparar sin limpieza. |
| P1: rendimiento/cancelación | Bloques, cancelación de preparación, diagnóstico de tiempos, presupuesto manual, caché segura | Pruebas sintéticas de límites de buffers; falta benchmark nativo. |
| P1: fuente/estado de capas | Fuente/capa fijadas; geometría; rechazo de edición de copia incompatible, máscara/efectos | Host simulado; máscaras/efectos reales pendientes. |
| Compensación sombra/color | Dos ajustes RGB, 0 neutral, cobertura independiente | Algoritmos propios probados; paridad propietaria no afirmada. |
| Desactivar trama | Umbral binario configurable después de knockout/niveles | Alfa 0/255; gradientes pierden reproducción continua. |
| Limpieza None | Diámetro/piso de partículas desactivados | No altera la política de transparencia binaria. |
| De-fringe localizado | Solo bordes parcialmente cubiertos cercanos a hueco, radio/fuerza y interior opaco | Color y costuras RAM/disco probados; archivos reales por revisar. |
| Presets personales | Guardar nombre/variantes, import/export JSON con versión, áreas y perfil | Esquema/enum/rangos/colección probado. |
| Ayuda contextual | Ayuda integrada, textos de niveles/LPI y diagnóstico | No incluye vídeos comerciales ni soporte contratado. |
| cm/pulgadas | Conversión desde medida canónica sin deriva | Varias conversiones preservan plan exacto. |
| Compatibilidad | Mínimo Photoshop 25.0 mantenido y matriz pendiente | No se baja a 23.3 sin validar APIs. |
| General + detalle/zoom/pan | Miniatura general y detalle con halo/navegación | JPEG orientativo; inspección exacta en lienzo/PNG. |
| Mockup de prenda | Plantilla plana a escala, medidas reales y posición/divisor | Aproximación; no simulación de tejido/tinta. |
| Asignaciones por imagen | Prenda/tallas/posiciones/receta/HEX; añadir/quitar/excluir | Lotes mixtos adultos/infantiles probados. |
| Todos los ajustes de lote | Niveles, output, compensación, borde, umbral, limpieza/protección | Controles comunes y receta distinta por imagen. |
| Preflight | Apertura, modos, dimensiones, ampliación, espacio estimado | Conversión opcional en copia; no lee espacio libre real. |
| Protección configurable | Radio/sensibilidad, selección, mapa real protegido y aviso de solidificación | No reconoce texto ni garantiza mínimos físicos. |
| Documento editable | Proyecto propio con fuente dimensionada y selección | Corrupción y guardado fallido probados; no es PSD multicapa. |
| Posiciones/prendas | Pecho, manga, nuca, infantil y recorte de márgenes | Áreas orientativas ajustables; verificar marca y plancha. |
| Perfil de producción | Marca/modelo, RIP, equipo/material y calibración manual | No automatiza RIP ni recomienda mínimos sin ensayos. |
| Distribución/mantenimiento | Código, CI, changelog, diagnóstico, protocolo y script GitHub | Repositorio remoto incorporado; licencia/soporte comercial y release oficial pendientes. |

## Bloqueos para versión estable

`release-validation.json` exige evidencia del CCX oficial, instalación, prueba nativa, UI, archivos grandes, reinicio de lote, RIP y transferencia/lavado. `npm run release:check` devuelve error mientras falten. No se presentó evidencia ficticia ni se sustituyeron pruebas físicas por tests unitarios.

Fuentes primarias y especificación matemática: `INVESTIGACION.md`. Pruebas y resultado: `PRUEBAS-AUTOMATICAS.txt`. Protocolo restante: `VALIDACION-WINDOWS.md`.
