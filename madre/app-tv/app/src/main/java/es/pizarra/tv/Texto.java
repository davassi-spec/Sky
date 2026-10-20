package es.pizarra.tv;

import java.util.Calendar;

/** Frases en español para la pantalla: el día, la hora dicha con palabras, el consejo del tiempo. */
final class Texto {
    private static final String[] DIAS = {"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"};
    private static final String[] MESES = {"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
            "agosto", "septiembre", "octubre", "noviembre", "diciembre"};
    private static final String[] HORAS = {"", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
            "nueve", "diez", "once", "doce"};
    private static final String[] NUM = {"", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
            "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho",
            "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
            "veintiséis", "veintisiete", "veintiocho", "veintinueve"};

    /** Franjas del día para la barra de arriba. */
    static final int MANANA = 0, TARDE = 1, NOCHE = 2;

    private Texto() {}

    static String nombreDia(Calendar c) {
        String d = DIAS[c.get(Calendar.DAY_OF_WEEK) - 1];
        return Character.toUpperCase(d.charAt(0)) + d.substring(1);
    }

    /** "20 de octubre de 2026" */
    static String fecha(Calendar c) {
        return c.get(Calendar.DAY_OF_MONTH) + " de " + MESES[c.get(Calendar.MONTH)] + " de " + c.get(Calendar.YEAR);
    }

    /** La hora en cifras, de 1 a 12: "5:15". */
    static String horaCifras(Calendar c) {
        int h = c.get(Calendar.HOUR_OF_DAY) % 12;
        int m = c.get(Calendar.MINUTE);
        return (h == 0 ? 12 : h) + ":" + (m < 10 ? "0" : "") + m;
    }

    /** "Son las cinco y cuarto", "Es la una en punto", "Son las doce menos veinte". */
    static String horaHablada(Calendar c) {
        int h = c.get(Calendar.HOUR_OF_DAY) % 12;
        int m = c.get(Calendar.MINUTE);
        int hora = m > 30 ? (h + 1) % 12 : h;     // a partir de y 31 se dice "menos"
        if (hora == 0) hora = 12;
        String verbo = hora == 1 ? "Es la " : "Son las ";
        String resto;
        if (m == 0) resto = " en punto";
        else if (m == 15) resto = " y cuarto";
        else if (m == 30) resto = " y media";
        else if (m == 45) resto = " menos cuarto";
        else if (m == 1) resto = " y un minuto";
        else if (m == 59) resto = " menos un minuto";
        else if (m < 30) resto = " y " + NUM[m];
        else resto = " menos " + NUM[60 - m];
        return verbo + HORAS[hora] + resto;
    }

    /** "Son las cinco y cuarto de la tarde": la hora dicha con la parte del día. */
    /** "Son las cinco y cuarto de la tarde": la hora dicha con la parte del día. */
    static String horaConParte(Calendar c) {
        return horaHablada(c) + " " + parteDelDia(c.get(Calendar.HOUR_OF_DAY));
    }

    /** Según la hora real: a las 11:40 sigue siendo "de la mañana" aunque se diga "las doce menos veinte". */
    static String parteDelDia(int h) {
        if (h == 0) return "de la noche";
        if (h < 6) return "de la madrugada";
        if (h < 12) return "de la mañana";
        if (h == 12) return "del mediodía";
        if (h < 20) return "de la tarde";
        return "de la noche";
    }

    /** La etiqueta grande de debajo de la hora. */
    static String etiquetaParte(int h) {
        if (h >= 6 && h < 12) return "Por la mañana";
        if (h == 12) return "Al mediodía";
        if (h > 12 && h < 20) return "Por la tarde";
        return "De noche";
    }

    /** Mañana 6:00-11:59, tarde 12:00-19:59, noche 20:00-5:59. */
    static int franja(int hora) {
        if (hora >= 6 && hora < 12) return MANANA;
        if (hora >= 12 && hora < 20) return TARDE;
        return NOCHE;
    }

