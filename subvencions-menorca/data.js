/*
  ============================================================
  SUBVENCIONS MENORCA — DADES
  ------------------------------------------------------------
  ⚠️ LES CONVOCATÒRIES D'AQUEST FITXER SÓN EXEMPLES.
  Són orientatives (tipus d'ajuts que convoquen habitualment
  el Consell Insular i els ajuntaments), però els imports,
  dates i requisits NO s'han de prendre com a reals.
  Substituïu-les per les convocatòries vigents publicades a:
    · BOIB (Butlletí Oficial de les Illes Balears)
    · BDNS / Infosubvenciones (www.infosubvenciones.es)
    · Seu electrònica de cada organisme
  ------------------------------------------------------------
  Camps de cada convocatòria:
    id          identificador únic (text curt, sense espais)
    titol       nom de la convocatòria
    organisme   clau d'ORGANISMES (cime, mao, ciutadella...)
    ambit       clau d'AMBITS
    beneficiaris  llista de claus de BENEFICIARIS
    import      import total de la convocatòria (€) o null
    maxim       import màxim per sol·licitud (€) o null
    inici       data d'obertura (AAAA-MM-DD)
    fi          data límit de sol·licitud (AAAA-MM-DD) o null si és oberta tot l'any
    resum       descripció breu
    requisits   llista de requisits principals
    url         enllaç a la convocatòria oficial (si es coneix)
    bdns        codi BDNS (si n'hi ha)
  ============================================================
*/

