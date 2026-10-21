package es.pizarra.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.InputStream;
import java.util.Calendar;
import java.util.Scanner;

/** La app nueva lee lo que manda el script ya desplegado (versión 5): JSON real producido por Code.gs en el simulador. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class CompatibilidadTest {
    private static String recurso(String nombre) {
        InputStream in = CompatibilidadTest.class.getResourceAsStream("/" + nombre);
        assertNotNull(nombre, in);
        return new Scanner(in, "UTF-8").useDelimiter("\\A").next();
    }

    @Test
    public void leeElEstadoDelScriptV5() throws Exception {
        Datos d = Datos.parse(recurso("estado-script-v5.json"));
        assertEquals(2, d.mensajes.size());
        assertEquals("Ana", d.mensajes.get(0).de);
        assertEquals("admin", d.mensajes.get(0).autor);
        assertEquals(0, d.mensajes.get(0).foto);
        assertTrue(d.hayTiempo);
        assertNotNull(d.hoy);
        assertNotNull(d.manana);
        assertEquals(19, d.manana.max);
        assertNotNull(d.cuenta);
        assertEquals("calendario", d.cuenta.icono);
        assertEquals("lavanda", d.estiloDia);
        assertEquals("salvia", d.estiloNoche);
        assertTrue(d.verMensajes && d.verEventos && d.verTiempo && d.verCuenta && d.verParte);
    }

    @Test
    public void laPruebaDeEstiloCambiaDiaYModo() throws Exception {
        Datos d = Datos.parse(recurso("estado-script-v5.json"));
        assertEquals("terracota", d.pruebaEstilo);
        assertTrue(d.pruebaNoche);
        assertTrue(d.esNocheAhora(15));        // a las 15 h sería de día, pero la prueba manda
        assertEquals("terracota", d.estiloAhora(true));
        d.pruebaEstilo = null;
        assertTrue(!d.esNocheAhora(15));
        assertEquals("lavanda", d.estiloAhora(false));
        assertEquals("salvia", d.estiloAhora(true));
    }

    @Test
    public void leeElFormatoDeLaVersion1() throws Exception {
        String v1 = "{\"widgets\":{\"mensajes\":true,\"eventos\":false,\"tiempo\":true},\"noche\":{\"desde\":21,\"hasta\":6},"
                + "\"mensajes\":[{\"id\":\"1\",\"de\":\"Dani\",\"texto\":\"Hola\",\"t\":1000}],\"eventos\":[],\"tiempo\":{\"temp\":20,\"codigo\":1}}";
        Datos d = Datos.parse(v1);
        assertTrue(!d.verEventos);
        assertEquals("lavanda", d.estiloDia);
        assertNull(d.cuenta);
        assertNull(d.hoy);
        assertEquals(20, d.temperatura);
    }

    @Test
    public void lasHorasHabladasLlevanLaParteDelDia() {
        assertEquals("Son las cinco y cuarto de la tarde", hora(17, 15));
        assertEquals("Son las diez y diez de la noche", hora(22, 10));
        assertEquals("Son las nueve y media de la mañana", hora(9, 30));
        assertEquals("Son las doce menos veinte de la mañana", hora(11, 40));
        assertEquals("Son las doce menos veinte de la noche", hora(23, 40));
        assertEquals("Es la una menos veinte del mediodía", hora(12, 40));
        assertEquals("Es la una en punto de la madrugada", hora(1, 0));
        assertEquals("Son las doce y cinco del mediodía", hora(12, 5));
    }

    @Test
    public void de11_31a11_59SigueSiendoDeLaMananaYDe23_31a23_59DeLaNoche() {
        for (int m = 31; m <= 59; m++) {
            assertTrue("11:" + m, hora(11, m).endsWith(" de la mañana"));
            assertTrue("23:" + m, hora(23, m).endsWith(" de la noche"));
        }
        assertTrue(hora(0, 10).endsWith(" de la noche"));
        assertTrue(hora(5, 45).endsWith(" de la madrugada"));
        assertTrue(hora(19, 45).endsWith(" de la tarde"));
    }

    @Test
    public void laEtiquetaDeLaParteDelDia() {
        assertEquals("Por la mañana", Texto.etiquetaParte(8));
        assertEquals("Al mediodía", Texto.etiquetaParte(12));
        assertEquals("Por la tarde", Texto.etiquetaParte(17));
        assertEquals("De noche", Texto.etiquetaParte(22));
        assertEquals("De noche", Texto.etiquetaParte(3));
    }

    @Test
    public void lasHorasDeLosEventosEnPalabras() {
        assertEquals("a las nueve", Texto.aLas("09:00"));
        assertEquals("a las seis y media", Texto.aLas("18:30"));
        assertEquals("a la una", Texto.aLas("13:00"));
        assertEquals("a la una y cuarto", Texto.aLas("01:15"));
        assertEquals("a las nueve menos cuarto", Texto.aLas("08:45"));
        assertEquals("a las nueve y diez", Texto.aLas("9:10"));
        assertEquals("a las doce menos diez", Texto.aLas("23:50"));
        assertEquals("a las doce y media", Texto.aLas("00:30"));
        assertEquals("a las doce", Texto.aLas("12:00"));
        assertEquals("a las ocho y un minuto", Texto.aLas("08:01"));
        assertEquals("a las nueve menos un minuto", Texto.aLas("08:59"));
        assertEquals("", Texto.aLas(""));
        assertEquals("", Texto.aLas("25:00"));
        assertEquals("", Texto.aLas("no es una hora"));
        assertEquals("A las seis y media", Texto.mayus(Texto.aLas("18:30")));
    }

    @Test
    public void leeElRecordatorioDelScript() throws Exception {
        String json = "{\"mensajes\":[],\"eventos\":[],\"recordatorio\":{\"id\":\"r1\",\"clave\":\"r1|2026-10-20\",\"texto\":\"Hora de la merienda\","
                + "\"texto2\":\"Con calma\",\"foto\":3,\"confirmar\":true,\"segundos\":600,\"prueba\":false}}";
        long llegada = 1_000_000L;
        Datos d = Datos.parse(json, llegada);
        assertNotNull(d.recordatorio);
        assertEquals("Hora de la merienda", d.recordatorio.texto);
        assertEquals("Con calma", d.recordatorio.texto2);
        assertEquals(3, d.recordatorio.foto);
        assertTrue(d.recordatorio.confirmar);
        assertEquals(llegada + 600_000L, d.recordatorio.hasta);      // caduca contando desde que llegó
        assertNull(Datos.parse("{\"recordatorio\":null}").recordatorio);
        assertNull(Datos.parse("{\"recordatorio\":{\"texto\":\"  \"}}").recordatorio);
        Datos sinFoto = Datos.parse("{\"recordatorio\":{\"id\":\"r2\",\"texto\":\"Algo\",\"foto\":null,\"segundos\":60}}");
        assertEquals(0, sinFoto.recordatorio.foto);
        assertTrue(!d.firma().equals(Datos.parse("{\"mensajes\":[],\"eventos\":[]}").firma()));   // un recordatorio cambia lo que se ve
    }

    private static String hora(int h, int m) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, h);
        c.set(Calendar.MINUTE, m);
        return Texto.horaConParte(c);
    }
}
