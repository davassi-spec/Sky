package es.pizarra.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Pizarra para la TV. Arriba el día y la fecha, y la hora en cifras y en palabras. Debajo, a la izquierda los
 * mensajes de la familia y a la derecha lo próximo del calendario y el tiempo. De noche, lo de mañana, el aviso
 * de dormir y el teléfono de contacto. Cinco estilos de color, cada uno de día y de noche (ver Paleta).
 * No tiene botones: solo se mira. Lo único que se mueve es el fundido entre una pantalla y la siguiente
 * y los dos puntos del reloj.
 *
 * Los datos vienen del script de Google (madre/apps-script). La dirección y la clave se guardan una vez con:
 *   adb shell am start -n es.pizarra.tv/.MainActivity --es url "https://script.google.com/macros/s/XXXX/exec" --es k "CLAVE"
 */
public class MainActivity extends Activity {
    private static final String TAG = "Pizarra";
    private static final long MAX_EDAD_CACHE_MS = 12L * 60 * 60 * 1000;
    private static final int FUNDIDO_MS = 700;

    private final Handler h = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private float s;                      // 1 = pantalla de 1080 px de alto
    private Typeface negrita, normal;
    private Datos datos;
    private boolean noche;
    private Paleta p = Paleta.de("lavanda", false);
    private String firma = "";            // lo que se ve ahora; si no cambia, no se repinta
    private boolean pintado;
    private boolean puntos = true;

    private FrameLayout marco;
    private LinearLayout raiz, cuerpo, colIzq, colDer, banda, pildora;
    private ImageView icBanda, icPildora;
    private TextView txBanda, txPildora, tvDia, tvFecha, tvH, tvDos, tvM, tvHablada;
    private final List<LinearLayout> tarjetasMsg = new ArrayList<>();

    private final Runnable tic = new Runnable() {
        @Override public void run() {
            tvDos.setVisibility(puntos ? View.VISIBLE : View.INVISIBLE);
            puntos = !puntos;
            pintarReloj();
            h.postDelayed(this, 500);
        }
    };
    private final Runnable busca = new Runnable() {
        @Override public void run() {
            buscar();
            h.postDelayed(this, 60000);
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        prefs = getSharedPreferences("pizarra", MODE_PRIVATE);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        s = Math.min(dm.heightPixels, dm.widthPixels) / 1080f;
        negrita = Typeface.createFromAsset(getAssets(), "fonts/PizarraSans-Bold.ttf");
        normal = Typeface.createFromAsset(getAssets(), "fonts/PizarraSans-Regular.ttf");
        leerConfiguracion(getIntent());
        cargarCache();
        construir();
        pintarReloj();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        leerConfiguracion(i);
        firma = "";
        pintarReloj();
        buscar();
    }

    @Override
    protected void onResume() {
        super.onResume();
        h.removeCallbacks(tic);
        h.removeCallbacks(busca);
        h.post(tic);
        h.post(busca);
    }

    @Override
    protected void onPause() {
        super.onPause();
        h.removeCallbacks(tic);
        h.removeCallbacks(busca);
    }

    @Override
    public void onWindowFocusChanged(boolean foco) {
        super.onWindowFocusChanged(foco);
        if (foco) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** Atrás no hace nada: así no se sale de la pizarra sin querer. Inicio sí funciona. */
    @Override
    public void onBackPressed() {
    }

    /* ---------- Configuración y datos ---------- */

    private void leerConfiguracion(Intent i) {
        if (i == null) return;
        String url = i.getStringExtra("url");
        String k = i.getStringExtra("k");
        if (url != null && k != null) {
            prefs.edit().putString("url", url.trim()).putString("k", k.trim()).remove("cache").apply();
            datos = null;
        }
    }

    private void cargarCache() {
        String c = prefs.getString("cache", null);
        long t = prefs.getLong("cacheT", 0);
        if (c == null || System.currentTimeMillis() - t > MAX_EDAD_CACHE_MS) return;
        try {
            datos = Datos.parse(c);
            datos.pruebaEstilo = null;      // una prueba de hace rato ya no vale
        } catch (Exception e) {
            Log.w(TAG, "Caché ilegible", e);
        }
    }

    private void buscar() {
        final String url = prefs.getString("url", "");
        final String k = prefs.getString("k", "");
        if (url.isEmpty()) return;
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url + "?a=estado&k=" + URLEncoder.encode(k, "UTF-8")).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(25000);
                    if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                    final String cuerpoJson = leer(c.getInputStream());
                    final Datos nuevo = Datos.parse(cuerpoJson);
                    prefs.edit().putString("cache", cuerpoJson).putLong("cacheT", System.currentTimeMillis()).apply();
                    for (Datos.Mensaje m : nuevo.mensajes) Fotos.asegurar(MainActivity.this, url, k, m.autor, m.foto);
                    h.post(new Runnable() {
                        @Override public void run() {
                            datos = nuevo;
                            pintarReloj();
                        }
                    });
                } catch (Exception e) {
                    Log.w(TAG, "No se pudieron leer los datos: " + e);
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    private static String leer(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    /* ---------- Piezas ---------- */

    private int px(float v) {
        return Math.round(v * s);
    }

    private TextView texto(float tam, boolean fuerte) {
        TextView t = new TextView(this);
        t.setTypeface(fuerte ? negrita : normal);
        t.setIncludeFontPadding(false);
        t.setTextSize(TypedValue.COMPLEX_UNIT_PX, tam * s);
        t.setTag(tam);
        return t;
    }

    private GradientDrawable caja(int fondo, float radio, int borde, float grosor) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fondo);
        g.setCornerRadius(radio * s);
        if (grosor > 0) g.setStroke(Math.max(1, px(grosor)), borde);
        return g;
    }

    private GradientDrawable ovalo(int color) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(color);
        return g;
    }

