/* Configuración de la copia local de Taxis Menorca.
 *
 * TARIFA: el precio real lo calcula el servidor de la app original, al que no
 * tenemos acceso. Solo se observó UN dato en las capturas oficiales:
 *   11,00 km  ->  21,74 €
 * Esta copia usa una tarifa lineal calibrada con ese único punto. NO es la
 * tarifa oficial: se muestra siempre como "estimación local".
 * Sustitúyela por la tarifa real (o por una llamada a tu API) cuando la tengas.
 */
window.TM_CONFIG = {
  tarifa: { bajada: 0, porKm: 21.74 / 11 },
  /* Mapa y servicios públicos de terceros (sustituibles). */
  tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  rutaApi: "/api/route", /* proxy propio (server.js) hacia OSRM */
  nominatim: "https://nominatim.openstreetmap.org",
  /* Caja de Menorca: oeste, sur, este, norte */
  viewbox: [3.7, 39.78, 4.4, 40.1],
  centro: [39.95, 4.1]
};
