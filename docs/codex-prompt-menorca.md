# Prompt para Codex: patrones espaciales y modelo predictivo de yacimientos prehistóricos de Menorca

> Copia todo lo que hay debajo de la línea en Codex. Está pensado para ejecutarse en un repositorio vacío o en una carpeta nueva (`menorca-apm/`).

---

## Rol y objetivo

Actúas como ingeniero de arqueología computacional. Vas a construir, en este repositorio, un proyecto reproducible para responder a una pregunta científica:

> ¿Los yacimientos prehistóricos conocidos de Menorca (Edad del Bronce, periodo talayótico y postalayótico) siguen una estructura territorial explicable por el paisaje (agua, suelo, topografía, visibilidad, movilidad, costa) y por relaciones entre comunidades? Y, si es así, ¿esa estructura permite priorizar zonas donde podría haber estructuras no documentadas?

El proyecto es un **experimento exploratorio con criterios de fracaso fijados de antemano**. Un resultado negativo (no hay señal explotable) es un resultado válido y debe documentarse igual que uno positivo.

## Reglas que no puedes romper

1. **No inventes datos.** Nunca generes coordenadas, yacimientos, atributos, URLs, resoluciones ni licencias que no hayas verificado. Si una fuente no está disponible o no puedes descargarla, detente en ese punto, escríbelo en `data/SOURCES.md` y pídeme el archivo. Los datos sintéticos solo se permiten dentro de `tests/` y deben estar marcados como sintéticos.
2. **No presentes una predicción como un descubrimiento.** Todo resultado se clasifica como:
   - *correlación estadística* (lo que produce el código),
   - *hipótesis arqueológica* (interpretación plausible, con alternativas),
   - *evidencia arqueológica* (solo procede de trabajo de campo o bibliografía publicada; este proyecto no la produce).
   Usa exactamente estas etiquetas en informes, leyendas y nombres de capas.
3. **No uses variables derivadas de los yacimientos conocidos en el modelo predictivo** (distancia al yacimiento más cercano, densidad de yacimientos, distancia al talayot más cercano, etc.). Provocan fuga de información y hacen que el modelo rellene huecos entre sitios conocidos en lugar de aprender reglas de localización. Esas variables solo se usan en el análisis de relaciones (hito M4).
4. **Validación espacial obligatoria.** Prohibida la validación cruzada con particiones aleatorias de puntos.
5. **Prerregistro.** Antes de entrenar ningún modelo, escribe `docs/preregistro.md` con las hipótesis, las variables, el modelo base, las métricas y los umbrales de éxito o fracaso. Haz commit. No lo modifiques después de ver resultados; si cambias algo, añade una sección "Desviaciones" con fecha y motivo.
6. **Protección del patrimonio.** Las coordenadas precisas de yacimientos y la lista de zonas candidatas son información sensible (riesgo de expolio). No las subas a repositorios públicos ni a servicios externos. Pon `data/` y `outputs/sensitive/` en `.gitignore`. Los mapas compartibles usan agregación a 1 km como mínimo.
7. **Un hito cada vez.** Al terminar cada hito, para, resume lo hecho, los resultados y los problemas, y espera mi confirmación antes de seguir.

## Entorno técnico

- Sistema de referencia: **ETRS89 / UTM 31N (EPSG:25831)** para todo. Comprueba y reproyecta cada capa al cargarla.
- Python 3.11+, entorno con `uv` o `conda` y archivo de bloqueo:
  `geopandas`, `shapely`, `pyproj`, `rasterio`, `rioxarray`, `xarray`, `numpy`, `scipy`, `pandas`, `scikit-learn`, `xgboost` o `lightgbm`, `elapid` (MaxEnt), `statsmodels`, `scikit-image` (superficies de coste y rutas con `MCP_Geometric`), `networkx`, `hdbscan`, `whitebox` o `gdal_viewshed` (visibilidad), `rvt-py` (Sky View Factor, Local Relief Model), `pdal` (LiDAR), `matplotlib`, `folium` o `leafmap`.
- R 4.x con `spatstat` para el análisis de patrones de puntos (funciones G, K y g inhomogéneas, K cruzada, envolventes de Monte Carlo, ventana = línea de costa) y, opcionalmente, `INLA` para el LGCP. Llámalo desde scripts del `Makefile` y guarda resultados en ficheros, no en memoria compartida.
- Orquestación con `Makefile` o `snakemake`: cada paso lee de disco y escribe en disco, con semilla fija.
- Tests con `pytest`: CRS correcto, sin NaN en celdas de tierra, alineación de rásters, sin fuga entre pliegues espaciales, y un test con datos sintéticos donde el modelo debe recuperar un efecto conocido.

