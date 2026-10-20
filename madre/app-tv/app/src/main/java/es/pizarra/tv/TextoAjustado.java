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
 */
final class TextoAjustado extends TextView {
    private float pedido;              // tamaño que se quiere, en px
    private final float minimo;        // tamaño mínimo, en px
    private int lineasBase = -1;       // líneas que se piden; -1 si no se pidió ninguna

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

    private void ajustar(int ancho) {
        String txt = getText().toString();
        TextPaint tp = new TextPaint(getPaint());
        float piso = Math.min(minimo, pedido);
        float paso = Math.max(1f, pedido * 0.03f);
        float tam = pedido;
        while (true) {
            tp.setTextSize(tam);
            if (lineas(txt, tp, ancho) <= lineasBase) {
                aplicar(tam, lineasBase);
                return;
            }
            if (tam <= piso) break;
            tam = Math.max(piso, tam - paso);
        }
        tp.setTextSize(piso);                                   // en el mínimo: una línea más (hasta 3)
        aplicar(piso, Math.max(lineasBase, Math.min(3, lineas(txt, tp, ancho))));
    }

    private void aplicar(float tam, int lineasMax) {
        if (Math.abs(getTextSize() - tam) > 0.01f) super.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, tam);
        if (getMaxLines() != lineasMax) super.setMaxLines(lineasMax);
    }
}
