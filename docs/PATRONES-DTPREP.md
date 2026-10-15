# Plantillas de trama de DTPrep 1.1.4 (análisis estático)

Complementa [AUDITORIA-DTPREP-ESTATICA.md](AUDITORIA-DTPREP-ESTATICA.md) §4 y [RENDIMIENTO-DTPREP.md](RENDIMIENTO-DTPREP.md).

**Método:** se leyeron `MainPattern3.psd` y `MainPattern4.psd` con un lector PSD propio escrito solo con la biblioteca estándar de Python. Lee la cabecera, los recursos, las capas, el bloque global `Patt` y los descriptores `PtFl`. No se abrieron en Photoshop ni se ejecutó el plugin.

**Aviso:** las teselas son material de DTPrep con derechos reservados. Aquí solo se describen su estructura y estadísticas para diseñar matrices **propias**. No se incluyen ni sus píxeles ni sus imágenes.

## 1. Qué contienen los PSD

Los dos archivos son **documentos RGB de 1 × 1 px a 300 ppp**: no hay imagen.
- **Contenido:** varias **capas de relleno de patrón** (`PtFl`) y, en el bloque global `Patt`, los patrones incrustados que esas capas usan.
- **Cómo los usa el plugin:** coloca el PSD con `placeEvent`, y las capas de patrón rellenan cualquier tamaño de documento sin depender de la resolución.

| Archivo | ¿Lo carga el código? | Capas `PtFl` | Patrones incrustados |
|---|---|---|---|
| `MainPattern3.psd` | **Sí**: `getEntry("MainPattern3.psd")`. Si falta, muestra «reinstall the plugin» | `HALFTONE LINE`, `HALFTONE ROUND` | `DTPrep_Line.png`, `DTPrep_Round` |
| `MainPattern4.psd` | **No**: ninguna referencia en `main.js`, ni a ELLIPSE ni a DIAMOND | `HALFTONE LINE`, `ROUND`, `ELLIPSE`, `DIAMOND` | Los anteriores más `DTPrep Ellipse2` y `DTPrep_Diamond2` |

`MainPattern4.psd` parece un resto de desarrollo o una función futura: la UI solo ofrece Round y Line.

**Valores guardados en cada `PtFl`:** escala **20 %** y ángulo **22,5°**. El plugin los sobrescribe al ejecutar Run con `470.1 / LPI` % y −ángulo.

## 2. Las teselas

| Patrón | Tamaño | Rango | Niveles distintos | Forma |
|---|---|---|---|---|
| `DTPrep_Round` | **64 × 64** | 0–254 | 254 | **Punto euclidiano** centrado |
| `DTPrep_Line.png` | **64 × 64** | 8–249 | 102 | **Líneas horizontales** con perfil triangular |
| `DTPrep Ellipse2` (sin usar) | 64 × 58 | 0–254 | 255 | Punto elíptico o de cadena |
| `DTPrep_Diamond2` (sin usar) | 64 × 64 | 0–254 | 255 | Punto cuadrado o rombo, con irregularidades locales |

Las teselas son RGB con los tres canales iguales: escala de grises guardada como RGB.

### 2.1 Round: una matriz de umbral euclidiana
- **Una celda por tesela:**
  - El mínimo (0) está en el centro (32, 32).
  - El máximo (≈254) está en las cuatro esquinas.
  - El punto medio de cada borde vale unos 130–131, alrededor del **51 %**.
- **Forma euclidiana:**
  - En tonos claros crece un punto redondo desde el centro.
  - Hacia el 50 % los puntos se tocan en el centro de los bordes y forman un tablero de ajedrez.
  - Por encima del 50 %, lo que queda son huecos redondos en las esquinas.
  - En la diagonal hay un salto brusco (175 → 153 → 122 → 95 en unos 4 px). Es la zona de unión típica del punto euclidiano.
- **Distribución casi uniforme** (porcentaje de píxeles con valor ≤ t):

  | t | 25 | 51 | 76 | 102 | 127 | 153 | 178 | 204 | 229 |
  |---|---|---|---|---|---|---|---|---|---|
  | % | 9,9 | 20,2 | 30,0 | 38,9 | 49,7 | **62,4** | 70,7 | 80,7 | 90,6 |

  La matriz está **ecualizada**: el área del punto es casi proporcional al tono.
  - La desviación máxima es de unos +2,4 puntos hacia el 60 %. Es el «salto» de la unión, en la zona de 38–62 %.

### 2.2 Line: líneas con perfil triangular
- **Valor por fila:** cada fila es casi constante (8–10 en la fila central). Varía solo en vertical.
  - Baja de 249 a 10 en 32 px y vuelve a subir: unos **7,8 niveles por píxel**.
  - El resultado es **una línea horizontal por tesela**. Con `angle`, el plugin la inclina.
- **Rango recortado:** va de 8 a 249, no de 0 a 255.
  - Los tonos por debajo del ~3 % y por encima del ~97 % salen sólidos o vacíos.
  - Esto actúa como un **mínimo y máximo de línea implícitos**, y evita filamentos de 1 px que no se adhieren en DTF.
