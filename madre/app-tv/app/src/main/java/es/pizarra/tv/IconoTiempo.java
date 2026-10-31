package es.pizarra.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.SystemClock;
import android.widget.ImageView;

/**
 * El dibujo del tiempo (sol, nubes, lluvia, nieve, tormenta, niebla) con un poco de movimiento para que la pantalla no quede estática:
 * el sol gira despacio y "respira", las nubes se mecen, la lluvia y la nieve caen, la tormenta destella y la niebla ondula.
 * Es un ImageView solo para que la pantalla lo escale como a los demás iconos (etiqueta float[]); se dibuja en una cuadrícula de 24 x 24.
 * Se redibuja unas 20 veces por segundo mientras esté en pantalla.
 */
final class IconoTiempo extends ImageView {
    static final int SOL = 0, PARCIAL = 1, NUBE = 2, LLUVIA = 3, NIEVE = 4, TORMENTA = 5, NIEBLA = 6;
    /** Solo para las pruebas: congela la animación en un instante (0..1 de un ciclo de 12 s) para que las capturas salgan siempre igual. */
    static Float fasePrueba;

    private static final int RETARDO_MS = 50;
    private final int categoria;
    private final int colorBase;
    private final boolean varios;       // true: sol ámbar, nube pizarra y gotas azules; false: todo del color base
    private final Paint trazo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path nube = new Path();
    private final Path rayo = new Path();
    private final Runnable repinta = new Runnable() {
        @Override public void run() {
            invalidate();
        }
    };

    IconoTiempo(Context c, int codigo, int colorBase, boolean varios) {
        super(c);
        this.categoria = categoriaDe(codigo);
        this.colorBase = colorBase;
        this.varios = varios;
        trazo.setStyle(Paint.Style.STROKE);
        trazo.setStrokeCap(Paint.Cap.ROUND);
        trazo.setStrokeJoin(Paint.Join.ROUND);
        trazo.setStrokeWidth(2f);
        // la nube: tres círculos y un fondo plano, unidos
        RectF r = new RectF();
        Path a = new Path(), b = new Path(), d = new Path(), f = new Path();
        a.addCircle(17f, 10f, 4f, Path.Direction.CW);
        b.addCircle(11.5f, 8.5f, 5.5f, Path.Direction.CW);
        d.addCircle(6.5f, 11f, 3f, Path.Direction.CW);
        r.set(6.5f, 10f, 17f, 14f);
        f.addRect(r, Path.Direction.CW);
        nube.set(a);
        nube.op(b, Path.Op.UNION);
        nube.op(d, Path.Op.UNION);
        nube.op(f, Path.Op.UNION);
        rayo.moveTo(13f, 14.5f);
        rayo.lineTo(10.5f, 18.5f);
        rayo.lineTo(13.5f, 18.5f);
        rayo.lineTo(11f, 22.5f);
    }

    static int categoriaDe(int codigo) {
        switch (codigo) {
            case 0: case 1: return SOL;
            case 2: return PARCIAL;
            case 45: case 48: return NIEBLA;
            case 51: case 53: case 55: case 61: case 63: case 65: case 80: case 81: case 82: return LLUVIA;
            case 71: case 73: case 75: return NIEVE;
            case 95: case 96: case 99: return TORMENTA;
            default: return NUBE;
        }
    }

    private int color(int tipo) {                // 0 sol, 1 nube, 2 gotas
        if (!varios) return colorBase;
        return tipo == 0 ? 0xFFC0760A : tipo == 1 ? 0xFF5E6C84 : 0xFF2747A8;
    }

    private float ms() {
        if (fasePrueba != null) return fasePrueba * 12000f;
        return SystemClock.uptimeMillis() % 120000L;
    }

