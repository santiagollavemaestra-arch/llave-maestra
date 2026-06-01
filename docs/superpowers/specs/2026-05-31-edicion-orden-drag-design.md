# Diseño: edición con casillas, orden de propiedades y drag de fotos

Fecha: 2026-05-31
Proyecto: Keynet CRM (Llave Maestra)

## Objetivo

Tres mejoras de UX pedidas, independientes entre sí:

1. **Editar "Qué busca" con casillas** — al editar una consulta cargada, el campo "Qué busca" debe editarse con el mismo UI de pills/casillas que se usa al crearla, en lugar del `prompt()` de texto plano actual.
2. **Orden de propiedades** — las propiedades nuevas deben aparecer arriba (no abajo), y debe poderse reordenar la lista manualmente arrastrando.
3. **Arrastrar fotos** — reordenar fotos arrastrando (no con flechitas ◀▶), tanto al subir una propiedad nueva como al editar una existente.

## Decisión técnica transversal: drag-and-drop

Se usa **SortableJS** (`npm i sortablejs`, ~12KB, soporte nativo touch + mouse). Es PWA mobile-first, por lo que el drag debe funcionar con el dedo; el drag nativo HTML5 no sirve en touch y hacerlo a mano con Pointer Events es propenso a bugs de scroll. Se importa como módulo ES6 (`import Sortable from 'sortablejs'`) en `propiedades.js`.

---

## Punto 1 — Editar "Qué busca" con casillas

### Estado actual
- Al crear (`#modal-consulta`), "Qué busca" se arma con pills (`#obs-op`, `#obs-tipo`, `#obs-amb`, `#obs-extras`, `#obs-zona`, `#obs-precio`, `#obs-moneda`, `#obs-extra-txt`, etc.) y `_buildObs()` (consultas.js) concatena todo en un string con ` · `.
- Al editar, `window._editObs(id)` abre un `prompt()` de texto plano. No hay uniformidad.
- La consulta guarda solo el string `obs`; no hay datos estructurados del criterio.

### Cambios
1. **Modelo de datos:** al guardar una consulta (crear o editar) se persiste, además del string `obs`, un objeto estructurado:
   ```js
   busca: { op, tipo, tipoOtro, amb, zona, precio, moneda, extras:[], extrasCustom:[], nota }
   ```
   El string `obs` se sigue guardando (lo consumen render de lista, matching IA, respuesta IA) — `busca` es complementario.
2. **`_buildObs(prefix)`** se parametriza con un prefijo de IDs para servir a dos modales. Devuelve `{ obs, busca }` (string + objeto). El modal de creación usa prefijo `obs-`; el de edición usa `eb-`.
3. **Nuevo modal `#modal-editar-busca`** en `index.html`: copia del bloque de pills de "Qué busca" con IDs prefijados `eb-` (`eb-op`, `eb-tipo`, `eb-amb`, `eb-extras`, `eb-zona`, `eb-precio`, `eb-moneda`, `eb-tipo-otro`, `eb-extras-custom`, `eb-extra-txt`). Botones Cancelar / Guardar.
4. **`_fillBuscaForm(prefix, busca)`** (nueva): precarga las pills/inputs de un modal a partir de un objeto `busca`.
5. **`_parseObs(str)`** (nueva): parseo best-effort de un string `obs` viejo → objeto `busca`. Separa por ` · ` y matchea cada token contra los sets conocidos (op: Venta/Alquiler/Alq. temporal; tipo: Departamento/Casa/PH/Local/Oficina/Terreno; `"N amb."`; `"Zona X"`; `"Hasta MON N"`; `"Con a, b, c"`). Los extras que matcheen pills conocidas van a `extras`, el resto a `extrasCustom`. Tokens no reconocidos se concatenan en `nota`.
6. **`window._editObs(id)`** se reescribe: abre `#modal-editar-busca`; si `c.busca` existe lo usa con `_fillBuscaForm`, si no parsea `c.obs` con `_parseObs`. Guarda el `id` en edición.
7. **`window._guardarBusca()`** (nueva): toma `_buildObs('eb-')`, hace `update(agRef('consultas',id), { obs, busca })`, cierra el modal y refresca el detalle (`window._abrirDetalle(id)`).
8. `window.guardarConsulta()` (crear) pasa a usar `_buildObs('obs-')` y guarda también `busca`.

### Alcance
Solo el campo "Qué busca". El resto de campos del detalle (nombre, tel, IG, propiedad, canal) siguen con el lápiz rápido (`prompt()`) actual.

---

## Punto 2 — Orden de propiedades (nuevas arriba + reorden manual)

