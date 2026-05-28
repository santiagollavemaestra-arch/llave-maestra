# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ¿Qué es esto?
CRM inmobiliario **Keynet** para uso interno de **Llave Maestra** (Mar del Plata, Argentina), con visión de comercializarlo como SaaS B2B (~30 USD/mes) a otras inmobiliarias pyme de Mar del Plata, compitiendo con Tokko Broker. El diferencial es la IA integrada (Gemini 2.5 Flash).

## Deploy
```bash
git add -p && git commit -m "mensaje" && git push
```
GitHub Actions corre `npm run build` y publica `dist/` en GitHub Pages en `https://santiagollavemaestra-arch.github.io/llave-maestra/`. Actualizar `<span class="version">vDD/MM HH:MM</span>` (en `index.html`) con hora Argentina (UTC-3) antes de cada commit.

Para desarrollo local:
```bash
npm run dev   # servidor en localhost:5173
npm run build # build de producción en dist/
```

## Estructura del proyecto
```
index.html          ← HTML puro (markup, sin CSS ni JS inline)
src/
  main.js           ← entry point: imports, Firebase listeners, render coordinador
  style.css         ← todo el CSS
public/
  sw.js             ← Service Worker sin caché
  manifest.json     ← PWA manifest
  icon-192.png
  icon-512.png
vite.config.js      ← build tool (base: '/llave-maestra/')
package.json
```
**La restricción "no separar en archivos" ya no aplica.** El proyecto usa Vite; agregar módulos bajo `src/` es el camino correcto.

## Servicios configurados
- **Firebase Realtime DB** — `https://llave-maestra-default-rtdb.firebaseio.com`, nodos: `consultas`, `propiedades`, `propietarios`, `visitas`, `emails`
- **Gemini** — modelo `gemini-2.5-flash`, clave dividida en array
- **Cloudinary** — cloud `dgaixfvxa`, preset `keynet_props` (unsigned upload)
- **EmailJS** — service `service_iorm3vh`, template `template_lqgp3ki`
- **Google Maps Places** — clave dividida en array, cargada dinámicamente via `document.createElement('script')` al final del módulo

## Arquitectura JS (dentro de `<script type="module">`)

### Estado global (module-level)
```
consultas / propiedades / propietarios / visitas / emails  ← sincronizados vía onValue()
matchCache{}         ← cache de resultados de matching IA; se invalida cuando cambia propiedades
fotosSubidas[]       ← fotos del formulario de nueva propiedad (se limpia al guardar)
_editFotos[]         ← fotos del modal de edición (copia de trabajo)
_alarmasExpanded     ← estado del banner de alarmas
```

### Flujo de datos
Firebase `onValue()` listeners → actualizan vars globales → llaman `render*()` automáticamente cuando la sección activa lo requiere. El listener de `pRef` limpia `matchCache={}` al actualizarse.

### CSS Variables dinámicas
```css
--header-h    /* altura real del .header, calculada con ResizeObserver */
--subtabs-top /* header-h + tabs-main height */
```
Usadas en `.tabs-main { top: var(--header-h) }` y `.subtabs { top: var(--subtabs-top) }`. Actualizar via `_updateStickyTops()` si se modifica el header.

### Funciones clave
| Función | Descripción |
|---|---|
| `geminiCall(prompt, opts)` | Wrapper Gemini con retry x3 en error 503 (backoff 3s/6s). Usar para **todas** las llamadas a Gemini. |
| `importarDesdePortal()` | 4 proxies con fallback (allorigins→corsproxy→codetabs→thingproxy), Gemini con retry x3 para JSON, sube fotos con dedup por stem de URL. |
| `generarDescripcionIA()` / `generarDescripcionEditIA()` | Genera descripción para portales, `maxOutputTokens:8192` |
| `generarMatchingIA(id, c)` | Dado un cliente, sugiere propiedades compatibles (cachea resultado en `matchCache`) |
| `matchingInverso(propId)` | Dada una propiedad, sugiere clientes compatibles |
| `_amLabel(a)` | Convierte amenity key → emoji + texto usando `AMENITY_INFO` |
| `_collectAmenities(gridId, customId)` | Lee chips seleccionados + tags custom del formulario |
| `_restoreAmenities(amenities, gridId, customId)` | Restaura estado de chips en modal de edición |
| `_addAmTag(prefix)` | Agrega tag custom de amenidad al contenedor |
| `renderVisitasHoy()` | Banner azul de visitas del día, llamado desde `render()` |
| `renderPropiedades()` | Incluye barra de búsqueda + filtros por operación y estado |
| `abrirFichaProp(id)` | Ficha completa: galería, specs, amenidades con emoji, matching inverso, compartir |
| `guardarPropiedad()` | Si hay fotos → `modal-derechos` (2 checkboxes) → `_doGuardarPropiedad()` |
| `_editPropietario(id)` | Pre-rellena modal de propietario en modo edición |
| `guardarPropietario()` | Detecta `pr-edit-id` para crear o actualizar |
| `_editarVisita(id)` | Pre-rellena modal de visita en modo edición (sin reenviar notificaciones) |
| `guardarVisita()` | Detecta `v-edit-id` para crear o actualizar |
| `_updateStickyTops()` | Calcula y setea `--header-h` y `--subtabs-top` via ResizeObserver |
| `sigRotacion()` | Determina próximo turno según conteo de consultas **activas** (excluye Cerrado/Sin interés) |

### Sistema de amenidades (chips)
- `AMENITY_INFO` — mapa de key→"emoji Nombre" para 20 características predefinidas + extras comunes
- Formularios usan `.am-chip` (toggle) + `.am-chip-custom` (tags libres del usuario)
- Backward compatible: propiedades antiguas guardadas con keys de checkbox siguen funcionando vía `_amLabel()`

### Funciones `window.*`
Todas las funciones llamadas desde atributos HTML (`onclick`, `onchange`) deben estar expuestas como `window.nombreFuncion`. Las funciones internas se declaran con `function` o `const` sin `window.`.

## Reglas técnicas críticas
1. **API keys divididas en arrays** — `['parte1','parte2'].join('')` para evitar detección de secretos en GitHub. Aplica también a Google Maps (cargado dinámicamente, no en `<script src>`).
2. **Sin template literals con saltos de línea literales** — Safari los rompe. Usar concatenación de strings.
3. **Sin backticks anidados** dentro de template literals.
4. **IA solo bajo demanda** — nunca automática al cargar; siempre detrás de un botón.
5. **`overscroll-behavior-x:none`** en `html` y `body` — evita swipe-back en iOS.
6. **Fotos 68×68px en listas/preview** — nunca tamaño completo en grillas.
7. **Todas las llamadas a Gemini van por `geminiCall()`** — nunca `fetch` directo.
8. **El header NO tiene `position:relative` inline** — la clase `.header` ya tiene `position:sticky; top:0` en CSS; un inline override rompería el scroll.

## Equipo
- `santiago` — admin, contraseña `2858`, único que puede eliminar consultas
- `mariana`, `milagros`, `gabriel` — agentes

## Roadmap (por prioridad)
1. **CRM completo** — pulir funcionalidades existentes y UX
2. **Multi-inmobiliaria** — login por agencia, datos separados, panel admin → Llave Maestra = primer cliente
3. **Landing page Keynet** — sitio de ventas para atraer otras inmobiliarias
4. **Portal público + IA** — búsqueda conversacional, valuador de propiedades, inteligencia de mercado marplatense
