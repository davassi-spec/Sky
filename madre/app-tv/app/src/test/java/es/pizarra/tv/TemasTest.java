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
            if (i >= 7) {                                                       // "Mensajes primero"
                minimo(id + " cabecera/fecha", t.encTxt, t.fecha);
                minimo(id + " cabecera/hora", t.encTxt, t.hora);
                minimo(id + " mensaje 1", t.txt, t.msg1);
                minimo(id + " mensaje 2", t.txt, t.msg2);
                minimo(id + " próxima cita", t.citaTxt, t.cita);
                minimo(id + " texto/hoy", t.txt, t.hoy);
                minimo(id + " texto/mañana", t.txt, t.man);
                minimo(id + " cuenta atrás", t.bandaTxt, t.banda);
                minimo(id + " texto/fondo", t.txt, t.fondo);
                minimo(id + " grados de hoy", t.tempHoy, t.hoy);
                minimo(id + " grados de mañana", t.tempMan, t.man);
                for (int k = 0; k < Paleta.TODAS.length; k += 2) {                  // los mensajes llevan los colores del estilo elegido (de día) sobre estos fondos
                    Paleta p = Paleta.TODAS[k];
                    minimo(id + " con el estilo " + k + ": nombre de quien escribe/mensaje 1", p.acentoTexto, t.msg1);
                    minimo(id + " con el estilo " + k + ": nombre de quien escribe/mensaje 2", p.acentoTexto, t.msg2);
                    minimo(id + " con el estilo " + k + ": texto/mensaje 1", p.texto, t.msg1);
                    minimo(id + " con el estilo " + k + ": texto/mensaje 2", p.texto, t.msg2);
                }
                continue;
            }
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
