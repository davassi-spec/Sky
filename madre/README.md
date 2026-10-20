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

Estado: **fases 0, 1 y 2 hechas** (script, datos en Drive, panel del móvil, app de la TV 2.0 con cinco estilos). **Fase 3 en revisión**
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

- **Fotos de la familia.** Cada persona sube la suya desde su enlace (cámara o galería). Antes de subirla se abre un recuadro redondo: arrastra la foto y
  acércala hasta que se vea bien la cara. Sale en la TV junto a sus mensajes, sin aprobación de nadie. El administrador puede cambiarla o quitarla en **Más › Familia**.
  Sin foto, se ve la inicial en un círculo.
- **Recordatorios** (**Más › Recordatorios**): hora, días de la semana, texto principal, texto pequeño, foto, cuánto tiempo se ve (5 a 60 minutos) y si hay que confirmarlo.
  A su hora la TV cambia entera con un fundido: arriba una línea fina con el día y la hora, en el centro la foto grande y el texto en letra enorme con la etiqueta **AHORA**,
  y abajo los mensajes de la familia. Pasada la duración, o al confirmarlo desde el móvil, vuelve a la pizarra. **De noche no salta ninguno.**
  "Guardar y probar 1 minuto en la TV" lo enseña enseguida, sea la hora que sea.
- **Confirmar.** Si hay que confirmarlo, en **Inicio** del móvil aparece "Pendiente de confirmar" con el botón **Confirmar que lo ha tomado**. Solo el administrador puede confirmar.
- **Aviso por correo.** Si algo que hay que confirmar sigue sin confirmar 30 minutos después de su hora, te llega un correo (una sola vez por recordatorio y día). Se manda al correo
  de tu cuenta de Google, o al que pongas en **Más › Ajustes › Avisos por correo**, donde también hay un botón para mandar un correo de prueba.
  Una comprobación automática lo revisa cada 5 minutos.
- **Fotos privadas.** Se guardan en tu Drive, en la carpeta **Pizarra**, y no se comparten con ningún enlace. La TV no entra en tu Drive: pide cada foto al script con la clave de
  administrador (`?a=foto&p=…`), que solo sirve fotos registradas en la pizarra (de una persona o de un recordatorio). La TV la guarda y no la vuelve a pedir hasta que cambie.
  El móvil las reduce antes de subirlas (familiares: 512 px cuadradas; recordatorios: hasta 900 px sin deformar) y el script rechaza más de 450 KB.
- **La TV** pregunta cada 60 s y, mientras muestra un recordatorio, cada 15 s (para volver a la pizarra enseguida al confirmarlo).
- Nunca hay nombres de medicinas en los ejemplos ni en los textos por defecto: lo que se escribe en cada recordatorio lo decides tú.

### Desplegar la versión 3 del script (la dirección `/exec` no cambia)

1. En <https://script.google.com> abre tu proyecto. Pega el nuevo `Code.gs` en `Código.gs` y el nuevo `Admin.html` en el archivo `Admin`. Deja `appsscript.json` como está.
2. **Guardar**, elige la función **`autorizar`** y pulsa **Ejecutar**. Google pedirá **permisos nuevos**:
   - **Enviar correos** como tú (para el aviso).
   - **Crear y gestionar disparadores** (para la comprobación automática cada 5 minutos).
   Acéptalos (Opciones avanzadas › Ir a… › Permitir). En el registro tiene que salir "Avisos por correo: activados".
3. **Implementar › Gestionar implementaciones › lápiz › Versión: Nueva versión › Implementar.** No uses "Nueva implementación": la dirección `/exec` no debe cambiar.
4. Abre el panel, ve a **Más › Ajustes › Avisos por correo** y pulsa "Enviar un correo de prueba".

Con el script nuevo y la TV todavía en la 2.0, todo sigue funcionando (la 2.0 ignora los recordatorios). Y con el script anterior, la TV 3.0 también (simplemente no hay recordatorios).

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

## App de la TV (versión 2.0)

