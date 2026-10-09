# Propuesta UX/UI — Halftone DTF para Photoshop

Fecha: 9 de octubre de 2026. Base: código 0.5.0 RC de `plugin/index.html`, `plugin/styles.css` y `plugin/main.js`. Estado: análisis y propuesta, pendiente de implementación y validación dentro de Photoshop.

## Diagnóstico

El panel reúne las funciones solicitadas, pero presenta demasiadas decisiones al mismo nivel. El usuario tiene que interpretar documentación técnica mientras configura una impresión. La prioridad del rediseño es organizar el trabajo, simplificar los controles y hacer visible el efecto de cada cambio.

La revisión es una inspección del código y del flujo declarado. No equivale a una prueba con usuarios ni a una captura de una instalación nativa de Photoshop. No se ha medido tiempo de tarea, tasa de error ni latencia real.

Como referencia reproducible, el HTML contiene 22 controles visibles por defecto dentro de Preparar, 27 dentro de Ajustar y 46 dentro de Lotes. Se contaron `input`, `select`, `button` y `sp-slider`, excluyendo inputs ocultos y descendientes de grupos `.hidden`, pero sin contar como oculto el contenedor raíz de cada etapa. Los números excluyen la cabecera global y los controles creados dinámicamente. Un control deshabilitado sigue contando como visible. No son controles visibles simultáneamente en toda la aplicación.

| Prioridad | Hallazgo concreto | Efecto | Cambio propuesto |
| --- | --- | --- | --- |
| P0 | Preparar muestra origen, medidas, presets, knockout, memoria, disco, cachés y proyectos. | Cuesta reconocer qué hay que hacer primero. | Preparar contiene tamaño y color; utilidades van al menú del taller. |
| P0 | Medidas personalizadas y presets están abiertos simultáneamente, con otro botón para aplicar la talla. | No resulta claro qué tamaño está activo. | Dos modos: A medida / Por talla. Seleccionar una talla calcula el encaje inmediatamente. |
| P0 | El documento abierto requiere pulsar Usar documento actual. | Un paso de activación poco evidente bloquea el avance. | Detectar y presentar el origen, con opción visible de cambiarlo; fijarlo al empezar. |
| P0 | Las vistas principales se mezclan con diagnósticos en un selector de ocho opciones. | Es difícil comparar el resultado visualmente. | Cuatro botones persistentes: Original, Prenda, Transparente y Máscara. Comparación como control de la vista Prenda. |
| P0 | Cinco niveles aparecen como bloques verticales con encabezados y explicaciones extensas. | La vista queda lejos de los controles que modifican el resultado. | Grupo Niveles compacto, con tres entradas y dos salidas, números precisos y sliders vinculados. |
| P0 | Volver y Cancelar descartan la copia de trabajo; Aplicar cierra la sesión antes de exportar. | Se puede perder una edición o quedarse sin una vuelta sencilla a los ajustes. | Definir explícitamente cuándo se descarta, cuándo se conserva y cuándo se exporta. Mantener la sesión editable hasta terminar la salida. |
| P1 | Lotes muestra medidas de todas las tallas y duplica controles técnicos del editor. | La tarea imágenes × tallas se convierte en un formulario extenso. | Tallas seleccionables, una receta compartida y excepciones visibles por archivo. |
| P1 | Estados y errores se acumulan al final del panel. | El usuario no ve por qué falló la acción junto al control afectado. | Validación junto al campo, estado junto a la vista y resumen operativo en la barra inferior. |
| P1 | Hay texto de 9–11 px y no hay tratamiento explícito del foco de botones. | Baja legibilidad y navegación con teclado difícil de seguir. | Texto principal 13 px, ayuda 12 px, foco visible y etiquetas persistentes. |
| P2 | Ayudas, recursos y advertencias generales aparecen en tareas rutinarias. | La información importante pierde jerarquía. | Ayuda contextual corta; avisos únicamente cuando la condición existe. |

