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
        String autor = "";  // id de la persona de la familia (para su foto)
        int foto;           // versión de su foto; 0 si no tiene
    }

    static final class Evento {
        boolean manana;
        String hora = "";   // "18:30"; vacío si dura todo el día
        String titulo = "";
        String autor = "";   // visitas: id de la persona de la familia que viene (para su foto)
        int foto;            // versión de su foto; 0 si no tiene
    }

    static final class Dia {
        int temp, codigo, max, min;
    }

    static final class Cuenta {
        String texto = "";
        String icono = "calendario";
        int dias;
    }

    /** Un recordatorio que la TV debe enseñar ahora (el script solo lo manda mientras toca y de día). */
    static final class Recordatorio {
        String id = "", clave = "", texto = "", texto2 = "";
        int foto;               // versión de su foto; 0 si no tiene
        boolean confirmar, prueba;
        long hasta;             // cuándo deja de verse, en ms (calculado al recibirlo)
    }

    /** Una foto, un audio o un vídeo que alguien de la familia ha mandado poner en la tele ahora. */
    static final class Medio {
        String orden = "", id = "", tipo = "", de = "", texto = "", mime = "";
        int partes, cmdN, rep;
        long bytes;
        int segundos;           // fotos: lo que queda de pantalla (0 = hasta que se quite)
        boolean sinLimite;
        String cmd = "";        // subir | bajar | parar (con su número cmdN, para no repetirlo)
    }

    Medio medio;
    boolean leerVoz;                // leer en voz alta los mensajes nuevos (nunca de noche)
    boolean rapido;                 // hay un envío pendiente: se pregunta cada pocos segundos
    Recordatorio recordatorio;
    boolean pidenCaptura;           // alguien mira la vista previa en el panel: hay que mandar una captura de la pantalla
    static final String[] DISTRIBUCIONES = {"clasica", "reloj", "lista", "sencillo", "banda", "mosaico", "bloques", "lateral", "titular", "marco", "limpia",
            "salvia_melocoton", "coral_menta", "salvia_azul", "menta_lavanda", "azul_terracota", "bosque_amarillo"};
    String distribucion = "clasica";
    String pruebaDistribucion;
    String estiloDia = "lavanda";
    String estiloNoche = "calido";
    String pruebaEstilo;            // "Probar 1 minuto" desde el panel; null si no hay prueba
    boolean pruebaNoche;
    int pruebaSegundos;
    boolean verCuenta = true;
    boolean verParte = true;
    Cuenta cuenta;
    Dia hoy, manana;
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
        return parse(json, System.currentTimeMillis());
    }

    /** recibidoMs: cuándo llegó ese JSON (de él se cuenta cuánto le queda al recordatorio). */
    static Datos parse(String json, long recibidoMs) throws JSONException {
        JSONObject o = new JSONObject(json);
        if (o.has("error")) throw new JSONException("El servidor respondió: " + o.optString("error"));
        Datos d = new Datos();
        JSONObject w = o.optJSONObject("widgets");
        if (w != null) {
            d.verMensajes = w.optBoolean("mensajes", true);
            d.verEventos = w.optBoolean("eventos", true);
            d.verTiempo = w.optBoolean("tiempo", true);
        }
        JSONArray bl = o.optJSONArray("bloques");
        for (int i = 0; bl != null && i < bl.length(); i++) {
            JSONObject b = bl.getJSONObject(i);
            boolean on = b.optBoolean("activo", true);
            String id = b.optString("id");
            if (id.equals("mensajes")) d.verMensajes = on;
            else if (id.equals("proximo")) d.verEventos = on;
            else if (id.equals("tiempo")) d.verTiempo = on;
            else if (id.equals("cuentaAtras")) d.verCuenta = on;
            else if (id.equals("parteDelDia")) d.verParte = on;
        }
        d.distribucion = valida(o.optString("distribucion", "clasica"));
        d.estiloDia = o.optString("estiloDia", "lavanda");
        d.estiloNoche = o.optString("estiloNoche", "calido");
        JSONObject pr = o.optJSONObject("prueba");
        if (pr != null) {
            d.pruebaEstilo = pr.optString("estilo", null);
            d.pruebaDistribucion = pr.isNull("distribucion") ? null : valida(pr.optString("distribucion", d.distribucion));
            d.pruebaNoche = "noche".equals(pr.optString("modo"));
            d.pruebaSegundos = pr.optInt("segundos", 0);
        }
        JSONObject ca = o.optJSONObject("cuentaAtras");
        if (ca != null && d.verCuenta && !ca.optString("texto", "").trim().isEmpty()) {
            d.cuenta = new Cuenta();
            d.cuenta.texto = ca.optString("texto").trim();
            d.cuenta.icono = ca.optString("icono", "calendario");
            d.cuenta.dias = ca.optInt("dias", 0);
        }
        d.pidenCaptura = o.optBoolean("captura", false);
        d.rapido = o.optBoolean("rapido", false);
        d.leerVoz = o.optBoolean("leerVoz", false);
        JSONObject me = o.optJSONObject("medio");
        if (me != null && !me.optString("id", "").isEmpty()) {
            Medio x = new Medio();
            x.orden = me.optString("orden", "");
            x.id = me.optString("id");
            x.tipo = me.optString("tipo", "");
            x.de = me.optString("de", "").trim();
            x.texto = me.optString("texto", "").trim();
            x.mime = me.optString("mime", "");
            x.partes = me.optInt("partes", 0);
            x.bytes = me.optLong("bytes", 0);
            x.segundos = me.optInt("segundos", 0);
            x.sinLimite = me.optBoolean("sinLimite", false);
            x.rep = me.optInt("rep", 0);
            JSONObject c = me.optJSONObject("cmd");
            if (c != null) { x.cmdN = c.optInt("n", 0); x.cmd = c.optString("c", ""); }
            if (x.partes > 0 && ("audio".equals(x.tipo) || "video".equals(x.tipo) || "foto".equals(x.tipo))) d.medio = x;
        }
        JSONObject rc = o.optJSONObject("recordatorio");
        if (rc != null && !rc.optString("texto", "").trim().isEmpty()) {
            Recordatorio r = new Recordatorio();
            r.id = rc.optString("id", "");
            r.clave = rc.optString("clave", "");
            r.texto = rc.optString("texto").trim();
            r.texto2 = rc.optString("texto2", "").trim();
            r.foto = rc.isNull("foto") ? 0 : rc.optInt("foto", 0);
            r.confirmar = rc.optBoolean("confirmar", false);
            r.prueba = rc.optBoolean("prueba", false);
            r.hasta = recibidoMs + rc.optLong("segundos", 0) * 1000L;
            d.recordatorio = r;
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
            x.autor = m.isNull("autor") ? "" : m.optString("autor", "");
            x.foto = m.isNull("foto") ? 0 : m.optInt("foto", 0);
            if (!x.texto.isEmpty()) d.mensajes.add(x);
        }
        JSONArray es = o.optJSONArray("eventos");
        for (int i = 0; es != null && i < es.length(); i++) {
            JSONObject e = es.getJSONObject(i);
            Evento x = new Evento();
            x.manana = e.optInt("dia", 0) == 1;
            x.hora = e.optString("hora", "");
            x.titulo = e.optString("titulo", "").trim();
            x.autor = e.isNull("autor") ? "" : e.optString("autor", "");
            x.foto = e.isNull("foto") ? 0 : e.optInt("foto", 0);
            if (!x.titulo.isEmpty()) d.eventos.add(x);
        }
        JSONObject t = o.optJSONObject("tiempo");
        if (t != null && t.has("temp")) {
            d.hayTiempo = true;
            d.temperatura = (int) Math.round(t.optDouble("temp"));
            d.codigoTiempo = t.optInt("codigo", 3);
            d.hoy = dia(t.optJSONObject("hoy"));
            d.manana = dia(t.optJSONObject("manana"));
        }
        return d;
    }

    /** Resumen de lo que se ve: si no cambia entre una consulta y la siguiente, la pantalla no se repinta. */
    String firma() {
        StringBuilder b = new StringBuilder();
        b.append(verMensajes).append(verEventos).append(verTiempo).append(verCuenta).append(verParte);
        b.append(distribucionAhora()).append('|').append(nocheTexto).append('|').append(contactoNombre).append(contactoTelefono);
        for (Mensaje m : mensajes) b.append('|').append(m.de).append(m.texto).append(m.t).append(m.autor).append(m.foto);
        for (Evento e : eventos) b.append('|').append(e.manana).append(e.hora).append(e.titulo).append(e.autor).append(e.foto);
        if (hayTiempo) b.append('|').append(temperatura).append(codigoTiempo);
        if (hoy != null) b.append(hoy.temp).append(hoy.codigo);
        if (manana != null) b.append(manana.temp).append(manana.codigo);
        if (cuenta != null) b.append('|').append(cuenta.texto).append(cuenta.icono);
        if (recordatorio != null) b.append("|R").append(recordatorio.clave).append(recordatorio.texto).append(recordatorio.texto2).append(recordatorio.foto);
        return b.toString().hashCode() + "";
    }

    private static Dia dia(JSONObject o) {
        if (o == null || !o.has("temp")) return null;
        Dia x = new Dia();
        x.temp = (int) Math.round(o.optDouble("temp"));
        x.codigo = o.optInt("codigo", 3);
        x.max = (int) Math.round(o.optDouble("max", x.temp));
        x.min = (int) Math.round(o.optDouble("min", x.temp));
        return x;
    }

    /** Estilo y modo que se ven ahora, teniendo en cuenta "Probar 1 minuto". */
    boolean esNocheAhora(int hora) {
        return pruebaEstilo != null ? pruebaNoche : esNoche(hora);
    }

    static String valida(String d) {
        for (String x : DISTRIBUCIONES) if (x.equals(d)) return d;
        return "clasica";
    }

    /** La distribución que se ve ahora (la de "Probar 1 minuto" si hay una prueba en marcha). */
    String distribucionAhora() {
        return pruebaEstilo != null && pruebaDistribucion != null ? pruebaDistribucion : distribucion;
    }

    String estiloAhora(boolean noche) {
        return pruebaEstilo != null ? pruebaEstilo : (noche ? estiloNoche : estiloDia);
    }

    /** ¿Estamos en horario de noche? Admite tramos que cruzan la medianoche (21 a 6). */
    boolean esNoche(int hora) {
        if (nocheDesde == nocheHasta) return false;
        if (nocheDesde < nocheHasta) return hora >= nocheDesde && hora < nocheHasta;
        return hora >= nocheDesde || hora < nocheHasta;
    }
}