Estructura:

```
menorca-apm/
  data/raw/          # descargas originales, sin tocar (no versionado)
  data/interim/
  data/processed/
  data/SOURCES.md    # fuente, URL verificada, fecha, licencia, formato, resolución, CRS
  docs/preregistro.md
  docs/decisiones.md # registro de decisiones metodológicas
  src/apm/           # paquete Python
  r/                 # scripts de spatstat / INLA
  notebooks/         # solo exploración; nada de lógica que no esté en src/
  outputs/public/    # figuras agregadas, compartibles
  outputs/sensitive/ # coordenadas y zonas candidatas (no versionado)
  tests/
  Makefile
```

## Hitos

### M0. Preparación
Crea la estructura, el entorno, el `Makefile`, la configuración (`config.yaml` con rutas, CRS, tamaño de celda, semillas) y el `.gitignore`. Escribe un `README.md` que explique el objetivo y las reglas anteriores.

### M1. Inventario y descarga de datos
Localiza, verifica y documenta en `data/SOURCES.md` cada fuente. Para cada una: qué ofrece, formato, resolución, licencia, si hay descarga directa o servicio WMS/WFS/WMTS/API, y la utilidad para el proyecto. Fuentes a investigar (verifica que existen y cómo se accede, no supongas URLs):

- **IGN / CNIG, Centro de Descargas**: MDT de 5 m (y 2 m si existe para Baleares), PNOA-LiDAR (nubes de puntos, cobertura de Menorca y año de vuelo), ortofotos PNOA actuales e históricas (vuelos americanos de 1945–46 y 1956–57, vuelo interministerial 1973–86), límites administrativos.
- **IDEIB** (Govern de les Illes Balears): ortofotos históricas, cartografía temática, usos del suelo, servicios WMS/WFS.
- **IDE Menorca / Consell Insular de Menorca**: cartografía insular, y el catálogo o inventario de patrimonio arqueológico si es accesible.
- **IGME**: mapa geológico MAGNA 1:50.000 de Menorca (hojas correspondientes), hidrogeología, puntos de agua si existen.
- **SIOSE / Corine Land Cover**: usos del suelo actuales.
- Red hidrográfica y fuentes: confirma qué capa existe.
- Inventarios publicados de yacimientos (catálogos municipales, la candidatura de Menorca Talayótica a Patrimonio Mundial, bibliografía con anexos de coordenadas).

**El catálogo de yacimientos probablemente no es descargable libremente.** Si no lo encuentras abierto, para y pídeme el CSV o GeoPackage. No lo reconstruyas a partir de páginas web, mapas turísticos o memoria.

### M2. Curación del catálogo de yacimientos
Esquema mínimo por yacimiento:

`id, nombre, fuente, x, y, precision_m, metodo_georref, tipo (poblado | talayot_aislado | recinto_taula | naveta_habitacion | naveta_funeraria | cueva_funeraria | hipogeo | otro), fases (lista), certeza_identificacion (alta|media|baja), certeza_cronologia, n_talayots, tiene_taula, superficie_m2, estado_conservacion, metodo_descubrimiento, fecha_alta_catalogo`

Tareas:
- Detecta duplicados, coordenadas fuera de la isla, en el mar o en errores evidentes.
- **Un punto por asentamiento** para el modelo de poblados (las estructuras de un mismo poblado se agrupan; usa HDBSCAN solo si el catálogo no trae el agrupamiento, y documenta el criterio).
- Excluye del entrenamiento los registros con certeza baja o `precision_m` mayor que el tamaño de celda; mantenlos en una capa aparte.
- Genera un informe de calidad: recuentos por tipo, fase y certeza, y un mapa de los registros excluidos y el motivo.
- Congela la versión (hash del fichero) y regístrala.

Para el sesgo de prospección, prepara también un conjunto **de todo el patrimonio catalogado de cualquier época** (romano, medieval, etnológico) si existe: se usará como fondo con el mismo sesgo.

### M3. Variables (covariables)
Retícula de **50 m** alineada con todos los rásters, máscara de tierra a partir de la línea de costa. Calcula cada variable a varias escalas (ventanas de 100 m, 500 m y 1 km) cuando tenga sentido:

