package es.pizarra.tv;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.VideoView;

import java.io.File;

/**
 * Pantalla completa para una foto, un audio o un vídeo que alguien de la familia manda poner ahora.
 * Siempre dice de quién es ("Vídeo de Ana"). Al cerrarse deja el volumen como estaba.
 */
final class PantallaMedio extends FrameLayout {
    interface AlFinal {
        void terminado();
        void error(String mensaje);
    }

    private static final String TAG = "Pizarra";
    private static final float VOLUMEN_AL_REPRODUCIR = 0.7f;      // fracción del máximo, si estaba más bajo

    final String orden;
    private final Datos.Medio medio;
    private final float s;
    private final Typeface negrita, normal;
    private final AlFinal alFinal;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final AudioManager audio;
    private ImageView imagen, icono;
    private VideoView video;
    private MediaPlayer sonido;
    private LinearLayout barra;
    private TextView txTitulo, txSub, txGrande;
    private int volumenPrevio = -1;
    private int ultimoCmd, ultimaRep;
    private boolean cerrada, reproduciendo;
    private final Runnable finDeFoto = new Runnable() {
        @Override public void run() { terminar(); }
    };

    PantallaMedio(Context c, float escala, Typeface negrita, Typeface normal, Datos.Medio m, AlFinal alFinal) {
        super(c);
        this.s = escala;
        this.negrita = negrita;
        this.normal = normal;
        this.medio = m;
        this.orden = m.orden;
        this.alFinal = alFinal;
        this.ultimoCmd = m.cmdN;
        this.ultimaRep = m.rep;
        this.audio = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        setBackgroundColor(Color.BLACK);
        construir(c);
    }

    private int px(float v) { return Math.round(v * s); }

    static String titulo(Datos.Medio m) {
        String que = "video".equals(m.tipo) ? "Vídeo" : "audio".equals(m.tipo) ? "Audio" : "Foto";
        return m.de.isEmpty() ? que : que + " de " + m.de;
    }

    private static String queManda(Datos.Medio m) {
        String que = "video".equals(m.tipo) ? "un vídeo" : "audio".equals(m.tipo) ? "un audio" : "una foto";
        return (m.de.isEmpty() ? "Alguien" : m.de) + " te manda " + que;
    }

    private int iconoDe(Datos.Medio m) {
        return "video".equals(m.tipo) ? R.drawable.ic_video : "audio".equals(m.tipo) ? R.drawable.ic_sonido : R.drawable.ic_camara;
    }

