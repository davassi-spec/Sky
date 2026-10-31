package es.pizarra.tv;

import android.content.Context;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.widget.TextView;

/**
 * Un texto que nunca se corta. Si no cabe en las líneas que se le dan (setMaxLines), primero baja la letra hasta un
 * mínimo (36 px en una pantalla de 1080) y, si aun así no cabe, usa una línea más (hasta 3).
 * Sin setMaxLines no hace nada: el texto se reparte en tantas líneas como haga falta.
 * Nunca se parte una palabra: si una palabra no cabe entera en el ancho se baja la letra, y en el mínimo el texto se
 * recorta por palabras con "…" al final (solo una palabra más larga que toda la línea se acorta ella misma con "…").
 */
final class TextoAjustado extends TextView {
    private float pedido;              // tamaño que se quiere, en px
    private final float minimo;        // tamaño mínimo, en px
    private int lineasBase = -1;       // líneas que se piden; -1 si no se pidió ninguna
    private CharSequence pedidoTexto;  // el texto tal como lo pusieron (sin recortar)
    private boolean interno;

    TextoAjustado(Context c, float minimoPx) {
        super(c);
        minimo = minimoPx;
        setEllipsize(TextUtils.TruncateAt.END);
    }

    @Override
    public void setTextSize(int unidad, float tam) {
        super.setTextSize(unidad, tam);
        pedido = getTextSize();
    }

    @Override
    public void setText(CharSequence t, BufferType tipo) {
        if (!interno) pedidoTexto = t;
        super.setText(t, tipo);
    }

    @Override
    public void setMaxLines(int n) {
        super.setMaxLines(n);
        lineasBase = n > 0 && n < 100 ? n : -1;
    }

    @Override
    protected void onMeasure(int anchoSpec, int altoSpec) {
        if (lineasBase > 0 && MeasureSpec.getMode(anchoSpec) != MeasureSpec.UNSPECIFIED && getText().length() > 0) {
            int ancho = MeasureSpec.getSize(anchoSpec) - getPaddingLeft() - getPaddingRight();
            if (ancho > 0) ajustar(ancho);
        }
        super.onMeasure(anchoSpec, altoSpec);
    }

    private int lineas(String txt, TextPaint tp, int ancho) {
        return new StaticLayout(txt, tp, ancho, Layout.Alignment.ALIGN_NORMAL, 1f, 0, false).getLineCount();
    }

    /** ¿Cabe cada palabra entera en una línea? Si no, la línea se rompería a mitad de palabra. */
    static boolean palabrasCaben(String txt, TextPaint tp, int ancho) {
        for (String w : txt.split("\\s+")) if (tp.measureText(w) > ancho) return false;
        return true;
    }

    /** El texto más largo (por palabras, con "…" al final) que cabe en ese ancho y esas líneas (y alto, si alto > 0). */
    static String recortar(String txt, TextPaint tp, int ancho, int lineasMax, int alto) {
        String[] pal = txt.trim().split("\\s+");
        for (int i = 0; i < pal.length; i++) {
            String w = pal[i];
            if (tp.measureText(w) > ancho) {                      // una palabra más ancha que la línea: se acorta ella, y hasta ahí
                while (w.length() > 1 && tp.measureText(w + "…") > ancho) w = w.substring(0, w.length() - 1);
                StringBuilder b = new StringBuilder();
                for (int j = 0; j < i; j++) b.append(pal[j]).append(' ');
                String cand = b + w + "…";
                if (i == 0) return cand;
                String sin = b.toString().trim() + "…";
                return new StaticLayout(cand, tp, ancho, Layout.Alignment.ALIGN_NORMAL, 1f, 0, false).getLineCount() <= lineasMax ? cand : sin;
            }
        }
        for (int n = pal.length; n >= 1; n--) {
            StringBuilder b = new StringBuilder();
            for (int j = 0; j < n; j++) b.append(j > 0 ? " " : "").append(pal[j]);
            String cand = n < pal.length ? b + "…" : b.toString();
            StaticLayout sl = new StaticLayout(cand, tp, ancho, Layout.Alignment.ALIGN_NORMAL, 1f, 0, false);
            if (sl.getLineCount() <= lineasMax && (alto <= 0 || sl.getHeight() <= alto)) return cand;
        }
        return pal[0];
    }

    private void ajustar(int ancho) {
        String txt = (pedidoTexto != null ? pedidoTexto : getText()).toString();
        TextPaint tp = new TextPaint(getPaint());
        float piso = Math.min(minimo, pedido);
        float paso = Math.max(1f, pedido * 0.03f);
        float tam = pedido;
        while (true) {
            tp.setTextSize(tam);
            if (lineas(txt, tp, ancho) <= lineasBase && palabrasCaben(txt, tp, ancho)) {
                ponerTexto(txt);
                aplicar(tam, lineasBase);
                return;
            }
            if (tam <= piso) break;
            tam = Math.max(piso, tam - paso);
        }
        tp.setTextSize(piso);                                   // en el mínimo: una línea más (hasta 3)
        if (palabrasCaben(txt, tp, ancho) && lineas(txt, tp, ancho) <= Math.max(lineasBase, 3)) {
            ponerTexto(txt);
            aplicar(piso, Math.max(lineasBase, Math.min(3, lineas(txt, tp, ancho))));
            return;
        }
        int maximo = Math.max(lineasBase, 3);                   // sigue sin caber: se recorta por palabras con "…"
        ponerTexto(recortar(txt, tp, ancho, maximo, 0));
        aplicar(piso, maximo);
    }

    private void ponerTexto(String t) {
        if (getText().toString().equals(t)) return;
        interno = true;
        setText(t);
        interno = false;
    }

    private void aplicar(float tam, int lineasMax) {
        if (Math.abs(getTextSize() - tam) > 0.01f) super.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, tam);
        if (getMaxLines() != lineasMax) super.setMaxLines(lineasMax);
    }
}
