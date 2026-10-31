package es.pizarra.tv;

import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.graphics.Canvas;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;

/** Los dibujos del tiempo se mueven (cada categoría cambia de un instante a otro) y no se quedan en blanco. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 34, qualifiers = "w1920dp-h1080dp-mdpi")
public class IconoTiempoTest {
    @After
    public void restaura() {
        IconoTiempo.fasePrueba = null;
    }

    private static Bitmap dibuja(int codigo, float fase) {
        IconoTiempo.fasePrueba = fase;
        IconoTiempo v = new IconoTiempo(RuntimeEnvironment.getApplication(), codigo, 0xFF333333, true);
        v.measure(android.view.View.MeasureSpec.makeMeasureSpec(240, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(240, android.view.View.MeasureSpec.EXACTLY));
        v.layout(0, 0, 240, 240);
        Bitmap b = Bitmap.createBitmap(240, 240, Bitmap.Config.ARGB_8888);
        b.eraseColor(0xFFFFFFFF);
        v.draw(new Canvas(b));
        return b;
    }

    private static int[] pixeles(Bitmap b) {
        int[] p = new int[b.getWidth() * b.getHeight()];
        b.getPixels(p, 0, b.getWidth(), 0, 0, b.getWidth(), b.getHeight());
        return p;
    }

    private static int distintos(Bitmap a, Bitmap b) {
        int[] x = pixeles(a), y = pixeles(b);
        int n = 0;
        for (int i = 0; i < x.length; i++) if (x[i] != y[i]) n++;
        return n;
    }

    private static int tinta(Bitmap a) {
        int n = 0;
        for (int p : pixeles(a)) if (p != 0xFFFFFFFF) n++;
        return n;
    }

    @Test
    public void cadaDibujoSeMueveYSeVe() throws Exception {
        // código del tiempo -> nombre
        int[][] casos = {{0, 0}, {2, 1}, {3, 2}, {61, 3}, {73, 4}, {95, 5}, {45, 6}};
        String[] nombres = {"sol", "parcial", "nubes", "lluvia", "nieve", "tormenta", "niebla"};
        File dir = new File(System.getProperty("capturas.dir"));
        dir.mkdirs();
        for (int i = 0; i < casos.length; i++) {
            Bitmap a = dibuja(casos[i][0], 0.00f), b = dibuja(casos[i][0], 0.31f), c = dibuja(casos[i][0], 0.62f);
            assertTrue(nombres[i] + " se ve", tinta(a) > 600);
            assertTrue(nombres[i] + " cambia de un instante a otro (" + distintos(a, b) + " píxeles)", distintos(a, b) > 40 || distintos(b, c) > 40);
            try (FileOutputStream o = new FileOutputStream(new File(dir, "icono-tiempo-" + nombres[i] + ".png"))) {
                Bitmap h = Bitmap.createBitmap(720, 240, Bitmap.Config.ARGB_8888);
                Canvas cv = new Canvas(h);
                cv.drawBitmap(a, 0, 0, null);
                cv.drawBitmap(b, 240, 0, null);
                cv.drawBitmap(c, 480, 0, null);
                h.compress(Bitmap.CompressFormat.PNG, 100, o);
            }
        }
    }

    @Test
    public void lasCategoriasSonLasDeSiempre() {
        assertTrue(IconoTiempo.categoriaDe(0) == IconoTiempo.SOL && IconoTiempo.categoriaDe(1) == IconoTiempo.SOL);
        assertTrue(IconoTiempo.categoriaDe(2) == IconoTiempo.PARCIAL && IconoTiempo.categoriaDe(3) == IconoTiempo.NUBE);
        assertTrue(IconoTiempo.categoriaDe(63) == IconoTiempo.LLUVIA && IconoTiempo.categoriaDe(82) == IconoTiempo.LLUVIA);
        assertTrue(IconoTiempo.categoriaDe(75) == IconoTiempo.NIEVE && IconoTiempo.categoriaDe(99) == IconoTiempo.TORMENTA);
        assertTrue(IconoTiempo.categoriaDe(48) == IconoTiempo.NIEBLA && IconoTiempo.categoriaDe(77) == IconoTiempo.NUBE);
    }
}
