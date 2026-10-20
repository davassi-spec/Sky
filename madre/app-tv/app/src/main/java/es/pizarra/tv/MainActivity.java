package es.pizarra.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Paint;
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
 * Pizarra para la TV. Arriba el día y la hora (en cifras y en palabras), una barra con
 * la parte del día, a la izquierda el mensaje de la familia, a la derecha los eventos
 * y abajo el tiempo. De noche, la misma pantalla en oscuro con el aviso de dormir.
 * No tiene botones: solo se mira.
 *
 * Los datos vienen del script de Google (madre/apps-script). La dirección y la clave
 * se guardan una vez con:
 *   adb shell am start -n es.pizarra.tv/.MainActivity --es url "https://script.google.com/macros/s/XXXX/exec" --es k "CLAVE"
 */
public class MainActivity extends Activity {
    private static final String TAG = "Pizarra";
    private static final long MAX_EDAD_CACHE_MS = 12L * 60 * 60 * 1000;

    private static final class Paleta {
        final int fondo, texto, sub, tarjeta, borde, barraOff, barraOffTexto, avatar, proximoFondo, tira, divisor, guiones;

        Paleta(int fondo, int texto, int sub, int tarjeta, int borde, int barraOff, int barraOffTexto,
               int avatar, int proximoFondo, int tira, int divisor, int guiones) {
            this.fondo = fondo; this.texto = texto; this.sub = sub; this.tarjeta = tarjeta; this.borde = borde;
            this.barraOff = barraOff; this.barraOffTexto = barraOffTexto; this.avatar = avatar;
            this.proximoFondo = proximoFondo; this.tira = tira; this.divisor = divisor; this.guiones = guiones;
        }
    }

    // Colores tomados del diseño "Pizarra para mamá" (pantallas Tarde y Noche).
    private static final Paleta DIA = new Paleta(0xFFFBF6EC, 0xFF2B2620, 0xFF5E564A, 0xFFFFFFFF, 0xFFDDD0B6,
            0xFFEFE3CC, 0xFF5E564A, 0xFF0E8F8F, 0xFFE0E7F6, 0xFFF4EAD7, 0xFFC5B591, 0xFF5A4D3E);
    private static final Paleta NOCHE = new Paleta(0xFF1A1612, 0xFFF4EAD7, 0xFFC9BBA3, 0xFF26201A, 0xFF3A3128,
            0xFF2A231C, 0xFFA99B84, 0xFF0E8F8F, 0xFF26201A, 0xFF2A231C, 0xFF5A4D3E, 0xFF5A4D3E);
    private static final int AMBAR = 0xFFC0760A, AZUL_NOCHE = 0xFF3A4C94, AZUL_AVISO = 0xFF2747A8;

    private final Handler h = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private float s;                      // 1 = pantalla de 1080 px de alto
    private Typeface negrita, normal;
    private Datos datos;
    private boolean noche;
    private String claveVista = "";
    private final List<Datos.Mensaje> mostrados = new ArrayList<>();
    private final List<TextView> textosMensaje = new ArrayList<>();
    private int tamAvatar = 96;

    private LinearLayout raiz, fila, tarjetaMsg, tarjetaEv, listaEv, tira;
    private LinearLayout[] celdas = new LinearLayout[3];
    private ImageView[] iconosCelda = new ImageView[3];
    private TextView[] textosCelda = new TextView[3];
    private TextView tvDia, tvFecha, tvHora, tvHablada, tvTituloEv;
    private int eventosTotales;