Pantalla: arriba el día, la fecha, la hora en cifras (con los dos puntos parpadeando), la hora en palabras ("Son las cinco y cuarto de la tarde")
y una etiqueta grande con la parte del día. Debajo, a la izquierda los mensajes de la familia (con su foto), a la derecha lo próximo del calendario y
el tiempo de hoy y de mañana con qué ponerse. Si hay una cuenta atrás, sale como una franja arriba. De noche: los mensajes, "Es hora de dormir" con
lo primero de mañana, y el teléfono. La letra crece hasta llenar cada tarjeta y solo encoge si no cabe; ningún texto baja de 36 px.
La colocación es fija: el panel solo enciende o apaga cada bloque.

Cinco estilos, cada uno de día y de noche: **Lavanda** (de día por defecto), **Cálido** (de noche por defecto), Salvia, Terracota y Alto contraste.
Todos los textos cumplen contraste 4,5:1 (lo comprueba una prueba). La fuente es **Pizarra Sans**, una versión de Atkinson Hyperlegible con el cero
sin tachar (licencia OFL, ver `app/src/main/assets/fonts`). Solo se mueven dos cosas: el fundido de 0,7 s entre una pantalla y la siguiente y los dos puntos del reloj.

Funciona con el script de la versión 5 que ya tienes desplegado; no hace falta tocar el script. (Los estilos que elijas se guardan en el panel, en **Pantalla**:
si no los has cambiado, el script v5 manda Cálido para día y noche.)

### Instalar la 2.0 en la TV (Windows PowerShell)

Descarga `PizarraTV-2.0.apk` (carpeta `madre/app-tv/release` del repositorio) a tu carpeta **Descargas**. Con la TV encendida y en la misma Wi-Fi,
en la TV: **Ajustes › Opciones de desarrollo › Depuración USB: Sí**. Después, en PowerShell:

```powershell
# 1. Conectar con la TV (acepta el aviso que sale en la pantalla de la TV, "Permitir siempre")
adb connect 192.168.1.83:5555
adb devices                      # tiene que salir 192.168.1.83:5555   device

# 2. Copia de seguridad de la versión actual (1.0), por si hay que volver atrás
New-Item -ItemType Directory -Force "$HOME\Pizarra-copia" | Out-Null
$ruta = ((adb shell pm path es.pizarra.tv) -replace 'package:','').Trim()
adb pull $ruta "$HOME\Pizarra-copia\PizarraTV-1.0.apk"
dir "$HOME\Pizarra-copia"        # tiene que aparecer PizarraTV-1.0.apk (unos 170 KB)

# 3. Instalar la 2.0 encima (-r conserva la dirección y la clave ya guardadas)
adb install -r "$HOME\Downloads\PizarraTV-2.0.apk"     # tiene que decir Success

# 4. Abrirla (los datos de conexión se conservan; no hace falta repetir la dirección ni la clave)
adb shell am start -n es.pizarra.tv/.MainActivity
```

Si la pantalla dice **"Falta conectar la pizarra."**, vuelve a darle la dirección y la clave (las tuyas, no las pongas en ningún archivo del repositorio):

```powershell
adb shell am start -n es.pizarra.tv/.MainActivity --es url "TU_DIRECCION_EXEC" --es k "TU_CLAVE_DE_ADMINISTRADOR"
```

Para cerrar la depuración al terminar: **Depuración USB: No** y reinicia la TV (desenchufándola unos 10 segundos).

### Volver a la versión 1.0

```powershell
adb connect 192.168.1.83:5555
adb install -r -d "$HOME\Pizarra-copia\PizarraTV-1.0.apk"
adb shell am start -n es.pizarra.tv/.MainActivity
```

`-d` permite instalar una versión anterior y `-r` conserva los datos. Si diera `INSTALL_FAILED_VERSION_DOWNGRADE` o `UPDATE_INCOMPATIBLE`, desinstala y vuelve a instalar
(se pierde la configuración guardada, así que después hay que darle de nuevo la dirección y la clave con el comando de arriba):

```powershell
adb uninstall es.pizarra.tv
adb install "$HOME\Pizarra-copia\PizarraTV-1.0.apk"
adb shell am start -n es.pizarra.tv/.MainActivity --es url "TU_DIRECCION_EXEC" --es k "TU_CLAVE_DE_ADMINISTRADOR"
```

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
- El intervalo de consulta de la TV frente a las cuotas de Apps Script (fase 4).
