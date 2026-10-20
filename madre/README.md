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

Estado: **fase 1 hecha** (script, datos en Drive, panel del móvil). La app de la TV todavía es la versión anterior
y sigue funcionando con el script nuevo. Las fases 2 a 4 (diseño nuevo de la TV, recordatorios, audio y vídeo) están pendientes.

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

## App de la TV

Con la TV y el ordenador en la misma Wi-Fi y la depuración USB activada:

```
adb connect IP_DE_LA_TV:5555
adb install -r PizarraTV.apk
adb shell am start -n es.pizarra.tv/.MainActivity --es url LA_DIRECCION_EXEC --es k TU_CLAVE
```

Se compila con JDK 17 o superior y el SDK de Android (plataforma 34):

```
cd app-tv
echo "sdk.dir=/ruta/al/android-sdk" > local.properties
gradle assembleDebug        # sale en app/build/outputs/apk/debug/app-debug.apk
```

## Pruebas

Sin dependencias, con Node y Chromium:

```
cd apps-script
node test/servidor.test.js       # lógica del script (simulador de Apps Script con el límite real de 9 KB): permisos, migración, historial, cuentas atrás…
node test/panel.test.js          # el panel con clics reales en Chromium y el Code.gs real detrás
python3 test/todas.py /tmp/ui    # capturas de todas las vistas del panel, en claro y oscuro (requiere servidor-ui.js en el puerto 8765)
```

## Pendiente de probar en aparatos reales

- El panel dentro de Apps Script, en iPhone (Safari) y Android (Chrome).
- La TV: que se vea bien, que la conexión con Google funcione y que arranque sola al encender.
- El intervalo de consulta de la TV frente a las cuotas de Apps Script (fase 4).
