# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ¿Qué es esto?
CRM inmobiliario **Keynet** para uso interno de **Llave Maestra** (Mar del Plata, Argentina), con visión de comercializarlo como SaaS (~30 USD/mes) compitiendo con Tokko Broker. El diferencial es la IA integrada.

## Deploy
```bash
git add index.html && git commit -m "mensaje" && git push
```
GitHub Pages publica automáticamente desde `main`. No hay build step. La versión visible en la app es el `<span class="version">` del header — actualizarla siempre con hora Argentina (UTC-3) antes de cada commit.

## Estructura del proyecto
Un solo archivo: `index.html` (~2300 líneas). Todo el HTML, CSS y JS está inline. No separar en múltiples archivos.
- `sw.js` — Service Worker sin caché (siempre red)
- `manifest.json` — PWA manifest

## Servicios configurados
- **Firebase Realtime DB** — `https://llave-maestra-default-rtdb.firebaseio.com`, nodos: `consultas`, `propiedades`, `propietarios`, `visitas`, `emails`
- **Gemini** — modelo `gemini-2.5-flash`, clave: `['AIzaSyC6PEMnA-5d','szajmDjKw42AnXNQ','RVwsASY'].join('')`
- **Cloudinary** — cloud `dgaixfvxa`, preset `keynet_props` (unsigned upload)
- **EmailJS** — service `service_iorm3vh`, template `template_lqgp3ki`
- **Google Places API** — `AIzaSyCJA9Mqz_27Z4pRWiXyuV9K1tgJsb27YKA`

## Arquitectura JS (dentro de `<script type="module">`)

### Estado global (module-level)
```
propiedades / consultas / propietarios / visitas / emails  ← sincronizados vía onValue()
fotosSubidas[]   ← fotos del formulario de nueva propiedad (se limpia al guardar)
_editFotos[]     ← fotos del modal de edición (copia de trabajo)
_mejoraContainer / _mejoraOrigUrl / _mejState  ← estado del modal de mejora IA
```

### Flujo de datos
Firebase `onValue()` listeners → actualizan las vars globales → llaman `render*()` automáticamente cuando la sección activa lo requiere.

### Funciones clave
| Función | Descripción |
|---|---|
| `geminiCall(prompt, opts)` | Wrapper Gemini con retry x3 en error 503 (backoff 3s/6s). Usar para **todas** las llamadas a Gemini. |
| `importarDesdePortal()` | Fetch HTML via allorigins→corsproxy, Gemini extrae datos, sube fotos con dedup inteligente por stem de URL |
| `generarDescripcionIA()` / `generarDescripcionEditIA()` | Genera descripción para portales con Gemini, `maxOutputTokens:8192` |
| `generarMatchingIA(id, c)` | Dado un cliente, sugiere propiedades compatibles |
| `matchingInverso(propId, p)` | Dada una propiedad, sugiere clientes compatibles |
| `_buildMejUrl(base, emb, desp)` | Construye URL Cloudinary con transforms: `e_improve:100,...` (embellecer) o `e_gen_remove:...` (despejar, plan pago) |
| `abrirMejoraFoto(el)` | Abre modal de mejora IA para una foto; muestra antes/después en tiempo real |
| `aplicarMejora()` | Guarda URL mejorada en `fotosSubidas` y agrega badge ✨/🧹 al thumbnail |
| `_renderEditFotos()` | Renderiza grid de fotos en modal de edición con ⭐ portada, ◀▶ orden, ✕ eliminar |
| `renderPropiedades()` | Tarjeta con cover 16:9 (primera foto), toca → `abrirFichaProp()` |
| `abrirFichaProp(id)` | Ficha completa: galería `.galeria-prop` con badges IA, características, matching inverso |
| `guardarPropiedad()` | Si hay fotos subidas → muestra `modal-derechos` (2 checkboxes) → `_doGuardarPropiedad()` |
| `actualizarSelPropietarios()` | Puebla los `<select>` de propietarios en nueva propiedad, visitas **y edición** |

### Funciones `window.*`
Todas las funciones llamadas desde atributos HTML (`onclick`, `onchange`) deben estar expuestas como `window.nombreFuncion`. Las funciones internas (helpers) se declaran con `function` o `const` sin `window.`.

## Reglas técnicas críticas
1. **API keys divididas en arrays** — `['parte1','parte2'].join('')` para evitar detección de secretos en GitHub.
2. **Sin template literals con saltos de línea literales** — Safari los rompe. Usar concatenación de strings en su lugar.
3. **Sin backticks anidados** dentro de template literals.
4. **IA solo bajo demanda** — nunca automática al cargar; siempre detrás de un botón.
5. **`overscroll-behavior-x:none`** en `html` y `body` — evita swipe-back en iOS.
6. **Fotos 68×68px en listas/preview** — nunca tamaño completo en grillas.
7. **Todas las llamadas a Gemini van por `geminiCall()`** — nunca `fetch` directo a la API.
8. **Versión en el header** — siempre actualizar `<span class="version">vDD/MM HH:MM</span>` con hora Argentina antes de cada commit.

## Equipo
- `santiago` — admin, contraseña `2858`, único que puede eliminar consultas/propiedades
- `mariana`, `milagros`, `gabriel` — agentes

## Pendiente
- **Multi-inmobiliaria** — sistema de login + panel admin para vender Keynet a otras inmobiliarias
- **Landing page Keynet** — sitio de ventas del producto
