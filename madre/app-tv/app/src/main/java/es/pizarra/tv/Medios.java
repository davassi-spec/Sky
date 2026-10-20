package es.pizarra.tv;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/** Descarga de los envíos (en trozos), aviso del estado al script, pitido suave y volumen. */
final class Medios {
    private static final String TAG = "Pizarra";

    /** Solo para pruebas: si no es null, no se descarga nada y se usa este archivo. */
    static File archivoDePrueba;
    /** Solo para pruebas: no se arranca el reproductor (Robolectric no sabe reproducir). */
    static boolean sinReproducir;
    /** Solo para pruebas: la descarga no termina (para ver la pantalla de espera). */
    static volatile boolean congelarDescarga;
    /** Solo para pruebas: el fotograma que se enseña de un vídeo. */
    static android.graphics.Bitmap posterDePrueba;

    private Medios() {}

    static String extension(Datos.Medio m) {
        String mime = m.mime == null ? "" : m.mime;
        if (mime.contains("wav")) return "wav";
        if (mime.contains("webm")) return "webm";
        if (mime.contains("quicktime")) return "mov";
        if (mime.contains("mp4")) return "mp4";
        if (mime.contains("jpeg")) return "jpg";
        return "bin";
    }

    /** Baja todas las partes a un archivo del caché y devuelve ese archivo (null si falla). Bloquea: llamar desde un hilo. */
    static File descargar(Context ctx, String url, String k, Datos.Medio m) {
        for (int i = 0; congelarDescarga && i < 100; i++) try { Thread.sleep(50); } catch (InterruptedException e) { break; }
        if (archivoDePrueba != null) return archivoDePrueba;
        File destino = new File(ctx.getCacheDir(), "medio-" + m.id + "." + extension(m));
        if (destino.exists() && destino.length() == m.bytes) return destino;
        borrarViejos(ctx, destino);
        File parcial = new File(destino.getPath() + ".parte");
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(parcial);
            for (int n = 0; n < m.partes; n++) {
                JSONObject r = new JSONObject(pedir(url + "?a=medio&k=" + URLEncoder.encode(k, "UTF-8") + "&id=" + URLEncoder.encode(m.id, "UTF-8") + "&n=" + n));
                if (r.has("error")) throw new Exception(r.optString("error"));
                out.write(Base64.decode(r.getString("b64"), Base64.DEFAULT));
            }
            out.close();
            out = null;
            if (parcial.length() != m.bytes || !parcial.renameTo(destino)) throw new Exception("tamaño distinto");
            return destino;
        } catch (Exception e) {
            Log.w(TAG, "No se pudo descargar el envío: " + e);
            parcial.delete();
            return null;
        } finally {
            if (out != null) try { out.close(); } catch (Exception ignorada) { }
        }
    }

    private static void borrarViejos(Context ctx, File conservar) {
        File[] fs = ctx.getCacheDir().listFiles();
        if (fs == null) return;
        for (File f : fs) if (f.getName().startsWith("medio-") && !f.equals(conservar)) f.delete();
    }

    private static String pedir(String direccion) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(direccion).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            return o.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    /** Cuenta al script cómo va: descargando | reproduciendo | terminado | error. */
    static void informar(final String url, final String k, final String orden, final String estado, final String mensaje) {
        if (archivoDePrueba != null) return;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    pedir(url + "?a=medioEstado&k=" + URLEncoder.encode(k, "UTF-8") + "&o=" + URLEncoder.encode(orden, "UTF-8")
                            + "&e=" + estado + (mensaje == null ? "" : "&m=" + URLEncoder.encode(mensaje, "UTF-8")));
                } catch (Exception e) {
                    Log.w(TAG, "No se pudo avisar del estado: " + e);
                }
            }
        }).start();
    }

    /** Un pitido suave de dos notas, para que se note que llega algo. Dura menos de un segundo. */
    static void pitido() {
        if (sinReproducir || archivoDePrueba != null) return;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    int hz = 22050;
                    double[] notas = {660, 880};
                    short[] pcm = new short[(int) (hz * 0.9)];
                    int por = pcm.length / notas.length;
                    for (int i = 0; i < pcm.length; i++) {
                        int n = Math.min(notas.length - 1, i / por);
                        double t = (i % por) / (double) por;
                        double env = Math.sin(Math.PI * t);                  // sube y baja suave, sin chasquidos
                        pcm[i] = (short) (Math.sin(2 * Math.PI * notas[n] * i / hz) * env * 9000);
                    }
                    AudioTrack at = new AudioTrack(AudioManager.STREAM_MUSIC, hz, AudioFormat.CHANNEL_OUT_MONO,
                            AudioFormat.ENCODING_PCM_16BIT, pcm.length * 2, AudioTrack.MODE_STATIC);
                    at.write(pcm, 0, pcm.length);
                    at.play();
                    Thread.sleep(1000);
                    at.release();
                } catch (Throwable e) {
                    Log.w(TAG, "Sin pitido: " + e);
                }
            }
        }).start();
    }

    /** Qué entiende esta tele (para el registro: adb logcat -s Pizarra). */
    static String codecs() {
        StringBuilder b = new StringBuilder();
        try {
            for (int i = 0; i < MediaCodecList.getCodecCount(); i++) {
                MediaCodecInfo ci = MediaCodecList.getCodecInfoAt(i);
                if (ci.isEncoder()) continue;
                for (String t : ci.getSupportedTypes()) {
                    if (t.startsWith("video/") || t.startsWith("audio/")) b.append(t).append(" (").append(ci.getName()).append("); ");
                }
            }
        } catch (Throwable e) {
            b.append("no se pudo leer: ").append(e);
        }
        return b.toString();
    }
}
