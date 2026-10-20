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
    private LinearLayout recView;        // la pantalla del recordatorio (ocupa todo, sustituye a la pizarra)
    private TextView tvRecTop;
    private PantallaMedio pm;            // foto, audio o vídeo a pantalla completa (null si no hay)
    private String ordenCerrado = "";   // el último envío que ya terminó (para no ponerlo dos veces)

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
            // Mientras hay un recordatorio en pantalla se pregunta más a menudo, para volver a la pizarra enseguida al confirmarlo.
            h.postDelayed(this, datos != null && (datos.pidenCaptura || datos.rapido || datos.medio != null) ? 6000 : datos != null && datos.recordatorio != null ? 15000 : 60000);
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
        cerrarMedio(false);
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
            datos = Datos.parse(c, t);      // el recordatorio guardado caduca contando desde que llegó
            datos.pruebaEstilo = null;      // una prueba de hace rato ya no vale
            datos.medio = null;             // un envío de hace rato no se vuelve a poner
            datos.rapido = false;
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
                    if (nuevo.recordatorio != null) Fotos.asegurar(MainActivity.this, url, k, nuevo.recordatorio.id, nuevo.recordatorio.foto);
                    h.post(new Runnable() {
                        @Override public void run() {
                            datos = nuevo;
                            pintarReloj();
                            gestionarMedio();
                            if (nuevo.pidenCaptura) mandarCaptura(url, k);
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

    /* ---------- Fotos, audios y vídeos que manda la familia ---------- */

    /** Pone, actualiza o quita la pantalla de un envío según lo que diga el script. De noche nunca se pone nada. */
    private void gestionarMedio() {
        final Datos.Medio m = datos == null ? null : datos.medio;
        if (m == null || datos.esNocheAhora(Hora.ahora().get(Calendar.HOUR_OF_DAY))) {
            if (pm != null) cerrarMedio(false);
            return;
        }
        if (m.orden.equals(ordenCerrado)) return;
        if (pm != null && pm.orden.equals(m.orden)) {
            pm.actualizar(m);
            return;
        }
        cerrarMedio(false);
        final String url = prefs.getString("url", "");
        final String k = prefs.getString("k", "");
        pm = new PantallaMedio(this, s, negrita, normal, m, new PantallaMedio.AlFinal() {
            @Override public void terminado() {
                Medios.informar(url, k, m.orden, "terminado", null);
                ordenCerrado = m.orden;
                cerrarMedio(true);
            }
            @Override public void error(String mensaje) {
                Medios.informar(url, k, m.orden, "error", mensaje);
                ordenCerrado = m.orden;
                cerrarMedio(true);
            }
        });
        marco.addView(pm, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Medios.informar(url, k, m.orden, "descargando", null);
        final PantallaMedio mia = pm;
        new Thread(new Runnable() {
            @Override public void run() {
                final java.io.File f = Medios.descargar(MainActivity.this, url, k, m);
                final Bitmap poster = f != null && "video".equals(m.tipo) ? PantallaMedio.fotogramaDe(f) : null;
                h.post(new Runnable() {
                    @Override public void run() {
                        if (pm != mia) return;                       // mientras tanto se quitó o llegó otro
                        if (f == null) {
                            Medios.informar(url, k, m.orden, "error", "La tele no ha podido bajar el envío. Comprueba que tiene internet.");
                            ordenCerrado = m.orden;
                            cerrarMedio(true);
                            return;
                        }
                        mia.reproducir(f, poster);
                        Medios.informar(url, k, m.orden, "reproduciendo", null);
                    }
                });
            }
        }).start();
    }

    /** Solo para pruebas: como si el script hubiera mandado este estado. */
    void mostrarMedioDePrueba(String json) throws Exception {
        datos = Datos.parse(json);
        gestionarMedio();
    }

    private void cerrarMedio(boolean buscarEnseguida) {
        if (pm == null) return;
        pm.cerrar();
        marco.removeView(pm);
        pm = null;
        if (buscarEnseguida) {
            h.removeCallbacks(busca);
            h.postDelayed(busca, 1500);
        }
    }

    private long ultimaCaptura;

    /** Alguien mira la vista previa en el panel: se manda una foto de la pantalla (como mucho una cada 5 s). */
    private void mandarCaptura(final String url, final String k) {
        if (System.currentTimeMillis() - ultimaCaptura < 5000) return;
        ultimaCaptura = System.currentTimeMillis();
        final Bitmap b = Captura.dibujar(marco);
        if (b == null) return;
        new Thread(new Runnable() {
            @Override public void run() {
                Captura.enviar(url, k, Captura.comprimir(b));
                b.recycle();
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
        TextView t = new TextoAjustado(this, 36 * s);       // nunca se corta: baja hasta 36 px y luego usa otra línea
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
            float base = (Float) tag;
            float tam = base * k;
            if (k < 1f) tam = Math.max(tam, Math.min(base, 36f));          // al encoger, nunca por debajo de 36 px
            ((TextView) v).setTextSize(TypedValue.COMPLEX_UNIT_PX, tam * s);
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
    private boolean llenar(LinearLayout t, float kmax) {
        return llenar(t, kmax, false);
    }

    /** Con encoger=true, si ni siquiera cabe al tamaño base se prueba más pequeño (hasta 0,55 veces; los textos nunca bajan de 36 px). */
    private boolean llenar(final LinearLayout t, float kmax, boolean encoger) {
        int ancho = t.getWidth();
        int alto = t.getHeight();
        if (ancho <= 0 || alto <= 0) return true;
        int n = Math.round((kmax - 1f) * 10f);
        int total = n + 1 + (encoger ? 9 : 0);
        for (int idx = 0; idx < total; idx++) {
            float k = idx <= n ? 1f + (n - idx) / 10f : 1f - (idx - n) * 0.05f;
            escalar(t, k);
            t.measure(View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            if (t.getMeasuredHeight() <= alto && !desbordaAncho(t)) {
                t.post(new Runnable() { @Override public void run() { t.requestLayout(); } });
                return true;
            }
        }
        escalar(t, 1f);
        return false;
    }

    /** ¿Alguna línea de una sola línea se sale por el lado al agrandarla? (ya medido) */
    private boolean desbordaAncho(View v) {
        if (v instanceof TextView) {
            TextView tv = (TextView) v;
            if (tv.getVisibility() == View.VISIBLE) {
                float ancho = tv.getMeasuredWidth() - tv.getPaddingLeft() - tv.getPaddingRight();
                if (ancho > 0) {
                    if (tv.getMaxLines() == 1 && tv.getPaint().measureText(tv.getText().toString()) > ancho) return true;
                    for (String w : tv.getText().toString().split("\\s+"))      // una palabra nunca se parte a mitad
                        if (tv.getPaint().measureText(w) > ancho) return true;
                }
            }
        } else if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) if (desbordaAncho(g.getChildAt(i))) return true;
        }
        return false;
    }

    /* ---------- Construcción de la pantalla ---------- */

    private void construir() {
        marco = new FrameLayout(this);
        raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(px(56), px(24), px(56), px(24));
        marco.addView(raiz, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        recView = new LinearLayout(this);
        recView.setOrientation(LinearLayout.VERTICAL);
        recView.setPadding(px(56), px(24), px(56), px(24));
        recView.setVisibility(View.GONE);
        marco.addView(recView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(marco);
        construirRaiz("clasica");        // se rehace con la distribución que toque al pintar
    }

    /* ---------- Distribuciones: Clásica, Reloj a la izquierda, Lista y Sencillo ---------- */

    private String distActual = "";
    private int anchoHablada = 1000;     // >0: la hora en palabras va en una sola línea de ese ancho; si no, se reparte en líneas
    private boolean compactoHora;        // Sencillo: "las 5:15 de la tarde" en una sola línea
    private TextView tvPre;
    private LinearLayout zonaMensajes, franja, colReloj;

    private void construirRaiz(String dist) {
        raiz.removeAllViews();
        distActual = dist;
        anchoHablada = -1;
        compactoHora = false;
        cuerpo = null; colIzq = null; colDer = null; zonaMensajes = null; franja = null; colReloj = null;
        construirBanda();
        if ("reloj".equals(dist)) construirReloj();
        else if ("lista".equals(dist)) construirLista();
        else if ("sencillo".equals(dist)) construirSencillo();
        else construirClasica();
    }

    /** Cuenta atrás (solo si toca): una franja arriba, a todo lo ancho, en todas las distribuciones. */
    private void construirBanda() {
        banda = new LinearLayout(this);
        banda.setOrientation(LinearLayout.HORIZONTAL);
        banda.setGravity(Gravity.CENTER);
        icBanda = new ImageView(this);
        icBanda.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams lpIcB = lp(px(56), px(56));
        lpIcB.rightMargin = px(24);
        banda.addView(icBanda, lpIcB);
        txBanda = texto(56, true);
        txBanda.setMaxLines(1);
        banda.addView(txBanda);
        banda.setMinimumHeight(px(80));
        banda.setPadding(px(24), px(8), px(24), px(8));
        LinearLayout.LayoutParams lpBanda = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpBanda.bottomMargin = px(12);
        raiz.addView(banda, lpBanda);
    }

    /** Los textos del reloj, con los tamaños de cada distribución (se crean siempre; cada distribución coloca los que usa). */
    private void crearCampos(int tDia, int tFecha, int tReloj, int tHablada, int tPildora) {
        tvDia = texto(tDia, true);
        tvDia.setMaxLines(1);
        tvFecha = texto(tFecha, true);
        tvFecha.setMaxLines(1);
        tvH = texto(tReloj, true);
        tvDos = texto(tReloj, true);
        tvM = texto(tReloj, true);
        tvDos.setText(":");
        tvPre = texto(tReloj, true);
        tvHablada = texto(tHablada, true);
        tvHablada.setMaxLines(1);
        pildora = new LinearLayout(this);
        pildora.setOrientation(LinearLayout.HORIZONTAL);
        pildora.setGravity(Gravity.CENTER_VERTICAL);
        pildora.setPadding(px(22), px(8), px(26), px(8));
        icPildora = new ImageView(this);
        icPildora.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams lpIcP = lp(px(tPildora + 2), px(tPildora + 2));
        lpIcP.rightMargin = px(14);
        pildora.addView(icPildora, lpIcP);
        txPildora = texto(tPildora, true);
        txPildora.setMaxLines(1);
        pildora.addView(txPildora);
    }

    private LinearLayout filaReloj(boolean conPrefijo) {
        LinearLayout reloj = new LinearLayout(this);
        reloj.setOrientation(LinearLayout.HORIZONTAL);
        if (conPrefijo) reloj.addView(tvPre);
        reloj.addView(tvH);
        reloj.addView(tvDos);
        reloj.addView(tvM);
        return reloj;
    }

    /** Clásica: cabecera con el día a la izquierda y la hora a la derecha; debajo, mensajes y tarjetas en dos columnas. */
    private void construirClasica() {
        crearCampos(120, 56, 180, 46, 46);
        anchoHablada = px(1000);
        LinearLayout cab = new LinearLayout(this);
        cab.setOrientation(LinearLayout.HORIZONTAL);
        cab.setGravity(Gravity.BOTTOM);
        LinearLayout izq = new LinearLayout(this);
        izq.setOrientation(LinearLayout.VERTICAL);
        izq.addView(tvDia);
        LinearLayout.LayoutParams lpFecha = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpFecha.topMargin = px(4);
        izq.addView(tvFecha, lpFecha);
        cab.addView(izq, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        LinearLayout der = new LinearLayout(this);
        der.setOrientation(LinearLayout.VERTICAL);
        der.setGravity(Gravity.RIGHT);
        // La letra deja aire arriba y abajo: se recorta para que la cabecera no crezca.
        LinearLayout.LayoutParams lpRel = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpRel.gravity = Gravity.RIGHT;
        lpRel.topMargin = -px(42);
        lpRel.bottomMargin = -px(42);
        der.addView(filaReloj(false), lpRel);
        LinearLayout.LayoutParams lpHab = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpHab.gravity = Gravity.RIGHT;
        lpHab.topMargin = px(4);
        der.addView(tvHablada, lpHab);
        LinearLayout.LayoutParams lpPil = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpPil.gravity = Gravity.RIGHT;
        lpPil.topMargin = px(10);
        der.addView(pildora, lpPil);
        LinearLayout.LayoutParams lpDer = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpDer.leftMargin = px(32);
        cab.addView(der, lpDer);
        raiz.addView(cab, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

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
    }

    /** Reloj a la izquierda: una columna con día, fecha, hora grande, hora en palabras y parte del día; mensajes a la derecha; franja abajo. */
    private void construirReloj() {
        crearCampos(100, 52, 210, 46, 44);
        tvFecha.setMaxLines(2);
        tvHablada.setMaxLines(2);
        colReloj = tarjeta(false);
        colReloj.setGravity(Gravity.CENTER_VERTICAL);
        colReloj.setPadding(px(44), px(28), px(44), px(28));
        colReloj.addView(tvDia, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams lpF = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpF.topMargin = px(4);
        colReloj.addView(tvFecha, lpF);
        LinearLayout.LayoutParams lpRel = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpRel.topMargin = -px(8);
        lpRel.bottomMargin = -px(34);
        colReloj.addView(filaReloj(false), lpRel);
        LinearLayout.LayoutParams lpH = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpH.topMargin = px(8);
        colReloj.addView(tvHablada, lpH);
        LinearLayout.LayoutParams lpP = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpP.topMargin = px(18);
        colReloj.addView(pildora, lpP);
        agrandarAlHueco(colReloj, 1.3f);

        cuerpo = new LinearLayout(this);
        cuerpo.setOrientation(LinearLayout.HORIZONTAL);
        cuerpo.addView(colReloj, lpPeso(0.78f));
        zonaMensajes = new LinearLayout(this);
        zonaMensajes.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lpZ = lpPeso(1f);
        lpZ.leftMargin = px(24);
        cuerpo.addView(zonaMensajes, lpZ);
        LinearLayout.LayoutParams lpCuerpo = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        lpCuerpo.topMargin = px(16);
        raiz.addView(cuerpo, lpCuerpo);
        anadirFranja();
    }

    /** Lista: cabecera a lo ancho; mensajes a lo ancho, uno debajo de otro, con la foto o la inicial grande; abajo, lo próximo y el tiempo. */
    private void construirLista() {
        crearCampos(96, 50, 150, 40, 40);
        tvHablada.setMaxLines(2);
        LinearLayout cab = tarjeta(true);
        cab.setOrientation(LinearLayout.HORIZONTAL);
        cab.setGravity(Gravity.CENTER_VERTICAL);
        cab.setPadding(px(40), px(16), px(40), px(16));
        LinearLayout izq = new LinearLayout(this);
        izq.setOrientation(LinearLayout.VERTICAL);
        izq.addView(tvDia);
        LinearLayout filaFecha = new LinearLayout(this);
        filaFecha.setOrientation(LinearLayout.HORIZONTAL);
        filaFecha.setGravity(Gravity.CENTER_VERTICAL);
        filaFecha.addView(tvFecha);
        LinearLayout.LayoutParams lpPil = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpPil.leftMargin = px(24);
        filaFecha.addView(pildora, lpPil);
        izq.addView(filaFecha);
        cab.addView(izq, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout der = new LinearLayout(this);
        der.setOrientation(LinearLayout.VERTICAL);
        der.setGravity(Gravity.RIGHT);
        LinearLayout.LayoutParams lpRel = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpRel.gravity = Gravity.RIGHT;
        lpRel.topMargin = -px(30);
        lpRel.bottomMargin = -px(30);
        der.addView(filaReloj(false), lpRel);
        LinearLayout.LayoutParams lpHab = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpHab.gravity = Gravity.RIGHT;
        lpHab.topMargin = px(4);
        der.addView(tvHablada, lpHab);
        LinearLayout.LayoutParams lpDer = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpDer.leftMargin = px(32);
        cab.addView(der, lpDer);
        raiz.addView(cab, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        anadirZonaYFranja();
    }

    /** Sencillo: día y hora en una línea arriba; el mensaje más reciente en una tarjeta enorme; abajo, lo próximo y el tiempo pequeños. */
    private void construirSencillo() {
        crearCampos(64, 56, 64, 64, 40);
        compactoHora = true;
        LinearLayout cab = new LinearLayout(this);
        cab.setOrientation(LinearLayout.HORIZONTAL);
        cab.setGravity(Gravity.CENTER_VERTICAL);
        cab.setPadding(px(8), px(4), px(8), px(12));
        cab.addView(tvDia, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout hora = filaReloj(true);
        LinearLayout.LayoutParams lpHora = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpHora.leftMargin = px(32);
        cab.addView(hora, lpHora);
        cab.addView(tvHablada, lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        raiz.addView(cab, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        View raya = new View(this);
        raya.setBackgroundColor(p.borde);
        raiz.addView(raya, lp(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(2, px(2))));
        anadirZonaYFranja();
    }

    private void anadirZonaYFranja() {
        zonaMensajes = new LinearLayout(this);
        zonaMensajes.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lpZ = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        lpZ.topMargin = px(16);
        raiz.addView(zonaMensajes, lpZ);
        anadirFranja();
    }

    private void anadirFranja() {
        franja = new LinearLayout(this);
        franja.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lpF = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(300));
        lpF.topMargin = px(16);
        raiz.addView(franja, lpF);
    }

    /* ---------- Reloj y cambio de pantalla ---------- */

    private void pintarReloj() {
        Calendar a = Hora.ahora();
        int hora = a.get(Calendar.HOUR_OF_DAY);
        if (datos != null && datos.recordatorio != null && System.currentTimeMillis() >= datos.recordatorio.hasta) datos.recordatorio = null;   // se acabó su tiempo
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
        if (tvRecTop != null && recView.getVisibility() == View.VISIBLE) setSiCambia(tvRecTop, lineaFina(a));
        int dos = cifras.indexOf(':');
        setSiCambia(tvH, cifras.substring(0, dos));
        setSiCambia(tvM, cifras.substring(dos + 1));
        boolean parte = datos == null || datos.verParte;
        if (compactoHora) {                      // Sencillo: "las 5:15 de la tarde"
            int h12 = a.get(Calendar.HOUR_OF_DAY) % 12 == 0 ? 12 : a.get(Calendar.HOUR_OF_DAY) % 12;
            setSiCambia(tvPre, h12 == 1 ? "la " : "las ");
            setSiCambia(tvHablada, parte ? " " + Texto.parteDelDia(a.get(Calendar.HOUR_OF_DAY)) : "");
            return;
        }
        String hablada = parte ? Texto.horaConParte(a) : Texto.horaHablada(a);
        if (anchoHablada > 0) {
            if (!hablada.contentEquals(tvHablada.getText())) ajustarLinea(tvHablada, hablada, anchoHablada, 46, 36);
        } else {
            setSiCambia(tvHablada, hablada);
        }
    }

    /** "Martes 20 de octubre · 5:15": la línea fina de arriba en la pantalla del recordatorio. */
    private static String lineaFina(Calendar a) {
        return Texto.nombreDia(a) + " " + Texto.fecha(a).replace(" de " + a.get(Calendar.YEAR), "") + " · " + Texto.horaCifras(a);
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
        Datos.Recordatorio rec = recordatorioVisible();
        if (rec != null) {
            raiz.setVisibility(View.GONE);
            recView.setVisibility(View.VISIBLE);
            marco.setBackgroundColor(p.fondo);
            pintarRecordatorio(ahora, rec);
            return;
        }
        raiz.setVisibility(View.VISIBLE);
        recView.setVisibility(View.GONE);
        raiz.setBackgroundColor(p.fondo);
        marco.setBackgroundColor(p.fondo);
        construirRaiz(datos != null ? datos.distribucionAhora() : "clasica");
        tvDia.setTextColor(p.texto);
        tvFecha.setTextColor(p.sub);
        tvH.setTextColor(compactoHora ? p.acentoTexto : p.texto);
        tvDos.setTextColor(compactoHora ? p.acentoTexto : p.texto);
        tvM.setTextColor(compactoHora ? p.acentoTexto : p.texto);
        tvPre.setTextColor(p.acentoTexto);
        tvHablada.setTextColor(compactoHora ? p.acentoTexto : p.sub);
        tvDia.setText(compactoHora ? Texto.nombreDia(ahora) + ", " + Texto.fecha(ahora) : Texto.nombreDia(ahora));
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
        if ("clasica".equals(distActual)) pintarCuerpo(ahora, hora);
        else pintarCuerpoDistribucion(ahora, hora);
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
        txBanda.setText(datos.cuenta.texto);
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

        izq.removeAll(java.util.Collections.singleton(null));        // las tarjetas vacías no se enseñan
        der.removeAll(java.util.Collections.singleton(null));
        if (izq.isEmpty() && der.size() > 1) izq.add(der.remove(0));  // sin nada a la izquierda, la primera pasa allí y las demás crecen
        if (izq.isEmpty()) { izq = der; der = new ArrayList<>(); }
        for (View v : izq) anadir(colIzq, v, 1f);
        for (View v : der) anadir(colDer, v, v.getTag() instanceof String && "tiempo".equals(v.getTag()) ? pesoTiempo : "dormir".equals(v.getTag()) ? 1.3f : 1f);
        cuerpo.setVisibility(izq.isEmpty() ? View.GONE : View.VISIBLE);
        colDer.setVisibility(der.isEmpty() ? View.GONE : View.VISIBLE);
        ((LinearLayout.LayoutParams) colIzq.getLayoutParams()).weight = der.isEmpty() ? 1f : 1.55f;
        ((LinearLayout.LayoutParams) colDer.getLayoutParams()).leftMargin = der.isEmpty() ? 0 : px(28);
        cuerpo.requestLayout();
    }

    /**
     * Elige la letra más grande de la lista con la que el texto cabe en ancho x alto y la pone. Prueba de mayor a menor:
     * crece hasta llenar el hueco y solo encoge si no cabe. Evita la palabra suelta en la última línea y, si el texto
     * ocupa dos o tres líneas, las reparte por igual (en Android 5.1 no hay BREAK_STRATEGY_BALANCED).
     */
    private void llenarTexto(TextView tx, String txt, Typeface tf, int ancho, int alto, int[] tamanos, float interlineado) {
        if (ancho <= 0 || alto <= 0) return;
        TextPaint tpnt = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tpnt.setTypeface(tf);
        int elegido = tamanos[tamanos.length - 1];
        int anchoElegido = ancho;
        for (int z : tamanos) {
            tpnt.setTextSize(z * s);
            StaticLayout sl = new StaticLayout(txt, tpnt, ancho, Layout.Alignment.ALIGN_NORMAL, interlineado, 0, false);
            if (sl.getHeight() > alto) continue;
            boolean palabraPartida = false;                         // una palabra que no cabe entera en el ancho se partiría a mitad
            for (String palabra : txt.split("\\s+")) if (tpnt.measureText(palabra) > ancho) { palabraPartida = true; break; }
            if (palabraPartida) continue;
            int w = ancho;
            int lineas = sl.getLineCount();
            if (lineas > 1 && lineas <= 3) {
                int lo = ancho / 2, hi = ancho;      // el ancho más estrecho con las mismas líneas
                for (int i = 0; i < 9; i++) {
                    int mid = (lo + hi) / 2;
                    int n = new StaticLayout(txt, tpnt, mid, Layout.Alignment.ALIGN_NORMAL, interlineado, 0, false).getLineCount();
                    if (n <= lineas) hi = mid; else lo = mid + 1;
                }
                w = hi;
                sl = new StaticLayout(txt, tpnt, w, Layout.Alignment.ALIGN_NORMAL, interlineado, 0, false);
            }
            boolean huerfana = sl.getLineCount() > 1 && sl.getLineWidth(sl.getLineCount() - 1) < w * 0.3f;
            if (!huerfana) {
                elegido = z;
                anchoElegido = w;
                break;
            }
        }
        tx.setTextSize(TypedValue.COMPLEX_UNIT_PX, elegido * s);
        ViewGroup.LayoutParams lt = tx.getLayoutParams();
        lt.width = anchoElegido >= ancho ? ViewGroup.LayoutParams.MATCH_PARENT : anchoElegido + px(4);
        tx.setLayoutParams(lt);
    }

    /* ---------- Pantalla del recordatorio ---------- */

    /** El recordatorio que toca enseñar: el script ya no lo manda de noche (salvo una prueba) y la TV lo vuelve a comprobar. */
    private Datos.Recordatorio recordatorioVisible() {
        if (datos == null || datos.recordatorio == null || prefs.getString("url", "").isEmpty()) return null;
        Datos.Recordatorio r = datos.recordatorio;
        if (System.currentTimeMillis() >= r.hasta) return null;
        if (noche && !r.prueba) return null;
        return r;
    }

    /**
     * La pantalla cambia entera: arriba una línea fina con el día y la hora; en el centro la foto grande y el texto
     * en letra enorme con la etiqueta AHORA; abajo, los mensajes de la familia.
     */
    private void pintarRecordatorio(Calendar ahora, final Datos.Recordatorio r) {
        recView.removeAllViews();
        recView.setBackgroundColor(p.fondo);
        tvRecTop = texto(44, true);
        tvRecTop.setTextColor(p.sub);
        tvRecTop.setMaxLines(1);
        tvRecTop.setText(lineaFina(ahora));
        recView.addView(tvRecTop, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        final LinearLayout card = tarjeta(false);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(px(40), px(32), px(40), px(32));
        final ImageView foto = new ImageView(this);
        foto.setScaleType(ImageView.ScaleType.FIT_XY);
        foto.setVisibility(View.GONE);
        card.addView(foto, lp(0, 0));
        final LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_VERTICAL);
        final TextView ahoraTx = texto(64, true);
        ahoraTx.setText("AHORA");
        ahoraTx.setTextColor(p.pillTexto);
        ahoraTx.setLetterSpacing(0.1f);
        ahoraTx.setBackgroundDrawable(caja(p.pillFondo, 24, p.borde, p.grosorBorde > 2 ? p.grosorBorde : 0));
        ahoraTx.setPadding(px(34), px(12), px(34), px(12));
        col.addView(ahoraTx, lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        final TextView principal = texto(140, true);
        principal.setTextColor(p.texto);
        principal.setLineSpacing(0, 1.05f);
        principal.setText(r.texto);
        LinearLayout.LayoutParams lpP = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpP.topMargin = px(24);
        col.addView(principal, lpP);
        final TextView pequeno = texto(56, false);
        pequeno.setTextColor(p.sub);
        pequeno.setText(r.texto2);
        LinearLayout.LayoutParams lpS = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpS.topMargin = px(20);
        pequeno.setVisibility(r.texto2.isEmpty() ? View.GONE : View.VISIBLE);
        col.addView(pequeno, lpS);
        card.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams lpCard = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        lpCard.topMargin = px(16);
        recView.addView(card, lpCard);

        card.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int rr, int b, int ol, int ot, int or, int ob) {
                if (rr - l == or - ol && b - tp == ob - ot) return;
                int anchoInt = card.getWidth() - card.getPaddingLeft() - card.getPaddingRight();
                int altoInt = card.getHeight() - card.getPaddingTop() - card.getPaddingBottom();
                if (anchoInt <= 0 || altoInt <= 0) return;
                // La foto, entera y sin deformar, con el tamaño más grande que quepa (hasta casi la mitad del ancho).
                int[] dim = Fotos.dimensiones(MainActivity.this, r.id, r.foto);
                int fw = 0, fh = 0;
                if (dim != null) {
                    float k = Math.min(anchoInt * 0.46f / dim[0], altoInt / (float) dim[1]);
                    fw = Math.round(dim[0] * k);
                    fh = Math.round(dim[1] * k);
                }
                Bitmap bmp = fw > 0 ? Fotos.redondeada(MainActivity.this, r.id, r.foto, fw, fh, px(32)) : null;
                LinearLayout.LayoutParams lf = (LinearLayout.LayoutParams) foto.getLayoutParams();
                if (bmp != null) {
                    foto.setImageBitmap(bmp);
                    lf.width = fw;
                    lf.height = fh;
                    lf.rightMargin = px(48);
                    foto.setVisibility(View.VISIBLE);
                } else {
                    fw = 0;
                    foto.setVisibility(View.GONE);
                }
                foto.setLayoutParams(lf);
                int anchoTexto = anchoInt - (bmp != null ? fw + px(48) : 0);
                ahoraTx.measure(View.MeasureSpec.makeMeasureSpec(anchoTexto, View.MeasureSpec.AT_MOST), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
                int alto = altoInt - ahoraTx.getMeasuredHeight() - px(24);
                if (!r.texto2.isEmpty()) {
                    // el texto pequeño ocupa a lo sumo un tercio; el principal se lleva el resto
                    llenarTexto(pequeno, r.texto2, normal, anchoTexto, altoInt / 3, new int[]{56, 50, 44, 40, 36}, 1.1f);
                    pequeno.measure(View.MeasureSpec.makeMeasureSpec(anchoTexto, View.MeasureSpec.AT_MOST), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
                    alto -= pequeno.getMeasuredHeight() + px(20);
                }
                llenarTexto(principal, r.texto, negrita, anchoTexto, alto, new int[]{160, 148, 136, 124, 112, 100, 92, 84, 76, 68, 60, 52, 46, 40, 36}, 1.05f);
                int g = bmp != null ? Gravity.LEFT : Gravity.CENTER_HORIZONTAL;
                principal.setGravity(g);
                pequeno.setGravity(g);
                col.setGravity(Gravity.CENTER_VERTICAL | (bmp != null ? Gravity.LEFT : Gravity.CENTER_HORIZONTAL));
                ((LinearLayout.LayoutParams) ahoraTx.getLayoutParams()).gravity = bmp != null ? Gravity.LEFT : Gravity.CENTER_HORIZONTAL;
                col.requestLayout();
            }
        });

        // Abajo, los mensajes de la familia (hasta dos, uno al lado del otro)
        int nm = datos.verMensajes ? Math.min(2, datos.mensajes.size()) : 0;
        if (nm > 0) {
            LinearLayout fila = new LinearLayout(this);
            fila.setOrientation(LinearLayout.HORIZONTAL);
            for (int i = 0; i < nm; i++) {
                LinearLayout.LayoutParams lm = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
                if (i > 0) lm.leftMargin = px(16);
                fila.addView(tarjetaMensajeMini(datos.mensajes.get(i)), lm);
            }
            recView.addView(fila, lp(ViewGroup.LayoutParams.MATCH_PARENT, px(210)));
            ((LinearLayout.LayoutParams) fila.getLayoutParams()).topMargin = px(16);
        }
    }

    /** Un mensaje pequeño para la franja de abajo: foto o inicial, quién lo dice y el texto. */
    private View tarjetaMensajeMini(final Datos.Mensaje m) {
        final LinearLayout t = tarjeta(false);
        t.setOrientation(LinearLayout.HORIZONTAL);
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(px(28), px(16), px(28), px(16));
        int lado = 88;
        if (!m.de.isEmpty()) {
            Bitmap foto = Fotos.circulo(this, m.autor, m.foto, px(lado));
            LinearLayout.LayoutParams lpAv = lp(px(lado), px(lado));
            lpAv.rightMargin = px(24);
            if (foto != null) {
                ImageView av = new ImageView(this);
                av.setImageBitmap(foto);
                t.addView(av, lpAv);
            } else {
                TextView av = texto(lado * 0.54f, true);
                av.setGravity(Gravity.CENTER);
                av.setTextColor(Color.WHITE);
                av.setBackgroundDrawable(ovalo(p.avatar));
                av.setText(m.de.substring(0, 1).toUpperCase(new Locale("es")));
                t.addView(av, lpAv);
            }
        }
        final LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView quien = texto(36, true);
        quien.setTextColor(p.acentoTexto);
        quien.setMaxLines(1);
        quien.setText(m.de.isEmpty() ? "Mensaje" : m.de + " dice");
        col.addView(quien);
        final TextView tx = texto(48, true);
        tx.setTextColor(p.texto);
        tx.setLineSpacing(0, 1.05f);
        tx.setText(m.texto);
        col.addView(tx, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        t.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        final int usado = px(lado) + px(24);
        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                int ancho = t.getWidth() - t.getPaddingLeft() - t.getPaddingRight() - (m.de.isEmpty() ? 0 : usado);
                int alto = t.getHeight() - t.getPaddingTop() - t.getPaddingBottom() - px(46);
                llenarTexto(tx, m.texto, negrita, ancho, alto, new int[]{52, 48, 44, 40, 36}, 1.05f);
            }
        });
        return t;
    }

    /* ---------- Cuerpo de Reloj, Lista y Sencillo ---------- */

    private int alturaFranja(boolean deNoche) {
        if ("sencillo".equals(distActual)) return deNoche ? 310 : 210;
        return deNoche ? 350 : 330;
    }

    private void pintarCuerpoDistribucion(Calendar ahora, int hora) {
        boolean conectada = !prefs.getString("url", "").isEmpty();
        boolean esLista = "lista".equals(distActual), esReloj = "reloj".equals(distActual), esSencillo = "sencillo".equals(distActual);
        int maxMsgs = esSencillo ? 1 : 2;
        List<View> msgs = new ArrayList<>();
        List<View> tarj = new ArrayList<>();
        if (!conectada) {
            LinearLayout t = tarjeta(false);
            t.setGravity(Gravity.CENTER_VERTICAL);
            TextView x = texto(76, true);
            x.setTextColor(p.texto);
            x.setText("Falta conectar la pizarra.");
            t.addView(x);
            msgs.add(t);
        } else if (datos != null) {
            int nm = datos.verMensajes ? Math.min(maxMsgs, datos.mensajes.size()) : 0;
            for (int i = 0; i < nm; i++) {
                Datos.Mensaje m = datos.mensajes.get(i);
                msgs.add(esLista ? tarjetaMensajeLista(m, nm > 1) : tarjetaMensaje(m, ahora, nm > 1));
            }
            if (noche) {
                boolean deManana = hora >= 12;
                List<Datos.Evento> lista = new ArrayList<>();
                for (Datos.Evento e : datos.eventos) if (e.manana == deManana) lista.add(e);
                tarj.add(tarjetaDormir(datos.verEventos, lista, deManana));
                if (!datos.contactoNombre.isEmpty()) tarj.add(tarjetaTelefono());
            } else {
                if (datos.verEventos) tarj.add(tarjetaProximoCompacto());
                if (datos.verTiempo && datos.hayTiempo) tarj.add(tarjetaTiempo(esSencillo));
            }
        }
        msgs.removeAll(java.util.Collections.singleton(null));          // las tarjetas vacías no se enseñan
        tarj.removeAll(java.util.Collections.singleton(null));
        if (esReloj && msgs.isEmpty() && !tarj.isEmpty()) { msgs = tarj; tarj = new ArrayList<>(); }   // sin mensajes, las tarjetas ocupan su sitio
        for (View v : msgs) anadir(zonaMensajes, v, 1f);
        zonaMensajes.setVisibility(msgs.isEmpty() ? View.GONE : View.VISIBLE);
        for (int i = 0; i < tarj.size(); i++) {
            View v = tarj.get(i);
            LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, "tiempo".equals(v.getTag()) ? 1f : 1.2f);
            if (i > 0) l.leftMargin = px(16);
            franja.addView(v, l);
        }
        franja.setVisibility(tarj.isEmpty() ? View.GONE : View.VISIBLE);
        LinearLayout.LayoutParams lf = (LinearLayout.LayoutParams) franja.getLayoutParams();
        if (!esReloj && msgs.isEmpty()) { lf.height = 0; lf.weight = 1f; }    // sin mensajes, las tarjetas se reparten todo el hueco
        else { lf.height = px(alturaFranja(noche)); lf.weight = 0f; }
        raiz.requestLayout();
    }

    /** Un mensaje de Lista: la foto o la inicial grande a la izquierda y, a su lado, quién lo dice y el mensaje. */
    private View tarjetaMensajeLista(final Datos.Mensaje m, final boolean dos) {
        final LinearLayout t = tarjeta(false);
        t.setOrientation(LinearLayout.HORIZONTAL);
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(px(36), px(16), px(36), px(16));
        final int lado = dos ? 120 : 190;
        if (!m.de.isEmpty()) {
            Bitmap foto = Fotos.circulo(this, m.autor, m.foto, px(lado));
            LinearLayout.LayoutParams lpAv = lp(px(lado), px(lado));
            lpAv.rightMargin = px(36);
            if (foto != null) {
                ImageView av = new ImageView(this);
                av.setImageBitmap(foto);
                t.addView(av, lpAv);
            } else {
                TextView av = texto(lado * 0.54f, true);
                av.setGravity(Gravity.CENTER);
                av.setTextColor(Color.WHITE);
                av.setBackgroundDrawable(ovalo(p.avatar));
                av.setText(m.de.substring(0, 1).toUpperCase(new Locale("es")));
                t.addView(av, lpAv);
            }
        }
        final LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        final TextView quien = texto(dos ? 48 : 56, true);
        quien.setTextColor(p.acentoTexto);
        quien.setMaxLines(1);
        quien.setText(m.de.isEmpty() ? "Mensaje" : m.de + " dice");
        col.addView(quien);
        final TextView tx = texto(76, true);
        tx.setTextColor(p.texto);
        tx.setLineSpacing(0, 1.05f);
        tx.setText(m.texto);
        col.addView(tx, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        t.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        final int usado = m.de.isEmpty() ? 0 : px(lado) + px(36);
        final int[] tamanos = dos ? new int[]{96, 88, 80, 72, 64, 56, 50, 44, 40, 36} : new int[]{132, 120, 108, 100, 92, 84, 76, 68, 60, 54, 48, 44, 40, 36};
        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                quien.measure(View.MeasureSpec.makeMeasureSpec(t.getWidth(), View.MeasureSpec.AT_MOST), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
                int ancho = t.getWidth() - t.getPaddingLeft() - t.getPaddingRight() - usado;
                int alto = t.getHeight() - t.getPaddingTop() - t.getPaddingBottom() - quien.getMeasuredHeight();
                llenarTexto(tx, m.texto, negrita, ancho, alto, tamanos, 1.05f);
            }
        });
        return t;
    }

    /** Lo próximo en la franja de abajo: el icono, la hora en palabras y qué es. */
    private View tarjetaProximoCompacto() {
        Datos.Evento e = null;
        for (Datos.Evento x : datos.eventos) if (!x.manana) { e = x; break; }
        if (e == null) return null;                      // sin nada apuntado hoy, no se enseña
        LinearLayout t = tarjeta(false);
        t.setBackgroundDrawable(caja(p.proximoFondo, 28, p.acentoTexto, 3));
        t.setOrientation(LinearLayout.HORIZONTAL);
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(px(32), px(16), px(32), px(16));
        String tl = e.titulo.toLowerCase(new Locale("es"));
        int icono = R.drawable.ic_calendario;
        if (tl.contains("merienda") || tl.contains("café") || tl.contains("cafe") || tl.contains("desayuno")) icono = R.drawable.ic_taza;
        else if (tl.contains("cena") || tl.contains("comida") || tl.contains("almuerzo") || tl.contains("comer")) icono = R.drawable.ic_cubiertos;
        else if (tl.contains("llamar") || tl.contains("llamada") || tl.contains("teléfono")) icono = R.drawable.ic_telefono;
        ImageView ic = iconoRedondo(icono, p.avatar, 96, 54);
        LinearLayout.LayoutParams lpIc = lp(px(96), px(96));
        lpIc.rightMargin = px(28);
        t.addView(ic, lpIc);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView hora = texto(44, true);
        hora.setTextColor(p.acentoTexto);
        hora.setMaxLines(2);
        hora.setText(e.hora.isEmpty() || Texto.aLas(e.hora).isEmpty() ? "Todo el día" : Texto.mayus(Texto.aLas(e.hora)));
        TextView nombre = texto(56, true);
        nombre.setTextColor(p.texto);
        nombre.setMaxLines(2);
        nombre.setText(e.titulo);
        col.addView(hora);
        col.addView(nombre);
        t.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        agrandarAlHueco(t, 1.6f);
        return t;
    }

    /** Un mensaje de la familia, con su foto (o la inicial) y la letra más grande que quepa. */
    private View tarjetaMensaje(final Datos.Mensaje m, Calendar ahora, boolean dos) {
        final LinearLayout t = tarjeta(false);
        t.setGravity(Gravity.CENTER_VERTICAL);
        int lado = dos ? 64 : 84;
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
        TextView quien = texto(dos ? 48 : 56, true);
        quien.setTextColor(p.acentoTexto);
        quien.setText(m.de.isEmpty() ? "Mensaje" : m.de + " dice");
        col.addView(quien);
        cab.addView(col);
        t.addView(cab);

        final TextView tx = texto(76, true);
        tx.setLineSpacing(0, 1.1f);
        tx.setTextColor(p.texto);
        tx.setText(m.texto);
        LinearLayout.LayoutParams lpT = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpT.topMargin = px(dos ? 8 : 14);
        t.addView(tx, lpT);
        // Se prueba de mayor a menor: la letra crece hasta llenar la tarjeta (hasta 96 px) y solo encoge si no cabe.
        final int[] tamanos = dos ? new int[]{92, 84, 76, 68, 60, 54, 48, 44, 40, 36}
                : "sencillo".equals(distActual) ? new int[]{200, 184, 168, 152, 136, 124, 112, 100, 92, 84, 76, 68, 60, 54, 48, 44, 40, 36}
                : new int[]{116, 108, 100, 92, 84, 76, 68, 60, 54, 48, 44, 40, 36};
        final View cabeza = cab;
        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                int ancho = t.getWidth() - t.getPaddingLeft() - t.getPaddingRight();
                int alto = t.getHeight() - t.getPaddingTop() - t.getPaddingBottom() - cabeza.getHeight()
                        - ((ViewGroup.MarginLayoutParams) tx.getLayoutParams()).topMargin;
                llenarTexto(tx, m.texto, negrita, ancho, alto, tamanos, 1.1f);
            }
        });
        return t;
    }

    /** Lo próximo del calendario; de noche, lo de mañana (o lo de hoy si ya pasó la medianoche). */
    private View tarjetaEventos(Calendar ahora, final boolean deNoche, boolean deManana) {
        final LinearLayout t = tarjeta(false);
        List<Datos.Evento> lista = new ArrayList<>();
        for (Datos.Evento e : datos.eventos) if (e.manana == deManana) lista.add(e);
        if (lista.isEmpty()) return null;               // una tarjeta vacía no se enseña: las demás ocupan su sitio

        final TextView titulo = texto(44, true);
        titulo.setTextColor(p.acentoTexto);
        if (deNoche) {
            Calendar dia = (Calendar) ahora.clone();
            if (deManana) dia.add(Calendar.DAY_OF_YEAR, 1);
            titulo.setText((deManana ? "Mañana, " : "Hoy, ") + Texto.nombreDia(dia).toLowerCase(new Locale("es")));
        } else {
            titulo.setText("Lo próximo");
        }
        t.addView(titulo);

        final LinearLayout listaEv = new LinearLayout(this);
        listaEv.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lpLista = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpLista.topMargin = px(14);
        t.addView(listaEv, lpLista);

        for (int i = 0; i < lista.size(); i++) listaEv.addView(itemEvento(lista.get(i), i == 0 && !deNoche, i > 0, deNoche));

        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                if (!llenar(t, 1.7f)) recortarEventos(t, titulo, listaEv, deNoche);
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
        TextView hora = texto(proximo ? 44 : grande ? 52 : 40, true);
        hora.setTextColor(p.texto);
        hora.setText(e.hora.isEmpty() || Texto.aLas(e.hora).isEmpty() ? "Todo el día" : Texto.mayus(Texto.aLas(e.hora)));
        hora.setMaxLines(2);
        TextView nombre = texto(proximo ? 52 : grande ? 52 : 40, true);
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
    private void recortarEventos(LinearLayout t, TextView titulo, LinearLayout lista, boolean conAviso) {
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
        if (quitados == 0 || !conAviso) return;          // de día se enseñan los que caben, sin "…y N más"
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
        return tarjetaTiempo(false);
    }

    private View tarjetaTiempo(boolean soloHoy) {
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
        if (datos.manana != null && !soloHoy) t.addView(filaTiempo("Mañana", datos.manana.temp, datos.manana.codigo, true));
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
        if (conAgenda && !lista.isEmpty()) {         // sin nada apuntado, no se enseña la línea
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
            que.setMaxLines(1);
            que.setEllipsize(TextUtils.TruncateAt.END);
            Datos.Evento e = lista.get(0);
            String cuandoTxt = e.hora.isEmpty() ? "todo el día" : Texto.aLas(e.hora);
            cuando.setText(dia + " " + (cuandoTxt.isEmpty() ? "todo el día" : cuandoTxt));      // "Mañana a las nueve"
            que.setText(Texto.mayus(e.titulo));
            t.addView(cuando);
            t.addView(que);
        }
        agrandarAlHueco(t, 3.2f);
        return t;
    }

    /** Cuando la tarjeta tiene sitio de sobra, letra e iconos crecen hasta llenarlo (como mucho kmax veces). */
    private void agrandarAlHueco(final LinearLayout t, final float kmax) {
        t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int tp, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l == or - ol && b - tp == ob - ot) return;
                llenar(t, kmax, true);
            }
        });
    }

    /** "Si necesitas algo / Llama a Daniel" y, debajo, el número: lo más grande de la tarjeta, que crece para llenarla. */
    private View tarjetaTelefono() {
        final LinearLayout t = tarjeta(true);
        t.setGravity(Gravity.CENTER_VERTICAL);
        final LinearLayout cab = new LinearLayout(this);
        cab.setOrientation(LinearLayout.HORIZONTAL);
        cab.setGravity(Gravity.CENTER_VERTICAL);
        ImageView tel = icono(R.drawable.ic_telefono, p.acentoTexto, 72);
        LinearLayout.LayoutParams lpT = lp(px(72), px(72));
        lpT.rightMargin = px(24);
        cab.addView(tel, lpT);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView a = texto(40, false);
        a.setTextColor(p.sub);
        a.setMaxLines(1);
        a.setText("Si necesitas algo");
        TextView b = texto(56, true);
        b.setTextColor(p.texto);
        b.setMaxLines(1);
        b.setText("Llama a " + datos.contactoNombre);
        col.addView(a);
        col.addView(b);
        cab.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        t.addView(cab);
        if (!datos.contactoTelefono.isEmpty()) {
            final TextView n = texto(120, true);
            n.setTextColor(p.acentoTexto);
            n.setMaxLines(1);
            n.setText(datos.contactoTelefono);
            LinearLayout.LayoutParams lpN = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lpN.topMargin = px(8);
            t.addView(n, lpN);
            t.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
                @Override public void onLayoutChange(View v, int l, int tp, int r, int bt, int ol, int ot, int or, int ob) {
                    if (r - l == or - ol && bt - tp == ob - ot) return;
                    // El número se lleva todo el alto que queda (la letra se encoge sola si no cabe a lo ancho, nunca por debajo de 36 px).
                    int alto = t.getHeight() - t.getPaddingTop() - t.getPaddingBottom() - cab.getHeight() - px(8);
                    if (alto > 0) n.setTextSize(TypedValue.COMPLEX_UNIT_PX, Math.min(300 * s, alto / 1.25f));
                }
            });
        }
        return t;
    }
}
