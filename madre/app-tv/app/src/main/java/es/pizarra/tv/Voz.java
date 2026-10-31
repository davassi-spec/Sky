package es.pizarra.tv;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Lee en voz alta los mensajes nuevos, en español. Si la TV no tiene voz en español, simplemente no lee (y no falla). */
final class Voz implements TextToSpeech.OnInitListener {
    private static final String TAG = "Pizarra";

    /** Solo para pruebas: no se crea el motor de voz. */
    static boolean desactivada;

    private TextToSpeech tts;
    private boolean listo, hayEspanol;
    private final List<String> pendientes = new ArrayList<>();

    Voz(Context c) {
        if (desactivada) return;
        try {
            tts = new TextToSpeech(c.getApplicationContext(), this);
        } catch (Throwable t) {
            Log.w(TAG, "Sin voz: " + t);
            tts = null;
        }
    }

    @Override
    public void onInit(int estado) {
        try {
            if (estado != TextToSpeech.SUCCESS || tts == null) { tts = null; return; }
            int r = tts.setLanguage(new Locale("es", "ES"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) r = tts.setLanguage(new Locale("es"));
            hayEspanol = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            listo = true;
            if (!hayEspanol) Log.w(TAG, "Esta tele no tiene voz en español: no se leerán los mensajes en voz alta");
            for (String p : pendientes) hablar(p);
            pendientes.clear();
        } catch (Throwable t) {
            Log.w(TAG, "Sin voz: " + t);
            tts = null;
        }
    }

    void decir(String texto) {
        if (tts == null || texto == null || texto.trim().isEmpty()) return;
        if (!listo) { if (pendientes.size() < 5) pendientes.add(texto); return; }
        if (hayEspanol) hablar(texto);
    }

    private void hablar(String texto) {
        try {
            tts.speak(texto, TextToSpeech.QUEUE_ADD, null, "pizarra");
        } catch (Throwable t) {
            Log.w(TAG, "No se pudo leer: " + t);
        }
    }

    void cerrar() {
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Throwable ignorada) { }
        tts = null;
    }

    /** "Mensaje de Ana: llevaré la merienda" */
    static String frase(Datos.Mensaje m) {
        return (m.de.isEmpty() ? "Mensaje" : "Mensaje de " + m.de) + ": " + m.texto;
    }

    /**
     * Qué frases hay que leer ahora: los mensajes que no se han leído ya. Los ya leídos o que llegaron de noche se apuntan como vistos
     * (de noche nunca se lee) y no se vuelven a leer. Devuelve las frases y deja en `leidos` todo lo que se ha tratado.
     */
    static List<String> porLeer(List<Datos.Mensaje> mensajes, Set<String> leidos, boolean permitido, boolean primeraVez) {
        List<String> out = new ArrayList<>();
        for (Datos.Mensaje m : mensajes) {
            String id = m.autor + "|" + m.t + "|" + m.texto.hashCode();
            if (leidos.contains(id)) continue;
            leidos.add(id);
            if (permitido && !primeraVez) out.add(frase(m));
        }
        return out;
    }
}
