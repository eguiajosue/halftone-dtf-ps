# Validación nativa y de producción — 0.5.0 RC

Estas pruebas requieren Photoshop real y el proceso DTF del taller. No están marcadas aprobadas. Registrar versión exacta del sistema/Photoshop/CCX, CPU, RAM, disco temporal, perfil de origen, RIP, fecha y responsable. Conservar PNG/JSON/capturas y ubicación de la evidencia. Trabajar sobre copias de prueba.

## 1. Paquete e instalación

Empaquetar con UXP Developer Tool; instalar ese CCX mediante Creative Cloud en un equipo limpio. Confirmar panel, versión e ID. Probar mínimo objetivo Photoshop 25 y las versiones del taller con números exactos. Cerrar/reabrir Photoshop, cargar preferencias y actualizar versión previa. Registrar fallos de permisos/console. macOS no se declara probado.

## 2. Prueba integrada

Sin sesión de edición activa, abrir **Ayuda → Comprobar Photoshop y PNG**, elegir destino y esperar informe. Crea una carta sintética propia y compara píxeles nativos con el motor en RAM/disco; exporta y reabre PNG; prueba rollback real y cierra solo documentos creados. Revisar `validacion-photoshop.json`: status=passed y todas las comprobaciones. Repetir ante cambio de host/plugin. El informe failed/cancelled no es aprobación; corregir antes de continuar.

La comprobación inicial no cubre CSS, sliders, archivos representativos, máscaras de fuentes ni rendimiento grande. No marcar todas las casillas por un solo informe.

## 3. Interfaz y flujo

- Panel a 300, 340, 380 y 600 px: legibilidad, scroll sin controles inaccesibles, navegación por teclado, foco y etiquetas.
- Preparar → Ajustar → Exportar; preview primero y pestañas; opciones plegables no ocultan acciones críticas.
- Arrastrar cada slider rápidamente y escribir decimales; solo prevalece última revisión. Valor Black≥White bloquea Aplicar y se recupera al corregir.
- cm→in→cm repetido, ancho/alto, arte 1:1/2:3/horizontal. Ver tamaño píxeles y metadata a 300 ppp. Presets encajan sin deformar; repetir adulto/infantil y cinco posiciones.
- Márgenes transparentes: medir lienzo vs solo arte; comprobar posición de selección y proporción. Cambiar documento activo/capa no cambia el origen fijado. Eliminar capa/resize del origen deben exigir volver a preparar.
- Knockout negro/blanco/color interior, tolerancia/transición, muestra en detalle Original y color frontal. Fondo vinculado/independiente. Vistas Original/antes/después/divisor/alfa/máscara/eliminado/protegido.
- Vista general/detalle/prenda, medidas y posición de mockup; cambiar fondo/divisor no modifica capas o PNG. Clic en muestra solo usa detalle original, no miniatura aproximada.
- Trama on/off, 5 formas, 25/35/55/75 LPI, distintos ángulos, 5 niveles, None/Low/Standard/High. Caso 75 LPI + Standard + 20%: aviso y None preserva puntos.
- Sombras/saturación: cero neutral, RGB cambia sin alterar cobertura. De-fringe negro/blanco/color, radio/fuerza y protección. Evaluar halos y cambios de color con originales reales.
- Protección automática con contraste/radio, trazos de 1–3 px y gradientes; selección de logo coincidente con knockout. Mapa debe mostrar píxeles protegidos; protección no certifica adhesión.
- Máscaras/estilos/grupos/objeto inteligente/opacidad del origen: comparar capa vs composición. Si la lectura difiere del aspecto deseado, usar copia rasterizada de la composición.
- Editar copia de trabajo: añadir capa, máscara, estilo, opacidad, ocultar, cambiar modo/tamaño o cerrar. Bloquear estados incompatibles sin perder origen. Back/Cancel descartan solo la copia.

## 4. PNG y proyecto