    private static float sen(float ms, float periodo, float desfase) {
        return (float) Math.sin(2 * Math.PI * (ms / periodo + desfase));
    }

    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth() - getPaddingLeft() - getPaddingRight(), h = getHeight() - getPaddingTop() - getPaddingBottom();
        if (w <= 0 || h <= 0) return;
        float t = ms();
        c.save();
        c.translate(getPaddingLeft(), getPaddingTop());
        c.scale(w / 24f, h / 24f);
        switch (categoria) {
            case SOL:
                sol(c, 12f, 12f, 4.5f, 1f, t);
                break;
            case PARCIAL:
                sol(c, 8.5f, 8f, 3.4f, 0.75f, t);
                c.save();
                c.translate(1.0f + 0.8f * sen(t, 7000f, 0f), 6.5f);
                nube(c);
                c.restore();
                break;
            case NUBE:
                c.save();
                c.translate(1.8f + 1.0f * sen(t, 8000f, 0.5f), -1.5f);
                trazo.setAlpha(150);
                c.scale(0.8f, 0.8f, 12f, 10f);
                nube(c);
                trazo.setAlpha(255);
                c.restore();
                c.save();
                c.translate(-0.2f + 1.0f * sen(t, 8000f, 0f), 6f);
                nube(c);
                c.restore();
                break;
            case LLUVIA:
                c.save();
                c.translate(0.6f * sen(t, 8000f, 0f), -1.5f);
                nube(c);
                c.restore();
                gotas(c, t, 1100f, 14.5f);
                break;
            case NIEVE:
                c.save();
                c.translate(0.6f * sen(t, 8000f, 0f), -1.5f);
                nube(c);
                c.restore();
                copos(c, t);
                break;
            case TORMENTA:
                c.save();
                c.translate(0.6f * sen(t, 8000f, 0f), -1.5f);
                nube(c);
                c.restore();
                float ciclo = t % 4000f;
                int alfa = ciclo < 180f ? 255 : ciclo < 280f ? 70 : ciclo < 460f ? 255 : 110;     // destellos
                trazo.setColor(color(0));
                trazo.setAlpha(alfa);
                c.drawPath(rayo, trazo);
                trazo.setAlpha(255);
                break;
            default:
                c.save();
                c.translate(0.6f * sen(t, 8000f, 0f), -2f);
                c.scale(0.85f, 0.85f, 12f, 14f);
                nube(c);
                c.restore();
                trazo.setColor(color(1));
                for (int i = 0; i < 3; i++) {
                    float dx = 1.6f * sen(t, 6000f, i * 0.33f);
                    c.drawLine(5f + dx, 15f + i * 2.8f, 18f + dx, 15f + i * 2.8f, trazo);
                }
                break;
        }
        c.restore();
        if (fasePrueba == null && isShown()) postInvalidateDelayed(RETARDO_MS);
    }

    private void nube(Canvas c) {
        trazo.setColor(color(1));
        c.drawPath(nube, trazo);
    }

    /** Círculo con ocho rayos: los rayos giran despacio y respiran. */
    private void sol(Canvas c, float cx, float cy, float r, float escala, float t) {
        trazo.setColor(color(0));
        c.drawCircle(cx, cy, r, trazo);
        float giro = (t % 40000f) / 40000f * 360f;
        float latido = 1f + 0.12f * sen(t, 4000f, 0f);
        c.save();
        c.rotate(giro, cx, cy);
        float ini = r + 3f * escala, fin = r + (3f + 2.6f * latido) * escala;
        for (int i = 0; i < 8; i++) {
            c.drawLine(cx, cy - ini, cx, cy - fin, trazo);
            c.rotate(45f, cx, cy);
        }
        c.restore();
    }

    private void gotas(Canvas c, float t, float periodo, float y0) {
        trazo.setColor(color(2));
        float[] xs = {8f, 12f, 16f};
        for (int i = 0; i < 3; i++) {
            float fase = ((t / periodo) + i * 0.33f) % 1f;
            float y = y0 + fase * 6f;
            int alfa = fase < 0.15f ? (int) (255 * fase / 0.15f) : fase > 0.8f ? (int) (255 * (1f - fase) / 0.2f) : 255;
            trazo.setAlpha(Math.max(0, Math.min(255, alfa)));
            c.drawLine(xs[i], y, xs[i] - 1f, y + 2.6f, trazo);
        }
        trazo.setAlpha(255);
    }

    private void copos(Canvas c, float t) {
        trazo.setColor(color(2));
        trazo.setStyle(Paint.Style.FILL);
        float[] xs = {8f, 12f, 16f};
        for (int i = 0; i < 3; i++) {
            float fase = ((t / 3500f) + i * 0.33f) % 1f;
            float x = xs[i] + 1.1f * sen(fase * 1.5f * 3500f, 3500f, i * 0.2f);
            float y = 14.8f + fase * 6.5f;
            int alfa = fase < 0.15f ? (int) (255 * fase / 0.15f) : fase > 0.8f ? (int) (255 * (1f - fase) / 0.2f) : 255;
            trazo.setAlpha(Math.max(0, Math.min(255, alfa)));
            c.drawCircle(x, y, 1.1f, trazo);
        }
        trazo.setAlpha(255);
        trazo.setStyle(Paint.Style.STROKE);
    }
}
