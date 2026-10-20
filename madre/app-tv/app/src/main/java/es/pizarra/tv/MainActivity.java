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
    private Paleta p = Paleta.de("calido", false);
    private String firma = "";            // lo que se ve ahora; si no cambia, no se repinta
    private boolean pintado;
    private boolean puntos = true;

    private FrameLayout marco;
    private LinearLayout raiz, cuerpo, colIzq, colDer, banda, filaHablada;
    private ImageView icBanda, icParte;
    private TextView txBanda, tvDia, tvFecha, tvH, tvDos, tvM, tvHablada;
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

    /* ---------- Construcción de la pantalla ---------- */

    private void construir() {
        marco = new FrameLayout(this);
        raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(px(56), px(28), px(56), px(28));
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
        LinearLayout.LayoutParams lpBanda = lp(ViewGroup.LayoutParams.MATCH_PARENT, px(88));
        lpBanda.bottomMargin = px(16);
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
        tvH = texto(176, true);
        tvDos = texto(176, true);
        tvM = texto(176, true);
        tvDos.setText(":");
        reloj.addView(tvH);
        reloj.addView(tvDos);
        reloj.addView(tvM);
        der.addView(reloj);
        filaHablada = new LinearLayout(this);
        filaHablada.setOrientation(LinearLayout.HORIZONTAL);
        filaHablada.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        icParte = new ImageView(this);
        icParte.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams lpParte = lp(px(48), px(48));
        lpParte.rightMargin = px(14);
        filaHablada.addView(icParte, lpParte);
        tvHablada = texto(46, true);
        tvHablada.setSingleLine(true);
        filaHablada.addView(tvHablada);
        LinearLayout.LayoutParams lpHab = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpHab.topMargin = px(4);
        der.addView(filaHablada, lpHab);
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
        lpCuerpo.topMargin = px(20);
        raiz.addView(cuerpo, lpCuerpo);

        setContentView(marco);
    }

    /* ---------- Reloj y cambio de pantalla ---------- */

    private void pintarReloj() {
        Calendar a = Hora.ahora();
        int hora = a.get(Calendar.HOUR_OF_DAY);
        boolean n = datos != null ? datos.esNocheAhora(hora) : (hora >= 21 || hora < 6);
        String estilo = datos != null ? datos.estiloAhora(n) : "calido";
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
        int ancho = px(1000) - (parte ? px(62) : 0);
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
        icParte.setVisibility(parte ? View.VISIBLE : View.GONE);
        icParte.setImageResource(noche ? R.drawable.ic_luna : R.drawable.ic_sol);
        icParte.setColorFilter(p.acentoTexto, PorterDuff.Mode.SRC_IN);
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
        t.setPadding(px(36), px(28), px(36), px(28));
        return t;
    }

    private void anadir(LinearLayout col, View v, boolean rellena) {
        LinearLayout.LayoutParams l = rellena
                ? new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
                : lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (col.getChildCount() > 0) l.topMargin = px(20);
        col.addView(v, l);
    }

    private void pintarCuerpo(Calendar ahora, int hora) {
        colIzq.removeAllViews();
        colDer.removeAllViews();
        tarjetasMsg.clear();
        boolean conectada = !prefs.getString("url", "").isEmpty();
        List<View> izq = new ArrayList<>();
        List<View> der = new ArrayList<>();

        if (!conectada) {
            LinearLayout t = tarjeta(false);
            t.setGravity(Gravity.CENTER_VERTICAL);
            TextView x = texto(76, true);
            x.setTextColor(p.texto);
            x.setText("Falta conectar la pizarra.");
            t.addView(x);
            izq.add(t);
        } else if (datos != null && noche) {
            boolean deManana = hora >= 12;
            if (datos.verEventos) izq.add(tarjetaEventos(ahora, true, deManana));
            else if (datos.verMensajes && !datos.mensajes.isEmpty()) izq.add(tarjetaMensaje(datos.mensajes.get(0), ahora, false));
            der.add(tarjetaDormir());
            if (!datos.contactoNombre.isEmpty()) der.add(tarjetaTelefono());
        } else if (datos != null) {
            int nm = datos.verMensajes ? Math.min(2, datos.mensajes.size()) : 0;
            for (int i = 0; i < nm; i++) izq.add(tarjetaMensaje(datos.mensajes.get(i), ahora, nm > 1));
            boolean compacto = datos.cuenta != null;
            View ev = datos.verEventos ? tarjetaEventos(ahora, false, false) : null;
            View tp = datos.verTiempo && datos.hayTiempo ? tarjetaTiempo(compacto) : null;
            if (nm > 0) {
                if (ev != null) der.add(ev);
                if (tp != null) der.add(tp);
            } else {
                if (ev != null) izq.add(ev);
                if (tp != null) (ev != null ? der : izq).add(tp);
            }
        }

        if (izq.isEmpty()) { izq = der; der = new ArrayList<>(); }
        for (View v : izq) anadir(colIzq, v, true);
        for (int i = 0; i < der.size(); i++) {
            View v = der.get(i);
            boolean ultimaTiempo = v.getTag() instanceof String && "tiempo".equals(v.getTag()) && der.size() > 1;
            anadir(colDer, v, !ultimaTiempo);
        }
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
        final int[] tamanos = dos ? new int[]{60, 54, 48, 44, 40, 36} : new int[]{80, 72, 64, 56, 50, 44, 40, 36};
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
                for (int z : tamanos) {
                    tpnt.setTextSize(z * s);
                    if (new StaticLayout(m.texto, tpnt, ancho, Layout.Alignment.ALIGN_NORMAL, 1.1f, 0, false).getHeight() <= alto) {
                        elegido = z;
                        break;
                    }
                }
                tx.setTextSize(TypedValue.COMPLEX_UNIT_PX, elegido * s);
            }
        });
        tarjetasMsg.add(t);
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
                recortarEventos(t, titulo, listaEv);
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
            caja.setPadding(px(24), px(18), px(24), px(18));
        } else {
            caja.setPadding(px(proximo ? 24 : 8), px(8), px(8), px(8));
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
        if (quitados > 0) {
            TextView mas = texto(36, true);
            mas.setTextColor(p.sub);
            mas.setText(quitados == 1 ? "…y 1 más" : "…y " + quitados + " más");
            LinearLayout.LayoutParams l = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            l.topMargin = px(10);
            lista.addView(mas, l);
        }
    }

    /** El tiempo de hoy y de mañana, con una frase de qué ponerse. */
    private View tarjetaTiempo(boolean compacto) {
        LinearLayout t = tarjeta(true);
        t.setTag("tiempo");
        t.setPadding(px(32), px(24), px(32), px(24));
        Datos.Dia hoy = datos.hoy;
        if (hoy == null) {
            hoy = new Datos.Dia();
            hoy.temp = datos.temperatura;
            hoy.codigo = datos.codigoTiempo;
        }
        t.addView(filaTiempo("Hoy", hoy.temp, hoy.codigo, false));
        if (datos.manana != null) {
            View f = filaTiempo("Mañana", datos.manana.temp, datos.manana.codigo, true);
            t.addView(f);
        }
        if (!compacto || datos.manana == null) {
            TextView consejo = texto(40, false);
            consejo.setTextColor(p.texto);
            consejo.setText(Texto.consejo(hoy.temp, hoy.codigo));
            LinearLayout.LayoutParams l = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            l.topMargin = px(14);
            t.addView(consejo, l);
        }
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
        TextView d = texto(36, false);
        d.setTextColor(p.sub);
        d.setText(dia);
        TextView g = texto(64, true);
        g.setTextColor(p.texto);
        g.setText(temp + "°");
        LinearLayout.LayoutParams lpG = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpG.leftMargin = px(18);
        l1.addView(d);
        l1.addView(g, lpG);
        TextView e = texto(40, true);
        e.setTextColor(p.texto);
        e.setSingleLine(true);
        e.setText(Texto.estadoDelTiempo(codigo));
        col.addView(l1);
        col.addView(e);
        fila.addView(col);
        LinearLayout.LayoutParams lf = lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (separada) lf.topMargin = px(12);
        fila.setLayoutParams(lf);
        return fila;
    }

    /** "Es hora de dormir." con la luna. */
    private View tarjetaDormir() {
        LinearLayout t = tarjeta(false);
        t.setOrientation(LinearLayout.HORIZONTAL);
        t.setGravity(Gravity.CENTER_VERTICAL);
        ImageView luna = icono(R.drawable.ic_luna, p.acentoTexto, 112);
        LinearLayout.LayoutParams lpL = lp(px(112), px(112));
        lpL.rightMargin = px(28);
        t.addView(luna, lpL);
        String txt = datos != null && !datos.nocheTexto.isEmpty() ? datos.nocheTexto : "Es hora de dormir.";
        int salto = txt.indexOf('\n');
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView a = texto(76, true);
        a.setTextColor(p.texto);
        a.setLineSpacing(0, 1.05f);
        a.setText(salto < 0 ? txt : txt.substring(0, salto).trim());
        col.addView(a);
        if (salto >= 0 && salto < txt.length() - 1) {
            TextView b = texto(44, false);
            b.setTextColor(p.sub);
            b.setText(txt.substring(salto + 1).trim());
            LinearLayout.LayoutParams l = lp(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            l.topMargin = px(10);
            col.addView(b, l);
        }
        t.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
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
