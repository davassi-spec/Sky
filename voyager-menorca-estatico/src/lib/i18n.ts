export const LANGS = ['es', 'ca', 'en', 'fr'] as const;
export type Lang = (typeof LANGS)[number];
export const LOCALE: Record<Lang, string> = { es: 'es_ES', ca: 'ca_ES', en: 'en_GB', fr: 'fr_FR' };
export const LANG_NAME: Record<Lang, string> = { es: 'Español', ca: 'Català', en: 'English', fr: 'Français' };
export const prefix = (l: Lang) => (l === 'es' ? '' : `/${l}`);

export const SITE = {
  name: 'Voyager Menorca',
  owner: 'Daniel Vaquera Sintes',
  email: 'info@voyagermenorca.com',
  phone: '+34 649 902 301',
  whatsapp: '34649902301',
  instagram: 'https://www.instagram.com/voyagermenorca/',
  googleReviews: 'https://search.google.com/local/reviews?placeid=ChIJ25e9AmcFvhIRuqJlrrZwgM4',
  turitopCompany: 'P626',
  gaId: 'GT-WK27R653',
};

export const wa = (text?: string) => `https://wa.me/${SITE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

type Dict = Record<string, string>;
const es: Dict = {
  skip: 'Saltar al contenido', menu: 'Menú', close: 'Cerrar', lang: 'Idioma', home: 'Inicio', book: 'Reservar', ask: 'Consultar disponibilidad',
  seeTours: 'Ver excursiones', whatsapp: 'Escribir por WhatsApp', from: 'desde', perGroup: 'por grupo', readMore: 'Leer artículo', toursTitle: 'Excursiones',
  related: 'Sigue leyendo', blog: 'Blog', page: 'Página', next: 'Siguiente', prev: 'Anterior', pagination: 'Paginación', allPosts: 'Todos los artículos',
  faq: 'Preguntas frecuentes', reviews: 'Lo que dicen los viajeros', reviewsLink: 'Ver todas las reseñas en Google', requestTitle: 'Solicita tu reserva',
  requestLede: 'Cuéntame fechas y número de personas. Respondo personalmente, normalmente en menos de 24 horas.',
  f_name: 'Nombre y apellidos', f_email: 'Correo electrónico', f_phone: 'Teléfono (opcional)', f_date: 'Fecha deseada', f_people: 'Personas', f_lang: 'Idioma de la visita',
  f_message: 'Mensaje', f_accept: 'He leído y acepto la', f_privacy: 'política de privacidad', f_send: 'Enviar solicitud', f_sending: 'Enviando…',
  f_ok: 'Gracias, hemos recibido tu mensaje. Te responderemos lo antes posible.', f_err: 'No se pudo enviar. Inténtalo de nuevo o escríbenos por WhatsApp.',
  f_req: 'Completa los campos obligatorios.', f_mail: 'Introduce un correo válido.', f_tour: 'Excursión', f_any: 'Sin preferencia',
  trust1: 'Respuesta en 24 h', trust2: 'Sin pago por adelantado', trust3: 'Cancelación gratuita',
  prefer: '¿Prefieres escribirnos directamente?', cookies: 'Cookies y privacidad', cookiesText: 'Usamos cookies técnicas y, solo si lo aceptas, analíticas para mejorar la web. Puedes cambiar tu decisión en cualquier momento.',
  accept: 'Aceptar', reject: 'Rechazar', settings: 'Preferencias de cookies', legal: 'Aviso legal', privacy: 'Política de privacidad', access: 'Accesibilidad', cookiePolicy: 'Política de cookies',
  notFound: 'Página no encontrada', notFoundText: 'Esta página no existe o ha cambiado de lugar. Prueba con las excursiones o escríbenos.', toTop: 'Volver arriba',
  officialGuide: 'Guía oficial acreditado', updated: 'Actualizado', readingTime: 'min de lectura', booking: 'Reservas', bookOnline: 'Reservar online', footerTag: 'Visitas guiadas privadas y excursiones en Menorca con guía oficial local.',
  funded: 'Financiado por la Unión Europea – NextGenerationEU', explore: 'Explorar', contactUs: 'Contacto', breadcrumb: 'Ruta de navegación',
};
const ca: Dict = {
  skip: 'Saltar al contingut', menu: 'Menú', close: 'Tancar', lang: 'Idioma', home: 'Inici', book: 'Reservar', ask: 'Consultar disponibilitat',
  seeTours: 'Veure excursions', whatsapp: 'Escriure per WhatsApp', from: 'des de', perGroup: 'per grup', readMore: 'Llegir article', toursTitle: 'Excursions',
  related: 'Segueix llegint', blog: 'Blog', page: 'Pàgina', next: 'Següent', prev: 'Anterior', pagination: 'Paginació', allPosts: 'Tots els articles',
  faq: 'Preguntes freqüents', reviews: 'Què diuen els viatgers', reviewsLink: 'Veure totes les ressenyes a Google', requestTitle: 'Sol·licita la teva reserva',
  requestLede: 'Explica’m dates i nombre de persones. Responc personalment, normalment en menys de 24 hores.',
  f_name: 'Nom i cognoms', f_email: 'Correu electrònic', f_phone: 'Telèfon (opcional)', f_date: 'Data desitjada', f_people: 'Persones', f_lang: 'Idioma de la visita',
  f_message: 'Missatge', f_accept: 'He llegit i accepto la', f_privacy: 'política de privacitat', f_send: 'Enviar sol·licitud', f_sending: 'Enviant…',
  f_ok: 'Gràcies, hem rebut el teu missatge. Et respondrem com més aviat millor.', f_err: 'No s’ha pogut enviar. Torna-ho a provar o escriu-nos per WhatsApp.',
  f_req: 'Completa els camps obligatoris.', f_mail: 'Introdueix un correu vàlid.', f_tour: 'Excursió', f_any: 'Sense preferència',
  trust1: 'Resposta en 24 h', trust2: 'Sense pagament per avançat', trust3: 'Cancel·lació gratuïta',
  prefer: 'Prefereixes escriure’ns directament?', cookies: 'Galetes i privacitat', cookiesText: 'Fem servir galetes tècniques i, només si ho acceptes, analítiques per millorar el web. Pots canviar la teva decisió en qualsevol moment.',
  accept: 'Acceptar', reject: 'Rebutjar', settings: 'Preferències de galetes', legal: 'Avís legal', privacy: 'Política de privacitat', access: 'Accessibilitat', cookiePolicy: 'Política de galetes',
  notFound: 'Pàgina no trobada', notFoundText: 'Aquesta pàgina no existeix o ha canviat de lloc. Prova amb les excursions o escriu-nos.', toTop: 'Tornar amunt',
  officialGuide: 'Guia oficial acreditat', updated: 'Actualitzat', readingTime: 'min de lectura', booking: 'Reserves', bookOnline: 'Reservar en línia', footerTag: 'Visites guiades privades i excursions a Menorca amb guia oficial local.',
  funded: 'Finançat per la Unió Europea – NextGenerationEU', explore: 'Explorar', contactUs: 'Contacte', breadcrumb: 'Ruta de navegació',
};
const en: Dict = {
  skip: 'Skip to content', menu: 'Menu', close: 'Close', lang: 'Language', home: 'Home', book: 'Book', ask: 'Check availability',
  seeTours: 'See excursions', whatsapp: 'Message on WhatsApp', from: 'from', perGroup: 'per group', readMore: 'Read article', toursTitle: 'Excursions',
  related: 'Keep reading', blog: 'Blog', page: 'Page', next: 'Next', prev: 'Previous', pagination: 'Pagination', allPosts: 'All articles',
  faq: 'Frequently asked questions', reviews: 'What travellers say', reviewsLink: 'See all reviews on Google', requestTitle: 'Request your booking',
  requestLede: 'Tell me your dates and group size. I reply personally, usually within 24 hours.',
  f_name: 'Full name', f_email: 'Email', f_phone: 'Phone (optional)', f_date: 'Preferred date', f_people: 'People', f_lang: 'Tour language',
  f_message: 'Message', f_accept: 'I have read and accept the', f_privacy: 'privacy policy', f_send: 'Send request', f_sending: 'Sending…',
  f_ok: 'Thank you, we have received your message. We will reply as soon as possible.', f_err: 'Could not send. Please try again or message us on WhatsApp.',
  f_req: 'Please fill in the required fields.', f_mail: 'Please enter a valid email.', f_tour: 'Excursion', f_any: 'No preference',
  trust1: 'Reply within 24 h', trust2: 'No upfront payment', trust3: 'Free cancellation',
  prefer: 'Prefer to write directly?', cookies: 'Cookies and privacy', cookiesText: 'We use essential cookies and, only if you agree, analytics cookies to improve the site. You can change your choice at any time.',
  accept: 'Accept', reject: 'Reject', settings: 'Cookie settings', legal: 'Legal notice', privacy: 'Privacy policy', access: 'Accessibility', cookiePolicy: 'Cookie policy',
  notFound: 'Page not found', notFoundText: 'This page does not exist or has moved. Try our excursions or write to us.', toTop: 'Back to top',
  officialGuide: 'Accredited official guide', updated: 'Updated', readingTime: 'min read', booking: 'Bookings', bookOnline: 'Book online', footerTag: 'Private guided tours and excursions in Menorca with an official local guide.',
  funded: 'Funded by the European Union – NextGenerationEU', explore: 'Explore', contactUs: 'Contact', breadcrumb: 'Breadcrumb',
};
const fr: Dict = {
  skip: 'Aller au contenu', menu: 'Menu', close: 'Fermer', lang: 'Langue', home: 'Accueil', book: 'Réserver', ask: 'Vérifier la disponibilité',
  seeTours: 'Voir les excursions', whatsapp: 'Écrire sur WhatsApp', from: 'à partir de', perGroup: 'par groupe', readMore: 'Lire l’article', toursTitle: 'Excursions',
  related: 'Continuer la lecture', blog: 'Blog', page: 'Page', next: 'Suivant', prev: 'Précédent', pagination: 'Pagination', allPosts: 'Tous les articles',
  faq: 'Questions fréquentes', reviews: 'Ce que disent les voyageurs', reviewsLink: 'Voir tous les avis sur Google', requestTitle: 'Demandez votre réservation',
  requestLede: 'Indiquez-moi vos dates et le nombre de personnes. Je réponds personnellement, généralement sous 24 heures.',
  f_name: 'Nom et prénom', f_email: 'E-mail', f_phone: 'Téléphone (facultatif)', f_date: 'Date souhaitée', f_people: 'Personnes', f_lang: 'Langue de la visite',
  f_message: 'Message', f_accept: 'J’ai lu et j’accepte la', f_privacy: 'politique de confidentialité', f_send: 'Envoyer la demande', f_sending: 'Envoi…',
  f_ok: 'Merci, nous avons bien reçu votre message. Nous vous répondrons dès que possible.', f_err: 'Envoi impossible. Réessayez ou écrivez-nous sur WhatsApp.',
  f_req: 'Veuillez remplir les champs obligatoires.', f_mail: 'Saisissez une adresse e-mail valide.', f_tour: 'Excursion', f_any: 'Sans préférence',
  trust1: 'Réponse sous 24 h', trust2: 'Sans paiement à l’avance', trust3: 'Annulation gratuite',
  prefer: 'Vous préférez écrire directement ?', cookies: 'Cookies et confidentialité', cookiesText: 'Nous utilisons des cookies techniques et, uniquement si vous l’acceptez, des cookies d’analyse pour améliorer le site. Vous pouvez modifier votre choix à tout moment.',
  accept: 'Accepter', reject: 'Refuser', settings: 'Préférences des cookies', legal: 'Mentions légales', privacy: 'Politique de confidentialité', access: 'Accessibilité', cookiePolicy: 'Politique de cookies',
  notFound: 'Page introuvable', notFoundText: 'Cette page n’existe pas ou a été déplacée. Essayez nos excursions ou écrivez-nous.', toTop: 'Haut de page',
  officialGuide: 'Guide officiel accrédité', updated: 'Mis à jour', readingTime: 'min de lecture', booking: 'Réservations', bookOnline: 'Réserver en ligne', footerTag: 'Visites guidées privées et excursions à Minorque avec un guide officiel local.',
  funded: 'Financé par l’Union européenne – NextGenerationEU', explore: 'Explorer', contactUs: 'Contact', breadcrumb: 'Fil d’Ariane',
};
const DICT: Record<Lang, Dict> = { es, ca, en, fr };
export const t = (l: Lang, k: string): string => DICT[l][k] ?? es[k] ?? k;

/** URLs de las páginas clave por idioma (conservan las del WordPress original). */
export const KEY_URLS: Record<Lang, { home: string; about: string; services: string; tours: string; blog: string; contact: string; privacy: string; legal: string; access: string; cookies: string; thanks: string }> = {
  es: { home: '/', about: '/quienes-somos/', services: '/servicios/', tours: '/excursiones/', blog: '/blog/', contact: '/contacto/', privacy: '/politica-privacidad/', legal: '/aviso-legal/', access: '/accesibilidad/', cookies: '/politica-de-cookies-ue/', thanks: '/solicitud-recibida/' },
  ca: { home: '/ca/', about: '/ca/quienes-somos/', services: '/ca/servicios/', tours: '/ca/excursions/', blog: '/ca/blog/', contact: '/ca/contacto/', privacy: '/ca/politica-privacidad/', legal: '/ca/aviso-legal/', access: '/ca/accesibilidad/', cookies: '/ca/politica-de-cookies-ue/', thanks: '/ca/sol-star-licitud-rebuda/' },
  en: { home: '/en/', about: '/en/quienes-somos/', services: '/en/servicios/', tours: '/en/field-trips/', blog: '/en/blog/', contact: '/en/contacto/', privacy: '/en/politica-privacidad/', legal: '/en/aviso-legal/', access: '/en/accesibilidad/', cookies: '/en/politica-de-cookies-ue/', thanks: '/en/request-received/' },
  fr: { home: '/fr/', about: '/fr/quienes-somos/', services: '/fr/servicios/', tours: '/fr/excursions/', blog: '/fr/blog/', contact: '/fr/contacto/', privacy: '/fr/politica-privacidad/', legal: '/fr/aviso-legal/', access: '/fr/accesibilidad/', cookies: '/fr/politica-de-cookies-ue/', thanks: '/fr/demande-recue/' },
};
export const NAV_LABEL: Record<Lang, { about: string; services: string; tours: string; blog: string; contact: string }> = {
  es: { about: 'Quiénes somos', services: 'Servicios', tours: 'Excursiones', blog: 'Blog', contact: 'Contacto' },
  ca: { about: 'Qui som', services: 'Serveis', tours: 'Excursions', blog: 'Blog', contact: 'Contacte' },
  en: { about: 'Who we are', services: 'Services', tours: 'Excursions', blog: 'Blog', contact: 'Contact' },
  fr: { about: 'Qui sommes-nous ?', services: 'Services', tours: 'Excursions', blog: 'Blog', contact: 'Contact' },
};
