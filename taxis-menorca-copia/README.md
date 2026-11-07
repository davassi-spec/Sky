# Taxis Menorca — copia local independiente (web)

Réplica web funcional de la app iOS **Taxis Menorca** (Binary Menorca S.L., App Store id6737982901),
reconstruida a partir de la ficha pública de la App Store y sus 6 capturas oficiales.
**No contiene código, binario ni datos de la app original** y no se conecta a su servidor.

## Ejecutar
```bash
cd taxis-menorca-copia
npm install        # solo vendoriza leaflet (ya incluido en vendor/)
npm start          # http://localhost:8080
npm test           # pruebas e2e con Playwright (requiere el servidor en marcha)
```
Requiere Node 18+ (probado con Node 22). `server.js` sirve los estáticos y hace de proxy
de rutas hacia OSRM (`/api/route`) para evitar CORS.

## Qué hace
Inicio de sesión / alta / recuperación de contraseña (cuentas locales, PBKDF2) · ubicación
por geolocalización o búsqueda · búsqueda de destino (lista local de Menorca + OpenStreetMap
Nominatim) o elección en mapa · ruta real (OSRM) con km y precio · "Taxi solicitado" → Resumen →
Cancelar reserva (con confirmación) · pestañas 4 plazas / Especial / Reservas · menú con
Mis reservas, Mi perfil y Cerrar sesión. Todo persiste en `localStorage` (prefijo `tmcopia:`).

## Dependencias de servidor NO disponibles (alternativas locales)
| Función original | Aquí |
|---|---|
| Cuentas de clientes | Cuentas locales en el navegador (sin servidor) |
| Recuperar contraseña por correo | Restablecimiento local directo |
| Cálculo de precio | `config.js`: tarifa lineal calibrada con UN dato observado (11 km → 21,74 €). **No oficial** |
| Envío del pedido al taxista / central | No existe: la solicitud se guarda solo en el navegador y la interfaz lo indica |
| Google Maps / Places | OpenStreetMap + Nominatim + OSRM (servicios públicos; respeta sus políticas de uso) |

## Aviso sobre lo no observado
Solo se conocen 6 pantallas por las capturas. Alta de cliente, recuperar contraseña, menú lateral,
perfil, pestaña "Especial", lista de "Reservas", textos de error y confirmaciones **no se observaron**
y son diseño propio. El fondo de playa original no se reutiliza (degradado de aproximación);
colócalo en `styles.css` si lo deseas. Idiomas CA/EN de la app original: no implementados.
