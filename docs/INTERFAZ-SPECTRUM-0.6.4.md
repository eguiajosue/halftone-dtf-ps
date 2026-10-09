# Interfaz Spectrum · 0.6.4 RC

## Biblioteca y compatibilidad

Se usan Adobe Spectrum Web Components mediante los wrappers oficiales UXP: button, action-button, checkbox y textfield 2.0.0, utils 2.0.1. El wrapper fija componentes Spectrum 0.37 compatibles con UXP. El manifest activa `enableSWCSupport` y mantiene Photoshop mínimo 25.0.

Se conservan `sp-slider` nativos de UXP y campos numéricos/selectores HTML: no se exige el soporte más reciente de NumberField o Picker. No se añaden React, WebView, CDN ni descargas al abrir el panel. Spectrum se compila una vez con esbuild 0.25.12 y se entrega en el CCX. La prueba de arranque impide comenzar una sesión si faltan los componentes registrados.

Referencias oficiales: [Integración SWC en Photoshop](https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-spectrum/swc/), [wrappers de Adobe](https://github.com/adobe/swc-uxp-wrappers). La compatibilidad declarada requiere corroboración en Photoshop 25 y versiones actuales.

## Organización

- **Preparar:** 01 tamaño y presets, 02 forma/lineatura/ángulo, 03 color a eliminar con cuentagotas. Un botón principal crea la vista tramada.
- **Ajustar:** color y prenda con HEX, resumen de trama, niveles con slider y valor, vistas y limpieza. Salida/sombras, color, detalles e inspector se despliegan cuando se necesitan.
- **Exportar:** resultado aplicado y exportación validada.

La marca usa cuatro puntos y un acento verde suave. Los controles utilizan tema oscuro Spectrum, contraste de selección corregido y espaciado compacto. El contenido central se desplaza; Aplicar/Cancelar permanecen visibles incluso a 300 × 450 px. El panel continúa ofreciendo presets, recetas, proyectos, lotes, protección y comparación. La medición visible tiene dos decimales, pero la medida interna conserva precisión.

![Preparar](UI-PREPARAR-0.6.4.png)
![Ajustar](UI-AJUSTAR-0.6.4.png)

## Validación y límites

Las capturas provienen de `npm run test:ui`, ejecutando el HTML/CSS y el bundle Spectrum reales en Chromium. Un sustituto representa exclusivamente el slider nativo UXP y un host simula I/O de Photoshop. No son capturas nativas ni certifican transferencia física.

10 escenarios de interacción verifican registro, ausencia de errores, panel de 300/340 px, presets y proporciones, sincronización de casillas y HEX desde Shadow DOM, vistas seleccionadas, limpieza, niveles avanzados persistentes, acciones visibles al tamaño mínimo y aplicación/exportación. Las 129 pruebas JavaScript cubren también bloqueo de controles, precisión de medidas, motor y sesiones. Las 5 Python verifican distribución y exclusión de dependencias; CI conserva 10 pruebas Windows con UPIA simulado.

La biblioteca compilada ocupa aproximadamente 508 KiB sin comprimir y solo se carga al iniciar. No se promete más velocidad de cálculo por cambiar controles. Se conserva el motor optimizado de 0.6.3 y su caché; las cifras históricas están en [UX y rendimiento 0.6.3](UX-RENDIMIENTO-0.6.3.md).

Pendiente: apertura real de esta versión en Photoshop, foco/teclado, cuentagotas, sliders y espacio vertical en UXP. El gate de versión estable conserva la evidencia nativa, instalación e impresión como pendientes.

## Construcción

```sh
npm ci
npm run build:ui
npm test
npm run test:ui
npm run check
npm run distribution:test
npm run package
```

`plugin/vendor` es generado y se excluye de git; los workflows lo compilan antes de verificar/empaquetar. El CCX y ZIP del proyecto incluyen bundle y licencias. `node_modules`, Chromium y herramientas de pruebas se excluyen. El lockfile fija dependencias. Para Adobe UDT, primero `npm run distribution:prepare`; empaquetar la fuente preparada, validar en Photoshop y registrar evidencia antes de publicar estable.
