# Implementación de lo aprendido del estudio de DTPrep

Resume qué se tomó de los documentos de referencia ([informe](INFORME-LIGHTNING-DTPREP.md), [uso visto desde fuera](AUDITORIA-DTPREP.md), [pasos del tramado](PASOS-TRAMADO-DTPREP.md), [plantillas de trama](PATRONES-DTPREP.md), [detalle estático](AUDITORIA-DTPREP-ESTATICA.md) y [rendimiento](RENDIMIENTO-DTPREP.md)), dónde está en el código y qué se dejó fuera a propósito.

**Regla de trabajo.** DTPrep es software comercial con derechos reservados. Solo se tomaron técnicas estándar descritas en los documentos (funciones de punto, apertura morfológica, filtros conocidos). No se copió código, ni plantillas PSD, ni gráficos, ni textos. Las matrices se generan con funciones propias.

## Qué se implementó

| Documento | Idea | Dónde | Estado |
|---|---|---|---|
| Patrones §2.1, §5.1 | Punto **euclidiano** ecualizado por rango: crece redondo, se une al 50 % en el centro de los bordes y cierra como huecos redondos en las esquinas. El área impresa es lineal en el tono | `engine.js` · forma `euclidean` | Hecho y probado (monotonía, 50 %, linealidad ±0,6 %) |
| Patrones §2.2, §5.2 | **Línea con recorte**: perfil triangular acotado para que no haya filamentos de 1 px (por debajo del tono recortado no imprime, por encima imprime sólido) | `engine.js` · opción `lineTrim` (0–10 %, el preset «Líneas» usa 3 %) | Hecho y probado |
| Patrones §5.3 | Matriz **calculada al tamaño real de la celda**, sin reducir una tesela de 64 px | El motor ya lo hacía; se mantiene (`lut[cobertura] > umbral`) | Ya existía |
| Patrones §5.5 | Más formas de punto (elipse, rombo) | Ya estaban: `ellipse`, `diamond`, `square` | Ya existía |
| Patrones §4, §5.4 | **Aviso de tonos por celda**: una celda de `300/LPI` px admite como mucho `(300/LPI)²` tonos; por debajo de 50 (≈ 42 LPI) se avisa de la posterización | `diagnostics.js` · `tonesPerCell`; el panel lo muestra bajo la lineatura | Hecho y probado |
| Estática §4.3 / §6.5 | **Signo del ángulo explícito**: DTPrep invierte el signo en silencio; aquí el ángulo se aplica tal cual y el campo dice «+ horario» | `index.html`, prueba de dirección en pantalla | Hecho y probado |
| Pasos Fase 5 · Estática §4.6 / §6.3 | **Limpieza por apertura según LPI**: calado `1 + 0,1·(40 − LPI)` px (+0,5 en Alta), contraer y expandir 1 px (2 px en Alta); solo quita tinta, nunca añade, y respeta la protección de detalles | `morph.js`; opción `cleanupMode: 'opening'` (la limpieza «por área» sigue siendo el valor por defecto) | Hecho y probado. El calado se aproxima con un desenfoque de caja al 50 % |
| Pasos §2.2 | **Suavizado previo** antes de la trama: gaussiano de 1,4 px y, en el nivel 2, un filtro que conserva bordes equivalente a Desenfoque de superficie (radio 20, umbral 24) | `smooth.js`; opción `presmooth` 0/1/2 (apagado por defecto) | Hecho y probado. El nivel 2 es una **aproximación** (filtro guiado a 1/4 de resolución), no el filtro de Photoshop: ablanda un borde duro en ~4 px |
| Rendimiento §7.3 y §7.4 | Cola de la última petición y **esperas diferenciadas**: 40 ms para niveles, 120 ms para lo que rehace una etapa (trama, limpieza, color, knockout) | `live.js` (`request(job, delay)`), `main.js` | Hecho y probado |
| Rendimiento §7.2 | Menos recorridos del puente DOM al escribir | `host.js` (`assertLayerState` reutiliza la capa ya resuelta) | Hecho |
| Rendimiento | Primera pasada ~20 % más rápida (`Math.sqrt` en lugar de `Math.hypot`) y búferes de la apertura reutilizados entre ajustes | `live-render.js`, `morph.js` | Medido |
| Rendimiento §7.6 | No borrar el historial | El repo nunca llama a `clearEvent historyStates` | Ya cumplía |
| Rendimiento §7.5 | Proteger preferencias de Photoshop con `try/finally` | El panel no cambia ninguna preferencia | No aplica |

