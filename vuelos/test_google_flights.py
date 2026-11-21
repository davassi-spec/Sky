"""Pruebas sin red de la fuente Google Flights (SerpApi)."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import google_flights as g  # noqa: E402
import rastreador as r  # noqa: E402

CFG = json.loads((Path(__file__).parent / "config.json").read_text(encoding="utf-8"))
CAT = json.loads((Path(__file__).parent / "destinos.json").read_text(encoding="utf-8"))["destinos"]


def respuesta(precio, nivel="typical"):
    """Forma de una respuesta de SerpApi google_flights (campos que usamos)."""
    return {
        "search_metadata": {"google_flights_url": "https://www.google.com/travel/flights?tfs=abc"},
        "best_flights": [{
            "flights": [
                {"departure_airport": {"id": "MAH", "time": "2026-12-12 07:05"},
                 "arrival_airport": {"id": "MAD", "time": "2026-12-12 08:30"},
                 "airline": "Iberia", "flight_number": "IB 3911"},
                {"departure_airport": {"id": "MAD", "time": "2026-12-12 12:40"},
                 "arrival_airport": {"id": "BKK", "time": "2026-12-13 09:15"},
                 "airline": "Qatar Airways", "flight_number": "QR 150"},
            ],
            "layovers": [{"id": "MAD", "duration": 250}],
            "price": precio,
        }],
        "other_flights": [{"flights": [], "price": None}],
        "price_insights": {"lowest_price": precio, "price_level": nivel, "typical_price_range": [700, 950]},
    }


class Pruebas(unittest.TestCase):
    def test_a_opcion(self):
        o = g.a_opcion(respuesta(612), "MAH", "BKK", "2026-12-12", "2027-01-10")
        self.assertEqual(o["total"], 612)
        self.assertEqual(o["noches"], 29)
        self.assertEqual(o["fuente"], "Google Flights")
        s = o["billetes"][0]["segmentos"][0]
        self.assertEqual((s["de"], s["a"], s["escalas"]), ("MAH", "BKK", 1))
        self.assertEqual(s["salida"], "2026-12-12T07:05:00")
        self.assertIn("google.com", o["billetes"][0]["google"])

    def test_sin_vuelos(self):
        self.assertIsNone(g.a_opcion({"best_flights": []}, "MAH", "BKK", "2026-12-12", "2027-01-10"))

    def test_cupo_repartido(self):
        cfg_g = {"max_busquedas_mes": 95, "max_por_ejecucion": 3}
        est = {}
        self.assertEqual(g.cupo_disponible(cfg_g, est, datetime(2026, 11, 1, 0, tzinfo=timezone.utc)), 1)
        est = {"mes": "2026-11", "usadas_mes": 60}
        self.assertEqual(g.cupo_disponible(cfg_g, est, datetime(2026, 11, 21, tzinfo=timezone.utc)), 3)
        est = {"mes": "2026-11", "usadas_mes": 95}
        self.assertEqual(g.cupo_disponible(cfg_g, est, datetime(2026, 11, 30, 23, tzinfo=timezone.utc)), 0)
        est = {"mes": "2026-11", "usadas_mes": 95}  # cambia el mes → se reinicia
        self.assertEqual(g.cupo_disponible(cfg_g, est, datetime(2026, 12, 1, 6, tzinfo=timezone.utc)), 1)

    def test_rotacion_y_integracion(self):
        llamadas = []

        def fake(p):
            llamadas.append(p)
            return respuesta(590 if p["arrival_id"] == "BKK" else 990, "low" if p["arrival_id"] == "BKK" else "typical")

        with tempfile.TemporaryDirectory() as tmp:
            ahora = datetime(2026, 11, 21, 12, tzinfo=timezone.utc)
            out = r.ejecutar(CFG, CAT, None, Path(tmp), ahora=ahora, avisar=lambda s: None, fetch_google=fake)
            self.assertEqual([p["arrival_id"] for p in llamadas], ["BKK", "KUL", "CMB"])
            self.assertEqual(out["fuentes"], ["Google Flights"])
            bkk = next(d for d in out["destinos"] if d["iata"] == "BKK")
            self.assertEqual(bkk["mejor"]["total"], 590)
            self.assertTrue(bkk["chollo"])
            self.assertIn("Google Flights lo marca como precio bajo", bkk["motivo_chollo"])
            # segunda ejecución: sigue la rotación donde se quedó y conserva lo anterior
            r.ejecutar(CFG, CAT, None, Path(tmp), ahora=ahora, avisar=lambda s: None, fetch_google=fake)
            self.assertEqual([p["arrival_id"] for p in llamadas[3:]], ["PUJ", "CUN", "PTY"])
            guardado = json.loads((Path(tmp) / "google_flights.json").read_text())
            self.assertEqual(len(guardado["resultados"]), 6)
            self.assertEqual(guardado["estado"]["usadas_mes"], 6)


if __name__ == "__main__":
    unittest.main()
