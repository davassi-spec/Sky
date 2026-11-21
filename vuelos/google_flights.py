"""Segunda fuente de precios: Google Flights a través de SerpApi.

El plan gratuito de SerpApi da unas 100 búsquedas al mes, así que no se puede
barrer todo como con Aviasales. Este módulo:

  * va rotando por (destino × par de fechas), empezando por los destinos más
    prometedores, y recuerda por dónde iba;
  * reparte el cupo mensual a lo largo del mes (nunca gasta más de lo que
    "toca" a esa altura del mes, ni más de N búsquedas por ejecución);
  * guarda el último resultado de cada búsqueda en data/google_flights.json
    para que el panel lo siga mostrando entre ejecuciones.

Cada búsqueda es MAH ⇄ destino ida y vuelta en fechas concretas: Google
combina las escalas en un solo billete.

Necesita la variable de entorno SERPAPI_KEY.
"""
from __future__ import annotations

import calendar
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Callable

API = "https://serpapi.com/search.json"
FetchG = Callable[[dict], dict]


def fetch_serpapi(clave: str) -> FetchG:
    def fetch(params: dict) -> dict:
        q = {"engine": "google_flights", "currency": "EUR", "hl": "es", "gl": "es",
             "type": "1", "api_key": clave, **params}
        url = API + "?" + urllib.parse.urlencode(q)
        for intento in range(3):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    datos = json.loads(r.read().decode("utf-8"))
                if datos.get("error"):
                    raise RuntimeError(datos["error"])
                return datos
            except urllib.error.HTTPError as e:
                cuerpo = e.read().decode("utf-8", "replace")[:200]
                if e.code in (429, 500, 502, 503) and intento < 2:
                    time.sleep(5 * (intento + 1))
                    continue
                raise RuntimeError(f"HTTP {e.code}: {cuerpo}") from e
        return {}
    return fetch


def cupo_disponible(cfg_g: dict, estado: dict, ahora: datetime) -> int:
    """Cuántas búsquedas se pueden hacer ahora sin pasarse del cupo mensual."""
    mes = ahora.strftime("%Y-%m")
    if estado.get("mes") != mes:
        estado["mes"], estado["usadas_mes"] = mes, 0
    dias = calendar.monthrange(ahora.year, ahora.month)[1]
    fraccion = (ahora.day - 1 + ahora.hour / 24) / dias
    toca = int(cfg_g["max_busquedas_mes"] * fraccion) + 1
    libre = min(toca, cfg_g["max_busquedas_mes"]) - estado["usadas_mes"]
    return max(0, min(libre, cfg_g["max_por_ejecucion"]))


def cola(cfg: dict, catalogo: list[dict]) -> list[tuple[str, str, str]]:
    """Lista ordenada de (destino, ida, vuelta) a recorrer en rotación."""
    g = cfg["google_flights"]
    f = cfg["filtros"]
    aptos = [d for d in catalogo if d["temp_max"] >= f["temp_max_minima"] and d["seguridad"] >= f["seguridad_minima"]]
    prioridad = [i for i in g.get("destinos_prioritarios", [])]
    resto = sorted((d for d in aptos if d["iata"] not in prioridad), key=lambda d: d["ref"])
    orden = prioridad + [d["iata"] for d in resto]
    # Primero un par de fechas para todos los destinos, luego el siguiente par…
    return [(iata, ida, vta) for ida, vta in g["fechas"] for iata in orden]


def _hora(s: str) -> str:
    # "2026-12-12 10:30" → "2026-12-12T10:30:00"
    return s.replace(" ", "T") + (":00" if len(s) == 16 else "")