    private final Runnable tic = new Runnable() {
        @Override public void run() {
            pintarReloj();
            h.postDelayed(this, 5000);
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
        negrita = Typeface.createFromAsset(getAssets(), "fonts/AtkinsonHyperlegible-Bold.ttf");
        normal = Typeface.createFromAsset(getAssets(), "fonts/AtkinsonHyperlegible-Regular.ttf");
        leerConfiguracion(getIntent());
        cargarCache();
        construir();
        pintarReloj();
        pintar();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        leerConfiguracion(i);
        pintar();
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
                    final String cuerpo = leer(c.getInputStream());
                    final Datos nuevo = Datos.parse(cuerpo);
                    prefs.edit().putString("cache", cuerpo).putLong("cacheT", System.currentTimeMillis()).apply();
                    h.post(new Runnable() {
                        @Override public void run() {
                            datos = nuevo;
                            claveVista = "";
                            pintarReloj();
                            pintar();
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

    private GradientDrawable caja(int fondo, float radio, int borde, float grosor, boolean guiones) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fondo);
        g.setCornerRadius(radio * s);
        if (grosor > 0) {
            if (guiones) g.setStroke(px(grosor), borde, px(10), px(8));
            else g.setStroke(px(grosor), borde);
        }
        return g;
    }

    private GradientDrawable ovalo(int color) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(color);
        return g;
    }

    private LinearLayout.LayoutParams params(int ancho, int alto) {
        return new LinearLayout.LayoutParams(ancho, alto);
    }

    private ImageView iconoRedondo(int recurso, int color, float diametro, float interior) {
        ImageView v = new ImageView(this);
        v.setImageResource(recurso);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setBackgroundDrawable(ovalo(color));
        int pad = px((diametro - interior) / 2f);
        v.setPadding(pad, pad, pad, pad);
        v.setLayoutParams(params(px(diametro), px(diametro)));
        return v;
    }

    /* ---------- Construcción de la pantalla ---------- */

    private void construir() {
        raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(px(72), px(48), px(72), px(48));

        // Cabecera: día y fecha a la izquierda; hora en cifras y en palabras a la derecha.
        LinearLayout cab = new LinearLayout(this);
        cab.setOrientation(LinearLayout.HORIZONTAL);
        cab.setGravity(Gravity.BOTTOM);
        LinearLayout izq = new LinearLayout(this);
        izq.setOrientation(LinearLayout.VERTICAL);
        tvDia = texto(132, true);
        tvDia.setLineSpacing(0, 0.9f);
        tvFecha = texto(58, true);
        izq.addView(tvDia);
        LinearLayout.LayoutParams lpFecha = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpFecha.topMargin = px(8);
        izq.addView(tvFecha, lpFecha);
        cab.addView(izq, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout der = new LinearLayout(this);
        der.setOrientation(LinearLayout.VERTICAL);
        der.setGravity(Gravity.RIGHT);
        tvHora = texto(132, true);
        tvHora.setLineSpacing(0, 0.9f);
        tvHora.setSingleLine(true);
        tvHablada = texto(50, true);
        tvHablada.setSingleLine(true);
        der.addView(tvHora);
        LinearLayout.LayoutParams lpHab = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpHab.topMargin = px(8);
        der.addView(tvHablada, lpHab);
        LinearLayout.LayoutParams lpDer = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpDer.leftMargin = px(48);
        cab.addView(der, lpDer);
        raiz.addView(cab, params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Barra: mañana / tarde / noche
        LinearLayout barra = new LinearLayout(this);
        barra.setOrientation(LinearLayout.HORIZONTAL);
        for (int i = 0; i < 3; i++) {
            LinearLayout c = new LinearLayout(this);
            c.setOrientation(LinearLayout.HORIZONTAL);
            c.setGravity(Gravity.CENTER);
            ImageView ic = new ImageView(this);
            ic.setScaleType(ImageView.ScaleType.FIT_CENTER);
            LinearLayout.LayoutParams lpIc = params(px(48), px(48));
            lpIc.rightMargin = px(18);
            c.addView(ic, lpIc);
            TextView t = texto(36, true);
            t.setSingleLine(true);
            c.addView(t);
            LinearLayout.LayoutParams lpC = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
            if (i > 0) lpC.leftMargin = px(12);
            barra.addView(c, lpC);
            celdas[i] = c;
            iconosCelda[i] = ic;
            textosCelda[i] = t;
        }
        LinearLayout.LayoutParams lpBarra = params(ViewGroup.LayoutParams.MATCH_PARENT, px(88));
        lpBarra.topMargin = px(28);
        raiz.addView(barra, lpBarra);

        // Dos tarjetas: mensaje (izquierda) y eventos (derecha)
        fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        tarjetaMsg = new LinearLayout(this);
        tarjetaMsg.setOrientation(LinearLayout.VERTICAL);
        tarjetaMsg.setGravity(Gravity.CENTER_VERTICAL);
        tarjetaMsg.setPadding(px(48), px(40), px(48), px(40));
        fila.addView(tarjetaMsg, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1.55f));
        tarjetaEv = new LinearLayout(this);
        tarjetaEv.setOrientation(LinearLayout.VERTICAL);
        tarjetaEv.setPadding(px(40), px(40), px(40), px(40));
        LinearLayout.LayoutParams lpEv = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        lpEv.leftMargin = px(28);
        fila.addView(tarjetaEv, lpEv);
        LinearLayout.LayoutParams lpFila = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        lpFila.topMargin = px(28);
        raiz.addView(fila, lpFila);
        View.OnLayoutChangeListener ajuste = new View.OnLayoutChangeListener() {
            @Override public void onLayoutChange(View v, int l, int t, int r, int b, int ol, int ot, int or, int ob) {
                if (r - l != or - ol || b - t != ob - ot) {
                    if (v == tarjetaMsg) ajustarMensajes(); else ajustarEventos();
                }
            }
        };
        tarjetaMsg.addOnLayoutChangeListener(ajuste);
        tarjetaEv.addOnLayoutChangeListener(ajuste);

        // Franja de abajo: el tiempo (de día) o a quién llamar (de noche)
        tira = new LinearLayout(this);
        tira.setOrientation(LinearLayout.HORIZONTAL);
        tira.setGravity(Gravity.CENTER_VERTICAL);
        tira.setPadding(px(40), 0, px(40), 0);
        LinearLayout.LayoutParams lpTira = params(ViewGroup.LayoutParams.MATCH_PARENT, px(128));
        lpTira.topMargin = px(28);
        raiz.addView(tira, lpTira);

        setContentView(raiz);
    }

    /* ---------- Pintar ---------- */

    private void pintarReloj() {
        Calendar a = Calendar.getInstance();
        int hora = a.get(Calendar.HOUR_OF_DAY);
        tvDia.setText(Texto.nombreDia(a));
        tvFecha.setText(Texto.fecha(a));
        tvHora.setText(Texto.horaCifras(a));
        tvHablada.setText(Texto.horaHablada(a));
        boolean n = datos != null ? datos.esNoche(hora) : (hora >= 21 || hora < 6);
        String clave = n + "/" + Texto.franja(hora) + "/" + (hora == 12) + "/" + (hora < 12) + "/" + a.get(Calendar.DAY_OF_YEAR);
        if (!clave.equals(claveVista)) {
            claveVista = clave;
            noche = n;
            pintar();
        }
    }

    private void pintar() {
        Calendar ahora = Calendar.getInstance();
        int hora = ahora.get(Calendar.HOUR_OF_DAY);
        Paleta p = noche ? NOCHE : DIA;
        raiz.setBackgroundColor(p.fondo);
        tvDia.setTextColor(p.texto);
        tvFecha.setTextColor(p.sub);
        tvHora.setTextColor(p.texto);
        tvHablada.setTextColor(p.sub);
        pintarBarra(hora, p);
        pintarMensajes(p, ahora);
        pintarEventos(p, ahora, hora);
        pintarTira(p);

        boolean verMsg = tarjetaMsg.getVisibility() == View.VISIBLE;
        boolean verEv = tarjetaEv.getVisibility() == View.VISIBLE;
        fila.setVisibility(verMsg || verEv ? View.VISIBLE : View.GONE);
        ((LinearLayout.LayoutParams) tarjetaEv.getLayoutParams()).leftMargin = verMsg ? px(28) : 0;
        tarjetaEv.requestLayout();
    }

    private void pintarBarra(int hora, Paleta p) {
        String[] nombres = {"Mañana", "Tarde", "Noche"};
        int activa = Texto.franja(hora);
        for (int i = 0; i < 3; i++) {
            boolean on = i == activa;
            int fondo = !on ? p.barraOff : (i == Texto.NOCHE ? AZUL_NOCHE : AMBAR);
            celdas[i].setBackgroundDrawable(caja(fondo, 16, 0, 0, false));
            textosCelda[i].setText(on ? Texto.franjaActiva(hora) : nombres[i]);
            textosCelda[i].setTextSize(TypedValue.COMPLEX_UNIT_PX, (on ? 42 : 36) * s);
            textosCelda[i].setTextColor(on ? Color.WHITE : p.barraOffTexto);
            iconosCelda[i].setVisibility(on ? View.VISIBLE : View.GONE);
            iconosCelda[i].setImageResource(i == Texto.NOCHE ? R.drawable.ic_luna : R.drawable.ic_sol);
        }
    }

    /** Tarjeta de la izquierda: el mensaje de la familia, o el aviso de dormir por la noche. */
    private void pintarMensajes(Paleta p, Calendar ahora) {
        tarjetaMsg.removeAllViews();
        mostrados.clear();
        textosMensaje.clear();
        tarjetaMsg.setBackgroundDrawable(caja(p.tarjeta, 24, p.borde, 2, false));
        boolean conectada = !prefs.getString("url", "").isEmpty();

        if (!conectada) {
            TextView t = texto(76, true);
            t.setTextColor(p.texto);
            t.setText("Falta conectar la pizarra.");
            tarjetaMsg.addView(t);
            tarjetaMsg.setVisibility(View.VISIBLE);
            return;
        }
        if (noche) {
            String txt = datos != null && !datos.nocheTexto.isEmpty() ? datos.nocheTexto : "Es hora de dormir.";
            int salto = txt.indexOf('\n');
            TextView titulo = texto(92, true);
            titulo.setTextColor(p.texto);
            titulo.setLineSpacing(0, 1.08f);
            titulo.setText(salto < 0 ? txt : txt.substring(0, salto).trim());
            tarjetaMsg.addView(titulo);
            if (salto >= 0 && salto < txt.length() - 1) {
                TextView sub = texto(56, true);
                sub.setTextColor(p.sub);
                sub.setLineSpacing(0, 1.2f);
                sub.setText(txt.substring(salto + 1).trim());
                LinearLayout.LayoutParams lp = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                lp.topMargin = px(24);
                tarjetaMsg.addView(sub, lp);
            }
            tarjetaMsg.setVisibility(View.VISIBLE);
            return;
        }
        if (datos == null || !datos.verMensajes || datos.mensajes.isEmpty()) {
            tarjetaMsg.setVisibility(View.GONE);
            return;
        }
        for (int i = 0; i < Math.min(2, datos.mensajes.size()); i++) mostrados.add(datos.mensajes.get(i));
        tamAvatar = mostrados.size() > 1 ? 64 : 96;
        for (int i = 0; i < mostrados.size(); i++) {
            Datos.Mensaje m = mostrados.get(i);
            LinearLayout cabecera = new LinearLayout(this);
            cabecera.setOrientation(LinearLayout.HORIZONTAL);
            cabecera.setGravity(Gravity.CENTER_VERTICAL);
            if (!m.de.isEmpty()) {
                TextView av = texto(tamAvatar * 0.54f, true);
                av.setGravity(Gravity.CENTER);
                av.setTextColor(Color.WHITE);
                av.setBackgroundDrawable(ovalo(p.avatar));
                av.setText(m.de.substring(0, 1).toUpperCase(new Locale("es")));
                LinearLayout.LayoutParams lpAv = params(px(tamAvatar), px(tamAvatar));
                lpAv.rightMargin = px(24);
                cabecera.addView(av, lpAv);
            }
            LinearLayout col = new LinearLayout(this);
            col.setOrientation(LinearLayout.VERTICAL);
            TextView quien = texto(mostrados.size() > 1 ? 34 : 40, true);
            quien.setTextColor(p.texto);
            quien.setText(m.de.isEmpty() ? "Mensaje" : "Mensaje de " + m.de);
            col.addView(quien);
            if (m.t > 0) {
                TextView cuando = texto(mostrados.size() > 1 ? 26 : 30, false);
                cuando.setTextColor(p.sub);
                cuando.setText(Texto.cuandoEscribio(m.t, ahora));
                col.addView(cuando);
            }
            cabecera.addView(col);
            LinearLayout.LayoutParams lpCab = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (i > 0) lpCab.topMargin = px(36);
            tarjetaMsg.addView(cabecera, lpCab);

            TextView t = texto(76, true);
            t.setLineSpacing(0, 1.12f);
            t.setTextColor(p.texto);
            t.setText(m.texto);
            LinearLayout.LayoutParams lpT = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lpT.topMargin = px(24);
            tarjetaMsg.addView(t, lpT);
            textosMensaje.add(t);
        }
        tarjetaMsg.setVisibility(View.VISIBLE);
        tarjetaMsg.post(new Runnable() { @Override public void run() { ajustarMensajes(); } });
    }

    /** Tarjeta de la derecha: lo que hay en el calendario. */
    private void pintarEventos(Paleta p, Calendar ahora, int hora) {
        tarjetaEv.removeAllViews();
        tarjetaEv.setBackgroundDrawable(caja(p.tarjeta, 24, p.borde, 2, false));
        boolean ver = datos != null && datos.verEventos && !prefs.getString("url", "").isEmpty();
        tarjetaEv.setVisibility(ver ? View.VISIBLE : View.GONE);
        if (!ver) return;

        // De noche se enseña lo de mañana (después de medianoche, lo de hoy).
        boolean deManana = noche && hora >= 12;
        String titulo;
        if (noche) {
            Calendar dia = (Calendar) ahora.clone();
            if (deManana) dia.add(Calendar.DAY_OF_YEAR, 1);
            titulo = (deManana ? "Mañana, " : "Hoy, ") + Texto.nombreDia(dia).toLowerCase(new Locale("es"));
        } else {
            titulo = Texto.tituloEventos(hora);
        }
        tvTituloEv = texto(40, true);
        tvTituloEv.setTextColor(p.texto);
        tvTituloEv.setText(titulo);
        tarjetaEv.addView(tvTituloEv);

        listaEv = new LinearLayout(this);
        listaEv.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lpLista = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpLista.topMargin = px(20);
        tarjetaEv.addView(listaEv, lpLista);

        List<Datos.Evento> lista = new ArrayList<>();
        for (Datos.Evento e : datos.eventos) if (e.manana == deManana) lista.add(e);
        eventosTotales = lista.size();
        if (lista.isEmpty()) {
            TextView vacio = texto(42, true);
            vacio.setTextColor(p.sub);
            vacio.setText((deManana ? "Mañana" : "Hoy") + " no hay nada apuntado.");
            listaEv.addView(vacio);
        }
        for (int i = 0; i < lista.size(); i++) listaEv.addView(itemEvento(lista.get(i), i == 0 && !noche, p, i > 0));
        tarjetaEv.post(new Runnable() { @Override public void run() { ajustarEventos(); } });
    }

    private View itemEvento(Datos.Evento e, boolean proximo, Paleta p, boolean separado) {
        String t = e.titulo.toLowerCase(new Locale("es"));
        int icono = R.drawable.ic_calendario;
        int color = AZUL_NOCHE;
        if (t.contains("merienda") || t.contains("café") || t.contains("cafe") || t.contains("desayuno")) {
            icono = R.drawable.ic_taza; color = 0xFFD63D6B;
        } else if (t.contains("cena") || t.contains("comida") || t.contains("almuerzo") || t.contains("comer")) {
            icono = R.drawable.ic_cubiertos; color = 0xFF4F8F3A;
        } else if (t.contains("llamar") || t.contains("llamada") || t.contains("teléfono")) {
            icono = R.drawable.ic_telefono; color = 0xFF0E8F8F;
        }

        LinearLayout caja = new LinearLayout(this);
        caja.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lpCaja = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (separado) lpCaja.topMargin = px(20);
        if (proximo) {
            caja.setBackgroundDrawable(caja(p.proximoFondo, 18, AZUL_AVISO, 3, false));
            caja.setPadding(px(28), px(24), px(28), px(24));
            TextView chip = texto(24, true);
            chip.setText("LO PRÓXIMO");
            chip.setTextColor(Color.WHITE);
            chip.setLetterSpacing(0.08f);
            chip.setBackgroundDrawable(caja(AZUL_AVISO, 8, 0, 0, false));
            chip.setPadding(px(14), px(6), px(14), px(6));
            LinearLayout.LayoutParams lpChip = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lpChip.bottomMargin = px(12);
            caja.addView(chip, lpChip);
        } else if (noche) {
            caja.setBackgroundDrawable(caja(Color.TRANSPARENT, 18, p.guiones, 2, true));
            caja.setPadding(px(28), px(28), px(28), px(28));
        } else {
            caja.setBackgroundDrawable(caja(Color.TRANSPARENT, 18, p.borde, 2, false));
            caja.setPadding(px(28), px(20), px(28), px(20));
        }

        LinearLayout linea = new LinearLayout(this);
        linea.setOrientation(LinearLayout.HORIZONTAL);
        linea.setGravity(Gravity.CENTER_VERTICAL);
        ImageView ic = iconoRedondo(icono, color, 72, 40);
        LinearLayout.LayoutParams lpIc = params(px(72), px(72));
        lpIc.rightMargin = px(20);
        linea.addView(ic, lpIc);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView hora = texto(noche ? 46 : 50, true);
        hora.setTextColor(p.texto);
        hora.setText(e.hora.isEmpty() ? "Todo el día" : e.hora);
        TextView nombre = texto(noche ? 40 : 42, true);
        nombre.setTextColor(noche ? p.sub : p.texto);
        nombre.setText(e.titulo);
        nombre.setMaxLines(2);
        nombre.setEllipsize(TextUtils.TruncateAt.END);
        col.addView(hora);
        col.addView(nombre);
        linea.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        caja.addView(linea);
        caja.setLayoutParams(lpCaja);
        return caja;
    }

    private void pintarTira(Paleta p) {
        tira.removeAllViews();
        tira.setBackgroundDrawable(caja(p.tira, 24, 0, 0, false));
        boolean conectada = !prefs.getString("url", "").isEmpty();
        if (!conectada || datos == null) {
            tira.setVisibility(View.GONE);
            return;
        }
        if (noche) {
            if (datos.contactoNombre.isEmpty()) {
                tira.setVisibility(View.GONE);
                return;
            }
            tira.setVisibility(View.VISIBLE);
            ImageView tel = iconoRedondo(R.drawable.ic_telefono, 0xFF0E8F8F, 84, 44);
            LinearLayout.LayoutParams lpTel = params(px(84), px(84));
            lpTel.rightMargin = px(28);
            tira.addView(tel, lpTel);
            TextView llama = texto(46, true);
            llama.setTextColor(p.texto);
            llama.setText("¿Necesitas algo? Llama a " + datos.contactoNombre);
            tira.addView(llama);
            if (!datos.contactoTelefono.isEmpty()) {
                TextView num = texto(46, true);
                num.setTextColor(p.sub);
                num.setText(datos.contactoTelefono);
                LinearLayout.LayoutParams lpNum = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                lpNum.leftMargin = px(28);
                tira.addView(num, lpNum);
            }
            return;
        }
        if (!datos.verTiempo || !datos.hayTiempo) {
            tira.setVisibility(View.GONE);
            return;
        }
        tira.setVisibility(View.VISIBLE);
        ImageView ic = new ImageView(this);
        ic.setImageResource(Texto.iconoDelTiempo(datos.codigoTiempo));
        ic.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams lpIc = params(px(84), px(84));
        lpIc.rightMargin = px(32);
        tira.addView(ic, lpIc);
        TextView grados = texto(84, true);
        grados.setTextColor(p.texto);
        grados.setText(datos.temperatura + "°");
        tira.addView(grados);
        TextView estado = texto(44, true);
        estado.setTextColor(p.texto);
        estado.setText(Texto.estadoDelTiempo(datos.codigoTiempo));
        LinearLayout.LayoutParams lpEs = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lpEs.leftMargin = px(32);
        tira.addView(estado, lpEs);
        View raya = new View(this);
        raya.setBackgroundColor(p.divisor);
        LinearLayout.LayoutParams lpRaya = params(px(2), ViewGroup.LayoutParams.MATCH_PARENT);
        lpRaya.topMargin = px(28);
        lpRaya.bottomMargin = px(28);
        lpRaya.leftMargin = px(32);
        lpRaya.rightMargin = px(32);
        tira.addView(raya, lpRaya);
        TextView consejo = texto(40, false);
        consejo.setTextColor(p.texto);
        consejo.setMaxLines(2);
        consejo.setEllipsize(TextUtils.TruncateAt.END);
        consejo.setText(Texto.consejo(datos.temperatura, datos.codigoTiempo));
        tira.addView(consejo, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    }

    /* ---------- Ajustes de tamaño ---------- */

    /** Busca la letra más grande con la que caben los mensajes en la tarjeta. */
    private void ajustarMensajes() {
        if (tarjetaMsg.getVisibility() != View.VISIBLE || mostrados.isEmpty()) return;
        int ancho = tarjetaMsg.getWidth() - tarjetaMsg.getPaddingLeft() - tarjetaMsg.getPaddingRight();
        int alto = tarjetaMsg.getHeight() - tarjetaMsg.getPaddingTop() - tarjetaMsg.getPaddingBottom();
        if (ancho <= 0 || alto <= 0) return;
        int[] tamanos = mostrados.size() > 1 ? new int[]{56, 50, 44, 40, 36, 32} : new int[]{76, 68, 60, 52, 46, 40, 34};
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTypeface(negrita);
        int elegido = tamanos[tamanos.length - 1];
        for (int t : tamanos) {
            float total = 0;
            for (int i = 0; i < mostrados.size(); i++) {
                tp.setTextSize(t * s);
                total += new StaticLayout(mostrados.get(i).texto, tp, ancho, Layout.Alignment.ALIGN_NORMAL, 1.12f, 0, false).getHeight();
                total += px(tamAvatar) + px(24);
                if (i > 0) total += px(36);
            }
            if (total <= alto) {
                elegido = t;
                break;
            }
        }
        for (TextView v : textosMensaje) v.setTextSize(TypedValue.COMPLEX_UNIT_PX, elegido * s);
    }

    /** Si hay más eventos de los que caben en la tarjeta, deja los primeros y avisa de cuántos faltan. */
    private void ajustarEventos() {
        if (tarjetaEv.getVisibility() != View.VISIBLE || listaEv == null || tvTituloEv == null) return;
        int ancho = tarjetaEv.getWidth() - tarjetaEv.getPaddingLeft() - tarjetaEv.getPaddingRight();
        int alto = tarjetaEv.getHeight() - tarjetaEv.getPaddingTop() - tarjetaEv.getPaddingBottom()
                - tvTituloEv.getHeight() - px(20);
        if (ancho <= 0 || alto <= 0) return;
        int quitados = 0;
        while (listaEv.getChildCount() > 1) {
            listaEv.measure(View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            if (listaEv.getMeasuredHeight() <= alto) break;
            listaEv.removeViewAt(listaEv.getChildCount() - 1);
            quitados++;
        }
        if (quitados > 0) {
            TextView mas = texto(32, true);
            mas.setTextColor(noche ? NOCHE.sub : DIA.sub);
            mas.setText(quitados == 1 ? "…y 1 más" : "…y " + quitados + " más");
            LinearLayout.LayoutParams lp = params(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = px(12);
            listaEv.addView(mas, lp);
        }
    }
}
