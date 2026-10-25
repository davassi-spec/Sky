package es.pizarra.tv;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Los colores de las siete pantallas con diseño propio: todo texto con contraste 4,5:1 como mínimo. */
public class TemasTest {
    private static void minimo(String que, int a, int b) {
        double c = PaletaTest.contraste(a, b);
        assertTrue(que + " tiene contraste " + c + " (mínimo 4,5)", c >= 4.5);
    }

    @Test
    public void todosLosTextosDeLosTablerosSeLeen() {
        for (int i = 0; i < MainActivity.TEMAS.length; i++) {
            MainActivity.Tema t = MainActivity.TEMAS[i];
            String id = MainActivity.TABLEROS[i];
            int[] fondos = {t.fondo, t.fecha, t.hora, t.hoy, t.man, t.parte, t.panel};
            for (int f : fondos) {
                if (i == 0 && f == t.fecha) continue;                         // Banda verde: ahí el texto es blanco (se comprueba abajo)
                if (i == 0 && f == t.hora) continue;
                minimo(id + " texto", t.txt, f);
                minimo(id + " texto suave", t.sub, f);
            }
            minimo(id + " cuenta atrás", t.bandaTxt, t.banda);
            minimo(id + " píldora", t.pillTxt, t.pill);
            minimo(id + " grados de hoy", t.tempHoy, t.hoy);
            minimo(id + " grados de mañana", t.tempMan, t.man);
            if (i == 0) {
                minimo(id + " blanco sobre la cabecera verde", 0xFFFFFFFF, t.fecha);
                minimo(id + " texto claro sobre la cabecera verde", 0xFFE6F0E9, t.fecha);
            }
        }
    }
}
