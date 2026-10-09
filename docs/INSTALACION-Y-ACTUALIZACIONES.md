# Instalación con Adobe y actualizaciones desde GitHub

## Estado 0.6.1

Código de distribución implementado; todavía no existe un release estable validado con Photoshop. El CCX generado por `npm run package` es un candidato ZIP reproducible, no un paquete declarado oficialmente verificado. El actualizador no lo instala. Adobe recomienda empaquetar con UXP Developer Tool y comprobar el instalador real.

El usuario final no necesita UXP Developer Tools. El mantenedor lo usa para producir cada CCX oficial. El plugin no puede reemplazar su propio código desde UXP. Para actualizar desde GitHub usamos un acompañante de Windows que llama al instalador oficial Adobe UPIA. Marketplace es otro canal y requiere un ID/listing aprobado por Adobe.

## Usuario de Windows: instalación única

Estos pasos aplican cuando se haya publicado el primer release estable con los archivos indicados. Hoy la ejecución se detiene si no existe ese release.

1. Instala o actualiza Creative Cloud Desktop, inicia sesión y abre Photoshop al menos una vez. Se requiere Photoshop 25.0 o posterior, además de la versión mínima indicada en cada release.
2. Guarda tus trabajos y cierra Photoshop. No hace falta activar el modo desarrollador.
3. Descarga `Halftone-DTF-Updater-Windows.zip` desde [Releases](https://github.com/eguiajosue/halftone-dtf-ps/releases) y extrae todo a una carpeta local. Antes de extraer, si Windows muestra **Propiedades → Desbloquear** para el ZIP, revisa el origen y desbloquéalo explícitamente. Esto no modifica las políticas corporativas de PowerShell.
4. Ejecuta `Instalar-y-activar.cmd` con tu usuario normal. Obtendrá el último release estable, verificará el paquete y ejecutará `UnifiedPluginInstallerAgent.exe /install`. No eleva privilegios automáticamente. Si Adobe requiere un administrador o PowerShell está restringido por tu organización, consulta a tu administrador; el script no evade esas restricciones.
5. Cuando Adobe UPIA termine correctamente, se registra una tarea del usuario en el Programador de tareas. Abre Photoshop y entra a **Plugins → Halftone DTF → ☰ → Versión y actualizaciones** para comprobar la versión que realmente cargó.

Alternativa sin acompañante: abre el `.ccx` oficial con doble clic, acepta la instalación de Creative Cloud y actualiza repitiendo ese paso cuando el panel avise. No requiere Dev Tools, pero la instalación de futuras versiones es manual.

Si anteriormente cargaste el plugin con Dev Tools, descarga esa copia mediante **Unload** y retírala de su lista para evitar cargar dos variantes. No borres carpetas de Adobe a mano. Verifica tus recetas y exporta una copia de respaldo antes de migrar.

## Qué ocurre automáticamente

- La tarea consulta el último release **estable publicado** una vez por hora mientras tienes sesión iniciada. Un commit, tag sin release, borrador o prerelease no actualiza tu equipo.
- Si Photoshop está abierto, aplaza la consulta/instalación y reintenta en la siguiente ejecución. Nunca cierra Photoshop ni toca documentos abiertos. Vuelve a comprobar que esté cerrado después de descargar.
- Comprueba repo y ruta de descarga, ID, canal independiente, versión numérica, marca de empaquetado con Adobe, validación nativa, nombre, tamaño, SHA-256 y manifest del CCX. Solo instala versiones posteriores. La marca de validación es una declaración del mantenedor respaldada por evidencia del repo; el checksum no sustituye una firma de editor.
- Adobe UPIA aplica la compatibilidad con Photoshop y los permisos de instalación. Si falla, el actualizador conserva su registro anterior y muestra el código de error. Un código cero confirma que UPIA terminó, no prueba que el panel haya cargado: revisa la versión en Photoshop.
- Conserva el paquete y recibo anteriores para recuperación manual. No desinstala primero ni ejecuta un downgrade automático, porque eso podría afectar los datos del plugin.
- El acompañante no se actualiza a sí mismo. Una mejora del acompañante requiere descargar su ZIP nuevo y ejecutar otra vez el instalador. El proceso automático solo reemplaza el plugin mediante Adobe.

El acompañante se copia a `%LOCALAPPDATA%\HalftoneDTFUpdater`. El registro es `updater.log`, los recibos `state.json` / `previous-state.json`, y los CCX se guardan en `packages`. La tarea se llama `Halftone DTF - actualizaciones - <SID de tu usuario>` y se ejecuta sin elevación, con sesión interactiva y sin contraseña almacenada. Si el equipo está apagado, la ejecución pendiente se atiende al estar disponible; no opera con la sesión cerrada.

**Desactivar:** ejecuta `Desactivar-actualizaciones.cmd`. Elimina solo la tarea del usuario; conserva el plugin, recetas y archivos. **Ver estado:** ejecuta `Ver-estado.cmd`. Para reparar una instalación que desinstalaste manualmente, vuelve a ejecutar `Instalar-y-activar.cmd` (permite reinstalar la misma versión).

## Panel del plugin

**☰ → Versión y actualizaciones** muestra versión, comprobación manual y un enlace al release. La búsqueda al abrir el panel se puede desactivar. Las consultas exitosas se limitan a una cada ocho horas; la búsqueda manual ignora ese intervalo. Ante fallos de red puedes seguir trabajando. No se envían imágenes, rutas, recetas ni ajustes: se solicita información pública del repo a GitHub. El panel consulta; el acompañante instala fuera de Photoshop.

Permisos nuevos: conexiones a `api.github.com`, `github.com` y `release-assets.githubusercontent.com` y apertura de enlaces HTTPS. UXP solicita su consentimiento al abrir el navegador. No se solicita acceso total al disco, ejecución arbitraria ni credenciales de GitHub.

## Mantenedor: generar el primer instalador

1. Usa Windows y la misma revisión del código que vas a publicar. Ejecuta `npm test`, `npm run check` y `npm run distribution:test`.
2. Ejecuta `npm run distribution:prepare`. Produce `dist/adobe-independent/manifest.json` con el ID permanente `com.josueeguia.halftonedtf`. No cambies ese ID entre actualizaciones independientes.
3. En UXP Developer Tool añade ese manifest. En el menú del plugin elige **Package** y guarda el CCX. No necesitas cargarlo para empaquetar. Renombra el resultado a `Halftone-DTF-0.6.1.ccx`.
4. Instala ese archivo con Creative Cloud en un equipo de prueba. Comprueba instalación limpia, actualización desde una versión previa, aparición de un solo panel, permisos y persistencia de recetas/proyectos. Completa también las pruebas nativas y físicas de `release-validation.json` y registra evidencia real. No marques `passed` sin prueba.
5. Prueba Adobe UPIA con esos CCX en Windows, su código de retorno y la versión cargada. Prueba la tarea del acompañante con tu cuenta, Photoshop abierto/cerrado, red caída, permisos insuficientes y desactivación. Confirma que no cambia nada al fallar. Las pruebas CI usan un instalador simulado: no sustituyen esto.
6. Guarda el CCX real en `installer/official/Halftone-DTF-0.6.1.ccx` y la evidencia en el repo. Ejecuta:

   ```bash
   npm run release:check
   python3 scripts/prepare-distribution.py --official-ccx installer/official/Halftone-DTF-0.6.1.ccx
   ```

   La preparación falla sin evidencia y compara todo el contenido del CCX con `plugin/`. Si UDT añade un archivo adicional legítimo, revísalo antes de ajustar esa comprobación; no omitas la comparación.

7. Integra los cambios validados y crea el tag `v0.6.1` en esa revisión. El workflow **Prepare official release** ejecuta pruebas y crea un **borrador** con CCX oficial, `halftone-update.json` y ZIP del acompañante. No sobreescribe releases existentes. Revisa las notas y publica el borrador como versión estable. Para primeras pruebas, utiliza un equipo dedicado: no publiques un estable sin completar la evidencia.
8. Al publicar una nueva versión, el proceso se repite con una versión mayor y el mismo ID. Los acompañantes activados detectarán ese release en su siguiente consulta. El workflow no sube paquetes a Adobe Marketplace.

Los releases antiguos que no tengan `halftone-update.json` completo no son aptos para este flujo. No copies la metadata de otra versión ni declares que un candidato fue empaquetado con Adobe.

## Marketplace: instalación desde el catálogo de Adobe

1. Abre [Adobe Developer Distribution](https://developer.adobe.com/developer-distribution/), inicia sesión con la cuenta del propietario y completa su perfil de editor.
2. Crea el listing de Photoshop y copia el **Plugin ID generado por Adobe**. Define distribución gratuita/de pago, soporte, privacidad, condiciones y recursos visuales reales. No uses el ID independiente para ambos canales.
3. Con el ID y URL reales del listing prepara una copia:

   ```bash
   python3 scripts/prepare-distribution.py --channel marketplace --marketplace-id ID_REAL_DE_ADOBE --marketplace-url https://exchange.adobe.com/URL_REAL_DEL_LISTING
   ```

4. Empaqueta `dist/adobe-marketplace/manifest.json` con UDT y prueba ese canal. Esta edición no consulta GitHub y dirige las actualizaciones a Creative Cloud; no se usa el acompañante independiente para instalarla.
5. Sube el CCX al listing, completa la versión y envíalo a revisión. Adobe decide la aprobación. Cada actualización de Marketplace se presenta como nueva versión; publicar un release en GitHub no la publica en Adobe.

Preparar las fuentes no crea una ficha ni obtiene un ID. Esos pasos requieren la cuenta del propietario. No hay credenciales de Adobe, listing ni equipo Windows/Photoshop disponibles en este entorno, por lo que no se afirma publicación aprobada ni instalación nativa completada.

## Referencias oficiales

- [Empaquetado, ID permanente y separación de canales](https://developer.adobe.com/uxp/guides/how-to/distribution/package/)
- [Instalación con Creative Cloud y UPIA](https://developer.adobe.com/uxp/guides/how-to/distribution/install/)
- [Distribución independiente mediante GitHub](https://developer.adobe.com/uxp/guides/how-to/distribution/independent-distribution/)
- [Marketplace y aprobación](https://developer.adobe.com/uxp/guides/how-to/distribution/adobe-marketplace/)
- [Obtención del Plugin ID de Adobe](https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/plugin-id)