## Arquitectura propuesta

La cabecera mantiene el nombre del plugin, el modo Individual / Lote y un menú de herramientas. El trabajo individual usa tres etapas: **Tamaño y color → Ajustar → Exportar**. No se añade un asistente inicial obligatorio.

### 1. Tamaño y color

- Mostrar una línea de origen: documento y capa o composición. Detectar el documento no debe iniciar procesamiento ni modificarlo. Si Photoshop cambia de documento durante una sesión, mantener la referencia fijada y ofrecer cambiar de origen explícitamente.
- A medida muestra Ancho y Alto vinculados, con una unidad común. Cambiar uno recalcula el otro; no permitir deformación accidental.
- Por talla muestra Prenda, Posición y Talla. El preset define un área máxima; el arte encaja proporcionalmente. Mostrar la **medida final del arte** aparte del área, por ejemplo: área 27 × 33 cm, arte 22 × 33 cm para una proporción 2:3. Las áreas existentes son orientativas, no medidas universales de todas las marcas.
- Mantener 300 ppp como propiedad de salida en una sola línea informativa, junto a los píxeles finales. No añadir un selector de resolución.
- Mostrar Eliminar color como interruptor, una muestra de color y Tomar de la imagen. El selector visual acepta un HEX preciso dentro de su editor. Renombrar Color frontal a Usar color frontal de Photoshop para evitar confundirlo con la posición de la impresión.
- Tolerancia y Transición pertenecen a Ajustar eliminación. Recortar márgenes y el cambio de origen pertenecen a Opciones de origen. Mostrar parámetros dependientes solo al activar su función.
- Acción principal: **Preparar vista**. Al avanzar se dimensiona y se genera la primera trama con la receta activa.

### 2. Ajustar

La vista ocupa el primer bloque. Debajo hay un grupo de ajustes a la vez: Trama, Niveles, Color o Detalle. Cambiar de grupo conserva todos los valores. El color eliminado permanece accesible sin volver a preparar.

**Vistas:** Original, Prenda, Transparente y Máscara. Prenda ofrece Comparar, un divisor desplazable y el color del fondo; este color se vincula inicialmente al color eliminado. La comparación mantiene el mismo encuadre y escala en ambos lados. Colocado en prenda / Imagen / Detalle son encuadres, separados de las vistas. Eliminado por limpieza y Detalle protegido van a Inspeccionar. La vista de prenda es una plantilla plana, no una simulación física de tinta.

**Trama:** formas con muestras reconocibles y etiqueta: Redonda, Elipse, Cuadrada, Diamante y Líneas. Lineatura incluye slider, campo numérico y LPI; Ángulo incluye slider, campo y grados. Se conservan los límites actuales: 5–75 LPI, −180° a 180°. Mostrar una explicación breve al solicitar ayuda. Desactivar trama revela el umbral de alfa; ese umbral desaparece mientras la trama esté activa.

**Niveles:** mantener Negro, Medios tonos y Blanco como tres filas compactas de entrada. Mantener Negro de salida y Blanco de salida como dos filas del mismo grupo. Los sliders y campos comparten exactamente los valores del motor. Negro de entrada debe ser menor que Blanco; el midtone conserva su rango 0.10–9.99. Negro de salida debe ser menor o igual que Blanco de salida, ambos dentro de 0–255; el motor actual no admite salidas invertidas. No reemplazar estos cinco controles por un slider genérico de intensidad: cambiaría la capacidad de ajuste. Explicar una vez que estos niveles modifican la cobertura de la máscara y que blanco significa más tinta; no son niveles RGB. Un histograma puede añadirse después, sin hacerlo requisito de esta fase ni inventar un slider Spectrum de tres manejadores.

