package es.pizarra.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Abre la pizarra sola cuando la TV arranca (o se actualiza la app) y deja funcionando el aviso de "la TV despierta". */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        context.startService(new Intent(context, Despertar.class));
        Intent abrir = new Intent(context, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(abrir);
    }
}
