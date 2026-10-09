Halftone DTF incorpora un panel compacto, vistas en el lienzo de Photoshop y preparación de impresión a 300 ppp con alfa binario.

Instalación independiente: abre el CCX con Creative Cloud. No requiere UXP Developer Tools en el equipo del usuario.

Windows: el ZIP del actualizador incluye `Instalar-y-activar.cmd`. Al activarlo, una tarea del usuario consulta releases estables cada hora mientras está conectado y usa Adobe UPIA con Photoshop cerrado. Requiere Creative Cloud instalado y sesión iniciada. `Desactivar-actualizaciones.cmd` elimina esa tarea.

El actualizador verifica identidad del plugin, versión, tamaño, SHA-256 y manifest del paquete. No instala prereleases ni versiones anteriores. Una publicación de código sin release estable no actualiza equipos.

Las actualizaciones de Marketplace se tramitan por Adobe y usan un ID independiente.