    static String franjaActiva(int hora) {
        if (hora == 12) return "Ahora es mediodía";
        switch (franja(hora)) {
            case MANANA: return "Ahora es por la mañana";
            case TARDE: return "Ahora es por la tarde";
            default: return "Ahora es de noche";
        }
    }

    /** Título de la tarjeta de eventos durante el día. */
    static String tituloEventos(int hora) {
        return hora < 12 ? "Esta mañana" : "Esta tarde";
    }

    /** "Lo escribió hoy, al mediodía" */
    static String cuandoEscribio(long segundos, Calendar ahora) {
        Calendar t = Calendar.getInstance();
        t.setTimeInMillis(segundos * 1000);
        Calendar ayer = (Calendar) ahora.clone();
        ayer.add(Calendar.DAY_OF_YEAR, -1);
        String dia;
        if (mismoDia(t, ahora)) dia = "hoy";
        else if (mismoDia(t, ayer)) dia = "ayer";
        else dia = "el " + DIAS[t.get(Calendar.DAY_OF_WEEK) - 1];
        int h = t.get(Calendar.HOUR_OF_DAY);
        String parte;
        if (h < 6) parte = "de madrugada";
        else if (h < 12) parte = "por la mañana";
        else if (h == 12) parte = "al mediodía";
        else if (h < 20) parte = "por la tarde";
        else parte = "por la noche";
        return "Lo escribió " + dia + ", " + parte;
    }

    private static boolean mismoDia(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    /** Códigos del tiempo de Open-Meteo (WMO) a una frase corta. */
    static String estadoDelTiempo(int codigo) {
        switch (codigo) {
            case 0: return "Despejado";
            case 1: return "Casi despejado";
            case 2: return "Algo nublado";
            case 3: return "Nublado";
            case 45: case 48: return "Niebla";
            case 51: case 53: case 55: return "Llovizna";
            case 61: case 63: return "Lluvia";
            case 65: return "Lluvia fuerte";
            case 71: case 73: case 75: return "Nieve";
            case 80: case 81: return "Chubascos";
            case 82: return "Chubascos fuertes";
            case 95: case 96: case 99: return "Tormenta";
            default: return "";
        }
    }

    static int iconoDeLaCuenta(String nombre) {
        if ("avion".equals(nombre)) return R.drawable.ic_avion;
        if ("corazon".equals(nombre)) return R.drawable.ic_corazon;
        if ("tarta".equals(nombre)) return R.drawable.ic_tarta;
        return R.drawable.ic_calendario;
    }

    static int iconoDelTiempo(int codigo) {
        switch (codigo) {
            case 0: case 1: return R.drawable.ic_t_sol;
            case 2: return R.drawable.ic_t_parcial;
            case 45: case 48: return R.drawable.ic_t_niebla;
            case 51: case 53: case 55: case 61: case 63: case 65: case 80: case 81: case 82:
                return R.drawable.ic_t_lluvia;
            case 71: case 73: case 75: return R.drawable.ic_t_nieve;
            case 95: case 96: case 99: return R.drawable.ic_t_tormenta;
            default: return R.drawable.ic_t_nube;
        }
    }

    /** Una frase corta sobre cómo vestirse, según la temperatura y el tiempo. */
    static String consejo(int temperatura, int codigo) {
        boolean lluvia = (codigo >= 51 && codigo <= 65) || (codigo >= 80 && codigo <= 82);
        if (codigo >= 95) return "Mejor quédate en casa.";
        if (codigo >= 71 && codigo <= 75) return "Si sales, abrígate bien.";
        if (lluvia) return "Si sales, lleva paraguas.";
        if (temperatura <= 8) return "Hace mucho frío. Abrígate.";
        if (temperatura <= 14) return "Si sales, lleva abrigo.";
        if (temperatura <= 20) return "Si sales, lleva chaqueta.";
        if (temperatura <= 24) return "Si sales, chaqueta fina.";
        if (temperatura <= 29) return "Hace calor. Ropa fresca.";
        return "Mucho calor. Bebe agua.";
    }
}