**Color:** selector visual del knockout, tolerancia y transición con sliders y valores. Recuperar mezcla, compensación de sombras, intensidad de color y tratamiento de contaminación de bordes se agrupan como ajustes adicionales de Color. Radio y Fuerza se revelan al activar el tratamiento. El fondo de vista y el color eliminado son valores independientes cuando se desvinculan.

**Detalle:** Limpieza con Sin limpieza / Baja / Normal / Alta; equivalencias internas None / Low / Standard / High. Protección muestra Desactivada / Automática / Selección. Capturar selección y sus instrucciones aparecen solo en Selección; radio y sensibilidad en el modo que los usa. Diámetro mínimo conserva la unidad mm dentro de los parámetros de limpieza. Advertir sobre pérdida de detalle cuando exista una configuración o resultado que la justifique, y permitir ver las partículas eliminadas.

**Actualización:** cambios de procesamiento alimentan el mecanismo existente de revisión/cancelación de trabajos. La presentación distingue Actualizando vista, Vista actualizada y Preparando resultado completo. No declarar sincronización completa mientras esté pendiente una versión. Cambiar de vista, comparar, hacer zoom o desplazar el encuadre no debe recalcular la trama. Conservar la última vista válida hasta reemplazarla, indicar si está desactualizada y evitar que una respuesta antigua sobrescriba la nueva.

La acción principal es **Revisar exportación**. Volver al tamaño conserva los ajustes. Si requiere regenerar la copia, explicar el efecto sobre ediciones manuales antes de ejecutarlo; esa confirmación solo aplica cuando haya cambios que realmente se perderían. Salir debe distinguir cerrar el editor de descartar la copia.

### 3. Exportar

Mostrar un resumen corto: tamaño físico, píxeles, 300 ppp, PNG y transparencia binaria. La pantalla ofrece Exportar PNG como acción principal y Volver a ajustes como secundaria. Nombre y carpeta se seleccionan mediante el diálogo nativo. Un diálogo cancelado devuelve al resumen conservando el trabajo.

Conservar capa/resultado y Guardar proyecto editable son decisiones explícitas independientes, sin un paso Aplicar obligatorio antes de poder exportar. La nueva gestión de sesión requiere cambios de host y pruebas; no se resuelve renombrando botones. Tras una exportación exitosa, ofrecer Abrir carpeta, Preparar otro diseño y Usar ajustes en lote. No añadir espejo, base blanca o parámetros del RIP como si ya los resolviera el plugin.

## Modo Lote

Lote tiene su propia navegación: Archivos y tallas → Revisar muestra → Procesar. La cantidad de archivos y las tallas son variables; M y L son únicamente un ejemplo de selección.

1. Elegir archivos y destino. Lista compacta con nombre, estado y Excepciones. Selección múltiple para aplicar una misma excepción a varios archivos.
2. Elegir prenda y posición, luego tallas como botones seleccionables. Editar áreas abre solo las medidas necesarias; no desplegar 14 campos por defecto para siete tallas.
3. Elegir una receta compartida, o usar los ajustes del trabajo individual. Ajustar receta abre el mismo editor y evita duplicar formularios o reglas.
4. Mostrar excepciones junto a cada archivo: tallas, posiciones, color y receta. Calcular variantes a partir de las asignaciones efectivas; no asumir siempre archivos × tallas cuando existen excepciones.
5. Revisar una muestra antes de iniciar. Verificar archivos y recursos como parte de Revisar lote. Si hay incidencias, mostrar una lista corregible y no comenzar una ejecución incompleta sin explicar qué se excluirá.
6. Al ejecutar, mostrar archivo, variante, completados, total y Detener. Reanudar aparece para lotes pendientes. Los resultados completos se conservan y el informe diferencia completados, fallidos, omitidos y cancelados.

## Dónde quedan las funciones existentes

