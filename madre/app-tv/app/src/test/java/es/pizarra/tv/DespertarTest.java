package es.pizarra.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Intent;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowApplication;
import org.robolectric.shadows.ShadowLooper;

/** La pizarra se abre sola al arrancar la TV y también al despertar del reposo (donde no hay arranque). */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class DespertarTest {
    @After
    public void limpia() {
        MainActivity.enPrimerPlano = false;
    }

    private static String clase(Intent i) {
        return i == null || i.getComponent() == null ? null : i.getComponent().getClassName();
    }

    @Test
    public void alEncenderLaPantallaSeAbreLaPizarra() {
        Application app = RuntimeEnvironment.getApplication();
        Robolectric.buildService(Despertar.class).startCommand(0, 1);
        ShadowApplication sombra = ShadowApplication.getInstance();
        sombra.clearNextStartedActivities();
        app.sendBroadcast(new Intent(Intent.ACTION_SCREEN_ON));
        ShadowLooper.idleMainLooper();
        Intent abierto = sombra.getNextStartedActivity();
        assertNotNull("al despertar la TV se abre una pantalla", abierto);
        assertEquals(MainActivity.class.getName(), clase(abierto));
        assertTrue((abierto.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK) != 0);
    }

    @Test
    public void tambienAlTerminarElSalvapantallasYAlDesbloquear() {
        Application app = RuntimeEnvironment.getApplication();
        Robolectric.buildService(Despertar.class).startCommand(0, 1);
        ShadowApplication sombra = ShadowApplication.getInstance();
        for (String aviso : new String[]{Intent.ACTION_USER_PRESENT, "android.intent.action.DREAMING_STOPPED"}) {
            sombra.clearNextStartedActivities();
            app.sendBroadcast(new Intent(aviso));
            ShadowLooper.idleMainLooper();
            assertEquals(aviso, MainActivity.class.getName(), clase(sombra.getNextStartedActivity()));
        }
    }

    @Test
    public void siYaEstaDelanteNoSeVuelveAAbrir() {
        Application app = RuntimeEnvironment.getApplication();
        Robolectric.buildService(Despertar.class).startCommand(0, 1);
        ShadowApplication sombra = ShadowApplication.getInstance();
        sombra.clearNextStartedActivities();
        MainActivity.enPrimerPlano = true;
        app.sendBroadcast(new Intent(Intent.ACTION_SCREEN_ON));
        ShadowLooper.idleMainLooper();
        assertNull(sombra.getNextStartedActivity());
    }

    @Test
    public void alArrancarLaTVSeAbreYQuedaVigilandoElReposo() {
        Application app = RuntimeEnvironment.getApplication();
        ShadowApplication sombra = ShadowApplication.getInstance();
        sombra.clearStartedServices();
        sombra.clearNextStartedActivities();
        new BootReceiver().onReceive(app, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals(MainActivity.class.getName(), clase(sombra.getNextStartedActivity()));
        Intent servicio = sombra.getNextStartedService();
        assertNotNull(servicio);
        assertEquals(Despertar.class.getName(), clase(servicio));
    }

    @Test
    public void elServicioSeReiniciaSiElSistemaLoPara() {
        int modo = Robolectric.buildService(Despertar.class).create().get().onStartCommand(null, 0, 1);
        assertEquals(android.app.Service.START_STICKY, modo);
    }
}
