# Prompt para Claude Code: Philips 50PUH6400/88 (Android TV 5.1.1)

Pégalo en Claude Code, en un ordenador conectado a la misma Wi-Fi que la TV.
Antes, clona el repo para que Claude reutilice `tools/` (no uses su `launcher/`, pide Android 8+):

    git clone https://github.com/Gathin23/cleanyourtv

En la TV: Ajustes → Preferencias del dispositivo → Acerca de → pulsa OK siete veces en
"Compilación" → vuelve → Opciones de desarrollador → activa **Depuración USB**
(y Depuración ADB/de red si aparece). Mantén la TV encendida.

---

Quiero limpiar mi Android TV de bloatware e instalar un YouTube que funcione. Trabaja sobre la TV
real, paso a paso, y comprueba cada cambio con capturas sacadas de la TV. Pregúntame antes de
cualquier cosa que dependa de mis preferencias.

Mi TV
- Philips 50PUH6400/88 (TP Vision, 2015), plataforma `philips_MT5593FHT_EU`, MediaTek.
- Android 5.1.1 (API 22), firmware QM152E.0.7.70.0 de julio de 2018, que es la última versión.
- Poca RAM y CPU lenta: nada pesado, nada que consulte la red en segundo plano.
- Tiene el repo `cleanyourtv` clonado en la carpeta actual. Reutiliza `tools/tv.py`,
  `tools/disable.sh` y `tools/restore.sh`. NO uses `launcher/`: su minSdk es 26 y mi TV es API 22.

Conexión
- Encuentra la TV en mi red (hostname, tabla ARP, o pídeme la IP) y conéctate por ADB al puerto 5555.
- Avísame cuándo aparecerá en la TV el aviso "¿Permitir depuración USB?" para que lo acepte.
- Android 5.1 trae un `pm` y un `adb` antiguos: si `adb install` falla o se cuelga, sube el APK
  a `/data/local/tmp` y ejecuta `pm install -r` por shell.
- Si macOS bloquea `adb connect` ("No route to host"), usa `tools/tv.py` o el paquete Python `adb-shell`.

Copia de seguridad primero
- Guarda la lista de paquetes, la de paquetes deshabilitados, `getprop` y los ajustes en una carpeta
  de backup antes de cambiar nada, y crea un script de restauración que reactive todo lo que desactives.
- Pregúntame qué tengo conectado a los puertos USB de la TV.

Debloat (solo desactivar, nunca desinstalar)
- Lista los paquetes y clasifícalos: telemetría/analítica de Philips/TP Vision, servicios de contenido
  y anuncios, servicios en segundo plano que probablemente no necesito, apps preinstaladas, apps de streaming.
- Desactiva con `pm disable-user --user 0 <paquete>`, un comando por llamada y en lotes pequeños,
  con captura entre lotes.
- No toques nunca: la app de TV y los servicios de entradas (HDMI, sintonizador, menú de fuentes),
  mando a distancia y Bluetooth, teclado en pantalla, Google Play Store y Play Services.
- Revisa los paquetes de Philips con `dumpsys package` antes de desactivarlos. Si dudas, pregúntame.
- Antes de tocar las apps de streaming, el asistente de voz, Chromecast o el servicio de actualizaciones,
  pregúntame con una lista cuáles uso. **Deja activo el servicio de actualizaciones** por defecto.
- No ofrezcas Private DNS: solo existe en Android 9+.

Launcher
- Mantén el launcher de Philips. No construyas el del repo ni instales launchers de pago.
- No desactives el launcher actual salvo que yo lo pida y tengas otro funcionando.
- Opcional, solo si lo pido: instalar un launcher ligero compatible con API 22. Pregúntame antes.

YouTube
- El YouTube oficial en Android 5.1 puede dejar de funcionar. Instala SmartTube **stable** desde el
  GitHub oficial: https://github.com/yuliskov/SmartTube/releases/download/latest/smarttube_stable.apk
  (requiere Android 4.3 o superior).
- Descárgalo solo de ahí, compara el tamaño con la página de releases y muéstrame el hash antes de instalar.
- Comprueba el espacio libre con `df /data` antes. Si falla la instalación, suele ser por falta de espacio.
- Instálalo en memoria interna, no en almacenamiento externo, y ábrelo con una captura para comprobar
  que arranca. No lo desinstales ni toques el YouTube oficial salvo que yo lo pida.

Verificación
- Tras cada cambio, envía pulsaciones del mando por ADB, saca una captura de la TV y míralas.
- Las capturas de TV en directo o de HDMI salen vacías (0 bytes): es normal. Usa
  `dumpsys activity activities | grep -i resumed` para saber qué hay en pantalla.
- Al terminar, dame el script de restauración y un README con cómo reactivar cualquier app.

Al final, cierra el ADB de red
- Desactiva la depuración USB y la de red en la TV, revoca las autorizaciones, reinicia y comprueba
  desde el ordenador que `nc -vz <ip de la tv> 5555` falla. El puerto 5555 va en texto plano.