Los tres ajustes nuevos (recorte de línea, suavizado previo y método de limpieza) están en el panel de Ajustar. La forma «Euclidiana» aparece junto a las demás. Hay un preset de fábrica nuevo («Camiseta negra · punto euclidiano») que los combina. Todo se guarda en recetas, proyectos y lotes, y los valores por defecto no cambian la salida ni un byte (las pruebas de equivalencia con 0.6.2 siguen pasando).

## Qué NO se implementó, y por qué

**El árbol de capas nativo de 118 comandos** (Pasos, Fases 1–5: Hard Mix contra un patrón, niveles como capa de ajuste, grupos con *blend-if*, umbral 30, etc.). Motivos:

1. **No se puede validar aquí.** No hay Photoshop. Los propios documentos marcan como hipótesis (H) varios comandos ofuscados (duplicar, convertir a objeto inteligente incrustado, eliminar halos, umbral 128) y piden confirmarlos con ScriptListener. Enviar ~120 descriptores `batchPlay` sin ejecutar ni una vez es la forma más segura de dejar el panel roto.
2. **Cambia el principio del repo.** Hoy la máscara es **determinista y comprobable en Node** (`lut[cobertura] > umbral`, 0/255 exactos, idéntica en vivo, en lotes y por bloques). Con Hard Mix la máscara la calcularía Photoshop, con remuestreo del patrón que los documentos no pudieron medir, y habría que reconstruirla leyendo el compuesto.
3. **No aporta nada que no se consiga ya**: la edición en vivo de 0.7.0 solo reescribe la máscara de 1 canal y mover un nivel cuesta ~0,2 s a 13 MP.

Si más adelante se quiere una *vista rápida nativa*, el camino razonable (Estática §6.2) es: generar la matriz de umbral propia, definirla como patrón por código, colocarla en Mezcla definida sobre una capa de Niveles y **hornear siempre con el motor JS en Apply**. Conviene grabarlo antes con ScriptListener en Photoshop.

También quedan fuera, por no poder comprobarse sin Photoshop: ocultar el panel Capas durante la preparación, y agrupar cada sesión de edición con `suspendHistory` (cada actualización sigue siendo un estado de historial; Photoshop limita la cantidad).

## Mediciones (CPU, Node 22, 25 × 38 cm a 300 ppp = 13 MP, sin E/S nativa)

Con `node scripts/benchmark-dtprep.js`. Una pasada, con ruido de ±15 %; el comparativo de la primera pasada es la mediana de 4 repeticiones alternadas.

| Paso | ms |
|---|---|
| Primera pasada (cobertura + trama + limpieza por área). Antes de este cambio: ~1150 | ~870–1050 |
| Mover un nivel (sin cambios frente a antes) | ~180–240 |
| Cambiar a punto euclidiano o a línea con recorte (solo recalcula la trama) | ~350–430 |
| Limpieza por apertura, primera vez | ~1150 |
| Mover un nivel con apertura | ~520 |
| Suavizado previo 1 + apertura (recalcula la cobertura) | ~2000 |
| Suavizado previo 2 + apertura | ~2750 |
| Mover un nivel con suavizado 2 + apertura | ~560 |

El suavizado previo solo se vuelve a calcular cuando cambian la cobertura (color a eliminar, tolerancia, gamma, intensidad) o el propio suavizado; mover niveles, trama o limpieza lo reutiliza. La apertura cuesta ~0,3 s más que la limpieza por área en cada ajuste: por eso queda como opción.

## Pendiente de validar en Photoshop

- Que la forma euclidiana y la línea recortada se vean y se impriman como se espera en el RIP (rampa de grises y carta de calibración). La linealidad tono → punto está probada en el motor, no en tinta.
- La apariencia del suavizado previo 2 frente al Desenfoque de superficie real, y si un borde ablandado ~4 px afecta al arte con trazos finos.
- Latencia real por ajuste con apertura y suavizado a 13 MP y a más de 50 MP.
- Que la escritura de la máscara y el flujo de historial se comporten igual con las opciones nuevas.
