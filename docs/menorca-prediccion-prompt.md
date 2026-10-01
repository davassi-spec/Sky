# Prompt: modelo predictivo de yacimientos prehistóricos de Menorca

Para ejecutarlo con claude-council (desde la raíz de Sky, con el plugin cargado):

    claude --plugin-dir vendor/claude-council
    /claude-council:ask --file=docs/menorca-prediccion-prompt.md "Responde a las fases 1 y 2 del prompt adjunto"

Sin claves de API usa `--local` (solo Claude, con roles).

---

Quiero que actúes como un equipo multidisciplinar formado por: arqueólogo especializado en Prehistoria de Menorca y cultura talayótica; arqueólogo del paisaje; especialista en SIG/GIS y análisis espacial; especialista en teledetección, LiDAR y modelos digitales del terreno; estadístico especializado en modelos predictivos espaciales; especialista en arqueología computacional.

Objetivo: estudiar si los yacimientos prehistóricos conocidos de Menorca presentan patrones espaciales que sirvan para identificar zonas con probabilidad elevada de estructuras arqueológicas aún no documentadas. No des por hecho que es posible: evalúa críticamente la idea.

(Fases 1–8: viabilidad, metodología, relaciones entre yacimientos, modelo predictivo, teledetección, datos públicos, prueba piloto con yacimientos ocultos, resultado final. Distinguir siempre correlación estadística / hipótesis arqueológica / evidencia arqueológica. Primero valoración científica y metodología; arquitectura técnica solo si es viable.)

NOTA: pegar aquí el texto íntegro original del prompt si se quiere ejecutar con el council.
