# ☀️ Chollos desde Menorca

Rastreador automático de vuelos **desde Menorca (MAH)**: salida en diciembre y vuelta en enero, a sitios
**cálidos y seguros**, con un **máximo de 1.000 €** ida y vuelta, todo incluido.

Cada 6 horas, GitHub Actions:

1. Busca **billete único** MAH ⇄ destino (con las escalas que ponga la aerolínea).
2. Busca **autoconexiones**: MAH → hub (BCN, MAD, Londres, París, Ámsterdam, Fráncfort, Lisboa, Milán,
   Estambul) + hub ⇄ destino + hub → MAH, con billetes separados. Solo las combina si queda un margen
   razonable en el hub (4 h; 6 h si hay cambio de aeropuerto, como Gatwick → Heathrow) y te avisa si
   te toca pasar la noche allí.
3. Descarta lo que supere el presupuesto y los destinos fríos (< 26 °C) o poco seguros (< 3/5).
4. Guarda el historial y marca **🔥 chollo** cuando el precio está ≥ 20 % por debajo del precio habitual
   del destino, o ≥ 15 % por debajo de la mediana de lo rastreado.
5. (Opcional) Te manda un **Telegram** cuando aparece un chollo nuevo o baja un 5 % más.

El panel (`vuelos/index.html`) lo muestra todo con filtros por región, precio, temperatura,
seguridad, playa y tipo de billete, y enlaces a Aviasales y Google Flights para confirmar y reservar.

## Puesta en marcha (5 minutos)

1. **Token gratis de precios**: date de alta en [travelpayouts.com](https://www.travelpayouts.com),
   ve a *Herramientas → API* (Data API de Aviasales) y copia el token.
2. En GitHub: *Settings → Secrets and variables → Actions → New repository secret*
   - `TRAVELPAYOUTS_TOKEN` = tu token.
3. Lleva estos cambios a la rama principal (las ejecuciones programadas solo funcionan ahí).
4. *Actions → Rastreador de vuelos desde Menorca → Run workflow* para la primera búsqueda.
5. Abre el panel: `https://<tu-usuario>.github.io/Sky/vuelos/` (si tienes GitHub Pages activo).

### Avisos por Telegram (opcional)

1. Habla con [@BotFather](https://t.me/BotFather) → `/newbot` → copia el token.
2. Escribe cualquier cosa a tu bot y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`
   para ver tu `chat.id`.
3. Añade los secretos `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.

## Ajustes

- `config.json`: fechas, noches mín/máx, presupuesto, hubs, márgenes de conexión, umbrales de chollo.
- `destinos.json`: catálogo de destinos (clima medio dic-ene, lluvia, seguridad 1-5, precio habitual).
  Añade o quita los que quieras.

Probar en local:

```bash
TRAVELPAYOUTS_TOKEN=xxxx python3 vuelos/rastreador.py --solo BKK,CUN,PTY
python3 -m unittest discover -s vuelos -p "test_*.py"
```

## Ojo

- Los precios vienen de la caché de búsquedas recientes de Aviasales (pueden tener hasta ~48 h):
  son una pista muy buena, pero confirma siempre en el enlace.
- Con **billetes separados**, si un vuelo se retrasa y pierdes el siguiente, nadie te recoloca, y hay
  que volver a facturar la maleta. Si prefieres ir sobre seguro, filtra «Solo billete único».
- La seguridad 1-5 es orientativa: mira las
  [recomendaciones de viaje de Exteriores](https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/Recomendaciones-de-viaje.aspx)
  y los requisitos de visado antes de reservar.
- No incluye maleta facturada ni hoteles en el hub si te toca dormir allí.
