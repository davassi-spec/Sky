package es.pizarra.tv;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.IBinder;
import android.util.Log;

/**
 * Abre la pizarra cuando la TV despierta del reposo. Al "apagar" con el mando una TV Android no se reinicia, solo se duerme,
 * y entonces no hay arranque (BOOT_COMPLETED) que abra la app. Este servicio vive con la app y escucha cuándo se enciende la
 * pantalla (esos avisos no se pueden pedir desde el manifiesto, por eso se registran aquí).
 */
public class Despertar extends Service {
    private static final String TAG = "Pizarra";
    static final String[] AVISOS = {Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT, "android.intent.action.DREAMING_STOPPED"};
    private BroadcastReceiver receptor;

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        if (receptor == null) {
            receptor = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent in) {
                    abrirSiHaceFalta(c);
                }
            };
            IntentFilter f = new IntentFilter();
            for (String a : AVISOS) f.addAction(a);
            registerReceiver(receptor, f);
        }
        return START_STICKY;               // si el sistema la para, vuelve a arrancar
    }

    /** Pone la pizarra delante, salvo que ya esté delante. */
    static void abrirSiHaceFalta(Context c) {
        if (MainActivity.enPrimerPlano) return;
        try {
            Intent abrir = new Intent(c, MainActivity.class);
            abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            c.startActivity(abrir);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo abrir la pizarra al despertar", e);
        }
    }

    @Override
    public void onDestroy() {
        if (receptor != null) {
            try { unregisterReceiver(receptor); } catch (Exception e) { /* ya no estaba */ }
            receptor = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) {
        return null;
    }
}
