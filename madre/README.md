# Pizarra para mamá

Pantalla de pared para una Android TV antigua (Philips 50PUH6400, Android 5.1). Muestra el día, la hora en cifras y
en palabras, los mensajes de la familia, los eventos del calendario y el tiempo. De noche pasa a una pantalla oscura.
Se maneja desde una web app en el móvil: un panel de administrador y un enlace sencillo para cada familiar.

| Carpeta | Qué es |
|---|---|
| `app-tv/` | App nativa de la TV (Android 5.0 o superior, sin navegador). |
| `apps-script/` | "Cerebro" en Google Apps Script: guarda los datos, lee el calendario y el tiempo, y sirve el panel del móvil. |
| `mockup/` | Diseños de referencia: estilos de la TV (`estilos/`) y panel del móvil (`panel/`). |
| `web-app/iconos/` | Iconos para poner el panel en la pantalla de inicio del móvil (se usan en la fase 4). |

Estado: **fases 0, 1 y 2 hechas** (script, datos en Drive, panel del móvil, app de la TV 2.0 con cinco estilos). **Fase 3 lista** (app de la TV 3.0)
(recordatorios con foto, fotos de la familia con encuadre en círculo, aviso por correo). Pendiente: la fase 4 (audio y vídeo) y, después,
las distribuciones de pantalla (Reloj a la izquierda, Lista, Sencillo) combinables con cualquier estilo de color.

## Fase 1: qué hay de nuevo en el script

- **Datos en Drive.** Todo vive en `pizarra-datos.json`, en una carpeta **Pizarra** de tu Drive, con caché y bloqueo.
  Las propiedades del script solo admiten 9 KB por valor y se habrían roto con unos 30 mensajes.
  Al arrancar, el script copia los datos de la versión anterior sin perder nada (la copia antigua se queda como respaldo).
- **Historial.** Se guardan los 100 últimos mensajes caducados. El administrador ve todos, con autor y hora; cada familiar, solo los suyos.
  "Quitar" deja el mensaje caducado, no lo borra.
- **Tiempo de hoy y de mañana** (Open-Meteo, caché de 30 min) y eventos del calendario (caché de 55 s).
- **Cuentas atrás.** Varias, con texto, fecha, icono, "mostrar desde N días antes" y texto del día. Se muestra la más cercana;
  el día del evento dice "Hoy es …" y al día siguiente desaparece.
- **Bloques y estilos.** Encender, apagar y ordenar los bloques; estilo de día y de noche (Cálido, Lavanda, Salvia, Terracota,
  Alto contraste); "Probar 1 minuto". La TV todavía no los usa: llegan con la fase 2.
- **Fotos de familia.** Cada persona sube su foto desde su enlace; el administrador puede cambiarla o quitarla.
  Se guardan en Drive y la TV las pedirá con la clave de administrador (nunca se comparten con "cualquiera con el enlace").
- **Estado de la TV.** El panel muestra "Conectada hace 20 segundos" o "Sin conexión desde las 14:10".
- **Sin aprobación.** Lo que escriben los familiares sale directamente.
- **Contador de uso** (fase 0). `TU_DIRECCION_EXEC?a=metricas&k=TU_CLAVE` (solo administrador) devuelve cuántas peticiones llegan cada día,
  de cada tipo (`estado` es la TV, `admin` es el panel), con su tiempo medio y máximo, de los últimos 8 días. Es aproximado; el tiempo real de
  ejecución sale en la pantalla **Ejecuciones** de Apps Script. Sirve para medir el consumo frente a las cuotas gratuitas.

## Fase 3: recordatorios con foto, fotos de la familia y aviso por correo

- **Vista previa.** Cualquier familiar puede ver, solo para mirar, cómo se ve ahora la pantalla de la tele (botón "Ver cómo se ve la tele" en su enlace).
- **Fotos de la familia.** Cada persona sube la suya desde su enlace (cámara o galería). Antes de subirla se abre un recuadro redondo: arrastra la foto y
  acércala hasta que se vea bien la cara. Sale en la TV junto a sus mensajes, sin aprobación de nadie. El administrador puede cambiarla o quitarla en **Más › Familia**.
  Sin foto, se ve la inicial en un círculo.
- **Recordatorios** (**Más › Recordatorios**): hora, días de la semana, texto principal, texto pequeño, foto, cuánto tiempo se ve (5 a 60 minutos) y si hay que confirmarlo.
  A su hora la TV cambia entera con un fundido: arriba una línea fina con el día y la hora, en el centro la foto grande y el texto en letra enorme con la etiqueta **AHORA**,
  y abajo los mensajes de la familia. Pasada la duración, o al confirmarlo desde el móvil, vuelve a la pizarra. **De noche no salta ninguno.**
  "Guardar y probar 1 minuto en la TV" lo enseña enseguida, sea la hora que sea.