window.SM_DATA = {
  exemple: true, // posau-ho a false quan les dades siguin reals

  ORGANISMES: {
    cime:        { nom: "Consell Insular de Menorca", curt: "Consell Insular", color: "#0b6e6e", web: "https://www.cime.es" },
    mao:         { nom: "Ajuntament de Maó", curt: "Maó", color: "#b23a48", web: "https://www.ajmao.org" },
    ciutadella:  { nom: "Ajuntament de Ciutadella", curt: "Ciutadella", color: "#3a5ba0", web: "https://www.ciutadella.cat" },
    alaior:      { nom: "Ajuntament d'Alaior", curt: "Alaior", color: "#7a4fa3", web: null },
    escastell:   { nom: "Ajuntament des Castell", curt: "Es Castell", color: "#c26a1b", web: null },
    santlluis:   { nom: "Ajuntament de Sant Lluís", curt: "Sant Lluís", color: "#2f8f4e", web: null },
    mercadal:    { nom: "Ajuntament des Mercadal", curt: "Es Mercadal", color: "#8a6d1f", web: null },
    migjorn:     { nom: "Ajuntament des Migjorn Gran", curt: "Es Migjorn Gran", color: "#a0476e", web: null },
    ferreries:   { nom: "Ajuntament de Ferreries", curt: "Ferreries", color: "#46707d", web: null }
  },

  AMBITS: {
    cultura:     { ca: "Cultura i patrimoni", es: "Cultura y patrimonio", icona: "🎭" },
    esports:     { ca: "Esports", es: "Deportes", icona: "⚽" },
    social:      { ca: "Serveis socials", es: "Servicios sociales", icona: "🤝" },
    joventut:    { ca: "Joventut i educació", es: "Juventud y educación", icona: "🎓" },
    economia:    { ca: "Comerç i empresa", es: "Comercio y empresa", icona: "🏪" },
    agricultura: { ca: "Agricultura i ramaderia", es: "Agricultura y ganadería", icona: "🐄" },
    medi:        { ca: "Medi ambient i Reserva de Biosfera", es: "Medio ambiente y Reserva de Biosfera", icona: "🌿" },
    habitatge:   { ca: "Habitatge i rehabilitació", es: "Vivienda y rehabilitación", icona: "🏠" },
    cooperacio:  { ca: "Cooperació i solidaritat", es: "Cooperación y solidaridad", icona: "🌍" },
    ocupacio:    { ca: "Ocupació i formació", es: "Empleo y formación", icona: "💼" }
  },

  BENEFICIARIS: {
    entitats:    { ca: "Entitats i associacions", es: "Entidades y asociaciones" },
    particulars: { ca: "Particulars i famílies", es: "Particulares y familias" },
    empreses:    { ca: "Empreses i autònoms", es: "Empresas y autónomos" },
    pagesos:     { ca: "Explotacions agràries", es: "Explotaciones agrarias" },
    estudiants:  { ca: "Estudiants i joves", es: "Estudiantes y jóvenes" },
    ajuntaments: { ca: "Ajuntaments", es: "Ayuntamientos" }
  },

  CONVOCATORIES: [
    {
      id: "cime-cultura-entitats",
      titol: "Subvencions per a activitats culturals d'entitats sense ànim de lucre",
      organisme: "cime", ambit: "cultura", beneficiaris: ["entitats"],
      import: 250000, maxim: 12000, inici: "2026-11-02", fi: "2026-12-04",
      resum: "Suport a la programació cultural estable, festivals, edicions i activitats de difusió de la cultura popular menorquina organitzades per entitats de l'illa.",
      requisits: ["Entitat inscrita al registre d'associacions", "Seu social a Menorca", "Activitat realitzada durant l'any de la convocatòria"],
      url: "https://www.cime.es", bdns: null
    },
    {
      id: "cime-esport-base",
      titol: "Ajuts a clubs per a l'esport base i la participació en competicions",
      organisme: "cime", ambit: "esports", beneficiaris: ["entitats"],
      import: 420000, maxim: 25000, inici: "2026-10-20", fi: "2026-11-27",
      resum: "Ajuda per a les despeses de desplaçament a competicions fora de l'illa i per al manteniment d'equips d'esport base.",
      requisits: ["Club inscrit al Registre d'Entitats Esportives", "Equips federats en categoria base", "Justificació de desplaçaments"],
      url: "https://www.cime.es", bdns: null
    },
    {
      id: "cime-biosfera-projectes",
      titol: "Projectes de sostenibilitat a la Reserva de Biosfera de Menorca",
      organisme: "cime", ambit: "medi", beneficiaris: ["entitats", "empreses", "ajuntaments"],
      import: 180000, maxim: 20000, inici: "2026-11-16", fi: "2027-01-15",
      resum: "Finançament de projectes d'educació ambiental, conservació de la biodiversitat, economia circular i reducció de residus alineats amb el Pla d'Acció de la Reserva de Biosfera.",
      requisits: ["Projecte executat a Menorca", "Pressupost detallat", "Indicadors d'impacte ambiental"],
      url: "https://www.cime.es", bdns: null
    },
    {
      id: "cime-raca-vermella",
      titol: "Ajuts al foment de races autòctones (vaca menorquina, cavall menorquí, ase)",
      organisme: "cime", ambit: "agricultura", beneficiaris: ["pagesos"],
      import: 300000, maxim: 8000, inici: "2026-12-01", fi: "2027-01-31",
      resum: "Ajuda per cap de bestiar inscrit al llibre genealògic per preservar les races autòctones de Menorca.",
      requisits: ["Explotació inscrita al REGA", "Animals inscrits al llibre genealògic", "Estar al corrent d'obligacions tributàries"],
      url: "https://www.cime.es", bdns: null
    },
    {
      id: "cime-paret-seca",
      titol: "Restauració de paret seca i barraques de bestiar",
      organisme: "cime", ambit: "agricultura", beneficiaris: ["pagesos", "particulars"],
      import: 500000, maxim: 15000, inici: "2026-09-15", fi: "2026-11-14",
      resum: "Subvenció per a la reconstrucció i manteniment d'elements d'arquitectura de pedra en sec del paisatge rural menorquí.",
      requisits: ["Finca en sòl rústic de Menorca", "Pressupost de margerer acreditat", "Fotografies de l'estat inicial"],
      url: "https://www.cime.es", bdns: null
    },
    {
      id: "cime-cooperacio",
      titol: "Projectes de cooperació internacional al desenvolupament",
      organisme: "cime", ambit: "cooperacio", beneficiaris: ["entitats"],
      import: 600000, maxim: 60000, inici: "2027-01-12", fi: "2027-02-27",
      resum: "Convocatòria anual per a projectes de cooperació, educació per al desenvolupament i ajuda humanitària d'ONGD amb presència a Menorca.",
      requisits: ["ONGD inscrita al registre corresponent", "Delegació o seu a Menorca", "Contrapart local al país d'execució"],
      url: "https://www.cime.es", bdns: null
    },
    {
      id: "cime-autonoms-digital",
      titol: "Ajuts a la digitalització del petit comerç i autònoms",
      organisme: "cime", ambit: "economia", beneficiaris: ["empreses"],
      import: 200000, maxim: 3000, inici: "2026-11-10", fi: "2026-12-18",
      resum: "Cobertura de fins al 70 % de la inversió en botiga en línia, TPV, programari de gestió i presència digital per a petit comerç i autònoms de l'illa.",
      requisits: ["Menys de 10 treballadors", "Establiment o domicili fiscal a Menorca", "Factures posteriors a l'1 de gener"],
      url: "https://www.cime.es", bdns: null
    },
    {
      id: "mao-comerc-local",
      titol: "Campanya de dinamització del comerç local del centre històric",
      organisme: "mao", ambit: "economia", beneficiaris: ["empreses", "entitats"],
      import: 60000, maxim: 4000, inici: "2026-11-04", fi: "2026-11-25",
      resum: "Ajuts per a millora d'aparadors, rètols i accions de promoció conjunta dels establiments del centre de Maó.",
      requisits: ["Establiment obert al públic al terme de Maó", "Llicència d'activitat vigent"],
      url: "https://www.ajmao.org", bdns: null
    },
    {
      id: "mao-beques-menjador",
      titol: "Beques de menjador escolar i material didàctic",
      organisme: "mao", ambit: "social", beneficiaris: ["particulars", "estudiants"],
      import: 150000, maxim: null, inici: "2026-08-25", fi: "2026-09-30",
      resum: "Ajuts per a famílies empadronades a Maó amb fills escolaritzats en educació infantil i primària.",
      requisits: ["Empadronament a Maó", "Renda familiar per davall del llindar establert"],
      url: "https://www.ajmao.org", bdns: null
    },
    {
      id: "mao-rehabilitacio-facanes",
      titol: "Rehabilitació de façanes i eliminació de barreres arquitectòniques",
      organisme: "mao", ambit: "habitatge", beneficiaris: ["particulars"],
      import: 120000, maxim: 6000, inici: "2026-11-15", fi: "2027-02-15",
      resum: "Subvencions per a la rehabilitació de façanes d'edificis d'habitatges i la instal·lació d'ascensors i rampes.",
      requisits: ["Edifici de més de 30 anys", "Llicència d'obra", "Comunitat de propietaris o propietari únic"],
      url: "https://www.ajmao.org", bdns: null
    },
    {
      id: "ciutadella-festes-barris",
      titol: "Subvencions a associacions de veïns per a festes de barri",
      organisme: "ciutadella", ambit: "cultura", beneficiaris: ["entitats"],
      import: 45000, maxim: 3500, inici: "2026-11-01", fi: "2026-12-12",
      resum: "Suport a l'organització de festes i activitats comunitàries a les barriades de Ciutadella.",
      requisits: ["Associació de veïns inscrita", "Programa d'activitats i pressupost"],
      url: "https://www.ciutadella.cat", bdns: null
    },
    {
      id: "ciutadella-lloguer-joves",
      titol: "Ajuts al lloguer d'habitatge per a joves",
      organisme: "ciutadella", ambit: "habitatge", beneficiaris: ["estudiants", "particulars"],
      import: 90000, maxim: 2400, inici: "2026-11-12", fi: "2026-12-31",
      resum: "Ajuda mensual per al lloguer de l'habitatge habitual de persones de 18 a 35 anys empadronades a Ciutadella.",
      requisits: ["Entre 18 i 35 anys", "Contracte de lloguer a Ciutadella", "Ingressos inferiors al límit"],
      url: "https://www.ciutadella.cat", bdns: null
    },
    {
      id: "ciutadella-esport-individual",
      titol: "Ajuts a esportistes individuals d'alt rendiment",
      organisme: "ciutadella", ambit: "esports", beneficiaris: ["particulars"],
      import: 20000, maxim: 1500, inici: "2026-12-01", fi: "2027-01-20",
      resum: "Suport a esportistes de Ciutadella que participen en campionats d'Espanya o internacionals.",
      requisits: ["Empadronament a Ciutadella", "Llicència federativa", "Resultats acreditats"],
      url: "https://www.ciutadella.cat", bdns: null
    },
    {
      id: "alaior-emergencia-social",
      titol: "Ajuts d'emergència social",
      organisme: "alaior", ambit: "social", beneficiaris: ["particulars"],
      import: 40000, maxim: null, inici: "2026-01-01", fi: null,
      resum: "Prestacions puntuals per cobrir necessitats bàsiques (subministraments, lloguer, alimentació). Convocatòria oberta tot l'any a través dels serveis socials municipals.",
      requisits: ["Empadronament a Alaior", "Informe dels serveis socials"],
      url: null, bdns: null
    },
    {
      id: "alaior-entitats-culturals",
      titol: "Subvencions a entitats culturals i esportives d'Alaior",
      organisme: "alaior", ambit: "cultura", beneficiaris: ["entitats"],
      import: 70000, maxim: 8000, inici: "2026-11-18", fi: "2026-12-19",
      resum: "Convocatòria anual de suport a l'activitat de les entitats locals.",
      requisits: ["Entitat amb seu a Alaior", "Memòria d'activitats"],
      url: null, bdns: null
    },
    {
      id: "escastell-placa-solar",
      titol: "Bonificació i ajut per a instal·lacions d'autoconsum fotovoltaic",
      organisme: "escastell", ambit: "medi", beneficiaris: ["particulars", "empreses"],
      import: 30000, maxim: 1500, inici: "2026-10-01", fi: "2026-12-15",
      resum: "Ajut directe complementari a la bonificació de l'IBI per a instal·lacions fotovoltaiques d'autoconsum.",
      requisits: ["Habitatge o local a Es Castell", "Certificat de la instal·lació"],
      url: null, bdns: null
    },
    {
      id: "santlluis-llibres",
      titol: "Ajuts per a la compra de llibres de text",
      organisme: "santlluis", ambit: "joventut", beneficiaris: ["particulars", "estudiants"],
      import: 25000, maxim: 200, inici: "2026-07-01", fi: "2026-09-15",
      resum: "Ajut per alumne escolaritzat en ESO o batxillerat empadronat a Sant Lluís.",
      requisits: ["Empadronament a Sant Lluís", "Factura de compra"],
      url: null, bdns: null
    },
    {
      id: "santlluis-emprenedoria",
      titol: "Ajuts a l'emprenedoria i nous negocis",
      organisme: "santlluis", ambit: "ocupacio", beneficiaris: ["empreses"],
      import: 35000, maxim: 3000, inici: "2026-12-01", fi: "2027-03-31",
      resum: "Suport a la creació d'empreses i a l'alta de nous autònoms al municipi.",
      requisits: ["Alta posterior a l'1 de gener", "Domicili fiscal a Sant Lluís"],
      url: null, bdns: null
    },
    {
      id: "mercadal-transport",
      titol: "Ajuts al transport d'estudiants",
      organisme: "mercadal", ambit: "joventut", beneficiaris: ["estudiants"],
      import: 18000, maxim: 600, inici: "2026-11-05", fi: "2026-12-05",
      resum: "Ajuda per a les despeses de desplaçament d'estudiants de cicles formatius i universitat fora del municipi.",
      requisits: ["Empadronament a Es Mercadal o Fornells", "Matrícula del curs actual"],
      url: null, bdns: null
    },
    {
      id: "migjorn-entitats",
      titol: "Subvencions a entitats i associacions del municipi",
      organisme: "migjorn", ambit: "cultura", beneficiaris: ["entitats"],
      import: 22000, maxim: 4000, inici: "2026-11-20", fi: "2026-12-20",
      resum: "Suport a l'activitat cultural, social i esportiva de les entitats des Migjorn Gran.",
      requisits: ["Entitat inscrita al registre municipal", "Memòria i pressupost"],
      url: null, bdns: null
    },
    {
      id: "ferreries-ocupacio",
      titol: "Pla d'ocupació local i formació per a persones aturades",
      organisme: "ferreries", ambit: "ocupacio", beneficiaris: ["empreses", "particulars"],
      import: 50000, maxim: 5000, inici: "2026-11-10", fi: "2026-11-30",
      resum: "Ajut a empreses que contractin persones aturades empadronades a Ferreries i beques de formació.",
      requisits: ["Contracte mínim de 6 mesos", "Persona contractada inscrita com a demandant d'ocupació"],
      url: null, bdns: null
    },
    {
      id: "ferreries-agricultura",
      titol: "Ajuts a la millora de camins rurals i explotacions",
      organisme: "ferreries", ambit: "agricultura", beneficiaris: ["pagesos"],
      import: 40000, maxim: 5000, inici: "2027-01-15", fi: "2027-03-15",
      resum: "Subvenció per a obres de millora d'accessos i infraestructures en explotacions agràries del terme.",
      requisits: ["Explotació al terme de Ferreries", "Pressupost d'obres"],
      url: null, bdns: null
    }
  ]
};
