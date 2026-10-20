package es.pizarra.tv;

/** Colores de cada estilo, de día y de noche. Todos los textos cumplen contraste 4,5:1 (ver PaletaTest). */
final class Paleta {
    final int fondo, texto, sub, tarjeta, tarjeta2, borde, pillFondo, pillTexto, acentoTexto, proximoFondo, avatar;
    final float grosorBorde;

    private Paleta(float grosor, int... c) {
        grosorBorde = grosor;
        fondo = c[0]; texto = c[1]; sub = c[2]; tarjeta = c[3]; tarjeta2 = c[4]; borde = c[5];
        pillFondo = c[6]; pillTexto = c[7]; acentoTexto = c[8]; proximoFondo = c[9]; avatar = c[10];
    }

    static final String[] ESTILOS = {"calido", "lavanda", "salvia", "terracota", "contraste"};

    //                          fondo       texto       sub         tarjeta     tarjeta2    borde       pillFondo   pillTexto   acentoTexto proximo     avatar
    private static final Paleta CALIDO_D = new Paleta(2, 0xFFFBF6EC, 0xFF2B2620, 0xFF5E564A, 0xFFFFFFFF, 0xFFF4EAD7, 0xFFDDD0B6, 0xFFA55A00, 0xFFFFFFFF, 0xFF8A4B00, 0xFFE0E7F6, 0xFF0B7A7A);
    private static final Paleta CALIDO_N = new Paleta(2, 0xFF1A1612, 0xFFF4EAD7, 0xFFC9BBA3, 0xFF26201A, 0xFF2A231C, 0xFF3A3128, 0xFFE0A458, 0xFF1A1612, 0xFFE0A458, 0xFF26201A, 0xFF0B7A7A);
    private static final Paleta LAVANDA_D = new Paleta(2, 0xFFEEEAFB, 0xFF17142B, 0xFF4A4569, 0xFFFFFFFF, 0xFFF5F2FF, 0xFFC9C0EE, 0xFF5B2D8E, 0xFFFFFFFF, 0xFF5B2D8E, 0xFFE6DFFA, 0xFF5B2D8E);
    private static final Paleta LAVANDA_N = new Paleta(2, 0xFF14122B, 0xFFF3EFFF, 0xFFC9C2EA, 0xFF221F45, 0xFF1B1838, 0xFF4A4585, 0xFFC9BCFF, 0xFF1B1540, 0xFFC9BCFF, 0xFF2B2760, 0xFF6A57C9);
    private static final Paleta SALVIA_D = new Paleta(2, 0xFFF5F0E6, 0xFF1F3A2B, 0xFF3F5A49, 0xFFE3EBDD, 0xFFEAEFE2, 0xFFC5D3BE, 0xFF2F5D3F, 0xFFFFFFFF, 0xFF2F5D3F, 0xFFD3E0CC, 0xFF2F5D3F);
    private static final Paleta SALVIA_N = new Paleta(2, 0xFF12201A, 0xFFE8F1E4, 0xFFB4C8B8, 0xFF1D3026, 0xFF182A21, 0xFF33503F, 0xFFA9D3B4, 0xFF0F2A1B, 0xFFA9D3B4, 0xFF24402F, 0xFF3D7A55);
    private static final Paleta TERRACOTA_D = new Paleta(2, 0xFFFBF0E6, 0xFF2A1A14, 0xFF6A463A, 0xFFF7DDD0, 0xFFFBE9DE, 0xFFE9C4B2, 0xFF9A4A2F, 0xFFFFFFFF, 0xFF8F3F25, 0xFFF2CDBB, 0xFF9A4A2F);
    private static final Paleta TERRACOTA_N = new Paleta(2, 0xFF1E1411, 0xFFF7E6DC, 0xFFD2B3A3, 0xFF2E1E18, 0xFF261812, 0xFF54382D, 0xFFE9A98C, 0xFF2A140C, 0xFFE9A98C, 0xFF3A261E, 0xFFB0603F);
    private static final Paleta CONTRASTE_D = new Paleta(4, 0xFFFFFFFF, 0xFF000000, 0xFF1A1A1A, 0xFFFFFFFF, 0xFFFFFFFF, 0xFF000000, 0xFF000000, 0xFFFFFFFF, 0xFF000000, 0xFFFFF200, 0xFF000000);
    private static final Paleta CONTRASTE_N = new Paleta(4, 0xFF000000, 0xFFFFFFFF, 0xFFE6E6E6, 0xFF000000, 0xFF000000, 0xFFFFFFFF, 0xFFFFEB3B, 0xFF000000, 0xFFFFEB3B, 0xFF000000, 0xFF0F6F6F);

    static final Paleta[] TODAS = {CALIDO_D, CALIDO_N, LAVANDA_D, LAVANDA_N, SALVIA_D, SALVIA_N,
            TERRACOTA_D, TERRACOTA_N, CONTRASTE_D, CONTRASTE_N};

    static Paleta de(String estilo, boolean noche) {
        if ("lavanda".equals(estilo)) return noche ? LAVANDA_N : LAVANDA_D;
        if ("salvia".equals(estilo)) return noche ? SALVIA_N : SALVIA_D;
        if ("terracota".equals(estilo)) return noche ? TERRACOTA_N : TERRACOTA_D;
        if ("contraste".equals(estilo)) return noche ? CONTRASTE_N : CONTRASTE_D;
        return noche ? CALIDO_N : CALIDO_D;
    }
}