- **Confirmar.** Si hay que confirmarlo, en **Inicio** del móvil aparece "Pendiente de confirmar" con el botón **Confirmar que lo ha tomado**. Lo puede confirmar el administrador
  o cualquier persona de la familia desde su enlace; en el panel del administrador queda anotado quién y cuándo ("Confirmado por Ana a las 13:40").
- **Aviso por correo.** Si algo que hay que confirmar sigue sin confirmar 30 minutos después de su hora, te llega un correo (una sola vez por recordatorio y día). Se manda al correo
  de tu cuenta de Google, o al que pongas en **Más › Ajustes › Avisos por correo**, donde también hay un botón para mandar un correo de prueba.
  Una comprobación automática lo revisa cada 5 minutos.
- **Fotos privadas.** Se guardan en tu Drive, en la carpeta **Pizarra**, y no se comparten con ningún enlace. La TV no entra en tu Drive: pide cada foto al script con la clave de
  administrador (`?a=foto&p=…`), que solo sirve fotos registradas en la pizarra (de una persona o de un recordatorio). La TV la guarda y no la vuelve a pedir hasta que cambie.
  El móvil las reduce antes de subirlas (familiares: 512 px cuadradas; recordatorios: hasta 900 px sin deformar) y el script rechaza más de 450 KB.
- **La TV** pregunta cada 60 s y, mientras muestra un recordatorio, cada 15 s (para volver a la pizarra enseguida al confirmarlo).
- Nunca hay nombres de medicinas en los ejemplos ni en los textos por defecto: lo que se escribe en cada recordatorio lo decides tú.

### Fase 3.1: arreglos

- **Ningún texto se corta.** Si no cabe, la letra baja hasta 36 px y, si aun así no cabe, pasa a otra línea (hasta tres). Vale para contacto, nombres, eventos, cuenta atrás y recordatorios.
- **Teléfono:** el número es lo más grande de su tarjeta y crece para llenarla ("061" a unos 200 px). La tarjeta de **Es hora de dormir** también crece hasta llenar su hueco.
- **Vista previa fiel.** "Así se ve ahora en la TV" ya no es un dibujo aproximado: es una foto de la pantalla real que manda la propia TV mientras alguien mira (cada pocos segundos, en JPEG de 640×360; se guarda
  en la caché del script y no en Drive). Mientras la tele no haya mandado ninguna, el panel enseña una versión aproximada y lo avisa.

### Desplegar la versión 3 del script (la dirección `/exec` no cambia)

1. En <https://script.google.com> abre tu proyecto. Pega el nuevo `Code.gs` en `Código.gs` y el nuevo `Admin.html` en el archivo `Admin`. Deja `appsscript.json` como está.
2. **Guardar**, elige la función **`autorizar`** y pulsa **Ejecutar**. Google pedirá **permisos nuevos**:
   - **Enviar correos** como tú (para el aviso).
   - **Crear y gestionar disparadores** (para la comprobación automática cada 5 minutos).
   Acéptalos (Opciones avanzadas › Ir a… › Permitir). En el registro tiene que salir "Avisos por correo: activados".
3. **Implementar › Gestionar implementaciones › lápiz › Versión: Nueva versión › Implementar.** No uses "Nueva implementación": la dirección `/exec` no debe cambiar.
4. Abre el panel, ve a **Más › Ajustes › Avisos por correo** y pulsa "Enviar un correo de prueba".

Con el script nuevo y la TV todavía en la 2.0, todo sigue funcionando (la 2.0 ignora los recordatorios). Y con el script anterior, la TV 3.0 también (simplemente no hay recordatorios).

## Versión 6.1: móvil rediseñado, mejoras del script y arreglos de la TV

### Arreglos de la TV (app 6.1)
- **Pantalla vacía**: con la distribución "reloj" (y con cualquiera) solo se veía la cabecera. Causa probable: la TV no tenía datos
  (dirección o clave guardadas mal; por ejemplo si se lanzó el comando de arranque con los textos de ejemplo
  `TU_DIRECCION_EXEC`/`TU_CLAVE_DE_ADMINISTRADOR`) y el cuerpo quedaba en blanco. Ahora:
  - la TV **no guarda** una dirección que no empiece por `https://` ni una clave de menos de 8 caracteres;
  - sin datos, todas las distribuciones dicen "Esperando a la pizarra…";
  - si una distribución falla al dibujarse, se pone la **Clásica**;
  - sin nada apuntado hoy, "Lo próximo" enseña lo primero de mañana ("Mañana · A las doce").
