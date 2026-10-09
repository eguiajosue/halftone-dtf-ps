# Evidencia automática de distribución 0.6.1

Fecha: 9 de octubre de 2026. Estos resultados no certifican una instalación Adobe real.

- 116 pruebas JavaScript aprobadas: motor/host simulado y UI existentes, versiones numéricas, filtrado de drafts/prereleases, identidad, canal, origen, checksum declarado, compatibilidad, coalescencia, intervalo, consulta manual, opt-out, timeout y fallos de red.
- 4 pruebas Python aprobadas: fuentes independientes, separación Marketplace/ID/permisos, coincidencia de contenido CCX y rechazo de metadata de release sin evidencia nativa.
- Pruebas del acompañante ejecutadas en Windows PowerShell 5.1 en GitHub Actions. Incluyen checksum/manifest, aplazamiento con Photoshop abierto, repetición sin reinstalar, rechazo de downgrade, error del instalador sin cambiar versión, actualización correcta conservando recibo/paquete anteriores, descriptor de tarea sin elevación, desactivación y bloqueo de concurrencia. El comando Adobe se reemplaza por un ejecutable de prueba; la tarea nunca se registra realmente.
- `npm run check` y `npm run package`: aprobados. CCX candidato y ZIP del acompañante verificados como archivos ZIP íntegros.
- `npm run release:check`: rechazo esperado; no hay evidencia nativa/Adobe/física y no se publica un estable.

Historial CI: [ejecución Windows/Linux aprobada](https://github.com/eguiajosue/halftone-dtf-ps/actions/runs/37991150353). La comprobación final añadida para metadata binaria vuelve a ejecutarse en el mismo PR. Consultar el último check del [PR #1](https://github.com/eguiajosue/halftone-dtf-ps/pull/1) para esa revisión.

Pendientes: UDT y Creative Cloud reales, instalación limpia y upgrade con UPIA real, tareas bajo la cuenta del usuario, bloqueo/permisos/errores reales de Adobe, persistencia de preferencias entre instalaciones y carga del panel en Photoshop. Tampoco se ha realizado la transferencia física ni la publicación de Marketplace.