    private LinearLayout.LayoutParams lp(int ancho, int alto) {
        return new LinearLayout.LayoutParams(ancho, alto);
    }

    private LinearLayout.LayoutParams lpPeso(float peso) {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, peso);
    }

    private ImageView icono(int recurso, int color, float lado) {
        ImageView v = new ImageView(this);
        v.setImageResource(recurso);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        v.setLayoutParams(lp(px(lado), px(lado)));
        v.setTag(new float[]{lado, lado});
        return v;
    }

    private ImageView iconoRedondo(int recurso, int color, float diametro, float interior) {
        ImageView v = new ImageView(this);
        v.setImageResource(recurso);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setBackgroundDrawable(ovalo(color));
        int pad = px((diametro - interior) / 2f);
        v.setPadding(pad, pad, pad, pad);
        v.setLayoutParams(lp(px(diametro), px(diametro)));
        v.setTag(new float[]{diametro, interior});
        return v;
    }

    /** Escribe el texto con la letra más grande (entre max y min) con la que cabe en una línea de ese ancho. */
    private void ajustarLinea(TextView t, String txt, int anchoPx, float max, float min) {
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTypeface(t.getTypeface());
        float tam = max;
        while (tam > min) {
            tp.setTextSize(tam * s);
            if (tp.measureText(txt) <= anchoPx) break;
            tam -= 2;
        }
        t.setTextSize(TypedValue.COMPLEX_UNIT_PX, tam * s);
        t.setText(txt);
    }

    /** Cambia a la vez el tamaño de letra y de iconos de una tarjeta (los tamaños base van en las etiquetas). */
    private void escalar(View v, float k) {
        Object tag = v.getTag();
        if (v instanceof TextView && tag instanceof Float) {
            ((TextView) v).setTextSize(TypedValue.COMPLEX_UNIT_PX, (Float) tag * k * s);
        } else if (v instanceof ImageView && tag instanceof float[]) {
            float[] a = (float[]) tag;
            ViewGroup.LayoutParams l = v.getLayoutParams();
            l.width = px(a[0] * k);
            l.height = px(a[0] * k);
            int pad = px((a[0] - a[1]) * k / 2f);
            v.setPadding(pad, pad, pad, pad);
        } else if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) escalar(g.getChildAt(i), k);
        }
    }

    /**
     * Agranda el contenido de la tarjeta hasta que llene el hueco (como mucho kmax veces el tamaño base).
     * Devuelve false si ni siquiera cabe con el tamaño base.
     */
    private boolean llenar(final LinearLayout t, float kmax) {
        int ancho = t.getWidth();
        int alto = t.getHeight();
        if (ancho <= 0 || alto <= 0) return true;
        for (int i = Math.round((kmax - 1f) * 10f); i >= 0; i--) {
            float k = 1f + i / 10f;
            escalar(t, k);
            t.measure(View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            if (t.getMeasuredHeight() <= alto) {
                t.post(new Runnable() { @Override public void run() { t.requestLayout(); } });
                return true;
            }
        }
        escalar(t, 1f);
        return false;
    }

    /* ---------- Construcción de la pantalla ---------- */

    private void construir() {
        marco = new FrameLayout(this);
        raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(px(56), px(24), px(56), px(24));
        marco.addView(raiz, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Cuenta atrás (solo si toca)
        banda = new LinearLayout(this);
        banda.setOrientation(LinearLayout.HORIZONTAL);
        banda.setGravity(Gravity.CENTER);
        icBanda = new ImageView(this);
        icBanda.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams lpIcB = lp(px(56), px(56));
        lpIcB.rightMargin = px(24);
        banda.addView(icBanda, lpIcB);
        txBanda = texto(56, true);
        txBanda.setSingleLine(true);
        banda.addView(txBanda);
        LinearLayout.LayoutParams lpBanda = lp(ViewGroup.LayoutParams.MATCH_PARENT, px(80));
        lpBanda.bottomMargin = px(12);
        raiz.addView(banda, lpBanda);

        // Cabecera: día y fecha a la izquierda; hora en cifras y en palabras a la derecha.
        LinearLayout cab = new LinearLayout(this);
        cab.setOrientation(LinearLayout.HORIZONTAL);
        cab.setGravity(Gravity.BOTTOM);
        LinearLayout izq = new LinearLayout(this);
        izq.setOrientation(LinearLayout.VERTICAL);
        tvDia = texto(120, true);
        tvDia.setSingleLine(true);
        tvFecha = texto(56, true);
        tvFecha.setSingleLine(true);
        izq.addView(tvDia);
        LinearLayout.LayoutParams lpFecha = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpFecha.topMargin = px(4);
        izq.addView(tvFecha, lpFecha);
        cab.addView(izq, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        LinearLayout der = new LinearLayout(this);
        der.setOrientation(LinearLayout.VERTICAL);
        der.setGravity(Gravity.RIGHT);
        LinearLayout reloj = new LinearLayout(this);
        reloj.setOrientation(LinearLayout.HORIZONTAL);
        tvH = texto(180, true);
        tvDos = texto(180, true);
        tvM = texto(180, true);
        tvDos.setText(":");
        reloj.addView(tvH);
        reloj.addView(tvDos);
        reloj.addView(tvM);
        // La letra deja aire arriba y abajo: se recorta para que la cabecera no crezca.
        LinearLayout.LayoutParams lpRel = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpRel.gravity = Gravity.RIGHT;
        lpRel.topMargin = -px(42);
        lpRel.bottomMargin = -px(42);
        der.addView(reloj, lpRel);
        tvHablada = texto(46, true);
        tvHablada.setSingleLine(true);
        LinearLayout.LayoutParams lpHab = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpHab.gravity = Gravity.RIGHT;
        lpHab.topMargin = px(4);
        der.addView(tvHablada, lpHab);
        pildora = new LinearLayout(this);
        pildora.setOrientation(LinearLayout.HORIZONTAL);
        pildora.setGravity(Gravity.CENTER_VERTICAL);
        pildora.setPadding(px(22), px(8), px(26), px(8));
        icPildora = new ImageView(this);
        icPildora.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams lpIcP = lp(px(48), px(48));
        lpIcP.rightMargin = px(14);
        pildora.addView(icPildora, lpIcP);
        txPildora = texto(46, true);
        txPildora.setSingleLine(true);
        pildora.addView(txPildora);
        LinearLayout.LayoutParams lpPil = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpPil.gravity = Gravity.RIGHT;
        lpPil.topMargin = px(10);
        der.addView(pildora, lpPil);
        LinearLayout.LayoutParams lpDer = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpDer.leftMargin = px(32);
        cab.addView(der, lpDer);
        raiz.addView(cab, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Cuerpo: dos columnas
        cuerpo = new LinearLayout(this);
        cuerpo.setOrientation(LinearLayout.HORIZONTAL);
        colIzq = new LinearLayout(this);
        colIzq.setOrientation(LinearLayout.VERTICAL);
        colDer = new LinearLayout(this);
        colDer.setOrientation(LinearLayout.VERTICAL);
        cuerpo.addView(colIzq, lpPeso(1.55f));
        LinearLayout.LayoutParams lpColDer = lpPeso(1f);
        lpColDer.leftMargin = px(28);
        cuerpo.addView(colDer, lpColDer);
        LinearLayout.LayoutParams lpCuerpo = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        lpCuerpo.topMargin = px(16);
        raiz.addView(cuerpo, lpCuerpo);

        setContentView(marco);
    }

    /* ---------- Reloj y cambio de pantalla ---------- */

    private void pintarReloj() {
        Calendar a = Hora.ahora();
        int hora = a.get(Calendar.HOUR_OF_DAY);
        boolean n = datos != null ? datos.esNocheAhora(hora) : (hora >= 21 || hora < 6);
        String estilo = datos != null ? datos.estiloAhora(n) : (n ? "calido" : "lavanda");
        String f = n + "/" + estilo + "/" + hora + "/" + a.get(Calendar.DAY_OF_YEAR) + "/"
                + prefs.getString("url", "").isEmpty() + "/" + (datos != null ? datos.firma() : "");
        if (!f.equals(firma)) {
            firma = f;
            noche = n;
            p = Paleta.de(estilo, n);
            repintar(a);
        }
        pintarHora(a);
    }

    /** Solo los textos que cambian cada minuto. */
    private void pintarHora(Calendar a) {
        String cifras = Texto.horaCifras(a);
        int dos = cifras.indexOf(':');
        setSiCambia(tvH, cifras.substring(0, dos));
        setSiCambia(tvM, cifras.substring(dos + 1));
        boolean parte = datos == null || datos.verParte;
        String hablada = parte ? Texto.horaConParte(a) : Texto.horaHablada(a);
        int ancho = px(1000);
        if (!hablada.contentEquals(tvHablada.getText())) ajustarLinea(tvHablada, hablada, ancho, 46, 40);
    }

    private static void setSiCambia(TextView t, String x) {
        if (!x.contentEquals(t.getText())) t.setText(x);
    }

    /** Pinta la pantalla de nuevo. Si ya había una a la vista, se funde con la anterior. */
    private void repintar(Calendar ahora) {
        ImageView velo = null;
        if (pintado && marco.getWidth() > 0 && marco.getHeight() > 0) {
            Bitmap b = Bitmap.createBitmap(marco.getWidth(), marco.getHeight(), Bitmap.Config.RGB_565);
            marco.draw(new Canvas(b));
            velo = new ImageView(this);
            velo.setImageBitmap(b);
            marco.addView(velo, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        pintar(ahora);
        pintado = true;
        if (velo != null) {
            final ImageView v = velo;
            v.animate().alpha(0f).setDuration(FUNDIDO_MS).withEndAction(new Runnable() {
                @Override public void run() {
                    marco.removeView(v);
                    reciclar(v);
                }
            }).start();
        }
    }

    private static void reciclar(ImageView v) {
        if (v.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
            Bitmap b = ((android.graphics.drawable.BitmapDrawable) v.getDrawable()).getBitmap();
            v.setImageDrawable(null);
            if (b != null) b.recycle();
        }
    }

    private void pintar(Calendar ahora) {
        int hora = ahora.get(Calendar.HOUR_OF_DAY);
        raiz.setBackgroundColor(p.fondo);
        marco.setBackgroundColor(p.fondo);
        tvDia.setTextColor(p.texto);
        tvFecha.setTextColor(p.sub);
        tvH.setTextColor(p.texto);
        tvDos.setTextColor(p.texto);
        tvM.setTextColor(p.texto);
        tvHablada.setTextColor(p.sub);
        tvDia.setText(Texto.nombreDia(ahora));
        tvFecha.setText(Texto.fecha(ahora));
        boolean parte = datos == null || datos.verParte;
        pildora.setVisibility(parte ? View.VISIBLE : View.GONE);
        pildora.setBackgroundDrawable(caja(p.pillFondo, 30, p.borde, p.grosorBorde > 2 ? p.grosorBorde : 0));
        icPildora.setImageResource(noche ? R.drawable.ic_luna : R.drawable.ic_sol);
        icPildora.setColorFilter(p.pillTexto, PorterDuff.Mode.SRC_IN);
        txPildora.setTextColor(p.pillTexto);
        txPildora.setText(Texto.etiquetaParte(hora));
        tvHablada.setText("");           // se vuelve a escribir en pintarHora, con su ancho
        pintarBanda();
        pintarCuerpo(ahora, hora);
    }

    private void pintarBanda() {
        if (datos == null || datos.cuenta == null) {
            banda.setVisibility(View.GONE);
            return;
        }
        banda.setVisibility(View.VISIBLE);
        banda.setBackgroundDrawable(caja(p.pillFondo, 28, p.borde, p.grosorBorde > 2 ? p.grosorBorde : 0));
        icBanda.setImageResource(Texto.iconoDeLaCuenta(datos.cuenta.icono));
        icBanda.setColorFilter(p.pillTexto, PorterDuff.Mode.SRC_IN);
        txBanda.setTextColor(p.pillTexto);
        ajustarLinea(txBanda, datos.cuenta.texto, px(1808 - 56 - 24 - 80), 56, 40);
    }

    /* ---------- Cuerpo ---------- */

    private LinearLayout tarjeta(boolean segunda) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setBackgroundDrawable(caja(segunda ? p.tarjeta2 : p.tarjeta, 28, p.borde, p.grosorBorde));
        t.setPadding(px(36), px(24), px(36), px(24));
        return t;
    }

    private void anadir(LinearLayout col, View v, float peso) {
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, peso);
        if (col.getChildCount() > 0) l.topMargin = px(16);
        col.addView(v, l);
    }

    private void pintarCuerpo(Calendar ahora, int hora) {
        colIzq.removeAllViews();
        colDer.removeAllViews();
        boolean conectada = !prefs.getString("url", "").isEmpty();
        List<View> izq = new ArrayList<>();
        List<View> der = new ArrayList<>();
        // Peso de cada tarjeta de la derecha (la del tiempo necesita algo más de sitio)
        float pesoTiempo = 1.12f;

        if (!conectada) {
            LinearLayout t = tarjeta(false);
            t.setGravity(Gravity.CENTER_VERTICAL);
            TextView x = texto(76, true);
            x.setTextColor(p.texto);
            x.setText("Falta conectar la pizarra.");
            t.addView(x);
            izq.add(t);
        } else if (datos != null && noche) {
            boolean deManana = hora >= 12;      // pasada la medianoche, "lo de mañana" ya es lo de hoy
            int nm = datos.verMensajes ? Math.min(2, datos.mensajes.size()) : 0;
            List<Datos.Evento> lista = new ArrayList<>();
            for (Datos.Evento e : datos.eventos) if (e.manana == deManana) lista.add(e);
            if (nm > 0) {
                for (int i = 0; i < nm; i++) izq.add(tarjetaMensaje(datos.mensajes.get(i), ahora, nm > 1));
                der.add(tarjetaDormir(datos.verEventos, lista, deManana));
            } else {
                if (datos.verEventos) izq.add(tarjetaEventos(ahora, true, deManana));
                der.add(tarjetaDormir(false, lista, deManana));
            }
            if (!datos.contactoNombre.isEmpty()) der.add(tarjetaTelefono());
            pesoTiempo = 0.8f;
        } else if (datos != null) {
            int nm = datos.verMensajes ? Math.min(2, datos.mensajes.size()) : 0;
            for (int i = 0; i < nm; i++) izq.add(tarjetaMensaje(datos.mensajes.get(i), ahora, nm > 1));
            View ev = datos.verEventos ? tarjetaEventos(ahora, false, false) : null;
            View tp = datos.verTiempo && datos.hayTiempo ? tarjetaTiempo() : null;
            if (nm > 0) {
                if (ev != null) der.add(ev);
                if (tp != null) der.add(tp);
            } else {
                if (ev != null) izq.add(ev);
                if (tp != null) (ev != null ? der : izq).add(tp);
            }
        }

        if (izq.isEmpty()) { izq = der; der = new ArrayList<>(); }
        for (View v : izq) anadir(colIzq, v, 1f);
        for (View v : der) anadir(colDer, v, v.getTag() instanceof String && "tiempo".equals(v.getTag()) ? pesoTiempo : "dormir".equals(v.getTag()) ? 1.3f : 1f);
        cuerpo.setVisibility(izq.isEmpty() ? View.GONE : View.VISIBLE);
        colDer.setVisibility(der.isEmpty() ? View.GONE : View.VISIBLE);
        ((LinearLayout.LayoutParams) colIzq.getLayoutParams()).weight = der.isEmpty() ? 1f : 1.55f;
        ((LinearLayout.LayoutParams) colDer.getLayoutParams()).leftMargin = der.isEmpty() ? 0 : px(28);
        cuerpo.requestLayout();
    }

    /** Un mensaje de la familia, con su foto (o la inicial) y la letra más grande que quepa. */
    private View tarjetaMensaje(final Datos.Mensaje m, Calendar ahora, boolean dos) {
        final LinearLayout t = tarjeta(false);
        t.setGravity(Gravity.CENTER_VERTICAL);
        int lado = dos ? 72 : 96;
        LinearLayout cab = new LinearLayout(this);
        cab.setOrientation(LinearLayout.HORIZONTAL);
        cab.setGravity(Gravity.CENTER_VERTICAL);
        if (!m.de.isEmpty()) {
            Bitmap foto = Fotos.circulo(this, m.autor, m.foto, px(lado));
            LinearLayout.LayoutParams lpAv = lp(px(lado), px(lado));
            lpAv.rightMargin = px(24);
            if (foto != null) {
                ImageView av = new ImageView(this);
                av.setImageBitmap(foto);
                cab.addView(av, lpAv);
            } else {
                TextView av = texto(lado * 0.54f, true);
                av.setGravity(Gravity.CENTER);
                av.setTextColor(Color.WHITE);
                av.setBackgroundDrawable(ovalo(p.avatar));
                av.setText(m.de.substring(0, 1).toUpperCase(new Locale("es")));
                cab.addView(av, lpAv);
            }
        }
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView quien = texto(dos ? 40 : 48, true);
        quien.setTextColor(p.acentoTexto);
        quien.setText(m.de.isEmpty() ? "Mensaje" : m.de + " dice");
        col.addView(quien);
        if (m.t > 0) {
            TextView cuando = texto(36, false);
            cuando.setTextColor(p.sub);
            cuando.setText(Texto.cuandoEscribio(m.t, ahora));
            col.addView(cuando);
        }
        cab.addView(col);
        t.addView(cab);

        final TextView tx = texto(76, true);
        tx.setLineSpacing(0, 1.1f);
        tx.setTextColor(p.texto);
        tx.setText(m.texto);
        LinearLayout.LayoutParams lpT = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpT.topMargin = px(dos ? 12 : 20);
        t.addView(tx, lpT);
        // Se prueba de mayor a menor: la letra crece hasta llenar la tarjeta (hasta 96 px) y solo encoge si no cabe.
        final int[] tamanos = dos ? new int[]{80, 72, 64, 56, 50, 44, 40, 36} : new int[]{96, 88, 80, 72, 64, 56, 50, 44, 40, 36};
        final View cabeza = cab;
        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                int ancho = t.getWidth() - t.getPaddingLeft() - t.getPaddingRight();
                int alto = t.getHeight() - t.getPaddingTop() - t.getPaddingBottom() - cabeza.getHeight()
                        - ((ViewGroup.MarginLayoutParams) tx.getLayoutParams()).topMargin;
                if (ancho <= 0 || alto <= 0) return;
                TextPaint tpnt = new TextPaint(Paint.ANTI_ALIAS_FLAG);
                tpnt.setTypeface(negrita);
                int elegido = tamanos[tamanos.length - 1];
                int anchoElegido = ancho;
                for (int z : tamanos) {
                    tpnt.setTextSize(z * s);
                    StaticLayout sl = new StaticLayout(m.texto, tpnt, ancho, Layout.Alignment.ALIGN_NORMAL, 1.1f, 0, false);
                    if (sl.getHeight() > alto) continue;
                    int w = ancho;
                    int lineas = sl.getLineCount();
                    if (lineas > 1 && lineas <= 3) {
                        // Reparto equilibrado (en Android 5.1 no hay BREAK_STRATEGY_BALANCED): el ancho más estrecho con las mismas líneas.
                        int lo = ancho / 2, hi = ancho;
                        for (int i = 0; i < 9; i++) {
                            int mid = (lo + hi) / 2;
                            int n = new StaticLayout(m.texto, tpnt, mid, Layout.Alignment.ALIGN_NORMAL, 1.1f, 0, false).getLineCount();
                            if (n <= lineas) hi = mid; else lo = mid + 1;
                        }
                        w = hi;
                        sl = new StaticLayout(m.texto, tpnt, w, Layout.Alignment.ALIGN_NORMAL, 1.1f, 0, false);
                    }
                    // Una palabra suelta en la última línea queda fea: se prefiere una letra algo menor.
                    boolean huerfana = sl.getLineCount() > 1 && sl.getLineWidth(sl.getLineCount() - 1) < w * 0.3f;
                    if (!huerfana) {
                        elegido = z;
                        anchoElegido = w;
                        break;
                    }
                }
                ViewGroup.LayoutParams lt = tx.getLayoutParams();
                lt.width = anchoElegido >= ancho ? ViewGroup.LayoutParams.MATCH_PARENT : anchoElegido + px(4);
                tx.setLayoutParams(lt);
                tx.setTextSize(TypedValue.COMPLEX_UNIT_PX, elegido * s);
            }
        });
        return t;
    }

    /** Lo próximo del calendario; de noche, lo de mañana (o lo de hoy si ya pasó la medianoche). */
    private View tarjetaEventos(Calendar ahora, boolean deNoche, boolean deManana) {
        final LinearLayout t = tarjeta(false);
        List<Datos.Evento> lista = new ArrayList<>();
        for (Datos.Evento e : datos.eventos) if (e.manana == deManana) lista.add(e);

        final TextView titulo = texto(44, true);
        titulo.setTextColor(p.acentoTexto);
        if (deNoche) {
            Calendar dia = (Calendar) ahora.clone();
            if (deManana) dia.add(Calendar.DAY_OF_YEAR, 1);
            titulo.setText((deManana ? "Mañana, " : "Hoy, ") + Texto.nombreDia(dia).toLowerCase(new Locale("es")));
        } else {
            titulo.setText(lista.isEmpty() ? "Hoy" : "Lo próximo");
        }
        t.addView(titulo);

        final LinearLayout listaEv = new LinearLayout(this);
        listaEv.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lpLista = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpLista.topMargin = px(14);
        t.addView(listaEv, lpLista);

        if (lista.isEmpty()) {
            TextView vacio = texto(48, true);
            vacio.setTextColor(p.sub);
            vacio.setText((deManana ? "Mañana" : "Hoy") + " no hay nada apuntado.");
            listaEv.addView(vacio);
        }
        for (int i = 0; i < lista.size(); i++) listaEv.addView(itemEvento(lista.get(i), i == 0 && !deNoche, i > 0, deNoche));

        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                if (!llenar(t, 1.7f)) recortarEventos(t, titulo, listaEv);
            }
        });
        return t;
    }

    private View itemEvento(Datos.Evento e, boolean proximo, boolean separado, boolean grande) {
        String t = e.titulo.toLowerCase(new Locale("es"));
        int icono = R.drawable.ic_calendario;
        if (t.contains("merienda") || t.contains("café") || t.contains("cafe") || t.contains("desayuno")) icono = R.drawable.ic_taza;
        else if (t.contains("cena") || t.contains("comida") || t.contains("almuerzo") || t.contains("comer")) icono = R.drawable.ic_cubiertos;
        else if (t.contains("llamar") || t.contains("llamada") || t.contains("teléfono")) icono = R.drawable.ic_telefono;

        LinearLayout caja = new LinearLayout(this);
        caja.setOrientation(LinearLayout.HORIZONTAL);
        caja.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams lpCaja = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (separado) lpCaja.topMargin = px(grande ? 28 : 14);
        if (proximo) {
            caja.setBackgroundDrawable(caja(p.proximoFondo, 20, p.acentoTexto, 3));
            caja.setPadding(px(24), px(16), px(24), px(16));
        } else {
            caja.setPadding(px(8), px(8), px(8), px(8));
        }
        float lado = proximo || grande ? 80 : 60;
        ImageView ic = iconoRedondo(icono, p.avatar, lado, lado * 0.56f);
        LinearLayout.LayoutParams lpIc = lp(px(lado), px(lado));
        lpIc.rightMargin = px(20);
        caja.addView(ic, lpIc);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView hora = texto(proximo ? 56 : grande ? 64 : 44, true);
        hora.setTextColor(p.texto);
        hora.setText(e.hora.isEmpty() ? "Todo el día" : e.hora);
        TextView nombre = texto(proximo ? 44 : grande ? 52 : 40, true);
        nombre.setTextColor(proximo || grande ? p.texto : p.sub);
        nombre.setText(e.titulo);
        nombre.setMaxLines(2);
        nombre.setEllipsize(TextUtils.TruncateAt.END);
        col.addView(hora);
        col.addView(nombre);
        caja.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        caja.setLayoutParams(lpCaja);
        return caja;
    }

    /** Si hay más eventos de los que caben, deja los primeros y avisa de cuántos faltan. */
    private void recortarEventos(LinearLayout t, TextView titulo, LinearLayout lista) {
        int ancho = t.getWidth() - t.getPaddingLeft() - t.getPaddingRight();
        int alto = t.getHeight() - t.getPaddingTop() - t.getPaddingBottom() - titulo.getHeight() - px(14);
        if (ancho <= 0 || alto <= 0) return;
        int quitados = 0;
        while (lista.getChildCount() > 1) {
            lista.measure(View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            if (lista.getMeasuredHeight() <= alto - (quitados == 0 ? 0 : px(52))) break;
            lista.removeViewAt(lista.getChildCount() - 1);
            quitados++;
        }
        if (quitados == 0) return;
        // El aviso "…y N más" solo se pone si cabe; si no, mejor dejar el hueco limpio que una letra cortada.
        lista.measure(View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        if (lista.getMeasuredHeight() + px(52) > alto) return;
        TextView mas = texto(36, true);
        mas.setTextColor(p.sub);
        mas.setText(quitados == 1 ? "…y 1 más" : "…y " + quitados + " más");
        LinearLayout.LayoutParams l = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        l.topMargin = px(10);
        lista.addView(mas, l);
    }

    /** El tiempo de hoy y de mañana, cada uno con su frase de qué ponerse. El texto no baja de 40 px. */
    private View tarjetaTiempo() {
        final LinearLayout t = tarjeta(true);
        t.setTag("tiempo");
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(px(32), px(20), px(32), px(20));
        Datos.Dia hoy = datos.hoy;
        if (hoy == null) {
            hoy = new Datos.Dia();
            hoy.temp = datos.temperatura;
            hoy.codigo = datos.codigoTiempo;
        }
        t.addView(filaTiempo("Hoy", hoy.temp, hoy.codigo, false));
        if (datos.manana != null) t.addView(filaTiempo("Mañana", datos.manana.temp, datos.manana.codigo, true));
        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                llenar(t, 1.8f);
            }
        });
        return t;
    }

    private View filaTiempo(String dia, int temp, int codigo, boolean separada) {
        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        ImageView ic = icono(Texto.iconoDelTiempo(codigo), p.acentoTexto, 72);
        LinearLayout.LayoutParams lpIc = lp(px(72), px(72));
        lpIc.rightMargin = px(20);
        fila.addView(ic, lpIc);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        LinearLayout l1 = new LinearLayout(this);
        l1.setOrientation(LinearLayout.HORIZONTAL);
        l1.setGravity(Gravity.BOTTOM);
        TextView d = texto(40, false);
        d.setTextColor(p.sub);
        d.setText(dia);
        TextView g = texto(64, true);
        g.setTextColor(p.texto);
        g.setText(temp + "°");
        LinearLayout.LayoutParams lpG = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpG.leftMargin = px(18);
        l1.addView(d);
        l1.addView(g, lpG);
        TextView e = texto(40, false);
        e.setTextColor(p.texto);
        e.setText(Texto.consejo(temp, codigo));
        col.addView(l1);
        col.addView(e);
        fila.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams lf = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (separada) lf.topMargin = px(14);
        fila.setLayoutParams(lf);
        return fila;
    }

    /** "Es hora de dormir." con la luna y, debajo, lo primero de mañana. */
    private View tarjetaDormir(boolean conAgenda, List<Datos.Evento> lista, boolean deManana) {
        LinearLayout t = tarjeta(false);
        t.setTag("dormir");
        t.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        ImageView luna = icono(R.drawable.ic_luna, p.acentoTexto, 96);
        LinearLayout.LayoutParams lpL = lp(px(96), px(96));
        lpL.rightMargin = px(24);
        fila.addView(luna, lpL);
        String txt = datos != null && !datos.nocheTexto.isEmpty() ? datos.nocheTexto : "Es hora de dormir.";
        int salto = txt.indexOf('\n');
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView a = texto(64, true);
        a.setTextColor(p.texto);
        a.setLineSpacing(0, 1.05f);
        a.setText(salto < 0 ? txt : txt.substring(0, salto).trim());
        col.addView(a);
        if (salto >= 0 && salto < txt.length() - 1) {
            TextView b = texto(40, false);
            b.setTextColor(p.sub);
            b.setText(txt.substring(salto + 1).trim());
            col.addView(b);
        }
        fila.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        t.addView(fila);
        if (conAgenda) {
            String dia = deManana ? "Mañana" : "Hoy";
            View raya = new View(this);
            raya.setBackgroundColor(p.borde);
            LinearLayout.LayoutParams lpR = lp(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(2, px(p.grosorBorde)));
            lpR.topMargin = px(18);
            lpR.bottomMargin = px(14);
            t.addView(raya, lpR);
            TextView cuando = texto(40, false);
            cuando.setTextColor(p.sub);
            TextView que = texto(52, true);
            que.setTextColor(p.texto);
            que.setSingleLine(true);
            que.setEllipsize(TextUtils.TruncateAt.END);
            if (lista.isEmpty()) {
                cuando.setText(dia);
                que.setText("No hay nada apuntado.");
                que.setTextColor(p.sub);
            } else {
                Datos.Evento e = lista.get(0);
                cuando.setText(dia + (e.hora.isEmpty() ? ", todo el día" : " a las " + e.hora)
                        + (lista.size() > 1 ? " (y " + (lista.size() - 1) + " más)" : ""));
                que.setText(e.titulo);
            }
            t.addView(cuando);
            t.addView(que);
        }
        return t;
    }

    /** "Si necesitas algo, llama a Daniel" con su teléfono. */
    private View tarjetaTelefono() {
        LinearLayout t = tarjeta(true);
        t.setOrientation(LinearLayout.HORIZONTAL);
        t.setGravity(Gravity.CENTER_VERTICAL);
        ImageView tel = icono(R.drawable.ic_telefono, p.acentoTexto, 96);
        LinearLayout.LayoutParams lpT = lp(px(96), px(96));
        lpT.rightMargin = px(28);
        t.addView(tel, lpT);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView a = texto(40, false);
        a.setTextColor(p.sub);
        a.setText("Si necesitas algo");
        TextView b = texto(56, true);
        b.setTextColor(p.texto);
        b.setSingleLine(true);
        b.setText("Llama a " + datos.contactoNombre);
        col.addView(a);
        col.addView(b);
        if (!datos.contactoTelefono.isEmpty()) {
            TextView n = texto(60, true);
            n.setTextColor(p.acentoTexto);
            n.setSingleLine(true);
            n.setText(datos.contactoTelefono);
            col.addView(n);
        }
        t.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return t;
    }
}