- **Palabras partidas**: ninguna palabra se parte nunca. La letra baja hasta 36 px; si aun así no cabe, el texto se recorta por
  palabras con "…" (solo una palabra más larga que toda la línea se acorta ella sola).
- **Versión instalada**: el panel enseña "Conectada hace… · app 6.1". Desde PowerShell:
  `adb shell dumpsys package es.pizarra.tv | findstr versionName`.

### App 6.7: "Mensajes primero", seis combinaciones de color
Un diseño nuevo, a partir de los 24 PNG de ChatGPT (6 combinaciones × 4 estados): cabecera pequeña (día | hora), los **mensajes lo más grandes posible**
a todo el ancho y de colores, la **próxima cita** en una banda, la cuenta atrás arriba y el tiempo abajo. Ids: `salvia_melocoton`, `coral_menta`, `salvia_azul`,
`menta_lavanda`, `azul_terracota` y `bosque_amarillo`. En el panel salen agrupadas bajo "Mensajes primero".
- Sin mensajes ni cita (estado A) los huecos punteados de los mockups **no se dibujan** (eran marcas de sitio): el tiempo y la cabecera ocupan el espacio.
- Sin datos del tiempo (estado D) salen las dos tarjetas "Sin datos del tiempo", como en los mockups.
- Los mockups llevaban el texto del tiempo a ~26 px; aquí se respeta el mínimo de 36 px (a 1080p).
- Los colores y su contraste se comprueban en `TemasTest` (también el estilo de día elegido sobre los fondos de los mensajes). De noche, la Clásica.
- Compatibilidad: hace falta la 6.7; una app anterior ve la Clásica (el panel lo avisa).

### App 6.6: las siete pantallas sin "momento del día"
Siguiendo los diseños revisados, las siete pantallas con diseño propio ya no llevan etiqueta ni píldora de "Al mediodía / Por la tarde": la hora
hablada ("Es la una menos veintisiete del mediodía") ya lo dice. Banda verde pierde su tarjeta central y se queda con Hoy y Mañana.

### App 6.5: el tiempo se mueve y el momento del día no lleva sol
- **Iconos del tiempo animados** (`IconoTiempo.java`), en todas las distribuciones: el sol gira despacio y respira, las nubes se mecen, la lluvia y la
  nieve caen, la tormenta destella y la niebla ondula. Se redibuja unas 20 veces por segundo; en las capturas de prueba se congela (`fasePrueba`).
- **Sin sol en "Al mediodía"** en las siete pantallas con diseño propio: el momento del día es solo texto, para que no parezca una previsión de sol.

### App 6.4: siete pantallas nuevas con diseño propio
Además de Clásica, Reloj, Lista y Sencillo hay siete distribuciones más, hechas a partir de los diseños del usuario: **Banda verde, Mosaico, Bloques,
Columna lateral, Titular grande, Marco azul y Limpia** (ids `banda`, `mosaico`, `bloques`, `lateral`, `titular`, `marco`, `limpia`). Se eligen en
Panel › Gestión › Pantalla › Distribución.
- **Colores**: cada una lleva los suyos de día (el estilo elegido solo cambia los mensajes, la próxima cita y de noche). **De noche** se ven como la
  Clásica con el estilo de noche. Los recordatorios, vídeos y fotos no cambian.
- **Con mensajes o cita**: el tiempo pasa a una sola línea y la cabecera se encoge para dejar sitio; sin nada de eso se ven como en el diseño.
- **Compatibilidad**: hace falta la app **6.4**. Una app anterior (probado con el código de la 6.3) recibe el id nuevo, no lo conoce y dibuja la
  **Clásica** idéntica, nunca en blanco. El panel lo avisa: "la app de la tele es la 6.3: hasta que instales la 6.4 seguirá viendo la Clásica".
- Código: `construirTablero` y `pintarTablero` en `MainActivity.java`; colores en `TEMAS` (con prueba de contraste 4,5:1, `TemasTest`);
  miniaturas del panel con `python3 madre/web-app/hacer-miniaturas.py <carpeta de capturas>`.
- Revertir: elegir otra distribución en el panel, o instalar la 6.3 (`PizarraTV-6.3.apk`).

