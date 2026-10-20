package es.pizarra.tv;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.BitmapShader;
import android.graphics.Shader;
import android.util.Base64;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.io.ByteArrayOutputStream;

/** Fotos de la familia: se piden una vez por versión al script (con la clave de administrador) y se guardan en la TV. */
final class Fotos {
    private Fotos() {}

    private static File archivo(Context c, String autor, int version) {
        return new File(c.getCacheDir(), "foto_" + autor.replaceAll("[^A-Za-z0-9-]", "") + "_" + version + ".jpg");
    }

    /** Descarga la foto si aún no está guardada. Se llama desde el hilo de red. */
    static void asegurar(Context c, String url, String k, String autor, int version) {
        if (autor.isEmpty() || version <= 0) return;
        File f = archivo(c, autor, version);
        if (f.exists()) return;
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(url + "?a=foto&p=" + URLEncoder.encode(autor, "UTF-8")
                    + "&k=" + URLEncoder.encode(k, "UTF-8")).openConnection();
            h.setConnectTimeout(15000);
            h.setReadTimeout(25000);
            if (h.getResponseCode() != 200) return;
            InputStream in = h.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONObject j = new JSONObject(out.toString("UTF-8"));
            if (!j.has("b64")) return;
            byte[] bytes = Base64.decode(j.getString("b64"), Base64.DEFAULT);
            FileOutputStream fo = new FileOutputStream(f);
            fo.write(bytes);
            fo.close();
            borrarAntiguas(c, autor, f);
        } catch (Exception e) {
            f.delete();
        } finally {
            if (h != null) h.disconnect();
        }
    }

    private static void borrarAntiguas(Context c, String autor, File actual) {
        File[] todos = c.getCacheDir().listFiles();
        if (todos == null) return;
        String pref = "foto_" + autor.replaceAll("[^A-Za-z0-9-]", "") + "_";
        for (File x : todos) if (x.getName().startsWith(pref) && !x.equals(actual)) x.delete();
    }

    /** La foto recortada en círculo, del tamaño pedido, o null si no está. */
    static Bitmap circulo(Context c, String autor, int version, int tam) {
        if (autor.isEmpty() || version <= 0 || tam <= 0) return null;
        File f = archivo(c, autor, version);
        if (!f.exists()) return null;
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap src = BitmapFactory.decodeFile(f.getPath(), o);
        if (src == null) return null;
        Bitmap out = Bitmap.createBitmap(tam, tam, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        BitmapShader sh = new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        float lado = Math.min(src.getWidth(), src.getHeight());
        float esc = tam / lado;
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setScale(esc, esc);
        m.postTranslate(-(src.getWidth() * esc - tam) / 2f, -(src.getHeight() * esc - tam) / 2f);
        sh.setLocalMatrix(m);
        p.setShader(sh);
        cv.drawCircle(tam / 2f, tam / 2f, tam / 2f, p);
        src.recycle();
        return out;
    }
}