def a_opcion(datos: dict, origen: str, destino: str, ida: str, vuelta: str) -> dict | None:
    """Convierte la respuesta de SerpApi en una opción con el mismo formato que el resto."""
    vuelos = (datos.get("best_flights") or []) + (datos.get("other_flights") or [])
    vuelos = [v for v in vuelos if v.get("price")]
    if not vuelos:
        return None
    v = min(vuelos, key=lambda x: x["price"])
    tramos = v.get("flights") or []
    if not tramos:
        return None
    primero, ultimo = tramos[0], tramos[-1]
    enlace = (datos.get("search_metadata") or {}).get("google_flights_url", "")
    aerolineas = sorted({t.get("airline", "") for t in tramos if t.get("airline")})
    seg = {
        "de": primero["departure_airport"]["id"],
        "a": ultimo["arrival_airport"]["id"],
        "salida": _hora(primero["departure_airport"]["time"]),
        "llegada": _hora(ultimo["arrival_airport"]["time"]),
        "escalas": len(tramos) - 1,
        "aerolinea": " / ".join(aerolineas),
        "vuelo": primero.get("flight_number", ""),
    }
    noches = (date.fromisoformat(vuelta) - date.fromisoformat(ida)).days
    avisos = []
    escalas = [f"{l.get('id', '')} ({l.get('duration', 0) // 60} h)" for l in v.get("layovers") or []]
    if escalas:
        avisos.append("Escalas a la ida: " + ", ".join(escalas) + ". Mismo billete: si pierdes una conexión te recolocan.")
    avisos.append("Precio de Google Flights para estas fechas exactas; la vuelta se elige al reservar.")
    return {
        "tipo": "directo",
        "fuente": "Google Flights",
        "destino": destino,
        "total": float(v["price"]),
        "ida": ida,
        "vuelta": vuelta,
        "noches": noches,
        "hub": None,
        "billetes": [{
            "descripcion": f"{origen} ⇄ {destino} (Google Flights)",
            "precio": float(v["price"]),
            "enlace": "",
            "google": enlace,
            "segmentos": [seg],
        }],
        "avisos": avisos,
        "insights": datos.get("price_insights") or {},
    }


def actualizar(cfg: dict, catalogo: list[dict], fetch: FetchG, guardado: dict,
               ahora: datetime | None = None) -> list[str]:
    """Hace las búsquedas que permita el cupo y actualiza `guardado` (in situ).

    `guardado` = {"estado": {...}, "resultados": {"BKK|2026-12-12|2027-01-10": {...}}}
    Devuelve la lista de errores.
    """
    ahora = ahora or datetime.now(timezone.utc)
    g = cfg["google_flights"]
    estado = guardado.setdefault("estado", {})
    res = guardado.setdefault("resultados", {})
    errores: list[str] = []
    tareas = cola(cfg, catalogo)
    if not tareas:
        return errores
    n = cupo_disponible(g, estado, ahora)
    i = estado.get("siguiente", 0) % len(tareas)
    for _ in range(n):
        iata, ida, vta = tareas[i]
        i = (i + 1) % len(tareas)
        estado["usadas_mes"] = estado.get("usadas_mes", 0) + 1
        clave = f"{iata}|{ida}|{vta}"
        try:
            datos = fetch({"departure_id": cfg["origen"], "arrival_id": iata,
                           "outbound_date": ida, "return_date": vta})
            op = a_opcion(datos, cfg["origen"], iata, ida, vta)
            res[clave] = {"fecha": ahora.replace(microsecond=0).isoformat(), "opcion": op}
        except Exception as e:  # noqa: BLE001
            errores.append(f"Google Flights {iata} {ida}: {e}")
            if "run out" in str(e).lower() or "limit" in str(e).lower():
                break
    estado["siguiente"] = i
    # olvida resultados viejos o de fechas que ya pasaron
    limite = ahora - timedelta(days=g.get("caducidad_dias", 10))
    for k in list(res):
        ida = k.split("|")[1]
        if datetime.fromisoformat(res[k]["fecha"]) < limite or date.fromisoformat(ida) < ahora.date():
            del res[k]
    return errores


def opciones_de(guardado: dict, iata: str) -> list[dict]:
    out = []
    for k, v in (guardado.get("resultados") or {}).items():
        if k.startswith(iata + "|") and v.get("opcion"):
            out.append({**v["opcion"], "consultado": v["fecha"]})
    return sorted(out, key=lambda o: o["total"])
