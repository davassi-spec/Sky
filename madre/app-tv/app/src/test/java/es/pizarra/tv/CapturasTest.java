package es.pizarra.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.View;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * Dibuja la pantalla real de la TV (la misma MainActivity) a 1920x1080 para cada estilo, de día y de noche,
 * con datos de ejemplo. Las capturas salen en la carpeta que se pase con -Dcapturas.dir=...
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 34, qualifiers = "w1920dp-h1080dp-mdpi")
public class CapturasTest {
    private static final String[] ESTILOS = {"calido", "lavanda", "salvia", "terracota", "contraste"};

    @After
    public void restaura() {
        Hora.fijar(null);
        IconoTiempo.fasePrueba = null;
    }

    private static long epoch(int dia, int h, int m) {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Madrid"));
        c.clear();
        c.set(2026, Calendar.OCTOBER, dia, h, m, 0);
        return c.getTimeInMillis() / 1000;
    }

    private static final String DANIEL = "{\"id\":\"1\",\"de\":\"Daniel\",\"texto\":\"Hoy viene Ana a las seis.\",\"t\":" + epoch(20, 16, 5) + ",\"autor\":\"p1\",\"foto\":1}";
    private static final String ANA = "{\"id\":\"2\",\"de\":\"Ana\",\"texto\":\"Llevaré la merienda. Te quiero, mamá.\",\"t\":" + epoch(20, 16, 40) + ",\"autor\":\"p2\",\"foto\":null}";
    private static final String LARGO = "{\"id\":\"3\",\"de\":\"María\",\"texto\":\"Mamá, hoy no puedo pasar a verte porque tengo trabajo hasta tarde, pero mañana a primera hora te llamo y quedamos para comer juntas, ¿vale? Un beso muy grande.\",\"t\":" + epoch(20, 11, 0) + ",\"autor\":\"p3\",\"foto\":null}";
    private static final String EV_DIA = "[{\"dia\":0,\"titulo\":\"Merienda con Ana\",\"hora\":\"18:30\",\"orden\":1},{\"dia\":0,\"titulo\":\"Cena\",\"hora\":\"21:00\",\"orden\":2},{\"dia\":1,\"titulo\":\"Viene Ana\",\"hora\":\"09:00\",\"orden\":3},{\"dia\":1,\"titulo\":\"Peluquería\",\"hora\":\"11:30\",\"orden\":4}]";
    private static final String TIEMPO = "{\"temp\":21,\"codigo\":2,\"hoy\":{\"temp\":21,\"codigo\":2,\"max\":23,\"min\":14},\"manana\":{\"temp\":19,\"codigo\":61,\"max\":19,\"min\":12}}";
    private static final String CUENTA = "{\"id\":\"c1\",\"texto\":\"Faltan 12 días para Todos los Santos\",\"icono\":\"calendario\",\"dias\":12}";

    private static final String REC = "{\"id\":\"rec1\",\"clave\":\"rec1|2026-10-20\",\"texto\":\"Hora de la merienda\",\"texto2\":\"En la cocina, con calma\",\"foto\":1,\"confirmar\":true,\"segundos\":600,\"prueba\":false}";
    private static final String REC_LARGO = "{\"id\":\"rec2\",\"clave\":\"rec2|2026-10-20\",\"texto\":\"Es hora de salir a pasear un ratito por el parque con tu bastón\",\"texto2\":\"Ponte el abrigo y las zapatillas cómodas. Vuelve antes de que oscurezca.\",\"foto\":null,\"confirmar\":false,\"segundos\":600,\"prueba\":false}";

    private static String json(String estilo, String mensajes, String eventos, String tiempo, String cuenta) {
        return json(estilo, mensajes, eventos, tiempo, cuenta, "null");
    }

    private static String json(String estilo, String mensajes, String eventos, String tiempo, String cuenta, String recordatorio) {
        return "{\"version\":2,\"noche\":{\"desde\":21,\"hasta\":6},\"nocheTexto\":\"Es hora de dormir.\","
                + "\"contacto\":{\"nombre\":\"Dani\",\"telefono\":\"600 000 000\"},"
                + "\"bloques\":[{\"id\":\"cuentaAtras\",\"activo\":true},{\"id\":\"mensajes\",\"activo\":true},{\"id\":\"proximo\",\"activo\":true},{\"id\":\"tiempo\",\"activo\":true},{\"id\":\"parteDelDia\",\"activo\":true}],"
                + "\"estiloDia\":\"" + estilo + "\",\"estiloNoche\":\"" + estilo + "\","
                + "\"mensajes\":[" + mensajes + "],\"eventos\":" + eventos + ",\"tiempo\":" + tiempo + ",\"cuentaAtras\":" + cuenta + ",\"recordatorio\":" + recordatorio + "}";
    }

