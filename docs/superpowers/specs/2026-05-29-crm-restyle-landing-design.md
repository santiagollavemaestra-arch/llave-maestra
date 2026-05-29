# Rediseño estético del CRM → lenguaje de la landing

**Fecha:** 2026-05-29
**Proyecto:** Keynet CRM (Llave Maestra)
**Tipo:** Restyle visual (CSS + HTML cosmético). Sin cambios de lógica, Firebase, datos ni Functions.

## Objetivo

Que la aplicación CRM se vea como la continuación natural de la landing page (`landing.html`),
cuya estética el usuario aprobó: **copper cálido + cream + darks con tinte cobre**, navbar
glassmorphic, botones con glow y shimmer, fotos de casas reales, radios generosos y DM Sans.

## Diagnóstico

El CRM ya comparte el ADN base de la landing (misma fuente DM Sans; header y stats bar con
darks cálidos y borde copper). El problema: el color de acento principal `--brand` sale
**casi negro (`#1C1917`)** por defecto, por lo que botones, tabs activos, pills, chips y ring
de foco se ven negros/grises. La app se siente apagada y genérica al lado de la landing, que
está dominada por copper.

## Decisiones tomadas (con el usuario)

1. **Copper universal:** el copper pasa a ser el look base de Keynet en todas las pantallas.
   El mecanismo de color por agencia (`--brand` vía `aplicarBrand`) se mantiene intacto: una
   agencia con `colorPrimario` propio lo sigue overrideando. Para Llave Maestra el default es copper.
2. **Incluir reemplazo de `alert()`** nativos por un componente toast/inline con estética copper.

## Cambios

### 1. Tokens de diseño (`src/style.css` `:root`)
- `--brand: #C47A2E` (copper) — reemplaza `#1C1917`.
- `--brand-ring: rgba(196,122,46,.18)`.
- Agregar: `--copper: #C47A2E`, `--copper-light: #D4943E`, `--copper-dark: #A86424`,
  `--gold: #D4A843`, `--cream: #FAF8F5`.
- `body { background }`: `var(--stone-50)` → `#FAF8F5` (cream).

### 2. Fallbacks de marca (`src/main.js`) — arregla inconsistencia detectada
- `aplicarBrand`: fallback `'#0a0a0a'` → `'#C47A2E'` (línea ~16).
- Logout: `setProperty('--brand', '#0a0a0a')` → `'#C47A2E'` y su `--brand-ring` a copper (líneas ~146-147).
- Resultado: un único color de marca por defecto, coherente con el CSS.

### 3. Login (`.user-screen` en `style.css` + markup en `index.html`)
- Fondo: dark sólido → **foto de casa con overlay cálido + slow-zoom** (mismo patrón que `.hero`/`.hero-bg`
  de la landing: `background-image` Unsplash + overlay `linear-gradient` oscuro cálido + `@keyframes slowZoom`).
- Badge copper con punto pulsante (opcional, reutilizar `.hero-badge`).
- Botón `.email-btn`: blanco → **copper con glow** (`box-shadow: 0 4px 24px rgba(196,122,46,.4)`).

### 4. Botones (`.btn-nueva`, `.btn-primary`, `.email-btn`)
- Color copper automático vía `--brand`.
- Agregar **glow copper** (box-shadow) en la acción primaria.
- Agregar **shimmer sweep** del `.btn-shimmer` de la landing (`::after` con `@keyframes shimmerSweep`)
  en el CTA principal (`.btn-nueva`).

### 5. Cards y modales
- Cards siguen blancas (legibilidad en listas) con **borde/hover copper sutil** y sombras cálidas.
- Modales: acentos copper en headers y acción primaria (automático vía `--brand`).

### 6. Header / stats / tabs / pills / chips / búsqueda
- Header y stats bar ya son dark+copper: reforzar levemente el borde copper.
- Tabs-main, subtabs, subtab-cnt activo, filter-pill activo, am-chip seleccionado y ring de
  `.search-input:focus` → copper **automático** al flipear `--brand`. Verificar visualmente.

### 7. Toasts (nuevo componente) — reemplazo de `alert()`
- Agregar componente toast cálido (copper) en `index.html` + estilos en `style.css` + helper
  (p.ej. `window.toast(msg, tipo)`).
- Reemplazar los 9 `alert()` actuales:
  - `visitas.js:62`, `propietarios.js:32`, `admin.js:233`, `consultas.js:370`, `consultas.js:457`,
    `propiedades.js:82`, `propiedades.js:628`, `propiedades.js:640`, `auth.js:81`.
- Validaciones de formulario (campos faltantes) → preferir error inline; mensajes de éxito/error
  generales → toast. Confirmaciones destructivas siguen usando su modal/confirm actual (no son `alert`).

### 8. Detalle fino
- `index.html`: meta `theme-color` `#0a0a0a` → `#100C08` (dark cálido).

## Fuera de alcance (no tocar)

- Lógica de negocio, Firebase, Functions, importación de portales, matching IA.
- Prompt IA duplicado (hallazgo #4) y `catch(e){}` vacíos (hallazgo #5): quedan para otra pasada.
- Hallazgo #1 (key Gemini en bundle): es de seguridad/deploy, se trata aparte de este restyle.

## Riesgo y verificación

- **Riesgo bajo:** cambios cosméticos. Sin escrituras a Firebase ni cambios de datos.
- **Verificación:** `npm run build` sin errores + revisión visual de login, lista de consultas,
  propiedades, modales, stats y los flujos que antes usaban `alert()`.

## Criterio de éxito

La app, al abrirla y navegarla, se siente parte del mismo producto que la landing: dominada por
copper cálido sobre cream, login con hero fotográfico, botones con glow/shimmer, y cero `alert()`
nativos rompiendo la estética.
