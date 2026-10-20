package es.pizarra.tv;

import java.util.Calendar;

/** El reloj de la app. Las pruebas pueden fijar una hora para que las capturas salgan siempre igual. */
final class Hora {
    private static Calendar fija;

    private Hora() {}

    static Calendar ahora() {
        return fija != null ? (Calendar) fija.clone() : Calendar.getInstance();
    }

    /** Solo para pruebas. null devuelve el reloj real. */
    static void fijar(Calendar c) {
        fija = c;
    }
}