- **Topografía**: altitud, pendiente, orientación (seno/coseno), curvatura, rugosidad, TPI multiescala, prominencia.
- **Agua**: distancia de coste a cauces y barrancos, acumulación de flujo, orden de cauce, distancia de coste a fuentes y puntos de agua (señala que la red actual es un proxy imperfecto de la prehistórica).
- **Geología y suelos**: litología agrupada, separación Tramuntana / Migjorn, capacidad agrológica.
- **Costa**: distancia de coste al mar y a calas aptas como fondeadero (define el criterio y documéntalo).
- **Viento**: exposición a la tramontana (norte) a partir del relieve.
- **Visibilidad**: superficie visible a 1, 3 y 10 km (observador a 1,6 m; repite con una torre de 6–8 m como análisis de sensibilidad), visibilidad hacia el mar. Para que sea computable, calcula la visibilidad sobre una muestra de puntos y para los yacimientos, no en todas las celdas, salvo que el cálculo sea viable.
- **Movilidad**: superficie de coste con la función de Tobler y penalización de barrancos; corredores como densidad de rutas de menor coste entre puntos **independientes de los yacimientos** (calas, fuentes, collados).
- **Sesgo**: distancia a carreteras y caminos actuales, uso del suelo actual, distancia a núcleos urbanos, zona urbanizada. Se usan para ajustar el modelo y se fijan a un valor constante al predecir.

Controla la colinealidad (|r| > 0,7 o VIF > 10) y documenta qué variables se descartan y por qué.

### M4. Análisis de patrones y relaciones (sin modelo predictivo)
En R con `spatstat`, ventana = contorno de la isla, corrección de borde activada:

1. Mapas descriptivos por tipo y fase. KDE solo como visualización.
2. Efecto de primer orden: proceso de Poisson inhomogéneo con covariables.
3. Funciones G y g(r) **inhomogéneas** por tipo, con envolventes de 999 simulaciones condicionadas a esa intensidad. Interpreta regularidad frente a agrupación por escalas.
4. K cruzada / g cruzada inhomogénea: talayot–recinto de taula, poblado–cueva funeraria, poblado–naveta.
5. Poblados con y sin taula: compara tamaño, centralidad y visibilidad con pruebas de permutación.
6. Intervisibilidad entre talayots (máximo 10 km): red, grado medio, componentes; compárala con 999 redes de puntos aleatorios en posiciones topográficas equivalentes (mismo rango de TPI y altitud).
7. Viewshed de los yacimientos frente a puntos aleatorios en la misma posición topográfica.
8. Alineaciones: cuenta tripletes alineados (tolerancia angular fija) y compáralos con simulaciones. Sin exceso significativo, no se informa de ninguna alineación.
9. Territorios: captaciones por coste a 30 y 60 minutos, Voronoi ponderado por coste y XTENT; proporción de suelo cultivable, agua y costa dentro de cada captación frente a captaciones de puntos aleatorios.
10. Separa siempre Tramuntana y Migjorn y repite con subconjuntos cronológicos (o con ponderación aorística) para comprobar que los patrones no son efecto del palimpsesto.

Cada resultado se escribe en `docs/resultados_M4.md` con su etiqueta (*correlación estadística* / *hipótesis arqueológica*), el tamaño de muestra y el valor de la prueba.

### M5. Modelo predictivo
Escribe primero `docs/preregistro.md` (regla 5) y haz commit.

- Salida: **intensidad relativa** por celda (no probabilidad absoluta).
- Fondo: 20.000–50.000 puntos; versión principal con **fondo con el mismo sesgo** (patrimonio de cualquier época) si existe; si no, fondo aleatorio más covariables de sesgo.
- Escalera de modelos; cada uno debe superar al anterior en validación espacial:
  0. nulo (intensidad constante);
  1. **base**: litología + distancia de coste al agua;
  2. Poisson inhomogéneo / regresión logística con fondo, penalizada (elastic net) o GAM;
  3. MaxEnt (`elapid`) con características lineales y cuadráticas y regularización;
  4. Gradient Boosting o Random Forest con restricciones monótonas, solo si n ≥ 100 en la clase;
  5. opcional: LGCP en INLA para separar paisaje y agrupación residual.
- Modelos por tipo:
  - **A. Poblados**: modelo completo (principal).
  - **B. Talayots aislados**: propio si n ≥ 80; si no, conjunto con A con término por tipo.
  - **C. Recintos de taula**: sin modelo de localización; modelo condicional "qué poblados tienen taula".
  - **D. Funerarios**: cuevas e hipogeos con modelo propio; navetas funerarias, análisis descriptivo si n < 30.
  - **E. Naviformes / Edad del Bronce**: exploratorio con regularización fuerte.
  - Más un modelo de **todos los yacimientos prehistóricos** como referencia.
