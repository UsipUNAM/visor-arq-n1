# Visor 3D del nivel 1 · modelo v14b

Visor web del modelo arquitectónico del hospital de simulación (planta baja completa y núcleo del nivel 2), en máxima
calidad para computadora de escritorio, laptop o Mac: texturas de 2048 px, sombras del sol, antialiasing y la resolución
nativa de la pantalla. Probado en Chrome y Safari de escritorio. En tabletas y teléfonos puede quedarse sin memoria de
video; en ese caso muestra «Este visor está optimizado para computadora; ábrelo en una PC o Mac».

## Cómo abrirlo

- **En línea**: abre el enlace de GitHub Pages que acompaña esta carpeta.
- **En esta computadora**: en Windows, doble clic en `abrir_visor.bat`; en Mac, doble clic en `abrir_visor.command`
  (la primera vez: clic derecho → Abrir). Levanta un servidor local (necesita Python 3) y abre `http://localhost:8765`
  en el navegador. Para cerrarlo, cierra la ventana de la terminal.
  Abrir `index.html` directamente con doble clic **no** funciona: los navegadores no cargan modelos 3D desde archivos
  locales sin servidor.

El modelo viene partido en 35 archivos por nivel y zona (`partes/`, 68 MB en total, el mayor de 11.6 MB). Se cargan en
orden con una barra de avance y el edificio aparece en cuanto llegan los muros.

## Cómo se usa

| | Con ratón y teclado | Con pantalla táctil |
|---|---|---|
| Girar | arrastrar | un dedo |
| Acercar | rueda | pellizcar con dos dedos |
| Desplazar | clic derecho y arrastrar | dos dedos |
| Caminar | botón «Caminar»; W A S D para moverse, ratón para mirar, Shift para correr, R / F para subir o bajar de nivel, Esc para salir | botón «Caminar»; palanca abajo a la izquierda para moverse, arrastrar con el dedo para mirar, botones «Nivel 2», «Nivel 1» y «Salir» |
| Ver un espacio | clic sobre él: nombre, zona, m² y medidas | tocarlo |

En el panel: vistas rápidas (plantas, isométrica, fachada sur), corte por altura, buscador de espacios y capas por zona.
En teléfono el panel se abre con el botón ☰.

## Observaciones de auditoría

Selecciona un espacio, escribe la observación y «Agregar observación». «Guardar notas» las guarda en
`notas_auditoria.md` cuando se usa `abrir_visor.bat`; en línea, el navegador descarga ese mismo archivo. «Cargar notas…»
vuelve a abrir un archivo de notas.

## Contenido

`index.html`, `visor.js`, `visor.css` (el visor), `lib/` (three.js, licencia MIT), `partes/` y `partes.json` (el modelo),
`espacios.json` (nombres, zonas y m² de los espacios del plano), `servidor.py`, `abrir_visor.bat` y `abrir_visor.command` (servidor local).

En el visor, los modelos de mobiliario con licencia que no permite redistribuirlos se sustituyen automáticamente por su
versión modelada a mano; el resto de los modelos y texturas son de dominio público (CC0).
