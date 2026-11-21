"""Pruebas sin red: python3 -m unittest vuelos/test_rastreador.py"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rastreador as r  # noqa: E402

CFG = json.loads((Path(__file__).parent / "config.json").read_text(encoding="utf-8"))
CFG = {**CFG, "hubs": ["MAD", "LON"]}

BKK = {"iata": "BKK", "ciudad": "Bangkok", "pais": "Tailandia", "region": "Sudeste Asiático",
       "temp_max": 32, "temp_min": 22, "lluvia": "seca", "seguridad": 4, "playa": False, "ref": 650, "nota": ""}
OSL = {**BKK, "iata": "OSL", "ciudad": "Oslo", "temp_max": 1, "seguridad": 5}


def rt(o, d, sal, ret, precio, dur=800, oa=None, da=None):
    return {"origin": o, "destination": d, "origin_airport": oa or o, "destination_airport": da or d,
            "price": precio, "airline": "XX", "flight_number": "1", "departure_at": sal, "return_at": ret,
            "transfers": 1, "return_transfers": 1, "duration": dur * 2, "duration_to": dur,
            "duration_back": dur, "link": f"/search/{o}{d}"}


def ow(o, d, sal, precio, dur=80, oa=None, da=None):
    return {"origin": o, "destination": d, "origin_airport": oa or o, "destination_airport": da or d,
            "price": precio, "airline": "VY", "flight_number": "2", "departure_at": sal,
            "transfers": 0, "duration": dur, "duration_to": dur, "link": f"/search/{o}{d}ow"}


class FakeAPI:
    def __init__(self, tabla):
        self.tabla, self.llamadas = tabla, []

    def __call__(self, p):
        self.llamadas.append(p)
        clave = (p["origin"], p["destination"], p["one_way"])
        return [x for x in self.tabla.get(clave, [])
                if x["departure_at"].startswith(p["departure_at"])
                and (not p.get("return_at") or x.get("return_at", "").startswith(p["return_at"]))]


def tabla_basica():
    return {
        # billete único MAH⇄BKK caro
        ("MAH", "BKK", "false"): [rt("MAH", "BKK", "2026-12-10T07:00:00+01:00", "2027-01-15T10:00:00+07:00", 980)],
        # MAD⇄BKK barato, sale 10/12 a las 13:00 (hora España)
        ("MAD", "BKK", "false"): [rt("MAD", "BKK", "2026-12-10T13:00:00+01:00", "2027-01-15T10:00:00+07:00", 400)],
        # posicionamientos: uno llega con 1h de margen (no vale), otro con 5h (vale)
        ("MAH", "MAD", "true"): [
            ow("MAH", "MAD", "2026-12-10T10:40:00+01:00", 25),     # llega 12:00 → margen 1h: NO
            ow("MAH", "MAD", "2026-12-10T06:40:00+01:00", 60),     # llega 08:00 → margen 5h: SÍ
        ],
        # vuelta: largo llega a MAD 15/01 10:00 BKK + 800 min = 03:00 UTC + 13h20 = 16:20 UTC
        ("MAD", "MAH", "true"): [
            ow("MAD", "MAH", "2027-01-15T18:00:00+01:00", 20),     # 17:00 UTC: margen <4h → NO
            ow("MAD", "MAH", "2027-01-15T22:00:00+01:00", 45),     # 21:00 UTC: margen 4h40 → SÍ
        ],
    }


class PruebasBuscador(unittest.TestCase):
    def test_autoconexion_respeta_margen_y_es_mas_barata(self):
        b = r.Buscador(CFG, FakeAPI(tabla_basica()))
        ops = b.buscar_destino("BKK")
        self.assertEqual(ops[0].tipo, "autoconexion")
        self.assertEqual(ops[0].hub, "MAD")
        self.assertEqual(ops[0].total, 60 + 400 + 45)
        self.assertEqual([x.precio for x in ops[0].billetes], [60, 400, 45])
        self.assertEqual(ops[1].tipo, "directo")
        self.assertEqual(ops[1].total, 980)

    def test_presupuesto(self):
        cfg = {**CFG, "presupuesto_max": 500}
        self.assertEqual(r.Buscador(cfg, FakeAPI(tabla_basica())).buscar_destino("BKK"), [])

    def test_cambio_de_aeropuerto_exige_mas_margen(self):
        t = {
            ("LON", "BKK", "false"): [rt("LON", "BKK", "2026-12-10T14:00:00+00:00", "2027-01-15T10:00:00+07:00",
                                         400, oa="LHR", da="BKK")],
            # llega a LGW 5h antes: con cambio LGW→LHR hacen falta 6h → no vale
            ("MAH", "LON", "true"): [ow("MAH", "LON", "2026-12-10T08:00:00+01:00", 30, dur=120, da="LGW")],
            ("LON", "MAH", "true"): [ow("LON", "MAH", "2027-01-16T09:00:00+00:00", 30, oa="LHR")],
        }
        # el vuelo real no deja margen → se usa un precio estimado (no el vuelo que no encaja)
        ops = r.Buscador({**CFG, "hubs": ["LON"]}, FakeAPI(t)).autoconexiones("LON", "BKK")
        self.assertEqual(len(ops), 1)
        self.assertIn("estimado", ops[0].billetes[0].descripcion)
        self.assertTrue(any("dormir en LON" in a for a in ops[0].avisos))
        t[("MAH", "LON", "true")].append(ow("MAH", "LON", "2026-12-10T05:00:00+01:00", 50, dur=120, da="LGW"))
        ops = r.Buscador({**CFG, "hubs": ["LON"]}, FakeAPI(t)).autoconexiones("LON", "BKK")
        self.assertEqual(len(ops), 1)
        self.assertTrue(any("cambio de aeropuerto" in a for a in ops[0].avisos))
        self.assertNotIn("estimado", ops[0].billetes[0].descripcion)

    def test_estimacion_con_dias_cercanos(self):
        t = tabla_basica()
        # solo hay datos Menorca→Madrid de 2 días después: se estima con la mediana
        t[("MAH", "MAD", "true")] = [ow("MAH", "MAD", "2026-12-12T09:00:00+01:00", 40),
                                     ow("MAH", "MAD", "2026-12-13T09:00:00+01:00", 80)]
        ops = r.Buscador({**CFG, "hubs": ["MAD"]}, FakeAPI(t)).autoconexiones("MAD", "BKK")
        self.assertEqual(ops[0].billetes[0].precio, 80)
        self.assertEqual(ops[0].ida, "2026-12-10")
        # sin ningún dato en ±4 días → no se inventa nada
        t[("MAH", "MAD", "true")] = [ow("MAH", "MAD", "2026-12-28T09:00:00+01:00", 40)]
        self.assertEqual(r.Buscador({**CFG, "hubs": ["MAD"]}, FakeAPI(t)).autoconexiones("MAD", "BKK"), [])

    def test_fechas_fuera_de_ventana(self):
        t = {("MAH", "BKK", "false"): [rt("MAH", "BKK", "2026-11-28T07:00:00+01:00",
                                          "2027-01-15T10:00:00+07:00", 300)]}
        self.assertEqual(r.Buscador(CFG, FakeAPI(t)).directos("BKK"), [])

    def test_cache_no_repite_llamadas(self):
        api = FakeAPI(tabla_basica())
        b = r.Buscador(CFG, api)
        b.buscar_destino("BKK")
        n = len(api.llamadas)
        b.buscar_destino("BKK")
        self.assertEqual(len(api.llamadas), n)

    def test_error_de_api_no_rompe(self):
        def falla(p):
            raise RuntimeError("caído")
        b = r.Buscador(CFG, falla)
        self.assertEqual(b.buscar_destino("BKK"), [])
        self.assertTrue(b.errores)


class PruebasChollo(unittest.TestCase):
    def test_referencia(self):
        ok, motivo = r.evaluar_chollo(450, 650, [], CFG)
        self.assertTrue(ok)
        self.assertIn("31 %", motivo)

    def test_historial(self):
        ok, _ = r.evaluar_chollo(590, 650, [720, 700, 710, 690], CFG)
        self.assertTrue(ok)
        ok, _ = r.evaluar_chollo(680, 650, [720, 700, 710, 690], CFG)
        self.assertFalse(ok)


class PruebasEjecucion(unittest.TestCase):
    def test_flujo_completo_y_avisos(self):
        with tempfile.TemporaryDirectory() as tmp:
            avisos = []
            t0 = datetime(2026, 11, 21, 6, tzinfo=timezone.utc)
            out = r.ejecutar(CFG, [BKK, OSL], FakeAPI(tabla_basica()), Path(tmp), ahora=t0, avisar=avisos.append)
            bkk = out["destinos"][0]
            self.assertEqual(bkk["iata"], "BKK")
            self.assertTrue(bkk["chollo"])
            self.assertEqual(bkk["mejor"]["total"], 505)
            self.assertEqual(len(avisos), 1)
            osl = next(d for d in out["destinos"] if d["iata"] == "OSL")
            self.assertFalse(osl["apto"])
            self.assertIsNone(osl["mejor"])
            # segunda ejecución al mismo precio: no repite el aviso
            r.ejecutar(CFG, [BKK], FakeAPI(tabla_basica()), Path(tmp), ahora=t0, avisar=avisos.append)
            self.assertEqual(len(avisos), 1)
            hist = json.loads((Path(tmp) / "historial.json").read_text())
            self.assertEqual(len(hist["BKK"]), 2)


if __name__ == "__main__":
    unittest.main()