    private TextView texto(float tam, boolean fuerte) {
        TextView t = new TextoAjustado(getContext(), 36 * s);
        t.setTypeface(fuerte ? negrita : normal);
        t.setIncludeFontPadding(false);
        t.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, tam * s);
        t.setTextColor(Color.WHITE);
        return t;
    }

    private void construir(Context c) {
        imagen = new ImageView(c);
        imagen.setScaleType(ImageView.ScaleType.FIT_CENTER);
        addView(imagen, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Un audio o la espera: icono grande y el nombre, sobre fondo oscuro
        LinearLayout centro = new LinearLayout(c);
        centro.setOrientation(LinearLayout.VERTICAL);
        centro.setGravity(Gravity.CENTER);
        icono = new ImageView(c);
        icono.setImageResource(iconoDe(medio));
        icono.setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN);
        centro.addView(icono, new LinearLayout.LayoutParams(px(320), px(320)));
        txGrande = texto(120, true);
        txGrande.setGravity(Gravity.CENTER);
        txGrande.setMaxLines(2);
        LinearLayout.LayoutParams lg = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lg.topMargin = px(40);
        lg.leftMargin = lg.rightMargin = px(80);
        centro.addView(txGrande, lg);
        addView(centro, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Barra con el nombre, abajo (en fotos y vídeos)
        barra = new LinearLayout(c);
        barra.setOrientation(LinearLayout.VERTICAL);
        barra.setPadding(px(48), px(24), px(48), px(28));
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(0xE6140F22);
        fondo.setCornerRadius(px(36));
        barra.setBackgroundDrawable(fondo);
        txTitulo = texto(112, true);
        txTitulo.setMaxLines(1);
        barra.addView(txTitulo);
        txSub = texto(72, false);
        txSub.setMaxLines(2);
        barra.addView(txSub);
        FrameLayout.LayoutParams lb = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        lb.bottomMargin = px(56);
        lb.leftMargin = lb.rightMargin = px(80);
        addView(barra, lb);
        barra.setVisibility(View.GONE);
        preparando();
    }

    /** Mientras llega el archivo: se avisa de que viene algo. */
    private void preparando() {
        imagen.setVisibility(View.GONE);
        txGrande.setText(queManda(medio));
        barra.setVisibility(View.GONE);
    }

    /** Ya está el archivo: pitido y a reproducir. poster: un fotograma del vídeo (o null). */
    void reproducir(File archivo, Bitmap poster) {
        if (cerrada) return;
        reproduciendo = true;
        subirVolumen();
        Medios.pitido();
        txTitulo.setText(titulo(medio));
        if (!medio.texto.isEmpty() && "foto".equals(medio.tipo)) { txSub.setText(medio.texto); txSub.setVisibility(View.VISIBLE); }
        else txSub.setVisibility(View.GONE);
        if ("foto".equals(medio.tipo)) {
            Bitmap b = BitmapFactory.decodeFile(archivo.getPath());
            if (b == null) { alFinal.error("La foto no se puede abrir"); return; }
            imagen.setImageBitmap(b);
            imagen.setVisibility(View.VISIBLE);
            ((View) icono.getParent()).setVisibility(View.GONE);
            barra.setVisibility(View.VISIBLE);
            reprogramarFoto(medio.segundos, medio.sinLimite);
        } else if ("video".equals(medio.tipo)) {
            if (poster != null) { imagen.setImageBitmap(poster); imagen.setVisibility(View.VISIBLE); }
            ((View) icono.getParent()).setVisibility(View.GONE);
            barra.setVisibility(View.VISIBLE);
            if (!Medios.sinReproducir) arrancarVideo(archivo);
        } else {
            txGrande.setText(titulo(medio));
            if (!Medios.sinReproducir) arrancarAudio(archivo);
        }
    }

    private void arrancarVideo(File archivo) {
        video = new VideoView(getContext());
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER);
        addView(video, 1, lp);
        video.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
            @Override public void onPrepared(MediaPlayer mp) { imagen.setVisibility(View.GONE); }
        });
        video.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
            @Override public void onCompletion(MediaPlayer mp) { terminar(); }
        });
        video.setOnErrorListener(new MediaPlayer.OnErrorListener() {
            @Override public boolean onError(MediaPlayer mp, int what, int extra) {
                Log.w(TAG, "Error de vídeo " + what + "/" + extra);
                if (!cerrada) alFinal.error("Esta tele no puede reproducir ese vídeo (formato no compatible). Prueba a grabarlo de nuevo desde el panel.");
                return true;
            }
        });
        video.setVideoPath(archivo.getPath());
        video.start();
    }

    private void arrancarAudio(File archivo) {
        try {
            sonido = new MediaPlayer();
            sonido.setAudioStreamType(AudioManager.STREAM_MUSIC);
            sonido.setDataSource(archivo.getPath());
            sonido.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override public void onCompletion(MediaPlayer mp) { terminar(); }
            });
            sonido.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override public boolean onError(MediaPlayer mp, int what, int extra) {
                    if (!cerrada) alFinal.error("Esta tele no puede reproducir ese audio.");
                    return true;
                }
            });
            sonido.prepare();
            sonido.start();
        } catch (Exception e) {
            Log.w(TAG, "Audio: " + e);
            alFinal.error("Esta tele no puede reproducir ese audio.");
        }
    }

    private void reprogramarFoto(int segundos, boolean sinLimite) {
        h.removeCallbacks(finDeFoto);
        if (!sinLimite && segundos > 0) h.postDelayed(finDeFoto, segundos * 1000L);
    }

    /** Llegan los datos nuevos de la consulta: órdenes del móvil (repetir, volumen) y el tiempo que queda de una foto. */
    void actualizar(Datos.Medio m) {
        if (cerrada || !reproduciendo) return;
        if ("foto".equals(m.tipo)) reprogramarFoto(m.segundos, m.sinLimite);
        if (m.rep != ultimaRep) {
            ultimaRep = m.rep;
            repetir();
        }
        if (m.cmdN != ultimoCmd) {
            ultimoCmd = m.cmdN;
            if ("subir".equals(m.cmd)) moverVolumen(+2);
            else if ("bajar".equals(m.cmd)) moverVolumen(-2);
        }
    }

    private void repetir() {
        try {
            if (video != null) { video.seekTo(0); video.start(); }
            else if (sonido != null) { sonido.seekTo(0); sonido.start(); }
            else Medios.pitido();
        } catch (Exception e) {
            Log.w(TAG, "No se pudo repetir: " + e);
        }
    }

    private void subirVolumen() {
        if (audio == null || volumenPrevio >= 0) return;
        try {
            volumenPrevio = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int objetivo = Math.round(max * VOLUMEN_AL_REPRODUCIR);
            if (objetivo > volumenPrevio) audio.setStreamVolume(AudioManager.STREAM_MUSIC, objetivo, 0);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo subir el volumen: " + e);
        }
    }

    private void moverVolumen(int pasos) {
        if (audio == null) return;
        try {
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int v = Math.max(0, Math.min(max, audio.getStreamVolume(AudioManager.STREAM_MUSIC) + pasos));
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo mover el volumen: " + e);
        }
    }

    private void terminar() {
        if (!cerrada) alFinal.terminado();
    }

    /** Para todo y deja el volumen como estaba. */
    void cerrar() {
        if (cerrada) return;
        cerrada = true;
        h.removeCallbacks(finDeFoto);
        try { if (video != null) video.stopPlayback(); } catch (Exception ignorada) { }
        try { if (sonido != null) { sonido.stop(); sonido.release(); } } catch (Exception ignorada) { }
        if (audio != null && volumenPrevio >= 0) {
            try { audio.setStreamVolume(AudioManager.STREAM_MUSIC, volumenPrevio, 0); } catch (Exception ignorada) { }
        }
        imagen.setImageDrawable(null);
    }

    /** Un fotograma del vídeo, para que no se vea negro mientras arranca. */
    static Bitmap fotogramaDe(File f) {
        if (Medios.posterDePrueba != null) return Medios.posterDePrueba;
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(f.getPath());
            return r.getFrameAtTime(0);
        } catch (Exception e) {
            return null;
        } finally {
            try { r.release(); } catch (Exception ignorada) { }
        }
    }
}
