package es.pizarra.tv;

import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;

@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 34, qualifiers = "w1920dp-h1080dp-mdpi")
public class HumoTest {
    @Test
    public void dibujaLaPantalla() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        String json = "{\"widgets\":{\"mensajes\":true,\"eventos\":true,\"tiempo\":true},\"noche\":{\"desde\":21,\"hasta\":6},\"nocheTexto\":\"Es hora de dormir.\","
                + "\"contacto\":{\"nombre\":\"Daniel\",\"telefono\":\"600 000 000\"},\"mensajes\":[{\"id\":\"1\",\"de\":\"Daniel\",\"texto\":\"Hoy viene Ana a las seis.\",\"t\":1760000000}],"
                + "\"eventos\":[{\"dia\":0,\"hora\":\"18:30\",\"titulo\":\"Merienda con Ana\"}],\"tiempo\":{\"temp\":21,\"codigo\":2}}";
        ctx.getSharedPreferences("pizarra", Context.MODE_PRIVATE).edit().putString("url", "http://127.0.0.1:1/x").putString("k", "k")
                .putString("cache", json).putLong("cacheT", System.currentTimeMillis()).commit();
        Activity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        View raiz = a.getWindow().getDecorView();
        raiz.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
        raiz.layout(0, 0, 1920, 1080);
        Bitmap b = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888);
        raiz.draw(new Canvas(b));
        File dir = new File(System.getProperty("capturas.dir")); dir.mkdirs();
        try (FileOutputStream o = new FileOutputStream(new File(dir, "humo.png"))) { b.compress(Bitmap.CompressFormat.PNG, 100, o); }
        assertTrue(new File(dir, "humo.png").length() > 10000);
    }
}