### App 6.3: una cita solo de mañana ya se ve de día
En la distribución Clásica, de día, "Lo próximo" solo dibujaba los eventos de hoy: si lo único apuntado era de mañana (por ejemplo "Mañana 07:45
Analítica Mamá"), no salía nada. Ahora, sin nada hoy, la tarjeta se llama "Mañana" y enseña lo de mañana. Las otras tres distribuciones ya lo hacían desde la 6.1.

### App 6.2: se abre sola al despertar la TV
Una TV Android, al "apagarla" con el mando, no se reinicia: se duerme. Sin arranque no hay `BOOT_COMPLETED` y la pizarra no salía. Ahora un
servicio (`Despertar`) escucha cuándo se enciende la pantalla (`SCREEN_ON`, `USER_PRESENT`, fin del salvapantallas) y abre la pizarra si no está
delante. También se abre al arrancar (`BOOT_COMPLETED`, `QUICKBOOT_POWERON`) y tras instalar una versión nueva. **Sin probar en la Philips real**:
si esa TV no emite esos avisos al despertar, hay que mirar su ajuste "al encender" (ver más abajo). Si mamá quiere ver un canal, usa el mando
(Fuente/Inicio): la pizarra se abre cada vez que la TV se enciende.

### Qué hay de nuevo
- **App del móvil rediseñada** (estilo iPhone: listas agrupadas, fondo gris claro, una sola tinta azul, modo oscuro): Inicio
  (estado de la tele, vista previa real, "A continuación"), Mandar (con nota de voz de mantener pulsado) y Enviados; el engranaje
  guarda Pantalla, Recordatorios, Cuentas atrás, Visitas y rutina, Familia y Ajustes. El familiar ve Inicio, Mandar y Enviados.
- **Todo se guarda al tocar**, "Deshacer" 10 s, miniaturas reales, programar un mensaje, "Volver a mandar", fijar un mensaje
  (uno solo, solo el administrador), horas en 24 h, nombres con mayúscula, Familia sin enseñar el enlace con la clave
  (solo "Copiar enlace" y "Enviar por WhatsApp") y errores junto a lo que falló.
- **Script**: caché de eventos de 10 minutos (simulado: 952 → 142 ms de media y 1200 → 120 llamadas a Calendar cada 600 consultas),
  limpieza diaria de Drive (medios vistos de más de 30 días; nunca fotos de perfil ni de recordatorios activos), copia diaria de los
  datos en `Pizarra/Copias` (las últimas 7), aviso por correo si la TV lleva más de 30 min sin consultar (y otro al volver, máximo uno
  de cada tipo cada 6 h), calendario de iCloud (`webcal://`, el enlace se guarda solo en el script), "Hoy viene…" y rutina semanal.
- **TV**: lee en voz alta los mensajes nuevos (español, nunca de noche; sin voz española no falla), y "Hoy viene…" con la foto.

### Iconos de la pantalla de inicio
- **Administrador**: el televisor violeta con el corazón (`web-app/iconos/`).
- **Familiares (Ana, Dani, María…)**: el mismo televisor en verde (`web-app/iconos-familia/`). El panel pone uno u otro según quién entra
  (iPhone: `apple-touch-icon`; Android: iconos de 192/512 y manifiesto). Solo vale si guardan la app desde `…/Sky/tele/`, no desde la página de Google.
- Para usar otro dibujo: `python3 madre/web-app/hacer-iconos.py mi-icono.png` (PNG cuadrado, mejor de 1024 px), después `python3 madre/web-app/construir.py` y `sh madre/web-app/publicar.sh`.
  Quien ya añadió la app debe borrar el icono y volver a añadirla: iOS guarda el icono al añadirla.

### Desplegar el script (la dirección `/exec` no cambia)
1. Abre el proyecto en script.google.com; sustituye todo `Code.gs` y `Admin.html` por los de esta carpeta.
2. Ejecuta una vez la función `autorizar` (crea el activador diario de limpieza y copias). **No hacen falta permisos nuevos.**
3. Implementar › Administrar implementaciones › lápiz › **Nueva versión**. Nunca "Nueva implementación".

### Instalar la 6.1 (PowerShell, de uno en uno)
```powershell
adb connect 192.168.1.83:5555
adb install -r "$HOME\Downloads\PizarraTV-6.1.apk"
```
No hace falta repetir la dirección ni la clave. Si la TV las perdió, pásalas **reales** (nunca los textos de ejemplo):
`adb shell am start -n es.pizarra.tv/.MainActivity --es url "https://script.google.com/macros/s/…/exec" --es k "TU_CLAVE"`.
Volver a la 5.0: `adb uninstall es.pizarra.tv`, `adb install "$HOME\Downloads\PizarraTV-5.0.apk"` y el comando de arranque de arriba.
La APK 6.1 lleva el mismo certificado que la 5.0 (SHA-256 `2ec1326a…0512972`).

### Medir antes y después
```powershell
$u = "https://script.google.com/macros/s/…/exec"; $k = "TU_CLAVE"
Invoke-RestMethod "$u`?a=metricas&k=$k" | ConvertTo-Json -Depth 6 | Out-File "$HOME\Downloads\metricas-antes.json" -Encoding utf8
```
(repetir con `metricas-despues.json` pasadas unas horas). Ajustes enseña las consultas de la TV por hora.

## Versión 5.0: distribuciones, audios/vídeos/fotos a distancia y app con icono

Todo está en tres PR en borrador encadenados (#8 distribuciones → #9 audios y vídeos → #10 app con icono), sobre #7 (fase 3.1). Nada está fusionado.

### Qué hay de nuevo

- **Fase 3.1** (ya en #7): el texto nunca se corta (baja hasta 36 px y, si hace falta, pasa a otra línea), el teléfono y "Es hora de dormir" crecen hasta llenar su tarjeta y la vista previa del móvil es una captura real de la TV.
- **Distribuciones** (**Más › Pantalla › Distribución**, con miniaturas que son capturas reales): *Clásica*, *Reloj a la izquierda*, *Lista* y *Sencillo*. Se combinan con cualquier estilo, de día y de noche; "Probar 1 minuto con esta distribución" prueba la combinación elegida.
- **Audios, vídeos y fotos** (**Más › Audios y vídeos**, y en la página de cada familiar): grabar un audio (hasta 1 min) o un vídeo (hasta 30 s), o elegir una foto/vídeo/audio del móvil. Todo queda en `Pizarra/Medios` de tu Drive, privado, sin enlaces públicos y sin aprobación.
  - Nada se pone solo. En **Preparados** se ve quién lo mandó; **Reproducir ahora** / **Mostrar ahora en la TV** lo pone. De noche no se pone nada (y no deja pulsarlo).
  - La TV pone pantalla completa con "Vídeo de Ana", un pitido suave, sube el volumen (al 70 % si estaba más bajo) y lo devuelve a como estaba al terminar; luego vuelve a la pizarra. Una foto se queda 1, 5 o 15 minutos, o hasta que se quite.
  - En el móvil: Repetir, Parar, Volumen − y +, y el estado en vivo (Esperando a la TV… / Reproduciendo / Terminado / un error claro). Si la TV no contesta en 15 minutos, el envío deja de esperar.
  - Permisos: cada familiar reproduce, muestra y borra lo suyo; el administrador todo, con **Historial** de lo que se ha puesto y quién.
  - Audio: se convierte siempre en el móvil a WAV mono de 16 kHz (lo entiende cualquier Android). Vídeo: Safari graba MP4/H.264 y Chrome MP4/H.264 o WebM/VP8. Un vídeo de la galería en **HEVC** (el de los iPhone recientes) se rechaza con una explicación ("Ajustes › Cámara › Formatos › Más compatible").
- **App con icono** (carpeta `web-app/`): el mismo panel en su propia página, para publicar en GitHub Pages. Icono de la tele con el corazón, nombre "La tele de mamá", pantalla completa. Así el micrófono y la cámara funcionan en Safari y Chrome (dentro de la página de Google, el navegador suele bloquearlos). Los enlaces de la familia apuntan a ella.

### Desplegar el script v5 (la dirección `/exec` no cambia)

1. Pega `apps-script/Code.gs` y `apps-script/Admin.html` en el editor de Apps Script (sustituyen a los actuales).
2. **Implementar › Administrar implementaciones › lápiz › Versión: Nueva versión › Implementar.** Nunca "Nueva implementación".
3. **No hay permisos nuevos:** usa los mismos que la v3 (Drive, Calendario, correo, servicios externos y activadores). Aun así, ejecuta `autorizar` una vez; si Google no te pide nada, es que no falta ninguno.
4. La carpeta `Pizarra/Medios` se crea sola al mandar el primer envío.

### Publicar la app del móvil (GitHub Pages)

La app vive en la subcarpeta **`tele/`** de la rama que ya sirve GitHub Pages (`claude/api-install-test-u8px6b`), porque la raíz de `https://davassi-spec.github.io/Sky/` es la web de la Torre d'en Galmés y no se toca. Queda en **`https://davassi-spec.github.io/Sky/tele/`** (ya publicada). No hay que cambiar nada en Settings › Pages.

Cada vez que cambie `Admin.html`: `python3 madre/web-app/construir.py` y `sh madre/web-app/publicar.sh` (copia solo `tele/` a esa rama).

Después:
1. Abre en el móvil `https://davassi-spec.github.io/Sky/tele/#u=IDENTIFICADOR&k=TU_CLAVE`. `IDENTIFICADOR` es la parte de tu dirección `/exec` entre `/s/` y `/exec`. Más cómodo: en el panel de Google, **Más › Ajustes › Icono en la pantalla de inicio**, la dirección de la app ya viene puesta; toca "Copiar mi enlace de la app" (o "Enviármelo por WhatsApp").
2. A partir de ahí, **Familia** da a cada persona un enlace de la app (con su clave tras el `#`, que el navegador nunca envía).
3. **Añadir a pantalla de inicio:** *iPhone (Safari)*: Compartir (cuadrado con flecha) › Añadir a pantalla de inicio › Añadir. *Samsung (Chrome)*: ⋮ › Añadir a pantalla de inicio (o Instalar aplicación) › Añadir.
4. Si el icono se abre sin el enlace, la app pide pegarlo una vez (también vale el enlace antiguo de Google).

### Instalar la 5.0 en la TV (Windows PowerShell)

El APK es `app-tv/release/PizarraTV-5.0.apk`, con el mismo certificado que la 3.0 (se instala encima, sin desinstalar). No pide permisos nuevos.

```
adb connect IP_DE_LA_TV:5555
adb install -r PizarraTV-5.0.apk
adb shell am start -n es.pizarra.tv/.MainActivity
```

**Volver a la 3.0** (el script v5 sigue valiendo para la 3.0; solo se pierden distribuciones y envíos a la TV): como Android no deja bajar de versión con `-r`, hay que desinstalar y reinstalar, y la TV pide la URL y la clave otra vez:

```
adb uninstall es.pizarra.tv
adb install PizarraTV-3.0.apk
adb shell am start -n es.pizarra.tv/.MainActivity --es url "TU_URL_EXEC" --es k "TU_CLAVE"
```

### Qué códecs entiende la TV

```
adb shell "cat /system/etc/media_codecs*.xml /vendor/etc/media_codecs*.xml 2>/dev/null | grep -i -E 'avc|hevc|vp8|vp9|aac|opus|mp3|wav'"
adb logcat -d -s Pizarra          # errores de reproducción de la app (la TV dice por qué no pudo)
```

H.264 + AAC (MP4) lo reproduce cualquier Android 5.1; WAV también. Si en ese listado no sale `video/avc`, o un vídeo de Chrome en WebM no se ve, grábalo desde Safari o elige H.264.

### ¿Cabe en las cuotas gratuitas? (estimación; mide con tu `?a=metricas`)

Mira los números reales con `TU_URL_EXEC?a=metricas&k=TU_CLAVE` (cuentan `estado`, `medio`, `medioEstado`, `rpc` y `post` por separado). Estimación con el código actual:

- Consulta normal: 1 llamada/min = 1.440 al día. Solo toca la caché (no Drive), así que son ejecuciones muy cortas.
- Mientras hay algo pendiente la TV pregunta cada 6 s. Un envío es: ~1 llamada de `medio` por cada trozo de 1 MB (un vídeo de 10 MB = 10 llamadas, cada una lee un fichero de Drive), ~10 consultas de estado y unas pocas escrituras (reproduciendo/terminado). Unas 25–50 llamadas por envío. Con 20 envíos al día: 500–1.000 llamadas más, y unos minutos de ejecución.
- El panel mira el estado cada 3 s solo mientras algo está pendiente (llamada ligera, de caché).
- Los límites de una cuenta gratuita que importan son: 6 min por ejecución, 90 min/día de activadores (el aviso por correo usa ~5), 20.000 llamadas/día a servicios externos y 30 ejecuciones simultáneas. Nada de esto se acerca. Lo único a vigilar es la lectura de Drive en los vídeos grandes: si ves `medio` con tiempos medios altos, acorta los vídeos.

### Pruebas nuevas

```
node apps-script/test/servidor.test.js      # 231: + distribución, envíos, permisos, noche, RPC y lista cerrada de funciones
node apps-script/test/panel.test.js         # 145: + audios/vídeos, subida por trozos, HEVC, grabar con micrófono y cámara simulados
node apps-script/test/envoltorio.test.js    # 23: la app con icono (enlaces, manifiesto, sin enlace, sin claves en el repo)
node apps-script/test/capturas-panel.js /ruta   # capturas del móvil de las fases 5 y 6
python3 web-app/construir.py --comprobar    # index.html al día respecto a Admin.html
```

## Poner el script (una vez, unos 5 minutos)

1. Entra en <https://script.google.com> con tu cuenta y abre tu proyecto (o crea uno nuevo).
2. Pega `Code.gs` en el archivo `Código.gs`. Pega `Admin.html` en el archivo HTML `Admin`
   (se crea con **+ → HTML**; el nombre es exactamente `Admin`). Deja `appsscript.json` como está.
3. **Guardar**, elige la función **`autorizar`** y pulsa **Ejecutar**. Google pide un permiso **nuevo**: acceso a tu Drive
   (para guardar el archivo de datos y las fotos). Acéptalo. Si es un proyecto nuevo, ejecuta antes **`configurar`**:
   crea tu clave secreta y la muestra en el registro.
4. En el registro aparece cuántos mensajes y personas se han migrado.
5. **Implementar → Gestionar implementaciones → lápiz → Versión: Nueva versión → Implementar.**
   No uses "Nueva implementación": la dirección `/exec` no debe cambiar, porque la TV la tiene guardada.
6. Abre `TU_DIRECCION_EXEC?a=admin&k=TU_CLAVE` en el móvil.

Si algo sale mal, la copia de los datos de la versión anterior sigue en las propiedades del script (`pizarra`).
Puedes borrarla cuando compruebes que todo funciona.

Quien tenga la dirección y una clave puede usar la pizarra. La clave de administrador lo puede todo (es la de la TV y la tuya);
las de familia solo escriben mensajes, quitan los suyos y cambian su foto. Si quitas a alguien en **Familia**, su enlace deja de funcionar al instante.
**No pongas claves ni la dirección `/exec` en el repositorio.**

## App de la TV (versión 3.0; la 5.0 está más arriba)

Pantalla: arriba el día, la fecha, la hora en cifras (con los dos puntos parpadeando), la hora en palabras ("Son las cinco y cuarto de la tarde")
y una etiqueta grande con la parte del día. Debajo, a la izquierda los mensajes de la familia (con su foto), a la derecha lo próximo del calendario y
el tiempo de hoy y de mañana con qué ponerse. Si hay una cuenta atrás, sale como una franja arriba. De noche: los mensajes, "Es hora de dormir" con
lo primero de mañana, y el teléfono. La letra crece hasta llenar cada tarjeta y solo encoge si no cabe; ningún texto baja de 36 px.
La colocación es fija: el panel solo enciende o apaga cada bloque.

Los mensajes salen solo con "Ana dice" (sin la hora a la que se escribieron) y con la letra más grande que quepa. Una tarjeta vacía no se enseña (sin eventos, sin tiempo…):
las demás ocupan su sitio y crecen. De día se enseñan los eventos que caben, sin "…y N más".

Cinco estilos, cada uno de día y de noche: **Lavanda** (de día por defecto), **Cálido** (de noche por defecto), Salvia, Terracota y Alto contraste.
Todos los textos cumplen contraste 4,5:1 (lo comprueba una prueba). La fuente es **Pizarra Sans**, una versión de Atkinson Hyperlegible con el cero
sin tachar (licencia OFL, ver `app/src/main/assets/fonts`). Solo se mueven dos cosas: el fundido de 0,7 s entre una pantalla y la siguiente y los dos puntos del reloj.

Funciona con el script de la versión 5 que ya tienes desplegado; no hace falta tocar el script. (Los estilos que elijas se guardan en el panel, en **Pantalla**:
si no los has cambiado, el script v5 manda Cálido para día y noche.)

### Instalar la 3.0 en la TV (Windows PowerShell)

Descarga `PizarraTV-3.0.apk` (carpeta `madre/app-tv/release` del repositorio) a tu carpeta **Descargas**. Con la TV encendida y en la misma Wi-Fi,
en la TV: **Ajustes › Opciones de desarrollo › Depuración USB: Sí**. Después, en PowerShell:

```powershell
# 1. Conectar con la TV (acepta el aviso que sale en la pantalla de la TV, "Permitir siempre")
adb connect 192.168.1.83:5555
adb devices                      # tiene que salir 192.168.1.83:5555   device

# 2. Copia de seguridad de la versión actual (2.0), por si hay que volver atrás
New-Item -ItemType Directory -Force "$HOME\Pizarra-copia" | Out-Null
$ruta = ((adb shell pm path es.pizarra.tv) -replace 'package:','').Trim()
adb pull $ruta "$HOME\Pizarra-copia\PizarraTV-2.0.apk"
dir "$HOME\Pizarra-copia"        # tiene que aparecer PizarraTV-2.0.apk (unos 190 KB)

# 3. Instalar la 3.0 encima (-r conserva la dirección y la clave ya guardadas)
adb install -r "$HOME\Downloads\PizarraTV-3.0.apk"     # tiene que decir Success

# 4. Abrirla (los datos de conexión se conservan; no hace falta repetir la dirección ni la clave)
adb shell am start -n es.pizarra.tv/.MainActivity
```

Si la pantalla dice **"Falta conectar la pizarra."**, vuelve a darle la dirección y la clave (las tuyas, no las pongas en ningún archivo del repositorio):

```powershell
adb shell am start -n es.pizarra.tv/.MainActivity --es url "TU_DIRECCION_EXEC" --es k "TU_CLAVE_DE_ADMINISTRADOR"
```

Para cerrar la depuración al terminar: **Depuración USB: No** y reinicia la TV (desenchufándola unos 10 segundos).

### Volver a la versión 2.0

Con la copia que hiciste en el paso 2 (o con `madre/app-tv/release/PizarraTV-2.0.apk` del repositorio):

```powershell
adb connect 192.168.1.83:5555
adb install -r -d "$HOME\Pizarra-copia\PizarraTV-2.0.apk"
adb shell am start -n es.pizarra.tv/.MainActivity
```

`-d` permite instalar una versión anterior y `-r` conserva los datos. Si diera `INSTALL_FAILED_VERSION_DOWNGRADE` o `UPDATE_INCOMPATIBLE`, desinstala y vuelve a instalar
(se pierde la configuración guardada, así que después hay que darle de nuevo la dirección y la clave con el comando de arriba):

```powershell
adb uninstall es.pizarra.tv
adb install "$HOME\Pizarra-copia\PizarraTV-2.0.apk"
adb shell am start -n es.pizarra.tv/.MainActivity --es url "TU_DIRECCION_EXEC" --es k "TU_CLAVE_DE_ADMINISTRADOR"
```

La 2.0 funciona con el script de la fase 3 (simplemente no enseña los recordatorios). No hay copia de la 1.0 en el repositorio.

### Compilar

Con JDK 17 o superior y el SDK de Android (plataforma 34):

```
cd app-tv
echo "sdk.dir=/ruta/al/android-sdk" > local.properties
gradle assembleDebug        # sale en app/build/outputs/apk/debug/app-debug.apk (firmado v1+v2, como necesita Android 5.1)
```

## Pruebas

Sin dependencias, con Node y Chromium:

```
cd apps-script
node test/servidor.test.js       # lógica del script (simulador de Apps Script con el límite real de 9 KB): permisos, migración, historial, cuentas atrás…
node test/panel.test.js          # el panel con clics reales en Chromium y el Code.gs real detrás
python3 test/todas.py /tmp/ui    # capturas de todas las vistas del panel, en claro y oscuro (requiere servidor-ui.js en el puerto 8765)
```

Las pantallas de la TV se prueban dibujando la app real a 1920×1080 en el ordenador (Robolectric), sin TV:

```
cd app-tv
gradle testDebugUnitTest -Dcapturas.dir=/ruta/capturas   # prueba de contraste, lectura del JSON del script v5, horas habladas y capturas de los cinco estilos
```

## Pendiente de probar en aparatos reales

- El panel dentro de Apps Script, en iPhone (Safari) y Android (Chrome).
- La TV: que se vea bien a 3 metros, que el fundido y los dos puntos del reloj vayan fluidos en Android 5.1, que se descarguen las fotos y que arranque sola al encender.
- El intervalo de consulta de la TV frente a las cuotas de Apps Script (ver la estimación de la 5.0 y comprobar con `?a=metricas`).
- **Fase 5 en la TV real:** que el audio y el vídeo se oigan y se vean (códecs de la Philips), que el volumen suba y vuelva a como estaba (puede que el volumen de Android no mande en los altavoces de la TV), que el pitido suene.
- **Grabar en Safari (iPhone)**: aquí solo se ha probado en Chromium con micrófono y cámara simulados. Hay que probar iPhone reciente (administrador), iPhone XR (María) y Samsung (Ana).
- **Añadir a pantalla de inicio en iPhone**: algunas versiones de iOS pierden lo que va tras el `#`; la app lo guarda en el móvil y, si aun así se pierde, pide pegar el enlace una vez.
