# Sprint de Entrevista

Plataforma para generar bancos de preguntas de entrevista personalizados a partir de una
descripción de empleo. Página estática (`index.html`, sin build) + dos funciones serverless
opcionales (`api/generate.js`, `api/grade.js`) para la generación y evaluación con IA.

## Cómo funciona

1. Pega la **descripción del empleo** (obligatorio).
2. Opcional: pega tu **CV** o suelta un `.pdf` / `.docx` / `.txt` (el archivo se lee en tu navegador; el
   texto extraído sí se envía a la IA al generar el banco, pero no se guarda en ningún servidor).
3. Opcional: tu **usuario de GitHub** y/o una descripción de tus proyectos.
4. La IA genera un banco de preguntas de opción múltiple adaptado a ti, en español o inglés.

Luego practicas con 5 modos: práctica por tema, flashcards, entrevista simulada,
respuesta abierta (la IA califica lo que escribes) y "enséñale a la IA" (técnica Feynman).

Los bancos y el progreso se guardan solo en tu navegador. Límite de 5 generaciones por
día por navegador; añade tu propia API key en ⚙︎ IA para quitar el límite.

## Idiomas

Interfaz en español e inglés (botón ES/EN). Cada banco queda en el idioma en que se generó.

## Uso local

Abre `index.html` en el navegador. No necesita servidor.
(Con conexión carga tipografías de Google Fonts; sin ella usa fuentes de respaldo.)
Para probar la generación de bancos y los modos con IA en local hay un servidor incluido:

```
LLM_API_KEY=tu_key_de_groq node dev-server.mjs   # http://localhost:4600
```

El servidor enruta `/api/generate` (crear bancos) y `/api/grade` (calificar respuestas),
y sirve `/vendor/*` (librerías cargadas por el navegador para leer CVs en PDF/DOCX).

## Deploy en Vercel

1. Importa el repo en Vercel. Sin configuración: no hay build, la raíz sirve `index.html`,
   `vendor/` se sirve como activos estáticos, y `api/generate.js` y `api/grade.js` se
   despliegan como funciones serverless automáticamente.
2. En **Settings → Environment Variables** agrega (ver `.env.example`):
   - `LLM_API_KEY` — API key de un proveedor con API estilo OpenAI.
     [Groq](https://console.groq.com/keys) es gratis y sin tarjeta.
   - `LLM_BASE_URL` *(opcional)* — por defecto `https://api.groq.com/openai/v1`.
   - `LLM_MODEL` *(opcional)* — por defecto `openai/gpt-oss-120b` (gratis en Groq;
     alternativa más rápida `openai/gpt-oss-20b`). Los modelos **Llama en Groq ya no
     son gratis** (pasaron a tier enterprise).

   Estas mismas variables alimentan `/api/generate` (crear bancos) y `/api/grade` (calificar respuestas).

3. Redeploy. La generación de bancos y los modos con IA quedan activos en la URL de Vercel.

Cambiar de proveedor (OpenRouter, Cerebras, Gemini, Ollama local…) es solo cambiar
`LLM_BASE_URL` y `LLM_MODEL` — no se toca el código. Ejemplos en `.env.example` y en
la cabecera de `api/generate.js` y `api/grade.js`.

### Usar la IA fuera de Vercel (Artifact, GitHub Pages, archivo local)

Ambas funciones (`api/generate.js` y `api/grade.js`) responden con CORS abierto, así que
cualquier copia de la página puede usar el backend desplegado: abre la app, pulsa **⚙︎ IA**
y pega la URL de tu deploy (p. ej. `https://sprint-entrevista.vercel.app`). Se guarda en
`localStorage`. Sin eso, la página usa `/api/generate` y `/api/grade` del mismo origen.

Alternativamente, pega tu propia API key en **⚙︎ IA** para usar la app sin necesidad de
backend desplegado; las llamadas van directo al proveedor de IA y el navegador sin pasar
por un servidor.

Nota: si usas un backend compartido, el proxy usa tu key; una URL pública deja que otros
consuman tu cuota (gratuita y con límites en Groq). Para uso personal es aceptable; si hace
falta, añade un secreto compartido en `api/generate.js` o `api/grade.js`.
