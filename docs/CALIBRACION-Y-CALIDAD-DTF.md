# Calibración de punto y calidad de sombras

## Ganancia de punto (☰ → Calibración de punto)
La tinta se expande sobre el film y el polvo agranda el borde, así que un tono nominal imprime más cobertura de la pedida (por ejemplo 30 % → 41 %).

1. Imprime `docs/CARTA-CALIBRACION.png` a 100 % con tu equipo, film y polvo, usando la lineatura que vas a producir (la ganancia aumenta con LPI altas).
2. Mide el porcentaje real de cada parche (10 … 90 %), con lupa o escáner y contando puntos.
3. Escribe pares `nominal:medido`, por ejemplo `10:14, 30:41, 50:63, 70:80, 90:94`. Hasta 10 pares; el medido debe crecer con el nominal y el último debe ser menor que 100.
4. El panel muestra qué se pedirá en realidad (`Para imprimir 10 / 30 / 50 / 70 / 90 % se pedirá 7 / 22 / 38 / 58 / 84 %`). Se aplica la curva inversa, interpolada linealmente entre puntos, después de los niveles y antes de comparar con la trama.
5. Se guarda con la receta (`gainPoints`). Mídela por equipo, film y lineatura.

## Rellenar huecos menores y «Sólido desde» (Ajustar → Detalles)
- **Rellenar huecos menores · mm:** en sombras casi sólidas los puntos casi se tocan y los poros que quedan se cierran al imprimir. Los poros de menos de ese diámetro equivalente se rellenan con el color del arte. Solo se rellenan píxeles que el cribado descartó: el color eliminado y las zonas transparentes del origen no se imprimen. 0 lo desactiva. Orden: tramado → limpieza de partículas → relleno de huecos.
- **Sólido desde cobertura · %:** cuando la cobertura ya compensada alcanza ese valor, el área se imprime sólida sin trama. 100 lo desactiva.

Referencia: 0,25 – 0,35 mm y 92 – 96 % son valores de partida razonables, no una calibración universal; prueba de lavado antes de producción.

## Límites
- La curva de ganancia es una aproximación lineal por tramos de tu medición.
- El relleno de huecos usa 4-conexión para los poros y 8-conexión para la tinta, igual que la limpieza de islas.
- La comprobación en Photoshop y el lavado físico siguen pendientes (`release-validation.json`).
