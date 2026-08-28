# Sprint de Entrevista

Plataforma de estudio gamificada para repasar antes de una entrevista técnica de prácticas
(perfil BI / análisis de datos). Una sola página HTML autocontenida, sin build ni dependencias.

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

El progreso (XP, nivel, dominio por tema) se guarda en `localStorage` del navegador.

## Uso local

Abre `index.html` en el navegador. No necesita servidor.
(Con conexión carga tipografías de Google Fonts; sin ella usa fuentes de respaldo.)

## Deploy

Sitio estático. En Vercel: importar el repo y desplegar sin configuración
(no hay comando de build; el directorio raíz sirve `index.html`).
