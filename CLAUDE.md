# Reglas del proyecto

## Pipeline de extracción PDF (backend/src/config/openai.ts)
- NUNCA modificar el pipeline de extracción de forma importante sin antes presentar un plan claro al usuario y obtener su aprobación explícita.
- "Cambio importante" = agregar/eliminar fases, cambiar el flujo entre Mathpix y GPT-4o, modificar cómo se procesan imágenes, cambiar el prompt de Phase 2, o cualquier cambio que altere el resultado de la extracción.
- Fixes menores (typos, logs, formato) no requieren aprobación previa.
- No hacer cambios al pipeline como parte de otra tarea — si se detecta un problema durante otro trabajo, anotarlo y proponerlo por separado.