Exportar/reabrir y comprobar 300 ppp, píxeles exactos, sRGB, alfa solo 0/255, tinta y ausencia de fondos. Cambiar tamaño/resolución o añadir semitransparencia después de Aplicar: bloquear exportación. Borrar toda la composición: bloquear aunque el resultado previamente fuera válido.

Guardar proyecto con selección y RGB previo al knockout. Cerrar Photoshop; reabrir proyecto sin original, cambiar color/niveles y comparar con regeneración original. Corrupción de bloque/ruta manifiesto debe mostrar error, liberar caché y preservar el proyecto. Cancelación/disco lleno al guardar no deben presentar una carpeta parcial como proyecto completo. Tamaño nuevo requiere preparar original.

## 5. Rendimiento y cancelación

Medir 5, 20, 35, 60 y 100 MP de salida en el equipo real: tiempo inicial, detalle, cálculo completo, publicación, exportación y revisión, RAM de Photoshop/UXP y uso/espacio temporal. 128 MP es límite de software, no capacidad certificada. Usar archivos con ruido, puntos aislados, bordes/diagonales y selección. RAM/disco en archivo pequeño deben coincidir píxel a píxel.

Revisar costuras en x/y=512/1024, bordes y esquinas, todas las formas y radios. Cancelar preparación, selección, cálculo y publicación; comprobar rollback a imagen anterior, cierre de temporales y ausencia de capas/caché activa residuales. Cambios rápidos no deben crear escrituras simultáneas. Simular espacio insuficiente y presupuesto manual; diagnóstico debe registrar tiempos. Limpiar cachés abandonadas sin tocar proyectos/resultados u otras carpetas.

## 6. Lotes y reinicio

- Cantidades X distintas y tallas arbitrarias; ejemplo 50×M/L=100, además 3 imágenes con asignaciones adultas/infantiles y frontal/espalda/pecho.
- Recetas/HEX/niveles distintos, imagen excluida y agregar/quitar. Preflight identifica incompatible/vacía/ampliada antes del PNG; conversión opcional conserva originales.
- Origen ya abierto no se cierra; abierto por lote sí. Nombres similares generan salidas únicas. Formatos reales PSD/TIFF/PNG/JPG/BMP.
- Detener/reiniciar durante lectura/trama/publicación/antes de guardar/después de guardar. Reanudar la carpeta: comprobar resultados validables, regenerar faltantes y no duplicar correctos. Tokens caducados requieren reelección de originales; original cambiado se rechaza.
- PNG dañado conserva archivo y genera _r2; reporte CSV fallido conserva PNG y JSON con aviso. Registro incompleto se maneja con aviso y revisión de salidas. Trabajo reanudado usa receta registrada.
- Disco lleno/permiso denegado/fallo de cierre: no acumular documentos; conservar evidencia y registrar resultados parciales.

## 7. RIP y transferencia

Imprimir carta `CARTA-CALIBRACION.png` a 15.24 × 17.78 cm, 1800 × 2100 px a 300 ppp. No escalar ni suavizar la trama. Revisar tamaño físico y perfil sRGB, base blanca y choke configurados en el RIP.

Registrar equipo/RIP/resolución/pasadas/perfil/blanca, film, tinta, lote de polvo, curado, temperatura/tiempo/presión, pelado, marca/modelo/material/talla y lavado. Comparar highlights, líneas, huecos, moiré, halos, tacto y adhesión inmediatamente y tras lavados conforme al proceso del taller. Probar 25/35/45 LPI y diferentes ángulos. Determinar mínimos reales; 300 ppp o diámetro de software no certifican transferencia.

## Registro de liberación

Actualizar cada `required` en `release-validation.json` con passed=true solo al completar su ensayo y con evidence que identifique reporte/equipo/fecha. Ejecutar `npm test`, `npm run check`, `npm run package`, `npm run release:check`. El gate no verifica la veracidad de textos: la revisión humana de evidencia sigue siendo necesaria. No distribuir como estable si falta cualquiera de esos controles.