| Funciones | Ubicación propuesta |
| --- | --- |
| Capa / composición, conversión RGB/8 bits, recorte de márgenes | Opciones de origen; conversión solo ante modo incompatible o elección explícita. |
| cm / pulgadas, medidas vinculadas, presets por talla y posición | Tamaño y color. |
| Knockout, toma de color, tolerancia, transición | Color accesible en Preparar y Ajustar. Una sola fuente de valores. |
| Cinco formas, LPI, ángulo, activar trama, umbral sin trama | Ajustar → Trama. |
| Cinco niveles y restablecimiento | Ajustar → Niveles. |
| Recuperar mezcla, sombras, intensidad y de-fringe | Ajustar → Color. |
| Limpieza, diámetro, protección automática y por selección | Ajustar → Detalle. |
| Cuatro vistas, comparación, fondo, encuadre, zoom y navegación | Barra de vista e Inspeccionar. |
| Recetas, perfiles de taller, importación y exportación | Menú del taller; receta activa resumida cerca de los ajustes. |
| Proyectos editables, abrir y reabrir | Menú del taller y exportación. |
| Memoria, presupuesto de disco, cachés | Ajustes de rendimiento. Los bloqueos reales aparecen en la tarea afectada. |
| Diagnóstico y comprobación nativa | Ayuda → Diagnóstico. |
| Asignaciones, recetas por archivo, ambas posiciones, detener y reanudar | Modo Lote. |
| Exportación PNG, conservar resultado | Etapa Exportar, con acciones inequívocas. |

Ninguna función se elimina por quedar fuera de la pantalla principal. Los valores avanzados guardados se conservan y se señala si una receta tiene personalizaciones. Volver a un grupo básico no restablece valores ocultos. Guardar, importar y migrar recetas debe producir el mismo contrato de parámetros 0.5.0.

## Diseño visual y accesibilidad

- Superficies neutras compatibles con el tema de Photoshop; una acción principal por etapa. Jerarquía por tamaño, separación y agrupación, sin decorar cada bloque con otra tarjeta y un párrafo.
- Panel flexible: cabecera y acción principal estables, cuerpo desplazable. Implementar con las capacidades reales de UXP; validar los componentes Spectrum y el CSS en Photoshop. La maqueta web no demuestra compatibilidad nativa.
- Probar anchos 300, 340 y 420 px; alturas 600 y 760 px. Evitar desplazamiento horizontal y conservar la acción principal visible. En un panel corto habrá desplazamiento vertical del cuerpo.
- Labels persistentes, texto principal 13 px, secundario 12 px, controles de al menos 32–36 px y estados de foco visibles. No depender solo de color, icono, tooltip o placeholder.
- Navegación completa con teclado, orden natural, anuncios de estado moderados y errores asociados al campo. La vista de máscara explica Blanco = imprime / Negro = transparente.
- Ayuda breve contextual, de una o dos frases. Información larga disponible en la guía. Bloqueos indican una solución: por ejemplo, Introduce un ancho mayor que cero, o Crea una copia RGB de 8 bits para continuar.

## Plan de implementación y validación

**Primero:** separar estado de edición y presentación; mantener el motor y los contratos de parámetros. Reconstruir cabecera, Preparar y barra de acciones. **Después:** editor por grupos, vistas, comparación y selector de color. **Luego:** transición de exportación reversible y editor compartido de lotes. Rendimiento, compatibilidad y distribución se verifican al terminar el flujo.

La prueba de regresión debe comparar el RGBA del motor con los mismos parámetros antes y después del cambio de UI, comprobar vínculo slider/campo, proporción y conversión de unidades, importación de recetas y persistencia de valores ocultos. Para el host, probar origen fijado, cancelación durante preparación, vuelta de tamaño, cancelación del diálogo de exportación y liberación de caché sin perder el origen.

Tareas de prueba con 5–8 usuarios representativos, contando a Josué: preparar 20 × 30 cm; usar un preset M sin deformación; corregir knockout después de avanzar; ajustar los cinco niveles; comparar sobre prenda; proteger texto fino; exportar y volver a corregir; ejecutar tres archivos para S/M/XL con una excepción. Registrar ayuda solicitada, errores, retrocesos y tiempo; comparar con la versión actual usando orden alternado de versiones. La muestra es exploratoria y no proporciona significancia estadística por sí sola.