    /** Fotos reales (de dominio público: un retrato y una taza de café) como si la TV ya las hubiera descargado. */
    private void foto() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        copia("/foto-familiar.jpg", new File(ctx.getCacheDir(), "foto_p1_1.jpg"));
        copia("/foto-recordatorio.jpg", new File(ctx.getCacheDir(), "foto_rec1_1.jpg"));
    }

    private void copia(String recurso, File destino) throws Exception {
        try (java.io.InputStream in = CapturasTest.class.getResourceAsStream(recurso); FileOutputStream out = new FileOutputStream(destino)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    private void captura(String nombre, String json, int dia, int h, int m) throws Exception {
        IconoTiempo.fasePrueba = 0.3f;          // la animación del tiempo congelada: las capturas salen siempre igual
        Context ctx = RuntimeEnvironment.getApplication();
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Madrid"));
        c.clear();
        c.set(2026, Calendar.OCTOBER, dia, h, m, 0);
        Hora.fijar(c);
        ctx.getSharedPreferences("pizarra", Context.MODE_PRIVATE).edit().putString("url", "http://127.0.0.1:1/x").putString("k", "k")
                .putString("cache", json).putLong("cacheT", System.currentTimeMillis()).commit();
        Activity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        View raiz = a.getWindow().getDecorView();
        for (int i = 0; i < 3; i++) {   // varias pasadas: el ajuste de letra se hace tras el primer reparto
            raiz.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
            raiz.layout(0, 0, 1920, 1080);
            ShadowLooper.idleMainLooper();      // como en la TV: lo que la pantalla deja pendiente (reajustes) se ejecuta
        }
        Bitmap b = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
        raiz.draw(new Canvas(b));
        File dir = new File(System.getProperty("capturas.dir"));
        dir.mkdirs();
        File f = new File(dir, nombre + ".png");
        try (FileOutputStream o = new FileOutputStream(f)) {
            b.compress(Bitmap.CompressFormat.PNG, 100, o);
        }
        assertTrue(f.length() > 10000);
    }

    @Test
    public void todosLosEstilos() throws Exception {
        foto();
        for (String e : ESTILOS) {
            captura(e + "-dia-completo", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-dia-cuenta-atras", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, CUENTA), 20, 17, 15);
            captura(e + "-dia-un-mensaje", json(e, DANIEL, EV_DIA, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-dia-mensaje-largo", json(e, LARGO, EV_DIA, TIEMPO, "null"), 20, 11, 40);
            captura(e + "-dia-sin-mensajes", json(e, "", EV_DIA, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-dia-sin-tiempo", json(e, DANIEL + "," + ANA, EV_DIA, "null", "null"), 20, 17, 15);
            captura(e + "-recordatorio", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null", REC), 20, 17, 15);
            captura(e + "-recordatorio-sin-foto-largo", json(e, DANIEL, EV_DIA, TIEMPO, "null", REC_LARGO), 20, 17, 15);
            captura(e + "-recordatorio-sin-mensajes", json(e, "", EV_DIA, TIEMPO, "null", REC), 20, 17, 15);
            captura(e + "-noche", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), 20, 22, 10);
        }
    }

    private static final String EV_MUCHOS = "[{\"dia\":0,\"titulo\":\"Merienda con Ana\",\"hora\":\"18:30\",\"orden\":1},{\"dia\":0,\"titulo\":\"Llamada de Javier\",\"hora\":\"19:15\",\"orden\":2},"
            + "{\"dia\":0,\"titulo\":\"Cena\",\"hora\":\"21:00\",\"orden\":3},{\"dia\":0,\"titulo\":\"Ver el programa\",\"hora\":\"21:30\",\"orden\":4},"
            + "{\"dia\":0,\"titulo\":\"Regar las plantas\",\"hora\":\"21:45\",\"orden\":5},{\"dia\":1,\"titulo\":\"Viene Ana\",\"hora\":\"09:00\",\"orden\":6}]";
    private static final String EV_SOLO_MANANA = "[{\"dia\":1,\"titulo\":\"Viene Ana\",\"hora\":\"09:00\",\"orden\":1}]";

    /** Los casos de la última tanda de cambios, en Lavanda y Cálido, de día y de noche. */
    @Test
    public void casosDeLaUltimaTanda() throws Exception {
        foto();
        for (String e : new String[]{"lavanda", "calido"}) {
            captura(e + "-p-dos-mensajes", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-p-un-mensaje", json(e, DANIEL, EV_DIA, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-p-sin-eventos", json(e, DANIEL + "," + ANA, EV_SOLO_MANANA, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-p-sin-eventos-ni-tiempo", json(e, DANIEL, "[]", "null", "null"), 20, 17, 15);
            captura(e + "-p-sin-mensajes-ni-eventos", json(e, "", "[]", TIEMPO, "null"), 20, 17, 15);
            captura(e + "-p-muchos-eventos", json(e, DANIEL + "," + ANA, EV_MUCHOS, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-p-noche-con-mensajes", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), 20, 22, 10);
            captura(e + "-p-noche-sin-eventos", json(e, DANIEL + "," + ANA, "[]", TIEMPO, "null"), 20, 22, 10);
            captura(e + "-p-noche-sin-mensajes-ni-eventos", json(e, "", "[]", TIEMPO, "null"), 20, 22, 10);
        }
    }

    private static String contacto(String json, String nombre, String telefono) {
        return json.replace("\"contacto\":{\"nombre\":\"Dani\",\"telefono\":\"600 000 000\"}", "\"contacto\":{\"nombre\":\"" + nombre + "\",\"telefono\":\"" + telefono + "\"}");
    }

    /** Textos largos y el teléfono: nada se corta; si no cabe, la letra baja (36 px como mínimo) y luego pasa a dos líneas. */
    @Test
    public void textosLargosYTelefono() throws Exception {
        foto();
        String largoEv = "[{\"dia\":0,\"titulo\":\"Cita con la doctora Fernández en el centro de salud del barrio\",\"hora\":\"18:30\",\"orden\":1},{\"dia\":0,\"titulo\":\"Cena\",\"hora\":\"21:00\",\"orden\":2},{\"dia\":1,\"titulo\":\"Visita de la prima Maricarmen con los niños\",\"hora\":\"09:00\",\"orden\":3}]";
        String cuentaLarga = "{\"id\":\"c1\",\"texto\":\"Faltan 12 días para el cumpleaños de la tía Maricarmen y de toda la familia reunida\",\"icono\":\"tarta\",\"dias\":12}";
        String nombreLargo = "{\"id\":\"9\",\"de\":\"Mª del Carmen Fernández\",\"texto\":\"Hoy no puedo ir.\",\"t\":" + epoch(20, 16, 5) + ",\"autor\":\"p9\",\"foto\":null}";
        for (String e : new String[]{"lavanda", "calido"}) {
            captura(e + "-q-contacto-emergencias", contacto(json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), "Emergencias", "061"), 20, 22, 10);
            captura(e + "-q-contacto-nombre-larguisimo", contacto(json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), "Servicio de Emergencias Sanitarias", "900 123 456"), 20, 22, 10);
            captura(e + "-q-telefono-061-solo", contacto(json(e, "", "[]", "null", "null"), "Emergencias", "061"), 20, 22, 10);
            captura(e + "-q-dormir-solo", contacto(json(e, "", "[]", "null", "null"), "", ""), 20, 22, 10);
            captura(e + "-q-evento-largo", json(e, DANIEL, largoEv, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-q-cuenta-larga", json(e, DANIEL, EV_DIA, TIEMPO, cuentaLarga), 20, 17, 15);
            captura(e + "-q-nombre-largo", json(e, nombreLargo + "," + ANA, EV_DIA, TIEMPO, "null"), 20, 17, 15);
            captura(e + "-q-noche-evento-largo", json(e, "", largoEv, TIEMPO, "null"), 20, 22, 10);
        }
    }

    /** La vista previa del panel es una foto real de la pantalla: pequeña, en JPEG y que cabe en la caché del script. */
    @Test
    public void laCapturaParaElPanel() throws Exception {
        foto();
        Context ctx = RuntimeEnvironment.getApplication();
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Madrid"));
        c.clear();
        c.set(2026, Calendar.OCTOBER, 20, 17, 15, 0);
        Hora.fijar(c);
        ctx.getSharedPreferences("pizarra", Context.MODE_PRIVATE).edit().putString("url", "http://127.0.0.1:1/x").putString("k", "k")
                .putString("cache", json("lavanda", DANIEL + "," + ANA, EV_DIA, TIEMPO, "null")).putLong("cacheT", System.currentTimeMillis()).commit();
        Activity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        View raiz = a.getWindow().getDecorView();
        for (int i = 0; i < 3; i++) {
            raiz.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
            raiz.layout(0, 0, 1920, 1080);
            ShadowLooper.idleMainLooper();
        }
        Bitmap b = Captura.dibujar(raiz);
        assertTrue(b != null && b.getWidth() == Captura.ANCHO && b.getHeight() == Captura.ALTO);
        String b64 = Captura.comprimir(b);
        assertTrue("cabe en la caché del script", b64.length() <= 90000 && b64.length() > 1000);
        assertTrue("es un JPEG", b64.startsWith("/9j/"));
        File dir = new File(System.getProperty("capturas.dir"));
        dir.mkdirs();
        try (FileOutputStream o = new FileOutputStream(new File(dir, "captura-para-el-panel.jpg"))) {
            o.write(android.util.Base64.decode(b64, android.util.Base64.DEFAULT));
        }
    }

    private static String conDistribucion(String json, String dist) {
        return json.replace("\"version\":2", "\"version\":2,\"distribucion\":\"" + dist + "\"");
    }

    /** Las cuatro distribuciones, con dos estilos, de día y de noche, y con todos los casos (vacíos, cuenta atrás, recordatorio…). */
    @Test
    public void distribuciones() throws Exception {
        foto();
        for (String d : new String[]{"clasica", "reloj", "lista", "sencillo"}) {
            for (String e : new String[]{"lavanda", "calido"}) {
                String n = "d4-" + d + "-" + e + "-";
                captura(n + "dia-completo", conDistribucion(json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), d), 20, 17, 15);
                captura(n + "dia-un-mensaje", conDistribucion(json(e, DANIEL, EV_DIA, TIEMPO, "null"), d), 20, 17, 15);
                captura(n + "dia-mensaje-largo", conDistribucion(json(e, LARGO + "," + ANA, EV_DIA, TIEMPO, "null"), d), 20, 11, 40);
                captura(n + "dia-cuenta-atras", conDistribucion(json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, CUENTA), d), 20, 17, 15);
                captura(n + "dia-sin-mensajes", conDistribucion(json(e, "", EV_DIA, TIEMPO, "null"), d), 20, 17, 15);
                captura(n + "dia-sin-eventos", conDistribucion(json(e, DANIEL + "," + ANA, EV_SOLO_MANANA, TIEMPO, "null"), d), 20, 17, 15);
                captura(n + "dia-sin-tiempo", conDistribucion(json(e, DANIEL + "," + ANA, EV_DIA, "null", "null"), d), 20, 17, 15);
                captura(n + "dia-solo-mensajes", conDistribucion(json(e, DANIEL + "," + ANA, "[]", "null", "null"), d), 20, 17, 15);
                captura(n + "dia-nada", conDistribucion(json(e, "", "[]", "null", "null"), d), 20, 17, 15);
                captura(n + "noche", conDistribucion(json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), d), 20, 22, 10);
                captura(n + "noche-sin-mensajes", conDistribucion(json(e, "", EV_DIA, TIEMPO, "null"), d), 20, 22, 10);
                captura(n + "noche-nada", conDistribucion(json(e, "", "[]", "null", "null"), d), 20, 22, 10);
                captura(n + "recordatorio", conDistribucion(json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null", REC), d), 20, 17, 15);
            }
        }
    }


    /** El caso real de la TV: sin mensajes, un solo evento (de mañana), tiempo y cuenta atrás; en las cuatro distribuciones. */
    @Test
    public void casoRealSinMensajesSoloManana() throws Exception {
        foto();
        String ev = "[{\"dia\":1,\"titulo\":\"Talleres\",\"hora\":\"12:00\",\"orden\":1}]";
        String cuenta = "{\"id\":\"c1\",\"texto\":\"Faltan 11 días para Tots Sants\",\"icono\":\"calendario\",\"dias\":11}";
        for (String d : new String[]{"clasica", "reloj", "lista", "sencillo"}) {
            captura("r1-" + d + "-calido-caso-real", conDistribucion(json("calido", "", ev, TIEMPO, cuenta), d), 20, 17, 15);
            captura("r4-" + d + "-calido-analitica-manana", conDistribucion(json("calido", "", "[{\"dia\":1,\"titulo\":\"Analítica Mamá\",\"hora\":\"07:45\",\"orden\":1}]", TIEMPO, "null"), d), 20, 12, 43);
            assertTrue(d + ": una cita solo de mañana se ve de día", contenidoDelCuerpo(new File(System.getProperty("capturas.dir"), "r4-" + d + "-calido-analitica-manana.png")) > 8);
            captura("r1-" + d + "-calido-solo-la-hora", conDistribucion(json("calido", "", "[]", "null", "null"), d), 20, 17, 15);
        }
    }


    /** Porcentaje de píxeles del cuerpo (debajo de la cabecera) que no son del color de fondo: si es ~0, la pantalla está en blanco. */
    private static double contenidoDelCuerpo(File png) {
        Bitmap b = BitmapFactory.decodeFile(png.getPath());
        int fondo = b.getPixel(4, 4), n = 0, total = 0;
        for (int y = 700; y < 1040; y += 4) for (int x = 60; x < 1860; x += 4) { total++; if (b.getPixel(x, y) != fondo) n++; }
        return 100.0 * n / total;
    }

    /** Ninguna distribución se queda en blanco: con todo vacío, sin datos, o si una de ellas falla al dibujar. */
    @Test
    public void ningunaDistribucionEnBlanco() throws Exception {
        foto();
        File dir = new File(System.getProperty("capturas.dir"));
        String ev = "[{\"dia\":1,\"titulo\":\"Talleres\",\"hora\":\"12:00\",\"orden\":1}]";
        String cuenta = "{\"id\":\"c1\",\"texto\":\"Faltan 11 días para Tots Sants\",\"icono\":\"calendario\",\"dias\":11}";
        for (String d : new String[]{"clasica", "reloj", "lista", "sencillo"}) {
            captura("r2-" + d + "-caso-real", conDistribucion(json("calido", "", ev, TIEMPO, cuenta), d), 20, 17, 15);
            assertTrue(d + " caso real: el cuerpo no está vacío", contenidoDelCuerpo(new File(dir, "r2-" + d + "-caso-real.png")) > 3);
            captura("r2-" + d + "-sin-datos", "", 20, 17, 15);
            assertTrue(d + " sin datos: dice algo", contenidoDelCuerpo(new File(dir, "r2-" + d + "-sin-datos.png")) > 1);
        }
        MainActivity.fallaDePrueba = "reloj";
        try {
            captura("r2-reloj-que-falla-se-ve-clasica", conDistribucion(json("calido", DANIEL, EV_DIA, TIEMPO, cuenta), "reloj"), 20, 17, 15);
        } finally {
            MainActivity.fallaDePrueba = null;
        }
        assertTrue("si falla, se ve la Clásica con su contenido", contenidoDelCuerpo(new File(dir, "r2-reloj-que-falla-se-ve-clasica.png")) > 5);
    }

    /** Nunca se parte una palabra: recordatorios y textos que no caben. */
    @Test
    public void palabrasEnterasEnElRecordatorio() throws Exception {
        foto();
        String[] frases = {"Toma Medicina Mamá", "Hora de la fisioterapia", "Recuerda llamar a la farmacia", "Anticonstitucionalmente electroencefalografista"};
        int i = 0;
        for (String f : frases) {
            String rec = "{\"id\":\"rec9\",\"clave\":\"rec9|2026-10-20\",\"texto\":\"" + f + "\",\"texto2\":\"\",\"foto\":null,\"confirmar\":true,\"segundos\":600,\"prueba\":false}";
            for (String e : new String[]{"calido", "lavanda"})
                captura("r3-" + e + "-recordatorio-" + (++i), json(e, "", EV_DIA, TIEMPO, "null", rec), 20, 17, 15);
        }
    }

    @Test
    public void recortarNuncaParteUnaPalabra() {
        android.text.TextPaint tp = new android.text.TextPaint();
        tp.setTextSize(40);
        int ancho = 400;
        String r = TextoAjustado.recortar("Hoy viene la prima Maricarmen con los niños a merendar y luego se van al cine todos juntos", tp, ancho, 2, 0);
        assertTrue(r, r.endsWith("…"));
        for (String w : r.replace("…", "").trim().split(" ")) assertTrue(w, "Hoy viene la prima Maricarmen con los niños a merendar y luego se van al cine todos juntos".contains(w));
        assertTrue(new android.text.StaticLayout(r, tp, ancho, android.text.Layout.Alignment.ALIGN_NORMAL, 1f, 0, false).getLineCount() <= 2);
        String larga = TextoAjustado.recortar("Anticonstitucionalmente", tp, 200, 2, 0);
        assertTrue(larga, larga.endsWith("…") && tp.measureText(larga) <= 200);
        assertTrue("lo que cabe no se toca", TextoAjustado.recortar("Toma Medicina", tp, ancho, 2, 0).equals("Toma Medicina"));
    }


    /** Los siete tableros nuevos, de día y de noche, con todos los casos. */
    @Test
    public void tableros() throws Exception {
        foto();
        File dir = new File(System.getProperty("capturas.dir"));
        String ev = "[{\"dia\":0,\"titulo\":\"Merienda con Ana\",\"hora\":\"18:30\",\"orden\":1},{\"dia\":1,\"titulo\":\"Analítica Mamá\",\"hora\":\"07:45\",\"orden\":2}]";
        String cuenta = "{\"id\":\"c1\",\"texto\":\"Faltan 7 días para Tots Sants\",\"icono\":\"calendario\",\"dias\":7}";
        for (String d : new String[]{"banda", "mosaico", "bloques", "lateral", "titular", "marco", "limpia", "salvia_melocoton", "coral_menta", "salvia_azul", "menta_lavanda", "azul_terracota", "bosque_amarillo"}) {
            String n = "t7-" + d + "-";
            captura(n + "solo-hora-y-tiempo", conDistribucion(json("calido", "", "[]", TIEMPO, cuenta), d), 25, 12, 33);
            captura(n + "sin-cuenta-atras", conDistribucion(json("calido", "", "[]", TIEMPO, "null"), d), 25, 12, 33);
            captura(n + "dos-mensajes", conDistribucion(json("calido", DANIEL + "," + ANA, ev, TIEMPO, cuenta), d), 20, 17, 15);
            captura(n + "un-mensaje", conDistribucion(json("calido", DANIEL, "[]", TIEMPO, "null"), d), 20, 17, 15);
            captura(n + "mensaje-largo", conDistribucion(json("calido", LARGO + "," + ANA, ev, TIEMPO, "null"), d), 20, 11, 40);
            captura(n + "solo-cita", conDistribucion(json("calido", "", ev, TIEMPO, "null"), d), 20, 17, 15);
            captura(n + "sin-tiempo", conDistribucion(json("calido", DANIEL, ev, "null", cuenta), d), 20, 17, 15);
            captura(n + "nada", conDistribucion(json("calido", "", "[]", "null", "null"), d), 20, 17, 15);
            captura(n + "noche", conDistribucion(json("calido", DANIEL, ev, TIEMPO, cuenta), d), 20, 22, 10);
            captura(n + "recordatorio", conDistribucion(json("calido", DANIEL, ev, TIEMPO, "null", REC), d), 20, 17, 15);
            assertTrue(d + ": solo con la hora y el tiempo se ve", contenidoDelCuerpo(new File(dir, n + "solo-hora-y-tiempo.png")) > 8);
            assertTrue(d + ": con mensajes se ve", contenidoDelCuerpo(new File(dir, n + "dos-mensajes.png")) > 8);
            assertTrue(d + ": sin nada de datos tampoco se queda en blanco", contenidoDelCuerpo(new File(dir, n + "nada.png")) > 1);
        }
    }

    @Test
    public void unaDistribucionDesconocidaSeVeComoLaClasica() {
        assertEquals("clasica", Datos.valida("holograma"));
        for (String d : new String[]{"banda", "mosaico", "bloques", "lateral", "titular", "marco", "limpia", "salvia_melocoton", "coral_menta", "salvia_azul", "menta_lavanda", "azul_terracota", "bosque_amarillo"}) assertEquals(d, Datos.valida(d));
    }


    /** Las citas: la hora en cifras (7:45) y, con varias, se turnan de una en una. */
    @Test
    public void citasEnCifrasYTurnandose() throws Exception {
        foto();
        File dir = new File(System.getProperty("capturas.dir"));
        String dos = "[{\"dia\":1,\"titulo\":\"Analítica Mamá\",\"hora\":\"07:45\",\"orden\":1},{\"dia\":1,\"titulo\":\"Fisioterapia con Marta\",\"hora\":\"11:30\",\"orden\":2}]";
        assertEquals("7:45", Texto.horaNumerica("07:45"));
        assertEquals("18:30", Texto.horaNumerica("18:30"));
        assertEquals("0:05", Texto.horaNumerica("00:05"));
        assertEquals("", Texto.horaNumerica("")); 
        assertEquals("", Texto.horaNumerica("25:00"));
        for (String d : new String[]{"clasica", "reloj", "lista", "sencillo", "banda", "mosaico", "bloques", "lateral", "titular", "marco", "limpia", "salvia_melocoton", "bosque_amarillo"}) {
            captura("c8-" + d + "-dos-citas-primera", conDistribucion(json("calido", ANA, dos, TIEMPO, "null"), d), 25, 19, 15);
            assertTrue(d + ": la cita se ve", contenidoDelCuerpo(new File(dir, "c8-" + d + "-dos-citas-primera.png")) > 8);
        }
        // pasados unos segundos, aparece la segunda
        Context ctx = RuntimeEnvironment.getApplication();
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Madrid"));
        c.clear();
        c.set(2026, Calendar.OCTOBER, 25, 19, 15, 0);
        Hora.fijar(c);
        IconoTiempo.fasePrueba = 0.3f;
        ctx.getSharedPreferences("pizarra", Context.MODE_PRIVATE).edit().putString("url", "http://127.0.0.1:1/x").putString("k", "k")
                .putString("cache", conDistribucion(json("calido", ANA, dos, TIEMPO, "null"), "clasica")).putLong("cacheT", System.currentTimeMillis()).commit();
        Activity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        View raiz = a.getWindow().getDecorView();
        for (int i = 0; i < 3; i++) {
            raiz.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
            raiz.layout(0, 0, 1920, 1080);
            ShadowLooper.idleMainLooper();
        }
        assertTrue("al principio sale la primera", textos(raiz).contains("Analítica Mamá") && textos(raiz).contains("7:45") && textos(raiz).contains("1 de 2"));
        ShadowLooper.idleMainLooper(9, java.util.concurrent.TimeUnit.SECONDS);
        for (int i = 0; i < 3; i++) {
            raiz.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
            raiz.layout(0, 0, 1920, 1080);
            ShadowLooper.idleMainLooper();
        }
        String t2 = textos(raiz);
        assertTrue("a los 9 segundos sale la segunda: " + t2, t2.contains("Fisioterapia con Marta") && t2.contains("11:30") && t2.contains("2 de 2") && !t2.contains("Analítica Mamá"));
        Bitmap b = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
        raiz.draw(new Canvas(b));
        try (FileOutputStream o = new FileOutputStream(new File(dir, "c8-clasica-dos-citas-segunda.png"))) {
            b.compress(Bitmap.CompressFormat.PNG, 100, o);
        }
        ShadowLooper.idleMainLooper(9, java.util.concurrent.TimeUnit.SECONDS);
        assertTrue("y vuelve a la primera", textos(raiz).contains("Analítica Mamá"));
    }

    private static String textos(View v) {
        StringBuilder sb = new StringBuilder();
        if (v instanceof android.widget.TextView && v.getVisibility() == View.VISIBLE) sb.append(((android.widget.TextView) v).getText()).append('\n');
        if (v instanceof android.view.ViewGroup && v.getVisibility() == View.VISIBLE) {
            android.view.ViewGroup g = (android.view.ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) sb.append(textos(g.getChildAt(i)));
        }
        return sb.toString();
    }


    /** Todos los mensajes se ven, de uno en uno, cada uno con la hora a la que se mandó, y pasan solos. */
    @Test
    public void mensajesTurnandose() throws Exception {
        foto();
        File dir = new File(System.getProperty("capturas.dir"));
        String tres = DANIEL + "," + ANA + ",{\"id\":\"9\",\"de\":\"María\",\"texto\":\"Hola mamá, ¿me llamas para saludarte? No tengo trabajo y estoy muy aburrida. Besos.\",\"t\":" + epoch(20, 16, 56) + ",\"autor\":\"p3\",\"foto\":null}";
        assertEquals(12000, MainActivity.lecturaMs(msg("Te quiero")));
        assertEquals(40000, MainActivity.lecturaMs(msg(new String(new char[400]).replace('\0', 'x'))));
        for (String d : new String[]{"clasica", "reloj", "lista", "sencillo", "banda", "mosaico", "salvia_melocoton", "bosque_amarillo"}) {
            captura("m9-" + d + "-tres-mensajes", conDistribucion(json("calido", tres, EV_DIA, TIEMPO, "null"), d), 20, 17, 15);
            assertTrue(d + ": se ve", contenidoDelCuerpo(new File(dir, "m9-" + d + "-tres-mensajes.png")) > 8);
        }
        Context ctx = RuntimeEnvironment.getApplication();
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Madrid"));
        c.clear();
        c.set(2026, Calendar.OCTOBER, 20, 17, 15, 0);
        Hora.fijar(c);
        IconoTiempo.fasePrueba = 0.3f;
        ctx.getSharedPreferences("pizarra", Context.MODE_PRIVATE).edit().putString("url", "http://127.0.0.1:1/x").putString("k", "k")
                .putString("cache", conDistribucion(json("calido", tres, EV_DIA, TIEMPO, "null"), "clasica")).putLong("cacheT", System.currentTimeMillis()).commit();
        Activity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        View raiz = a.getWindow().getDecorView();
        String[][] esperado = {{"Hoy viene Ana a las seis.", "1 de 3", "Enviado a las 16:05"}, {"Llevaré la merienda", "2 de 3", "Enviado a las 16:40"}, {"Hola mamá", "3 de 3", "Enviado a las 16:56"}, {"Hoy viene Ana a las seis.", "1 de 3", "Enviado a las 16:05"}};
        for (int k = 0; k < esperado.length; k++) {
            for (int i = 0; i < 3; i++) {
                raiz.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
                raiz.layout(0, 0, 1920, 1080);
                ShadowLooper.idleMainLooper();
            }
            String t = textos(raiz);
            for (String e : esperado[k]) assertTrue("mensaje " + (k + 1) + " debería tener «" + e + "»:\n" + t, t.contains(e));
            if (k < 2) {
                Bitmap b = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
                raiz.draw(new Canvas(b));
                try (FileOutputStream o = new FileOutputStream(new File(dir, "m9-clasica-mensaje-" + (k + 1) + ".png"))) {
                    b.compress(Bitmap.CompressFormat.PNG, 100, o);
                }
            }
            ShadowLooper.idleMainLooper(MainActivity.lecturaMs(msgDe(k)) + 1000, java.util.concurrent.TimeUnit.MILLISECONDS);
        }
    }

    private static Datos.Mensaje msg(String texto) {
        Datos.Mensaje m = new Datos.Mensaje();
        m.texto = texto;
        return m;
    }

    private static Datos.Mensaje msgDe(int k) {
        return msg(new String[]{"Hoy viene Ana a las seis.", "Llevaré la merienda. Te quiero, mamá.", "Hola mamá, ¿me llamas para saludarte? No tengo trabajo y estoy muy aburrida. Besos."}[k % 3]);
    }

    private static String conMedio(String json, String medio) {
        return json.replace("\"version\":2", "\"version\":2,\"rapido\":true,\"medio\":" + medio);
    }

    private static String medio(String tipo, String de, String texto, String mime, int segundos) {
        return "{\"orden\":\"1\",\"id\":\"m1\",\"tipo\":\"" + tipo + "\",\"de\":\"" + de + "\",\"texto\":\"" + texto + "\",\"partes\":1,\"bytes\":100,\"mime\":\"" + mime
                + "\",\"segundos\":" + segundos + ",\"cmd\":{\"n\":0,\"c\":\"\"},\"rep\":0,\"sinLimite\":false}";
    }

    private void capturaMedio(String nombre, String medio, boolean esperando) throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        File f = new File(ctx.getCacheDir(), "envio.jpg");
        copia("/foto-recordatorio.jpg", f);
        Medios.archivoDePrueba = f;
        Medios.sinReproducir = true;
        Medios.congelarDescarga = esperando;
        Bitmap pos = BitmapFactory.decodeFile(f.getPath());
        Medios.posterDePrueba = pos;
        try {
            Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Madrid"));
            c.clear();
            c.set(2026, Calendar.OCTOBER, 20, 17, 15, 0);
            Hora.fijar(c);
            String json = conMedio(json("lavanda", DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), medio);
            ctx.getSharedPreferences("pizarra", Context.MODE_PRIVATE).edit().putString("url", "http://127.0.0.1:1/x").putString("k", "k")
                    .putString("cache", json).putLong("cacheT", System.currentTimeMillis()).commit();
            MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
            a.mostrarMedioDePrueba(json);
            for (int i = 0; i < 5; i++) {
                Thread.sleep(120);
                ShadowLooper.idleMainLooper();
                View raiz = a.getWindow().getDecorView();
                raiz.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
                raiz.layout(0, 0, 1920, 1080);
            }
            Bitmap b = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
            a.getWindow().getDecorView().draw(new Canvas(b));
            File dir = new File(System.getProperty("capturas.dir"));
            dir.mkdirs();
            try (FileOutputStream o = new FileOutputStream(new File(dir, nombre + ".png"))) {
                b.compress(Bitmap.CompressFormat.PNG, 100, o);
            }
        } finally {
            Medios.congelarDescarga = false;
            Medios.archivoDePrueba = null;
            Medios.sinReproducir = false;
            Medios.posterDePrueba = null;
        }
    }

    /** Las pantallas de una foto, un vídeo y un audio que manda la familia. */
    @Test
    public void fotosAudiosYVideos() throws Exception {
        foto();
        capturaMedio("d5-foto-con-texto", medio("foto", "Ana", "Mira qué bonito está el jardín", "image/jpeg", 300), false);
        capturaMedio("d5-foto-sin-texto", medio("foto", "María", "", "image/jpeg", 0), false);
        capturaMedio("d5-video", medio("video", "Ana", "", "video/mp4", 0), false);
        capturaMedio("d5-audio", medio("audio", "Daniel", "", "audio/wav", 0), false);
        capturaMedio("d5-llegando-video", medio("video", "Ana", "", "video/mp4", 0), true);
    }

    /** El caso de la TV real: "Toma Medicina a Mamá" con una foto vertical; la palabra larga no puede partirse. */
    @Test
    public void recordatorioConPalabraLargaYFotoVertical() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        copia("/foto-vertical.jpg", new File(ctx.getCacheDir(), "foto_rec3_1.jpg"));
        foto();
        String rec = "{\"id\":\"rec3\",\"clave\":\"rec3|2026-10-20\",\"texto\":\"Toma Medicina a Mamá\",\"texto2\":\"\",\"foto\":1,\"confirmar\":true,\"segundos\":600,\"prueba\":false}";
        for (String e : ESTILOS) captura(e + "-recordatorio-palabra-larga-foto-vertical", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null", rec), 20, 11, 22);
        String rec2 = rec.replace("Toma Medicina a Mamá", "Hidratación y medicación después del desayuno");
        captura("lavanda-recordatorio-palabra-larga-2", json("lavanda", DANIEL, EV_DIA, TIEMPO, "null", rec2), 20, 11, 22);
    }

    private static final String EV_VISITAS = "[{\"dia\":0,\"titulo\":\"Viene la asistenta\",\"hora\":\"17:30\",\"orden\":\"17:30\"},"
            + "{\"dia\":0,\"titulo\":\"Viene Ana\",\"hora\":\"18:00\",\"orden\":\"18:00\",\"autor\":\"p1\",\"foto\":1},"
            + "{\"dia\":0,\"titulo\":\"Cena\",\"hora\":\"21:00\",\"orden\":\"21:00\"},"
            + "{\"dia\":1,\"titulo\":\"Viene Javier\",\"hora\":\"11:00\",\"orden\":\"11:00\",\"autor\":\"p1\",\"foto\":1}]";

    /** "Hoy viene…" (con la foto de quien viene) y la rutina de la semana, en las cuatro distribuciones. */
    @Test
    public void hoyVieneYRutinaSemanal() throws Exception {
        foto();
        for (String d : new String[]{"clasica", "reloj", "lista", "sencillo"}) {
            captura("d6-" + d + "-lavanda-dia-hoy-viene", conDistribucion(json("lavanda", DANIEL + "," + ANA, EV_VISITAS, TIEMPO, "null"), d), 20, 17, 15);
            captura("d6-" + d + "-calido-noche-manana-viene", conDistribucion(json("calido", DANIEL, EV_VISITAS, TIEMPO, "null"), d), 20, 22, 10);
        }
        String solo = "[{\"dia\":0,\"titulo\":\"Viene Ana\",\"hora\":\"18:00\",\"orden\":\"18:00\",\"autor\":\"p1\",\"foto\":1}]";
        captura("d6-clasica-lavanda-dia-solo-ana", json("lavanda", DANIEL, solo, TIEMPO, "null"), 20, 17, 15);
    }
}