### Estado actual
- `renderPropiedades()` hace `Object.entries(st.propiedades)` sin ordenar → orden de push-id de Firebase (más viejas primero). Las nuevas quedan abajo.
- Las propiedades ya guardan `fecha: Date.now()`.

### Cambios
1. **Campo `orden`** (number) en cada propiedad. Mayor `orden` = más arriba.
2. **Al crear** (`_doGuardarPropiedad`): `orden = (max orden actual) + 1`, de modo que la nueva queda primera. Fallback: si ninguna propiedad tiene `orden`, usar `Date.now()`.
3. **Ordenamiento en `renderPropiedades`:** ordenar el array por `orden` descendente; las que no tengan `orden` (datos viejos) caen por `fecha` descendente al final del bloque sin-orden. Regla simple: clave de orden = `p.orden ?? p.fecha ?? 0`, sort descendente.
4. **Reorden manual con SortableJS** sobre `.prop-grid`:
   - Se activa **solo cuando no hay búsqueda ni filtros activos** (`q`, `fOp`, `fEst` vacíos). Reordenar una vista filtrada es ambiguo.
   - El `onclick` de la card abre la ficha; para no disparar ficha al arrastrar se usa el umbral de Sortable (`delay` corto / `delayOnTouchOnly`) o se ignora el click si hubo drag.
   - `onEnd`: recalcular `orden` de todas las cards visibles según su nuevo índice DOM (orden descendente) y hacer un `update` multipath en Firebase (`agRef('propiedades')` con `{ 'id1/orden':N, 'id2/orden':M, ... }`). Actualizar también `st.propiedades` localmente para evitar salto visual.

---

## Punto 3 — Arrastrar fotos (subir + editar)

### Estado actual
- **Editar** (`_renderEditFotos`): reordena con botones ◀▶ vía `_editMoverFoto(idx,dir)` sobre el array `_editFotos`. La foto 0 es portada (⭐).
- **Subir nueva** (`subirFotos` → `#p-fotos-preview`): no hay reorden; el array es `fotosSubidas`.

### Cambios
1. **Editar:**
   - Quitar los botones ◀▶ y `_editMoverFoto` de `_renderEditFotos`.
   - Inicializar `Sortable` sobre `#edit-fotos-grid`. `onEnd`: reordenar `_editFotos` según el cambio (`oldIndex`→`newIndex`) y re-renderizar (la primera queda como portada ⭐).
   - El `onclick` de la img abre lightbox; evitar que el drag dispare el lightbox (igual criterio que punto 2).
2. **Subir nueva:**
   - Inicializar `Sortable` sobre `#p-fotos-preview`. Como las fotos suben async y los tiles se crean con índice fijo en el `onclick`, se añade `data-url` a cada tile.
   - `onEnd`: reconstruir `fotosSubidas` leyendo el `data-url` de los tiles en su orden actual del DOM. Así el array siempre refleja el orden visual sin depender de índices fijos.
   - Revisar `quitarFoto` y `abrirMejoraFoto`: deben operar por `data-url` en vez de índice fijo, ya que el orden puede cambiar tras un drag.

---

## Archivos afectados

- `package.json` — agregar `sortablejs`.
- `src/consultas.js` — `_buildObs(prefix)`, `_fillBuscaForm`, `_parseObs`, `_editObs`, `_guardarBusca`, `guardarConsulta`.
- `src/propiedades.js` — import Sortable; `renderPropiedades` (sort + Sortable); `_doGuardarPropiedad` (orden); `_renderEditFotos` (sin flechas + Sortable); `subirFotos`/`quitarFoto`/`abrirMejoraFoto` (data-url + Sortable); quitar `_editMoverFoto`.
- `index.html` — nuevo `#modal-editar-busca` con pills prefijadas `eb-`; ajustar `#p-fotos-preview`/`#edit-fotos-grid` si hace falta para Sortable.

## Riesgos / consideraciones

- **Conflicto click vs drag** en grids con `onclick` (ficha, lightbox). Mitigar con umbral de arrastre de Sortable o flag de "hubo drag".
- **Parseo de `obs` viejo** es best-effort; si un token no matchea, cae en `nota` (no se pierde info).
- **Datos viejos sin `orden`**: el fallback por `fecha` evita que queden mezclados de forma rara.
- **Versión visible:** actualizar `<span class="version">` con fecha/hora Argentina al deployar (regla del proyecto).

## Fuera de alcance

- Reordenar consultas (solo propiedades).
- Reordenar propiedades con filtros activos.
- Migración de datos: las propiedades viejas no reciben `orden` retroactivo; se ordenan por `fecha` hasta que se las toque.