Criterios de aceptación propuestos, todavía no medidos:

- Al menos 80% completa preparación y exportación sin instrucciones del moderador; cero pérdidas no advertidas de trabajo.
- Al menos 80% distingue medida del arte, área máxima y color de vista frente a color eliminado.
- Los cinco niveles y las cuatro vistas son localizables desde Ajustar, sin navegar a Preparar.
- El número y nombres de variantes coinciden con tallas, posiciones y excepciones elegidas.
- La interacción reconoce inmediatamente un cambio; medir vista y procesamiento por separado. No prometer latencia idéntica para cualquier tamaño de archivo.
- Todas las tareas esenciales se completan por teclado; no hay solapamientos en los tamaños de panel definidos.
- Pasan las pruebas existentes y las pruebas nuevas de integración del flujo. Antes de publicar se valida en Photoshop compatible de Windows y macOS y con una impresión física de referencia.

## Alcance de la propuesta navegable

La propuesta que acompaña este documento permite recorrer las etapas, cambiar medidas vinculadas, probar presets, abrir los grupos de ajustes, cambiar vistas, comparar y seleccionar tallas para un lote. Usa un dibujo de muestra y una trama ilustrativa. No está conectada a Photoshop, no produce el PNG de producción y no valida el motor, la calidad física ni la compatibilidad UXP. No es una release del plugin.

## Segunda fase: instalación y actualizaciones

El objetivo de no depender de UXP Developer Tools para el uso diario es viable mediante un CCX instalado con Creative Cloud Desktop. UDT corresponde a desarrollo y empaquetado, no a la instalación rutinaria del usuario final.

Hay que separar tres requisitos: (1) instalador CCX correcto, (2) publicación verificada en Adobe Marketplace si se desea ese canal oficial, y (3) un mecanismo de actualización. Publicar una release en GitHub no la registra automáticamente en Adobe ni convierte el plugin instalado en un cliente de actualizaciones.

La fase de distribución debe validar el ID estable por canal, el manifest, la instalación limpia y actualización sobre una versión anterior. La documentación actual de Adobe indica que un CCX UXP no necesita una firma digital del paquete; publicar en Marketplace sí requiere su ID y revisión. No se debe resolver el error previo de instalación afirmando sin evidencia que falta una firma.

Para GitHub se puede añadir comprobación de versión y acceso al CCX de la release. Eso sería una actualización asistida. Una actualización que descargue e instale sola requiere estudiar el instalador externo/UPIA, plataformas, consentimiento del sistema, recuperación y distribución; no se presume que un panel UXP pueda reemplazar sus propios archivos mientras Photoshop lo ejecuta. Esa decisión y su implementación quedan después del UX/UI.

## Fuentes de diseño y distribución

- NN/g, [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): priorizar controles habituales y revelar opciones especializadas, evitando demasiada profundidad.
- Adobe Spectrum, [Help text](https://spectrum.adobe.com/page/help-text/): ayudas concisas y errores que expliquen cómo corregir el campo.
- Adobe, [Install a UXP plugin](https://developer.adobe.com/uxp/guides/how-to/distribution/install/): instalación Marketplace/CCX y distinción respecto a desarrollo.
- Adobe, [Package a UXP plugin](https://developer.adobe.com/uxp/guides/how-to/distribution/package/): IDs estables por canal, empaquetado y diferencias frente a CEP.
- Adobe, [Package and Distribute](https://developer.adobe.com/uxp/guides/how-to/distribution/overview/): revisión de Marketplace frente a distribución independiente.

Consultadas el 9 de octubre de 2026. Las observaciones del panel proceden del repositorio; las decisiones de reorganización son una propuesta de diseño que debe comprobarse con tareas reales.