- **Pocos niveles:** solo tiene 102 valores distintos, porque la pendiente es lineal y entera. La distribución también es uniforme (10,9 / 20,3 / 29,7 / 39,5 / 51,1 / … / 89,1 %).

## 3. Cómo se convierte en trama

Fórmula de Hard Mix (Mezcla definida), con `A` el tono del arte tras Desaturar y Niveles y `B` la matriz:

```
resultado = (A + B ≥ 255) ? 255 : 0
```

- Un píxel queda «encendido» cuando `B ≥ 255 − A`.
- Como la matriz es casi uniforme, la fracción encendida de cada celda vale `≈ A / 255`.
- Es decir, **la curva de tono a punto es lineal** antes de Niveles, de Output Levels y de la opacidad de relleno al 90 % (H).
- Toda la calibración tonal la hacen los Niveles (7 / 2 / 100 por defecto), no la matriz.

## 4. Escala, celda y niveles efectivos

Con la escala `s = 470.1 / LPI` % sobre una tesela de 64 px:

```
celda_px = 64 · s / 100 = 300,86 / LPI
LPI efectiva a 300 ppp = LPI · 300 / 300,86 ≈ 0,997 · LPI
```

- **Ajuste de la constante:** la exacta para 64 px sería `30000 / 64 = 468,75`. Con 470,1 la celda sale un 0,29 % más grande, una diferencia irrelevante en la práctica. Puede venir de calibrar contra el reescalado de Photoshop (H).
- **Remuestreo:** Photoshop reduce la tesela de 64 px al tamaño de la celda. Por eso **el número real de umbrales distintos por celda es como mucho `celda_px²`**:

| LPI | Celda | Escala | Umbrales máx. por celda (≈ tonos distintos) |
|---|---|---|---|
| 20 | 15 px | 23,5 % | ~225 |
| 30 *(defecto)* | 10 px | 15,67 % | ~100 |
| 40 | 7,5 px | 11,75 % | ~56 |
| 50 | 6 px | 9,40 % | ~36 |
| 60 | 5 px | 7,84 % | ~25 |

A partir de unos 45 LPI hay **posterización visible**: escalones en degradados suaves. Esto es una limitación de cualquier trama AM a 300 ppp, no un error de DTPrep. Además, el remuestreo de la tesela (bicúbico o bilineal, H) suaviza la matriz y puede alterar ligeramente la uniformidad de §2.1.

- **Ángulo:** al girar el patrón, Photoshop vuelve a muestrear la matriz en la rejilla de píxeles. Con 33° y celdas de pocos píxeles, los puntos no son idénticos entre sí (H). Para verlo hay que hacer una prueba visual en Photoshop.
- **Horneado sin antialias:** `HALFTONE FLAT` (`antiAliasNone`) garantiza bordes de 0/255 tras ese remuestreo.

## 5. Implicaciones para halftone-dtf-ps

Todo lo siguiente se puede hacer con matrices **generadas por código propio**: son técnicas estándar.

1. **Matriz Round:** usar una función de punto euclidiana. Por ejemplo, `f(x,y) = 1 − (x² + y²)/2` si `|x|+|y| ≤ 1` y `(x−1)² + (y−1)² − 1` (con la simetría correspondiente) en otro caso. Después, **ecualizar** por rango (*rank-order*) para que el área sea lineal en el tono, como en §2.1.
2. **Matriz Line:** usar un perfil triangular con recorte del 3 % en cada extremo para obtener el mismo efecto de mínimo y máximo de línea.
3. **Calcular la matriz al tamaño final de la celda**, no reducir una tesela de 64 px. Con eso se evita el suavizado del remuestreo y se controla la cobertura exacta. Si el motor ya trabaja así (`lut[cobertura] > umbral`), basta con generar los umbrales con estas funciones.
4. **Avisar en la UI** cuando la LPI deje menos de unos 50 niveles por celda (≥ 40 LPI a 300 ppp), o documentarlo en la calibración.
5. **Más formas de punto:** Ellipse (de cadena) y Diamond (cuadrado) son útiles en DTF y DTPrep no las expone. Podrían ser un punto diferenciador, generadas con su función de punto correspondiente.
6. **Validar en Photoshop:** pasar una rampa de grises por DTPrep y por este repo y medir el porcentaje de punto por paso. Así se comprueba la linealidad de §3 tras Niveles 7 / 2 / 100 y la opacidad de relleno al 90 %.

## 6. Qué está verificado y qué no

**Verificado estáticamente:**
- Estructura de los PSD, nombres e IDs de los patrones.
- Tamaños de 64 × 64 y 64 × 58.
- Rangos, número de niveles, distribución y perfiles de fila, columna y diagonal.
- Escala y ángulo por defecto de `PtFl` (20 %, 22,5°).
- Que `MainPattern4.psd` no se usa.

**Requiere Photoshop:**
- El método de remuestreo de las capas de patrón y su efecto sobre la uniformidad.
- La curva real de tono a punto tras Desaturar, Niveles y la opacidad de relleno al 90 %.
- El aspecto de los puntos girados a 33° en celdas pequeñas.
