package es.pizarra.tv;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PaletaTest {
    private static double lum(int c) {
        double[] v = {(c >> 16 & 255) / 255.0, (c >> 8 & 255) / 255.0, (c & 255) / 255.0};
        for (int i = 0; i < 3; i++) v[i] = v[i] <= 0.03928 ? v[i] / 12.92 : Math.pow((v[i] + 0.055) / 1.055, 2.4);
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }

    static double contraste(int a, int b) {
        double x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }

    private static void minimo(String que, int a, int b) {
        double c = contraste(a, b);
        assertTrue(que + " tiene contraste " + c + " (mínimo 4,5)", c >= 4.5);
    }

    @Test
    public void todosLosTextosTienenContraste() {
        int n = 0;
        for (Paleta p : Paleta.TODAS) {
            String id = "paleta " + n++;
            minimo(id + " texto/fondo", p.texto, p.fondo);
            minimo(id + " texto/tarjeta", p.texto, p.tarjeta);
            minimo(id + " texto/tarjeta2", p.texto, p.tarjeta2);
            minimo(id + " texto/proximo", p.texto, p.proximoFondo);
            minimo(id + " sub/fondo", p.sub, p.fondo);
            minimo(id + " sub/tarjeta", p.sub, p.tarjeta);
            minimo(id + " sub/tarjeta2", p.sub, p.tarjeta2);
            minimo(id + " acento/fondo", p.acentoTexto, p.fondo);
            minimo(id + " acento/tarjeta", p.acentoTexto, p.tarjeta);
            minimo(id + " acento/tarjeta2", p.acentoTexto, p.tarjeta2);
            minimo(id + " acento/proximo", p.acentoTexto, p.proximoFondo);
            minimo(id + " pastilla", p.pillTexto, p.pillFondo);
            minimo(id + " inicial del avatar", 0xFFFFFFFF, p.avatar);
        }
    }

    @Test
    public void cadaEstiloTieneDiaYNoche() {
        for (String e : Paleta.ESTILOS) {
            assertTrue(Paleta.de(e, false) != Paleta.de(e, true));
        }
        assertTrue(Paleta.de("no existe", false) == Paleta.de("calido", false));
    }
}
