package es.pizarra.tv;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Lo que el script de Google le manda a la TV (ver madre/apps-script/Code.gs). */
final class Datos {
    static final class Mensaje {
        String de = "";
        String texto = "";
        long t;             // cuándo se escribió, en segundos
    }

    static final class Evento {
        boolean manana;
        String hora = "";   // "18:30"; vacío si dura todo el día
        String titulo = "";
    }

    boolean verMensajes = true;
    boolean verEventos = true;
    boolean verTiempo = true;
    int nocheDesde = 21;
    int nocheHasta = 6;
    String nocheTexto = "Es hora de dormir.";
    String contactoNombre = "";
    String contactoTelefono = "";
    final List<Mensaje> mensajes = new ArrayList<>();
    final List<Evento> eventos = new ArrayList<>();
    boolean hayTiempo;
    int temperatura;
    int codigoTiempo;

    static Datos parse(String json) throws JSONException {
        JSONObject o = new JSONObject(json);
        if (o.has("error")) throw new JSONException("El servidor respondió: " + o.optString("error"));
        Datos d = new Datos();
        JSONObject w = o.optJSONObject("widgets");
        if (w != null) {
            d.verMensajes = w.optBoolean("mensajes", true);
            d.verEventos = w.optBoolean("eventos", true);
            d.verTiempo = w.optBoolean("tiempo", true);
        }
        JSONObject n = o.optJSONObject("noche");
        if (n != null) {
            d.nocheDesde = n.optInt("desde", 21);
            d.nocheHasta = n.optInt("hasta", 6);
        }
        d.nocheTexto = o.optString("nocheTexto", d.nocheTexto).trim();
        JSONObject c = o.optJSONObject("contacto");
        if (c != null) {
            d.contactoNombre = c.optString("nombre", "").trim();
            d.contactoTelefono = c.optString("telefono", "").trim();
        }
        JSONArray ms = o.optJSONArray("mensajes");
        for (int i = 0; ms != null && i < ms.length(); i++) {
            JSONObject m = ms.getJSONObject(i);
            Mensaje x = new Mensaje();
            x.de = m.optString("de", "").trim();
            x.texto = m.optString("texto", "").trim();
            x.t = m.optLong("t", 0);
            if (!x.texto.isEmpty()) d.mensajes.add(x);
        }
        JSONArray es = o.optJSONArray("eventos");
        for (int i = 0; es != null && i < es.length(); i++) {
            JSONObject e = es.getJSONObject(i);
            Evento x = new Evento();
            x.manana = e.optInt("dia", 0) == 1;
            x.hora = e.optString("hora", "");
            x.titulo = e.optString("titulo", "").trim();
            if (!x.titulo.isEmpty()) d.eventos.add(x);
        }
        JSONObject t = o.optJSONObject("tiempo");
        if (t != null && t.has("temp")) {
            d.hayTiempo = true;
            d.temperatura = (int) Math.round(t.optDouble("temp"));
            d.codigoTiempo = t.optInt("codigo", 3);
        }
        return d;
    }

    /** ¿Estamos en horario de noche? Admite tramos que cruzan la medianoche (21 a 6). */
    boolean esNoche(int hora) {
        if (nocheDesde == nocheHasta) return false;
        if (nocheDesde < nocheHasta) return hora >= nocheDesde && hora < nocheHasta;
        return hora >= nocheDesde || hora < nocheHasta;
    }
}
