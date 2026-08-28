# Sprint de Entrevista

Plataforma de estudio gamificada para repasar antes de una entrevista técnica de prácticas
(perfil BI / análisis de datos). Página estática (`index.html`, sin build) + una función
serverless opcional (`api/grade.js`) para los modos con IA.

## Contenido

96 preguntas de opción múltiple con explicación, en 8 mazos:

- Excel
- Power Apps
- Power BI
- Copilot / Copilot Studio
- Python
- SQL
- JavaScript
- CEMEX y entrevista (incluye preguntas de comportamiento tipo STAR)

## Modos

- **Práctica por tema** — respondes con explicación inmediata, 3 vidas por ronda, XP con
  multiplicador por racha y niveles.
- **Flashcards** — repaso rápido pregunta → concepto.
- **Entrevista simulada** — 15 preguntas mezcladas, 10 minutos, sin pistas, con reporte
  final por tema.
- **Respuesta abierta** *(IA)* — ves solo la pregunta, contestas con tus palabras (o "no sé").
  La IA califica (Correcto / Parcial / Incorrecto), explica y admite repreguntas.
- **Enséñale a la IA** *(IA)* — técnica Feynman: explicas el concepto como si dieras clase;
  la IA hace de alumno, te repregunta y evalúa tu explicación.

El progreso (XP, nivel, dominio por tema) se guarda en `localStorage` del navegador.

## Uso local

Abre `index.html` en el navegador. No necesita servidor.
(Con conexión carga tipografías de Google Fonts; sin ella usa fuentes de respaldo.)
Los modos con IA necesitan el backend (ver abajo); sin él, caen a un modo de
autoevaluación (revela la respuesta modelo y te calificas tú).

Para probar los modos con IA en local hay un servidor incluido:

```
LLM_API_KEY=tu_key_de_groq node dev-server.mjs   # http://localhost:4600
```

## Deploy en Vercel

1. Importa el repo en Vercel. Sin configuración: no hay build, la raíz sirve `index.html`
   y `api/grade.js` se despliega como función serverless automáticamente.
2. En **Settings → Environment Variables** agrega (ver `.env.example`):
   - `LLM_API_KEY` — API key de un proveedor con API estilo OpenAI.
     [Groq](https://console.groq.com/keys) es gratis y sin tarjeta (corre Llama 3.3 70B).
   - `LLM_BASE_URL` *(opcional)* — por defecto `https://api.groq.com/openai/v1`.
   - `LLM_MODEL` *(opcional)* — por defecto `llama-3.3-70b-versatile`.
3. Redeploy. Los modos con IA quedan activos en la URL de Vercel.

Cambiar de proveedor (OpenRouter, Cerebras, Gemini, Ollama local…) es solo cambiar
`LLM_BASE_URL` y `LLM_MODEL` — no se toca el código. Ejemplos en `.env.example` y en
la cabecera de `api/grade.js`.

### Usar la IA fuera de Vercel (Artifact, GitHub Pages, archivo local)

`api/grade.js` responde con CORS abierto, así que cualquier copia de la página puede
usar el backend desplegado: abre el modo **Respuesta abierta**, pulsa **⚙︎ IA** y pega
la URL de tu deploy (p. ej. `https://sprint-entrevista.vercel.app`). Se guarda en
`localStorage`. Sin eso, la página usa `/api/grade` del mismo origen.

Nota: el proxy usa tu key; una URL pública deja que otros consuman tu cuota (gratuita y
con límites en Groq). Para uso personal es aceptable; si hace falta, añade un secreto
compartido en `api/grade.js`.
