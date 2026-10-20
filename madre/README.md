# Pizarra para mamá

Pantalla de pared para una Android TV antigua (Philips 50PUH6400, Android 5.1).
Muestra el día, la hora en cifras y en palabras, la parte del día, los mensajes de la familia,
los eventos del calendario y el tiempo. De noche pasa a una pantalla oscura.

Tres piezas:

| Carpeta | Qué es |
|---|---|
| `app-tv/` | App nativa de la TV (Android 5.0 o superior, sin navegador). |
| `apps-script/` | "Cerebro" en Google Apps Script: guarda mensajes y ajustes, lee el calendario y el tiempo, y sirve la app del móvil. |
| `mockup/` | Diseños de referencia (tarde y noche). |

## 1. Google Apps Script (una vez, unos 5 minutos)

1. Entra en <https://script.google.com> con tu cuenta de Google y crea un **proyecto nuevo**.
2. Pega `Code.gs` en el archivo `Código.gs`. Añade un archivo **HTML** llamado `Admin` y pega `Admin.html`.
3. En Configuración del proyecto activa "Mostrar el archivo de manifiesto appsscript.json" y pega `appsscript.json`.
4. Elige la función `configurar` y pulsa **Ejecutar**. Acepta los permisos (calendario e Internet).
   En el registro de ejecución sale **tu clave secreta**. Apúntala.
5. **Implementar → Nueva implementación → Aplicación web**: ejecutar como *Yo*, acceso *Cualquier persona*.
   Copia la dirección que termina en `/exec`.
6. En el móvil abre `LA_DIRECCION_EXEC?a=admin&k=TU_CLAVE` y añádela a la pantalla de inicio.

Quien tenga la dirección y la clave puede leer los mensajes y los eventos de los calendarios elegidos. No las compartas.

## 2. App de la TV

Con la TV y el ordenador en la misma Wi-Fi y la depuración USB activada:

```
adb connect IP_DE_LA_TV:5555
adb install -r PizarraTV.apk
adb shell am start -n es.pizarra.tv/.MainActivity --es url "LA_DIRECCION_EXEC" --es k "TU_CLAVE"
```

La app arranca sola al encender la TV y no se cierra con el botón Atrás (Inicio sí funciona).

## Compilar el APK

Hace falta JDK 17 o superior y el SDK de Android (plataforma 34):

```
cd app-tv
echo "sdk.dir=/ruta/al/android-sdk" > local.properties
gradle assembleDebug
```

El APK sale en `app/build/outputs/apk/debug/app-debug.apk`.

## Pendiente de probar en la TV real

- Que se vea bien en la Philips (la maquetación se probó solo en el código, no en un aparato).
- Que la TV acepte la conexión con Google (Android 5.1 tiene certificados antiguos).
- Que la app arranque sola al encender la TV.
