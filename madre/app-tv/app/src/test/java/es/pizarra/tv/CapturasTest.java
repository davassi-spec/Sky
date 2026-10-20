package es.pizarra.tv;

import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
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

    private static String json(String estilo, String mensajes, String eventos, String tiempo, String cuenta) {
        return "{\"version\":2,\"noche\":{\"desde\":21,\"hasta\":6},\"nocheTexto\":\"Es hora de dormir.\","
                + "\"contacto\":{\"nombre\":\"Dani\",\"telefono\":\"600 000 000\"},"
                + "\"bloques\":[{\"id\":\"cuentaAtras\",\"activo\":true},{\"id\":\"mensajes\",\"activo\":true},{\"id\":\"proximo\",\"activo\":true},{\"id\":\"tiempo\",\"activo\":true},{\"id\":\"parteDelDia\",\"activo\":true}],"
                + "\"estiloDia\":\"" + estilo + "\",\"estiloNoche\":\"" + estilo + "\","
                + "\"mensajes\":[" + mensajes + "],\"eventos\":" + eventos + ",\"tiempo\":" + tiempo + ",\"cuentaAtras\":" + cuenta + "}";
    }

    private void foto() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        Bitmap b = Bitmap.createBitmap(300, 400, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(Color.rgb(222, 180, 140));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.rgb(90, 60, 40));
        c.drawCircle(150, 150, 70, p);
        p.setColor(Color.rgb(60, 90, 130));
        c.drawRect(60, 260, 240, 400, p);
        try (FileOutputStream o = new FileOutputStream(new File(ctx.getCacheDir(), "foto_p1_1.jpg"))) {
            b.compress(Bitmap.CompressFormat.JPEG, 90, o);
        }
    }

    private void captura(String nombre, String json, int dia, int h, int m) throws Exception {
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
            captura(e + "-noche", json(e, DANIEL + "," + ANA, EV_DIA, TIEMPO, "null"), 20, 22, 10);
        }
    }
}
