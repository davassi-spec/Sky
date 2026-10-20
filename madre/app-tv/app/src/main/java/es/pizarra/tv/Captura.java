package es.pizarra.tv;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.util.Base64;
import android.view.View;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/** Una foto de lo que se ve ahora en la TV, para la vista previa del panel (que así es idéntica a la pantalla). */
final class Captura {
    static final int ANCHO = 640, ALTO = 360;

    private Captura() {}

    /** Dibuja la vista en un mapa de bits pequeño. Va en el hilo principal. */
    static Bitmap dibujar(View v) {
        if (v.getWidth() <= 0 || v.getHeight() <= 0) return null;
        try {
            Bitmap b = Bitmap.createBitmap(ANCHO, ALTO, Bitmap.Config.RGB_565);
            Canvas c = new Canvas(b);
            c.scale(ANCHO / (float) v.getWidth(), ALTO / (float) v.getHeight());
            v.draw(c);
            return b;
        } catch (OutOfMemoryError e) {
            return null;
        }
    }

    /** JPEG en base64 de menos de ~90 000 caracteres (el límite de la caché del script es 100 KB). */
    static String comprimir(Bitmap b) {
        int calidad = 62;
        while (true) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, calidad, out);
            String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            if (b64.length() <= 90000 || calidad <= 20) return b64;
            calidad -= 10;
        }
    }

    /** Se manda al script con la clave de administrador. Va en un hilo aparte. */
    static boolean enviar(String url, String k, String b64) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url + "?a=captura&k=" + URLEncoder.encode(k, "UTF-8")).openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(15000);
            c.setReadTimeout(25000);
            c.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            OutputStream o = c.getOutputStream();
            o.write(b64.getBytes("UTF-8"));
            o.close();
            return c.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
