#!/usr/bin/env python3
"""Rastreador de chollos de vuelos desde Menorca.

Busca, para cada destino cálido del catálogo (destinos.json):

  1. Billete único  MAH → destino → MAH  (la aerolínea gestiona las escalas).
  2. Autoconexión   MAH → hub  +  hub → destino → hub  +  hub → MAH
     con billetes separados (suele ser bastante más barato, pero si pierdes
     una conexión nadie te recoloca: por eso se exige un margen mínimo).

Fuente de precios: API de datos de Travelpayouts / Aviasales (gratuita, necesita
token en la variable de entorno TRAVELPAYOUTS_TOKEN). Son precios en caché de
búsquedas recientes (hasta ~48 h), así que siempre hay que confirmar en el enlace.

Solo usa la biblioteca estándar de Python (>= 3.10).

Uso:
    TRAVELPAYOUTS_TOKEN=xxxx python3 vuelos/rastreador.py
    python3 vuelos/rastreador.py --solo BKK,CUN      # probar con pocos destinos
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable

import google_flights

AQUI = Path(__file__).resolve().parent
API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"
AVIASALES = "https://www.aviasales.com"
MAX_HISTORIAL = 500

Fetch = Callable[[dict], list[dict]]


# --------------------------------------------------------------------------
# Modelo
# --------------------------------------------------------------------------
@dataclass
class Segmento:
    de: str
    a: str
    salida: str          # ISO con zona horaria
    llegada: str         # ISO (UTC) calculada con la duración
    escalas: int
    aerolinea: str
    vuelo: str


@dataclass
class Billete:
    descripcion: str
    precio: float
    enlace: str
    google: str
    segmentos: list[Segmento]


@dataclass
class Opcion:
    tipo: str                    # "directo" | "autoconexion"
    destino: str
    total: float
    ida: str                     # fecha de salida de Menorca
    vuelta: str                  # fecha de llegada a Menorca
    noches: int
    hub: str | None
    billetes: list[Billete]
    avisos: list[str] = field(default_factory=list)
    fuente: str = "Aviasales"


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------
def parse_dt(s: str) -> datetime:
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def meses(desde: date, hasta: date) -> list[str]:
    out, d = [], desde.replace(day=1)
    while d <= hasta:
        out.append(d.strftime("%Y-%m"))
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return out


def enlace_google(o: str, d: str, ida: str, vuelta: str | None = None) -> str:
    q = f"Flights from {o} to {d} on {ida}" + (f" through {vuelta}" if vuelta else " one way")
    return "https://www.google.com/travel/flights?q=" + urllib.parse.quote(q)


def enlace_aviasales(link: str | None) -> str:
    if not link:
        return ""
    return link if link.startswith("http") else AVIASALES + link


def cargar_json(ruta: Path, defecto):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return defecto


def guardar_json(ruta: Path, datos) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(ruta)


# --------------------------------------------------------------------------
# Cliente Travelpayouts
# --------------------------------------------------------------------------
def fetch_travelpayouts(token: str, pausa: float = 0.35) -> Fetch:
    def fetch(params: dict) -> list[dict]:
        q = {"currency": "eur", "sorting": "price", "unique": "false",
             "limit": 1000, "page": 1, "token": token, **params}
        url = API + "?" + urllib.parse.urlencode(q)
        for intento in range(5):
            try:
                req = urllib.request.Request(url, headers={"Accept-Encoding": "identity",
                                                           "User-Agent": "rastreador-vuelos/1.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    datos = json.loads(r.read().decode("utf-8"))
                time.sleep(pausa)
                if not datos.get("success", True):
                    raise RuntimeError(datos.get("error") or "respuesta sin éxito")
                return datos.get("data") or []
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and intento < 4:
                    time.sleep(2 ** intento * 2)
                    continue
                if e.code == 401:
                    raise RuntimeError("token de Travelpayouts no válido") from e
                raise
            except urllib.error.URLError:
                if intento < 4:
                    time.sleep(2 ** intento)
                    continue
                raise
        return []
    return fetch


# --------------------------------------------------------------------------
# Lógica de búsqueda
# --------------------------------------------------------------------------
class Buscador:
    def __init__(self, cfg: dict, fetch: Fetch):
        self.cfg = cfg
        self.fetch = fetch
        self.origen = cfg["origen"]
        self.ida_desde = date.fromisoformat(cfg["ida_desde"])
        self.ida_hasta = date.fromisoformat(cfg["ida_hasta"])
        self.vuelta_desde = date.fromisoformat(cfg["vuelta_desde"])
        self.vuelta_hasta = date.fromisoformat(cfg["vuelta_hasta"])
        self.cache: dict[tuple, list[dict]] = {}
        self.errores: list[str] = []
        self.llamadas = 0
        self.diag = {"registros_api": 0, "consultas_con_datos": 0, "descartes": {}, "muestras": []}

    def _descarte(self, motivo: str) -> None:
        self.diag["descartes"][motivo] = self.diag["descartes"].get(motivo, 0) + 1

    # ---- llamadas cacheadas -------------------------------------------------
    def _get(self, **params) -> list[dict]:
        clave = tuple(sorted(params.items()))
        if clave not in self.cache:
            self.llamadas += 1
            try:
                self.cache[clave] = self.fetch(params)
                n = len(self.cache[clave])
                self.diag["registros_api"] += n
                if n:
                    self.diag["consultas_con_datos"] += 1
                    if len(self.diag["muestras"]) < 3:
                        self.diag["muestras"].append({"consulta": {k: v for k, v in params.items() if k != "token"},
                                                      "registro": self.cache[clave][0]})
            except Exception as e:  # noqa: BLE001 — un fallo no debe tumbar la ejecución
                self.errores.append(f"{params.get('origin')}→{params.get('destination')}: {e}")
                self.cache[clave] = []
        return self.cache[clave]

    def ida_y_vuelta(self, o: str, d: str) -> list[dict]:
        res = []
        for mi in meses(self.ida_desde, self.ida_hasta):
            for mv in meses(self.vuelta_desde, self.vuelta_hasta):
                res += self._get(origin=o, destination=d, departure_at=mi,
                                 return_at=mv, one_way="false")
        return res

    def solo_ida(self, o: str, d: str, desde: date, hasta: date) -> list[dict]:
        res = []
        for m in meses(desde, hasta):
            res += self._get(origin=o, destination=d, departure_at=m, one_way="true")
        return res

    # ---- conversión ---------------------------------------------------------
    @staticmethod
    def _llegada(salida: str, minutos) -> datetime | None:
        if not minutos:
            return None
        return parse_dt(salida) + timedelta(minutes=int(minutos))

    def _segs_rt(self, r: dict) -> tuple[Segmento, Segmento | None]:
        o = r.get("origin_airport") or r["origin"]
        d = r.get("destination_airport") or r["destination"]
        dur_ida = r.get("duration_to") or r.get("duration")
        lleg_ida = self._llegada(r["departure_at"], dur_ida)
        ida = Segmento(o, d, r["departure_at"], lleg_ida.isoformat() if lleg_ida else "",
                       int(r.get("transfers") or 0), r.get("airline", ""), str(r.get("flight_number", "")))
        vuelta = None
        if r.get("return_at"):
            lleg_v = self._llegada(r["return_at"], r.get("duration_back"))
            vuelta = Segmento(d, o, r["return_at"], lleg_v.isoformat() if lleg_v else "",
                              int(r.get("return_transfers") or 0), r.get("airline", ""), "")
        return ida, vuelta

    def _billete_rt(self, r: dict, desc: str) -> Billete:
        ida, vuelta = self._segs_rt(r)
        return Billete(desc, float(r["price"]), enlace_aviasales(r.get("link")),
                       enlace_google(r["origin"], r["destination"], r["departure_at"][:10],
                                     (r.get("return_at") or "")[:10] or None),
                       [s for s in (ida, vuelta) if s])

    def _billete_ow(self, r: dict, desc: str) -> Billete:
        ida, _ = self._segs_rt(r)
        return Billete(desc, float(r["price"]), enlace_aviasales(r.get("link")),
                       enlace_google(r["origin"], r["destination"], r["departure_at"][:10]), [ida])

    def _fechas_ok(self, salida_menorca: date, llegada_menorca: date) -> bool:
        noches = (llegada_menorca - salida_menorca).days
        return (self.ida_desde <= salida_menorca <= self.ida_hasta
                and self.vuelta_desde <= llegada_menorca <= self.vuelta_hasta
                and self.cfg["noches_min"] <= noches <= self.cfg["noches_max"])

    # ---- estrategia 1: billete único desde Menorca --------------------------
    def directos(self, dest: str) -> list[Opcion]:
        out = []
        for r in self.ida_y_vuelta(self.origen, dest):
            if not r.get("return_at"):
                self._descarte("directo: sin fecha de vuelta")
                continue
            ida, vuelta = self._segs_rt(r)
            s = parse_dt(ida.salida).date()
            ll = (parse_dt(vuelta.llegada) if vuelta.llegada else parse_dt(vuelta.salida)).date()
            if not self._fechas_ok(s, ll):
                self._descarte("directo: fechas fuera de ventana")
                continue
            b = self._billete_rt(r, f"{self.origen} ⇄ {dest} (billete único)")
            out.append(Opcion("directo", dest, b.precio, s.isoformat(), ll.isoformat(),
                              (ll - s).days, None, [b]))
        return out

    # ---- estrategia 2: autoconexión vía hub ---------------------------------
    def _margen(self, aeropuerto_llegada: str, aeropuerto_salida: str) -> timedelta:
        h = self.cfg["conexion_min_horas"]
        if aeropuerto_llegada != aeropuerto_salida:
            h = max(h, self.cfg["conexion_cambio_aeropuerto_horas"])
        return timedelta(hours=h)

    def autoconexiones(self, hub: str, dest: str) -> list[Opcion]:
        largos = [r for r in self.ida_y_vuelta(hub, dest) if r.get("return_at")]
        if not largos:
            return []
        max_con = timedelta(hours=self.cfg["conexion_max_horas"])
        pos_ida = self.solo_ida(self.origen, hub, self.ida_desde, self.ida_hasta)
        pos_vta = self.solo_ida(hub, self.origen, self.vuelta_desde, self.vuelta_hasta)
        pos_ida.sort(key=lambda r: r["price"])
        pos_vta.sort(key=lambda r: r["price"])

        out = []
        for L in largos:
            ida_l, vta_l = self._segs_rt(L)
            sal_l = parse_dt(ida_l.salida)
            if not vta_l.llegada:
                self._descarte("hub: vuelta sin duración")
                continue
            lleg_l = parse_dt(vta_l.llegada)

            p1 = next((p for p in pos_ida if self._encaja_antes(p, ida_l.de, sal_l, max_con)), None)
            p2 = next((p for p in pos_vta if self._encaja_despues(p, vta_l.a, lleg_l, max_con)), None)
            avisos = ["Billetes separados: si un vuelo se retrasa y pierdes el siguiente, no te recolocan."]

            if p1:
                b1 = self._billete_ow(p1, f"{self.origen} → {hub}")
                seg1 = b1.segmentos[0]
                if seg1.a != ida_l.de:
                    avisos.append(f"Ida: cambio de aeropuerto en {hub} ({seg1.a} → {ida_l.de}).")
                espera1 = sal_l - parse_dt(seg1.llegada)
                if espera1 > timedelta(hours=10):
                    avisos.append(f"Ida: noche/espera larga en {hub} ({int(espera1.total_seconds() // 3600)} h).")
            else:
                # Sin dato para ese día: estimamos con los días cercanos (hay varios vuelos diarios).
                limite = (sal_l - self._margen(hub, ida_l.de)).astimezone(sal_l.tzinfo)
                dia = limite.date() if limite.hour >= 9 else limite.date() - timedelta(days=1)
                b1 = self._estimado(pos_ida, dia, self.origen, hub)
                if not b1:
                    self._descarte("hub: sin precios Menorca-hub")
                    continue
                avisos.append(f"Vuelo {self.origen} → {hub}: precio estimado (~{b1.precio:.0f} €); "
                              f"búscalo para el {dia.strftime('%d/%m')}, llegando antes de las {limite.strftime('%H:%M')}.")
                if dia < sal_l.date():
                    avisos.append(f"Ida: probablemente toque dormir en {hub} la noche antes.")
            if p2:
                b2 = self._billete_ow(p2, f"{hub} → {self.origen}")
                seg2 = b2.segmentos[0]
                if vta_l.a != seg2.de:
                    avisos.append(f"Vuelta: cambio de aeropuerto en {hub} ({vta_l.a} → {seg2.de}).")
                espera2 = parse_dt(seg2.salida) - lleg_l
                if espera2 > timedelta(hours=10):
                    avisos.append(f"Vuelta: noche/espera larga en {hub} ({int(espera2.total_seconds() // 3600)} h).")
            else:
                tz_hub = sal_l.tzinfo
                desde = (lleg_l + self._margen(vta_l.a, hub)).astimezone(tz_hub)
                dia = desde.date() if desde.hour < 20 else desde.date() + timedelta(days=1)
                b2 = self._estimado(pos_vta, dia, hub, self.origen)
                if not b2:
                    self._descarte("hub: sin precios hub-Menorca")
                    continue
                avisos.append(f"Vuelo {hub} → {self.origen}: precio estimado (~{b2.precio:.0f} €); "
                              f"búscalo para el {dia.strftime('%d/%m')}" + (f", saliendo después de las {desde.strftime('%H:%M')}."
                                                                         if dia == desde.date() else "."))
                if dia > desde.date():
                    avisos.append(f"Vuelta: probablemente toque dormir en {hub} antes de volver.")

            s = parse_dt(b1.segmentos[0].salida).date()
            ll = parse_dt(b2.segmentos[0].llegada or b2.segmentos[0].salida).date()
            if not self._fechas_ok(s, ll):
                self._descarte("hub: fechas fuera de ventana")
                continue
            avisos.append("Recoge y vuelve a facturar el equipaje en el hub.")
            billetes = [b1, self._billete_rt(L, f"{hub} ⇄ {dest}"), b2]
            total = round(sum(b.precio for b in billetes), 2)
            out.append(Opcion("autoconexion", dest, total, s.isoformat(), ll.isoformat(),
                              (ll - s).days, hub, billetes, avisos))
        return out

    def _estimado(self, vuelos: list[dict], dia: date, o: str, d: str) -> Billete | None:
        """Precio orientativo de un vuelo corto Menorca ⇄ hub para `dia`.

        Orden: mediana de los días cercanos → mediana de toda la ventana → precio de
        referencia del hub en config.json (precio_hub_referencia)."""
        flex = self.cfg.get("estimacion_dias", 4)
        cerca = sorted(v["price"] for v in vuelos if abs((parse_dt(v["departure_at"]).date() - dia).days) <= flex)
        todos = sorted(v["price"] for v in vuelos)
        hub = d if o == self.origen else o
        ref = self.cfg.get("precio_hub_referencia", {})
        if cerca:
            precio, como = float(cerca[len(cerca) // 2]), "días cercanos"
        elif todos:
            precio, como = float(todos[len(todos) // 2]), "otros días del mes"
        elif hub in ref or "_otros" in ref:
            precio, como = float(ref.get(hub, ref.get("_otros"))), "precio de referencia"
        else:
            return None
        seg = Segmento(o, d, dia.isoformat(), "", 0, "", "")
        return Billete(f"{o} → {d} (precio estimado: {como})", precio, "", enlace_google(o, d, dia.isoformat()), [seg])

    def _encaja_antes(self, p: dict, aeropuerto_salida: str, salida: datetime, max_con: timedelta) -> bool:
        seg, _ = self._segs_rt(p)
        if not seg.llegada:
            return False
        lleg = parse_dt(seg.llegada)
        return salida - max_con <= lleg <= salida - self._margen(seg.a, aeropuerto_salida)

    def _encaja_despues(self, p: dict, aeropuerto_llegada: str, llegada: datetime, max_con: timedelta) -> bool:
        seg, _ = self._segs_rt(p)
        sal = parse_dt(seg.salida)
        return llegada + self._margen(aeropuerto_llegada, seg.de) <= sal <= llegada + max_con

    # ---- todo junto ---------------------------------------------------------
    def buscar_destino(self, dest: str) -> list[Opcion]:
        opciones = self.directos(dest)
        for hub in self.cfg["hubs"]:
            if hub != dest:
                opciones += self.autoconexiones(hub, dest)
        tope = self.cfg.get("precio_max_mostrar", self.cfg["presupuesto_max"])
        caros = sum(o.total > tope for o in opciones)
        if caros:
            self.diag["descartes"]["por encima del presupuesto"] = self.diag["descartes"].get("por encima del presupuesto", 0) + caros
        opciones = [o for o in opciones if o.total <= tope]
        opciones.sort(key=lambda o: (o.total, o.tipo != "directo"))
        # quita duplicados (mismas fechas y mismo tipo/hub)
        vistos, unicas = set(), []
        for o in opciones:
            k = (o.tipo, o.hub, o.ida, o.vuelta, o.fuente)
            if k not in vistos:
                vistos.add(k)
                unicas.append(o)
        return unicas

    # ---- estrategia 3: salir directamente desde un hub ----------------------
    def desde_hub(self, hub: str, dest: str) -> list[Opcion]:
        """Ida y vuelta hub ⇄ destino, para quien ya está en Barcelona/Madrid (sin el tramo de Menorca)."""
        out, vistos = [], set()
        for r in sorted(self.ida_y_vuelta(hub, dest), key=lambda x: x["price"]):
            if not r.get("return_at") or r["price"] > self.cfg.get("precio_max_mostrar", self.cfg["presupuesto_max"]):
                continue
            ida, vuelta = self._segs_rt(r)
            s = parse_dt(ida.salida).date()
            ll = (parse_dt(vuelta.llegada) if vuelta.llegada else parse_dt(vuelta.salida)).date()
            noches = (ll - s).days
            if not (self.ida_desde <= s <= self.ida_hasta and self.vuelta_desde <= ll <= self.vuelta_hasta
                    and self.cfg["noches_min"] <= noches <= self.cfg["noches_max"]) or (s, ll) in vistos:
                continue
            vistos.add((s, ll))
            b = self._billete_rt(r, f"{hub} ⇄ {dest}")
            out.append(Opcion("desde_hub", dest, b.precio, s.isoformat(), ll.isoformat(), noches, hub, [b],
                              [f"Sale de {hub}: el viaje desde Menorca hasta {hub} va aparte."]))
        return out


# --------------------------------------------------------------------------
# Chollos e historial
# --------------------------------------------------------------------------
def evaluar_chollo(precio: float, ref: float, historial: list[float], cfg: dict) -> tuple[bool, str]:
    c = cfg["chollo"]
    motivos = []
    if precio <= ref * c["factor_referencia"]:
        motivos.append(f"{round((1 - precio / ref) * 100)} % por debajo del precio habitual (~{ref:.0f} €)")
    if len(historial) >= c["historial_minimo"]:
        med = statistics.median(historial)
        if precio <= med * c["factor_historial"]:
            motivos.append(f"{round((1 - precio / med) * 100)} % por debajo de la mediana rastreada ({med:.0f} €)")
    return bool(motivos), "; ".join(motivos)


def pasa_filtros(d: dict, cfg: dict) -> bool:
    f = cfg["filtros"]
    return d["temp_max"] >= f["temp_max_minima"] and d["seguridad"] >= f["seguridad_minima"]


# --------------------------------------------------------------------------
# Avisos por Telegram (opcional)
# --------------------------------------------------------------------------
def telegram(texto: str) -> None:
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not tok or not chat:
        return
    datos = urllib.parse.urlencode({"chat_id": chat, "text": texto, "parse_mode": "HTML",
                                    "disable_web_page_preview": "true"}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage", datos, timeout=20)
    except Exception as e:  # noqa: BLE001
        print(f"[aviso] Telegram falló: {e}", file=sys.stderr)


def texto_alerta(d: dict, o: dict, motivo: str) -> str:
    ruta = "billete único" if o["tipo"] == "directo" else f"vía {o['hub']} (billetes separados)"
    ruta += f" · {o.get('fuente', 'Aviasales')}"
    enlace = next((b["enlace"] or b["google"] for b in o["billetes"] if "⇄" in b["descripcion"]), o["billetes"][0]["google"])
    return (f"🔥 <b>Chollo: {d['ciudad']} ({d['pais']}) por {o['total']:.0f} €</b>\n"
            f"{o['ida']} → {o['vuelta']} · {o['noches']} noches · {ruta}\n"
            f"☀️ {d['temp_max']} °C · seguridad {d['seguridad']}/5\n{motivo}\n{enlace}")


# --------------------------------------------------------------------------
# Programa principal
# --------------------------------------------------------------------------
def ejecutar(cfg: dict, catalogo: list[dict], fetch: Fetch | None, dir_datos: Path,
             ahora: datetime | None = None, solo: Iterable[str] | None = None,
             avisar: Callable[[str], None] = telegram,
             fetch_google: google_flights.FetchG | None = None) -> dict:
    ahora = ahora or datetime.now(timezone.utc)
    sello = ahora.replace(microsecond=0).isoformat()
    solo = {s.upper() for s in solo} if solo else None
    historial = cargar_json(dir_datos / "historial.json", {})
    alertados = cargar_json(dir_datos / "alertas.json", {})
    buscador = Buscador(cfg, fetch or (lambda p: []))
    n_opc = cfg.get("opciones_por_destino", 5)
    tope = cfg.get("precio_max_mostrar", cfg["presupuesto_max"])  # se guardan también algo más caros

    gf = cargar_json(dir_datos / "google_flights.json", {})
    errores_google = []
    if fetch_google and cfg.get("google_flights", {}).get("activo", True):
        errores_google = google_flights.actualizar(cfg, catalogo, fetch_google, gf, ahora)
        guardar_json(dir_datos / "google_flights.json", gf)

    resultados = []
    for d in catalogo:
        if solo and d["iata"] not in solo:
            continue
        apto = pasa_filtros(d, cfg)
        opciones = [asdict(o) for o in buscador.buscar_destino(d["iata"])] if (fetch and (apto or solo)) else []
        if apto or solo:
            opciones += [o for o in google_flights.opciones_de(gf, d["iata"]) if o["total"] <= tope]
        opciones.sort(key=lambda o: o["total"])
        for o in opciones:
            o["desde"] = cfg["origen"]
        desde_hubs = []
        if fetch and (apto or solo):
            for h in cfg.get("salidas_alternativas", []):
                desde_hubs += [{**asdict(o), "desde": h} for o in buscador.desde_hub(h, d["iata"])[:n_opc]]
        mejor = opciones[0] if opciones else None
        hist = historial.setdefault(d["iata"], [])
        previos = [h["precio"] for h in hist]
        en_presupuesto = bool(mejor) and mejor["total"] <= cfg["presupuesto_max"]
        chollo, motivo = (evaluar_chollo(mejor["total"], d["ref"], previos, cfg) if en_presupuesto else (False, ""))
        if en_presupuesto and (mejor.get("insights") or {}).get("price_level") == "low":
            rango = mejor["insights"].get("typical_price_range") or []
            extra = "Google Flights lo marca como precio bajo" + (f" (lo habitual: {rango[0]}–{rango[1]} €)" if len(rango) == 2 else "")
            chollo, motivo = True, "; ".join(x for x in (motivo, extra) if x)
        if mejor:
            hist.append({"fecha": sello, "precio": mejor["total"]})
            del hist[:-MAX_HISTORIAL]
            ult = alertados.get(d["iata"])
            if chollo and (ult is None or mejor["total"] <= ult * (1 - cfg["chollo"]["bajada_para_reavisar"])):
                avisar(texto_alerta(d, mejor, motivo))
                alertados[d["iata"]] = mejor["total"]
            elif not chollo and ult is not None and mejor["total"] > ult * 1.15:
                alertados.pop(d["iata"], None)  # el chollo desapareció: se podrá volver a avisar
        resultados.append({
            **d,
            "apto": apto,
            "mejor": mejor,
            "opciones": opciones[:n_opc] + desde_hubs,
            "chollo": chollo,
            "motivo_chollo": motivo,
            "historial": hist[-120:],
        })

    resultados.sort(key=lambda r: (r["mejor"] is None, not r["chollo"],
                                   r["mejor"]["total"] if r["mejor"] else 9e9))
    salida = {
        "generado": sello,
        "fuente": "Travelpayouts / Aviasales (precios en caché de búsquedas recientes)",
        "config": {k: cfg[k] for k in ("origen", "ida_desde", "ida_hasta", "vuelta_desde",
                                       "vuelta_hasta", "noches_min", "noches_max",
                                       "presupuesto_max", "hubs", "filtros")} | {"precio_max_mostrar": tope},
        "llamadas_api": buscador.llamadas,
        "errores": (buscador.errores + errores_google)[:50],
        "fuentes": [x for x, activa in (("Aviasales", bool(fetch)), ("Google Flights", bool(fetch_google))) if activa],
        "google_flights": {k: v for k, v in (gf.get("estado") or {}).items() if k in ("mes", "usadas_mes")},
        "diagnostico": buscador.diag,
        "destinos": resultados,
    }
    guardar_json(dir_datos / "resultados.json", salida)
    guardar_json(dir_datos / "historial.json", historial)
    guardar_json(dir_datos / "alertas.json", alertados)
    return salida


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=AQUI / "config.json", type=Path)
    ap.add_argument("--destinos", default=AQUI / "destinos.json", type=Path)
    ap.add_argument("--datos", default=AQUI / "data", type=Path)
    ap.add_argument("--solo", help="lista de IATA separada por comas para probar (p. ej. BKK,CUN)")
    a = ap.parse_args(argv)

    token = os.environ.get("TRAVELPAYOUTS_TOKEN")
    clave_g = os.environ.get("SERPAPI_KEY")
    if not token and not clave_g:
        print("Falta TRAVELPAYOUTS_TOKEN o SERPAPI_KEY: hace falta al menos una fuente de precios.", file=sys.stderr)
        return 2
    cfg = json.loads(a.config.read_text(encoding="utf-8"))
    catalogo = json.loads(a.destinos.read_text(encoding="utf-8"))["destinos"]
    fetch = fetch_travelpayouts(token, cfg.get("pausa_entre_llamadas_seg", 0.35)) if token else None
    fetch_g = google_flights.fetch_serpapi(clave_g) if clave_g else None
    salida = ejecutar(cfg, catalogo, fetch, a.datos, solo=a.solo.split(",") if a.solo else None,
                      fetch_google=fetch_g)
    print("Fuentes:", ", ".join(salida["fuentes"]), "· Google Flights este mes:", salida["google_flights"])

    con_precio = [d for d in salida["destinos"] if d["mejor"]]
    print("Diagnóstico:", json.dumps({k: v for k, v in salida["diagnostico"].items() if k != "muestras"}, ensure_ascii=False))
    print(f"{salida['llamadas_api']} llamadas · {len(con_precio)} destinos con precio ≤ "
          f"{cfg['presupuesto_max']} € · {sum(d['chollo'] for d in con_precio)} chollos")
    for d in con_precio[:15]:
        m = d["mejor"]
        via = ("único" if m["tipo"] == "directo" else f"vía {m['hub']}") + f", {m.get('fuente', 'Aviasales')}"
        print(f"  {'🔥' if d['chollo'] else '  '} {m['total']:7.0f} €  {d['ciudad']:<22} "
              f"{m['ida']} → {m['vuelta']}  ({via})")
    for e in salida["errores"][:5]:
        print("  [error]", e, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