- Validación:
  - bloques espaciales de tamaño mayor que el rango de autocorrelación estimado en M4 (por defecto 3 km), 5–10 pliegues;
  - exclusión de un sitio con margen (buffered leave-one-out);
  - exclusión de región (oeste→este y Tramuntana→Migjorn);
  - **validación temporal** si `fecha_alta_catalogo` lo permite (entrenar con lo catalogado antes de una fecha y evaluar con lo posterior).
- Métricas: curva de captura, ganancia de Kvamme al 5, 10 y 20 % de superficie, índice de Boyce continuo; AUC solo como métrica secundaria.
- Controles de sobreajuste: prueba de etiquetas permutadas (el modelo con ubicaciones barajadas no debe dar ganancia), estabilidad de variables y zonas entre pliegues, revisión de curvas de respuesta (todas se exportan como figura para que yo las revise).
- Incertidumbre: desviación entre modelos de pliegues y réplicas bootstrap; análisis MESS para marcar zonas fuera del rango de entrenamiento.
- Categorías del mapa por superficie (5 % / 5–15 % / 15–40 % / resto). Si en validación una categoría no concentra más sitios que la inferior, se fusionan.

### M6. Prueba de ocultación (decisiva)
Con los criterios ya escritos en el prerregistro:

1. Elige una zona piloto con suficientes yacimientos (propón 2–3 candidatas con recuentos reales del catálogo y justifica la elección; no la elijas tú sin mi confirmación).
2. Oculta aleatoriamente el 20–30 % de los yacimientos (estratificado por tipo), repítelo 100 veces con semillas distintas.
3. Entrena sin ellos y mide dónde caen los ocultos: percentil de su puntuación, proporción en las categorías "muy alta" y "alta", ganancia frente al modelo base.
4. **Criterio de fracaso por defecto** (ajustable solo en el prerregistro): si los yacimientos ocultos no superan claramente al modelo base (por ejemplo, menos de un 40 % capturado en el 20 % superior de superficie, o un índice de Boyce < 0,3), el método se declara insuficiente. En ese caso no se generan zonas candidatas y el informe final lo dice.

### M7. Teledetección sobre las zonas priorizadas (solo si M6 se supera)
Para las 20–30 zonas mejor puntuadas, estables entre modelos y fuera de zonas urbanizadas:

- LiDAR (PNOA): clasificación de suelo con PDAL, MDT de 0,5–1 m, y visualizaciones con `rvt-py`: hillshade multidireccional, Local Relief Model, Sky View Factor, apertura positiva y negativa, pendiente, curvatura.
- Ortofotos actuales e históricas (en especial 1956–57) para comparar estructuras desaparecidas.
- Imágenes multiespectrales (Sentinel-2) e índices de vegetación (NDVI, NDRE) en distintas épocas del año para marcas de vegetación.
- Genera por zona una ficha con las visualizaciones a la misma escala y una lista de **anomalías observadas**, descritas por su forma (circular, lineal, montículo, plataforma), tamaño y visibilidad en cada capa. No las llames "yacimiento" ni "talayot": usa "anomalía compatible con…".
- Si propones detección automática de formas (p. ej. círculos en el LRM), valídala primero sobre talayots conocidos y reporta precisión y falsos positivos.

### M8. Resultados
- `outputs/sensitive/`: GeoPackage con yacimientos conocidos por categoría, relaciones (red de intervisibilidad, corredores, territorios), raster de intensidad relativa, categorías, incertidumbre, zonas candidatas y fichas de M7.
- `outputs/public/`: figuras agregadas a ≥ 1 km, sin coordenadas de yacimientos no protegidos ni de zonas candidatas.
- `docs/informe.md` con: pregunta, datos y su sesgo, métodos, resultados de M4 (relaciones), rendimiento del modelo (M5, M6) incluido si ha fracasado, lista priorizada de zonas para revisión y limitaciones. En cada mapa y tabla, la frase: **"Las zonas de probabilidad son hipótesis estadísticas, no yacimientos arqueológicos confirmados. Cualquier comprobación sobre el terreno requiere arqueólogos profesionales y las autorizaciones del Consell Insular de Menorca."**

## Cómo quiero que trabajes
- Empieza por M0 y M1. Al terminar M1, enséñame la tabla de fuentes y dime qué datos faltan.
- Antes de cada decisión metodológica no prevista aquí, escríbela en `docs/decisiones.md` con su justificación.
- Si un resultado parece demasiado bueno (Kvamme > 0,8, AUC > 0,95), asume primero un error o una fuga de información y búscala.
- Prefiere un resultado modesto y honesto a uno espectacular sin validar.
