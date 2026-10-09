# Estado de entrega — 0.5.0 RC

Fecha: 9 de octubre de 2026. Se implementan los cambios de software derivados de la auditoría 0.4.0 frente a DTPrep. No se afirma equivalencia matemática con DTPrep ni aptitud física sin ensayos.

## Evidencia ejecutable

**101 pruebas automatizadas aprobadas**, sin omitidas. La suite incluye pruebas del motor real, remuestreo, cobertura/forma, bloques, vistas, archivos y recuperación, y flujos con un host Photoshop simulado. `npm run check` verifica manifiesto, sintaxis de módulos, IDs únicos y referencias de controles. `npm run package` verifica CRC de ZIP/CCX y escribe SHA-256 del CCX.

Pruebas nuevas cubren las regresiones de reducción de rayas, exportación vacía/tamaño cambiado, pérdida por limpieza, CSV fallido, interrupción entre PNG/checkpoint, reanudación, cambio de originales, importaciones malformadas, corrupción de proyecto, cancelación inicial, limpieza segura de caché, prenda/posición, conversión cm/in y asignaciones adultas/infantiles.

Una prueba sintética >32 MP comprueba que el motor solicita/emite bloques sin reservar un RGBA completo del lienzo. Otra integra 18 MP nativos en una sola muestra con lecturas ≤512 × 512 px. No equivalen a medir memoria/latencia de Photoshop. Las pruebas simuladas tampoco certifican permisos UXP, rollback real o PNG nativo.

Resultados finales reproducibles se incluyen en `PRUEBAS-AUTOMATICAS.txt`. No hay pruebas omitidas o declaradas manualmente aprobadas. El control de release estable permanece bloqueado por evidencia pendiente.

## Implementado

- Flujo por etapas, vista previa al frente, grupos Trama/Color/Detalle, navegación general/detalle y zoom visual.
- Filtro de área al reducir, alfa premultiplicado, tamaño fijado a 300 ppp; exportación bloqueada si está vacía o cambia tamaño/resolución/alfa.
- Trama opcional, None, compensación de sombras/saturación y de-fringe localizado con controles independientes.
- Protección con sensibilidad/radio/selección, máscara de protección real y mapa de partículas eliminadas; advertencias de pérdida tonal.
- Proyectos editables portátiles, recetas importables y perfiles de taller; ayuda y diagnóstico integrados.
- cm/pulgadas, recorte virtual de márgenes, adulto/infantil, cinco posiciones y áreas ajustables.
- Lotes con excepciones por imagen, todas las opciones comunes, preflight, registros durables y reanudación sin sobrescribir archivos.
- Caché por bloques, cancelación inicial, estimaciones de recursos y limpieza de cachés abandonadas marcadas.
- Comprobación ejecutable dentro de Photoshop y registro obligatorio de evidencia para autorizar release estable.

## Pendiente fuera de este entorno

Photoshop no está instalado aquí. Faltan CCX oficial e instalación limpia, matriz de versiones/equipos, interfaz UXP con teclado/sliders, validación nativa, memoria/latencia/cancelación grandes, reinicio/recuperación real, PNG en RIP, transferencia y lavado. `VALIDACION-WINDOWS.md` detalla casos y criterios; `release-validation.json` registra evidencia.

El mockup es plano y aproximado. La miniatura general/JPEG no aprueba píxeles. Los tamaños son propuestas de taller, no tablas oficiales de cada marca. Conversión sRGB puede reducir gama. La identidad de originales en recuperación usa metadatos, no hash completo; las salidas válidas manualmente modificadas pueden pasar la revisión de formato.

Repositorio GitHub: https://github.com/eguiajosue/halftone-dtf-ps. Publicación estable pendiente de validaciones nativas y físicas. La licencia y el soporte comercial quedan por definir.
