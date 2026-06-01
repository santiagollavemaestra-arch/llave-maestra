# Edición con casillas, orden de propiedades y drag de fotos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editar "Qué busca" de una consulta con el mismo UI de casillas que al crearla; ordenar propiedades (nuevas arriba + reorden manual arrastrando); reordenar fotos arrastrando (subida y edición) en vez de flechitas.

**Architecture:** App vanilla ES6 + Vite, sin framework. El drag usa **SortableJS** (touch + mouse). Punto 1 toca `consultas.js` + `index.html` (nuevo modal). Puntos 2 y 3 tocan `propiedades.js` + `index.html`. No se rompe el modelo de datos: se agregan campos (`busca` en consultas, `orden` en propiedades) sin migrar datos viejos.

**Tech Stack:** JavaScript ES6, Vite 6, Firebase Realtime DB, SortableJS, Cloudinary.

**Nota sobre testing:** el proyecto no tiene framework de tests (deploy es push-a-main, UI mobile-first). La verificación de cada tarea es **manual en el navegador** con `npm run dev` (localhost:5173). No se inventan tests unitarios que no podrían correr; cada tarea lista los pasos exactos de verificación manual.

---

## File Structure

- `package.json` — agrega dependencia `sortablejs`.
- `src/propiedades.js` — import Sortable; sort + `orden` en `renderPropiedades` y `_doGuardarPropiedad`; drag en `.prop-grid`; drag de fotos en edición (`_renderEditFotos`, quita `_editMoverFoto`); drag de fotos en subida (`subirFotos`, import, `quitarFoto`); flag anti-click `_suppressClickUntil`.
- `src/consultas.js` — `_buildObs(prefix)` devuelve `{obs,busca}`; `guardarConsulta` guarda `busca`; nuevas `_parseObs`, `_fillBuscaForm`, `_guardarBusca`; reescribe `_editObs`; `_addExtraTag(prefix)`.
- `index.html` — nuevo modal `#modal-editar-busca` (pills con prefijo `eb-`); actualiza el botón `+` del modal de creación a `_addExtraTag('obs')`; bump de `<span class="version">`.

---

## Task 1: Instalar e importar SortableJS

**Files:**
- Modify: `package.json` (vía npm)
- Modify: `src/propiedades.js:1` (imports)

- [ ] **Step 1: Instalar la dependencia**

Run:
```bash
cd ~/llave-maestra && npm i sortablejs
```
Expected: `package.json` queda con `"sortablejs": "^1.x"` en `dependencies` y termina sin error.

- [ ] **Step 2: Importar Sortable en propiedades.js**

En `src/propiedades.js`, después de la última línea `import` existente (cerca de la línea 1-5), agregar:
```js
import Sortable from 'sortablejs';
```

- [ ] **Step 3: Agregar el flag anti-click compartido**

En `src/propiedades.js`, junto a las otras variables module-level (cerca de `let fotosSubidas = [], propDirCompleta = '', propCiudad = '';`, línea ~31), agregar:
```js
let _suppressClickUntil = 0;
let _propSortable = null, _editFotosSortable = null, _previewSortable = null;
```

- [ ] **Step 4: Verificar que el build no rompe**

Run:
```bash
cd ~/llave-maestra && npm run build
```
Expected: build OK, sin errores de resolución de `sortablejs`.

- [ ] **Step 5: Commit**

```bash
cd ~/llave-maestra && git add package.json package-lock.json src/propiedades.js && git commit -m "chore: agregar SortableJS + flags para drag-and-drop"
```

---

## Task 2: Orden de propiedades — nuevas arriba (campo `orden` + sort)

**Files:**
- Modify: `src/propiedades.js` — `_doGuardarPropiedad` (~665), `renderPropiedades` (~742)

- [ ] **Step 1: Asignar `orden` al crear una propiedad**

En `_doGuardarPropiedad`, justo antes del `push(agRef('propiedades'),{`, agregar el cálculo del orden:
```js
  const _claves=Object.values(st.propiedades).map(p=>p.orden??p.fecha??0);
  const _maxClave=_claves.length?Math.max(..._claves):0;
```
Y dentro del objeto que se pushea (junto a `estado:'Disponible', fecha:Date.now(),`), agregar:
```js
    orden:_maxClave+1,
```
(El `orden` vive en el mismo espacio numérico que `fecha` (timestamps), así la nueva queda por encima de todas.)

- [ ] **Step 2: Ordenar la lista por `orden` descendente**

En `renderPropiedades`, después de la línea `const arr=Object.entries(st.propiedades).map(([id,p])=>({...p,id}));` (~742), agregar:
```js
  arr.sort((a,b)=>((b.orden??b.fecha??0)-(a.orden??a.fecha??0)));
```

- [ ] **Step 3: Verificación manual**

Run:
```bash
cd ~/llave-maestra && npm run dev
```
En el navegador (localhost:5173), entrar a Propiedades. Cargar una propiedad nueva → debe aparecer **arriba de todo** en la grilla. Las propiedades viejas (sin `orden`) deben seguir ordenadas por fecha descendente debajo.

- [ ] **Step 4: Commit**

```bash
cd ~/llave-maestra && git add src/propiedades.js && git commit -m "feat: propiedades nuevas aparecen arriba (campo orden + sort)"
```

---

## Task 3: Orden de propiedades — reorden manual arrastrando

**Files:**
- Modify: `src/propiedades.js` — `renderPropiedades` (card markup ~774 + init Sortable al final ~795), `abrirFichaProp` (~804)

- [ ] **Step 1: Agregar `data-id` a cada card**

En `renderPropiedades`, cambiar la apertura de la card:
```js
    return '<div class="prop-ficha" onclick="window.abrirFichaProp(\''+p.id+'\')">'+
```
por:
```js
    return '<div class="prop-ficha" data-id="'+p.id+'" onclick="window.abrirFichaProp(\''+p.id+'\')">'+
```

- [ ] **Step 2: Inicializar Sortable sobre `.prop-grid` (solo sin filtros)**

En `renderPropiedades`, reemplazar la línea final `lista.innerHTML=html;` (~795) por:
```js
  lista.innerHTML=html;
  if(_propSortable){_propSortable.destroy();_propSortable=null;}
  const _sinFiltros=!q&&!fOp&&!fEst;
  const _grid=lista.querySelector('.prop-grid');
  if(_grid&&_sinFiltros){
    _propSortable=Sortable.create(_grid,{
      animation:150, delay:150, delayOnTouchOnly:true,
      onEnd:()=>{
        _suppressClickUntil=Date.now()+350;
        const cards=[..._grid.querySelectorAll('.prop-ficha')];
        const base=Date.now(), N=cards.length, updates={};
        cards.forEach((card,idx)=>{
          const id=card.dataset.id;
          const orden=base+(N-idx);
          updates[id+'/orden']=orden;
          if(st.propiedades[id]) st.propiedades[id].orden=orden;
        });
        update(agRef('propiedades'),updates);
      }
    });
  }
```
(Reordenar reasigna `orden` a TODAS las cards visibles. Como solo se permite sin filtros, son todas las propiedades → orden global consistente.)

- [ ] **Step 3: Evitar que el drag abra la ficha**

Al inicio de `window.abrirFichaProp = (id) => {` (~804), agregar como primera línea del cuerpo:
```js
  if(Date.now()<_suppressClickUntil) return;
```

- [ ] **Step 4: Verificación manual**

Con `npm run dev`: en Propiedades sin búsqueda ni filtros, mantener presionada una card y arrastrarla a otra posición → se reordena y el orden persiste al recargar (F5). Un tap corto sigue abriendo la ficha. Con un filtro activo (ej: Operación=Venta), el arrastre no debe reordenar.

- [ ] **Step 5: Commit**

```bash
cd ~/llave-maestra && git add src/propiedades.js && git commit -m "feat: reordenar propiedades arrastrando (SortableJS, persiste orden)"
```

---

## Task 4: Drag de fotos en edición de propiedad (reemplaza flechitas ◀▶)

**Files:**
- Modify: `src/propiedades.js` — `_renderEditFotos` (~1055), eliminar `_editMoverFoto` (~1083), `abrirLightbox` (~1185)

- [ ] **Step 1: Quitar los botones ◀▶ del render**

En `_renderEditFotos`, borrar estas dos líneas (las que generan los botones de mover, ~1072-1073):
```js
      (i>0?'<button onclick="window._editMoverFoto('+i+',-1)" ...>◀</button>':'')+
      (i<_editFotos.length-1?'<button onclick="window._editMoverFoto('+i+',1)" ...>▶</button>':'')+
```
(Borrar ambas expresiones completas; dejar el `'</div>';` de cierre del tile.)

- [ ] **Step 2: Inicializar Sortable al final de `_renderEditFotos`**

Al final de `_renderEditFotos`, después del `grid.innerHTML=_editFotos.map(...).join('');`, agregar:
```js
  if(_editFotosSortable){_editFotosSortable.destroy();_editFotosSortable=null;}
  _editFotosSortable=Sortable.create(grid,{
    animation:150, delay:150, delayOnTouchOnly:true,
    onEnd:(evt)=>{
      _suppressClickUntil=Date.now()+350;
      const {oldIndex,newIndex}=evt;
      if(oldIndex===newIndex) return;
      const moved=_editFotos.splice(oldIndex,1)[0];
      _editFotos.splice(newIndex,0,moved);
      _renderEditFotos();
    }
  });
```

- [ ] **Step 3: Eliminar la función `_editMoverFoto`**

Borrar el bloque completo (~1083-1088):
```js
window._editMoverFoto = (idx,dir) => {
  const ni=idx+dir;
  if(ni<0||ni>=_editFotos.length) return;
  const tmp=_editFotos[idx];_editFotos[idx]=_editFotos[ni];_editFotos[ni]=tmp;
  _renderEditFotos();
};
```

- [ ] **Step 4: Evitar que el drag abra el lightbox**

Al inicio de `window.abrirLightbox = (fotosOrId,idx) => {` (~1185), agregar como primera línea:
```js
  if(Date.now()<_suppressClickUntil) return;
```

- [ ] **Step 5: Verificación manual**

Con `npm run dev`: abrir una propiedad → Editar. En la grilla de fotos, ya no deben verse las flechitas ◀▶. Arrastrar una foto a otra posición → se reordena; la primera queda con el marco/⭐ de portada. Guardar y reabrir editar → el orden persiste. Un tap corto abre el lightbox.

- [ ] **Step 6: Commit**

```bash
cd ~/llave-maestra && git add src/propiedades.js && git commit -m "feat: reordenar fotos arrastrando al editar propiedad (saca flechitas)"
```

---

## Task 5: Drag de fotos al subir propiedad nueva (+ refactor `quitarFoto`)

**Files:**
- Modify: `src/propiedades.js` — `subirFotos` (~483), tiles del import (~352), `quitarFoto` (~518), nuevo helper `_ensurePreviewSortable`

- [ ] **Step 1: Crear helper que inicializa Sortable sobre `#p-fotos-preview`**

Agregar cerca de `quitarFoto` en `src/propiedades.js`:
```js
function _ensurePreviewSortable(){
  const preview=document.getElementById('p-fotos-preview');
  if(!preview||_previewSortable) return;
  _previewSortable=Sortable.create(preview,{
    animation:150, delay:150, delayOnTouchOnly:true,
    onEnd:()=>{
      _suppressClickUntil=Date.now()+350;
      const tiles=[...preview.querySelectorAll('[data-url]')];
      fotosSubidas=tiles.map(t=>t.dataset.url);
    }
  });
}
```

- [ ] **Step 2: Refactorizar `quitarFoto` para operar por URL**

Reemplazar (~518):
```js
window.quitarFoto = (idx,el) => {fotosSubidas.splice(idx,1);el.remove();};
```
por:
```js
window.quitarFoto = (el) => {
  const url=el?.dataset?.url;
  const i=fotosSubidas.indexOf(url);
  if(i!==-1) fotosSubidas.splice(i,1);
  if(el) el.remove();
};
```

- [ ] **Step 3: Tile de `subirFotos` con `data-url` y nueva firma de `quitarFoto`**

En `subirFotos`, dentro del `if(el){...}` (~506-512), reemplazar el bloque por:
```js
      if(el){
        el.className='foto-container';
        el.dataset.url=url;
        el.innerHTML='<img src="'+url+'" style="width:110px;height:110px;object-fit:cover;border-radius:8px;display:block">'+
          '<button onclick="window.quitarFoto(this.parentElement)" style="position:absolute;top:-4px;right:-4px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'+
          '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;bottom:0;left:0;right:0;background:rgba(99,22,163,.82);color:#fff;border:none;border-radius:0 0 8px 8px;font-size:9px;font-weight:700;padding:3px 2px;cursor:pointer;font-family:\'DM Sans\',sans-serif">✨ IA</button>';
      }
```
(Se quitó el `const idx=...` que ya no se usa.)

- [ ] **Step 4: Inicializar Sortable al final de `subirFotos`**

Al final de `subirFotos`, antes de `input.value='';`, agregar:
```js
  _ensurePreviewSortable();
```

- [ ] **Step 5: Tile del flujo de importación con `data-url` y nueva firma**

En `importarDesdePortal`, en el bloque que crea el `div` de foto (~352-359), reemplazar por:
```js
          const div=document.createElement('div');
          div.className='foto-container';
          div.style.cssText='position:relative;display:inline-block';
          div.dataset.url=uploadedUrl;
          div.innerHTML='<img src="'+uploadedUrl+'" style="width:110px;height:110px;object-fit:cover;border-radius:8px;display:block">'+
            '<button onclick="window.quitarFoto(this.parentElement)" style="position:absolute;top:-4px;right:-4px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer">&#x2715;</button>'+
            '<button onclick="window.abrirMejoraFoto(this.parentElement)" style="position:absolute;bottom:0;left:0;right:0;background:rgba(99,22,163,.82);color:#fff;border:none;border-radius:0 0 8px 8px;font-size:9px;font-weight:700;padding:3px 2px;cursor:pointer;font-family:\'DM Sans\',sans-serif">✨ IA</button>';
          preview.appendChild(div);
          _ensurePreviewSortable();
```

- [ ] **Step 6: Resetear `_previewSortable` al cerrar/cancelar el modal**

En `_doGuardarPropiedad` y en `_cancelarNuevaPropiedad`, donde se hace `document.getElementById('p-fotos-preview').innerHTML='';`, agregar inmediatamente después:
```js
  if(_previewSortable){_previewSortable.destroy();_previewSortable=null;}
```

- [ ] **Step 7: Verificación manual**

Con `npm run dev`: Nueva propiedad → subir 3-4 fotos. Arrastrar para reordenarlas. Borrar una con la ✕ (debe borrar la correcta, no otra). Guardar → en la ficha, las fotos quedan en el orden arrastrado y la primera es la portada. Probar también importando por link: las fotos importadas deben poder arrastrarse y la ✕ borrar la correcta.

- [ ] **Step 8: Commit**

```bash
cd ~/llave-maestra && git add src/propiedades.js && git commit -m "feat: reordenar fotos arrastrando al subir/importar propiedad + quitarFoto por URL"
```

---

## Task 6: `_buildObs(prefix)` + guardar `busca` estructurado al crear consulta

**Files:**
- Modify: `src/consultas.js` — `_buildObs` (~419), `guardarConsulta` (~455)

- [ ] **Step 1: Reescribir `_buildObs` para que tome prefijo y devuelva `{obs, busca}`**

Reemplazar la función `_buildObs` completa (~419-440) por:
```js
function _buildObs(prefix){
  prefix=prefix||'obs';
  const $=id=>document.getElementById(prefix+'-'+id);
  const selPill=cid=>document.querySelector('#'+prefix+'-'+cid+' .obs-pill.sel');
  const busca={op:'',tipo:'',tipoOtro:'',amb:'',zona:'',precio:'',moneda:'USD',extras:[],extrasCustom:[],nota:''};
  const parts=[];
  const opEl=selPill('op'); if(opEl){busca.op=opEl.dataset.v;parts.push(busca.op);}
  const tipoEl=selPill('tipo');
  if(tipoEl){busca.tipo=tipoEl.dataset.v;parts.push(busca.tipo);}
  else{const to=($('tipo-otro')?.value||'').trim();if(to){busca.tipoOtro=to;parts.push(to);}}
  const ambEl=selPill('amb'); if(ambEl){busca.amb=ambEl.dataset.v;parts.push(busca.amb+' amb.');}
  const zona=($('zona')?.value||'').trim(); if(zona){busca.zona=zona;parts.push('Zona '+zona);}
  const precioRaw=($('precio')?.value||'').replace(/\D/g,'');
  const mon=$('moneda')?.value||'USD'; busca.moneda=mon;
  if(precioRaw){busca.precio=precioRaw;parts.push('Hasta '+mon+' '+parseInt(precioRaw).toLocaleString('es-AR'));}
  const extras=[...document.querySelectorAll('#'+prefix+'-extras .obs-pill.sel')].map(el=>el.dataset.v);
  const extrasCustom=[...document.querySelectorAll('#'+prefix+'-extras-custom .am-chip-custom')].map(el=>el.dataset.v);
  busca.extras=extras; busca.extrasCustom=extrasCustom;
  const todosExtras=[...extras,...extrasCustom];
  if(todosExtras.length) parts.push('Con '+todosExtras.join(', '));
  const nota=($('extra-txt')?.value||'').trim(); if(nota){busca.nota=nota;parts.push(nota);}
  return {obs:parts.join(' · '), busca};
}
```

- [ ] **Step 2: Actualizar `guardarConsulta` para usar el nuevo `_buildObs` y guardar `busca`**

En `guardarConsulta` (~468-474), reemplazar el bloque `push(agRef('consultas'),{...})` por:
```js
  const {obs,busca}=_buildObs('obs');
  push(agRef('consultas'),{nombre,asignado,propiedad,
    tel:telInput,
    instagram:document.getElementById('c-instagram').value.trim(),
    canal:document.getElementById('c-canal').value,
    obs, busca,
    fecha:Date.now(),estado:'Activo',checks:{},checkTs:{},cargadoPor:st.usuarioActivo
  });
```

- [ ] **Step 3: Verificación manual**

Con `npm run dev`: crear una consulta nueva eligiendo operación, tipo, ambientes, zona, precio, extras y una nota. Guardar. En el detalle de la consulta, "Qué busca" debe mostrar el mismo string que antes (sin regresiones). Verificar en la consola/Firebase que el registro tenga ahora el objeto `busca`.

- [ ] **Step 4: Commit**

```bash
cd ~/llave-maestra && git add src/consultas.js && git commit -m "feat: guardar criterio estructurado (busca) al crear consulta"
```

---

## Task 7: Modal `#modal-editar-busca` + `_addExtraTag(prefix)`

**Files:**
- Modify: `index.html` — nuevo modal después de `#modal-consulta` (~241), botón `+` del modal de creación (~230)
- Modify: `src/consultas.js` — `_addExtraTag` (~402)

- [ ] **Step 1: Parametrizar `_addExtraTag` con prefijo**

Reemplazar `window._addExtraTag` (~402-415) por:
```js
window._addExtraTag = (prefix) => {
  prefix=prefix||'obs';
  const inp = document.getElementById(prefix+'-extra-new');
  if(!inp) return;
  const v = inp.value.trim();
  if(!v) return;
  const cont = document.getElementById(prefix+'-extras-custom');
  if(!cont) return;
  const tag = document.createElement('span');
  tag.className = 'am-chip-custom';
  tag.dataset.v = v;
  tag.innerHTML = v + '<button type="button" onclick="window._delExtraTag(this.parentElement)">×</button>';
  cont.appendChild(tag);
  inp.value = '';
};
```

- [ ] **Step 2: Actualizar el botón `+` y el input del modal de creación**

En `index.html`, en el modal `#modal-consulta` (~229-230), cambiar:
```html
        <input class="form-input" id="obs-extra-new" placeholder="Otro extra..." type="text" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();window._addExtraTag();}">
        <button type="button" onclick="window._addExtraTag()" ...>+</button>
```
por (agregando el argumento `'obs'`):
```html
        <input class="form-input" id="obs-extra-new" placeholder="Otro extra..." type="text" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();window._addExtraTag('obs');}">
        <button type="button" onclick="window._addExtraTag('obs')" style="padding:8px 14px;background:var(--black);color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif">+</button>
```

- [ ] **Step 3: Agregar el modal `#modal-editar-busca`**

En `index.html`, inmediatamente después del cierre del `#modal-consulta` (después de la línea 241 `</div>` que cierra `modal-overlay`), insertar:
```html
<div class="modal-overlay" id="modal-editar-busca">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title">Editar qué busca</div>
    <input type="hidden" id="eb-id">
    <div class="form-group">
      <span class="obs-lbl" style="margin-top:0">Operación</span>
      <div class="obs-pills" id="eb-op">
        <span class="obs-pill" data-v="Venta" onclick="window._togglePill(this,false)">Venta</span>
        <span class="obs-pill" data-v="Alquiler" onclick="window._togglePill(this,false)">Alquiler</span>
        <span class="obs-pill" data-v="Alq. temporal" onclick="window._togglePill(this,false)">Alq. temporal</span>
      </div>
      <span class="obs-lbl">Tipo</span>
      <div class="obs-pills" id="eb-tipo">
        <span class="obs-pill" data-v="Departamento" onclick="window._togglePill(this,false)">Depto</span>
        <span class="obs-pill" data-v="Casa" onclick="window._togglePill(this,false)">Casa</span>
        <span class="obs-pill" data-v="PH" onclick="window._togglePill(this,false)">PH</span>
        <span class="obs-pill" data-v="Local" onclick="window._togglePill(this,false)">Local</span>
        <span class="obs-pill" data-v="Oficina" onclick="window._togglePill(this,false)">Oficina</span>
        <span class="obs-pill" data-v="Terreno" onclick="window._togglePill(this,false)">Terreno</span>
      </div>
      <input class="form-input" id="eb-tipo-otro" placeholder="Otro tipo..." type="text" style="margin-top:6px">
      <span class="obs-lbl">Ambientes</span>
      <div class="obs-pills" id="eb-amb">
        <span class="obs-pill" data-v="1" onclick="window._togglePill(this,false)">1</span>
        <span class="obs-pill" data-v="2" onclick="window._togglePill(this,false)">2</span>
        <span class="obs-pill" data-v="3" onclick="window._togglePill(this,false)">3</span>
        <span class="obs-pill" data-v="4" onclick="window._togglePill(this,false)">4</span>
        <span class="obs-pill" data-v="4+" onclick="window._togglePill(this,false)">4+</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <div style="flex:1">
          <span class="obs-lbl" style="margin-top:0">Zona / Barrio</span>
          <input class="form-input" id="eb-zona" placeholder="Güemes, Centro..." type="text">
        </div>
        <div style="flex:1">
          <span class="obs-lbl" style="margin-top:0">Precio máximo</span>
          <div style="display:flex;gap:4px">
            <select class="form-select" id="eb-moneda" style="width:68px;flex-shrink:0"><option>USD</option><option>ARS</option></select>
            <input class="form-input" id="eb-precio" placeholder="80.000" type="text">
          </div>
        </div>
      </div>
      <span class="obs-lbl">Extras</span>
      <div class="obs-pills" id="eb-extras">
        <span class="obs-pill" data-v="balcón" onclick="window._togglePill(this,true)">Balcón</span>
        <span class="obs-pill" data-v="cochera" onclick="window._togglePill(this,true)">Cochera</span>
        <span class="obs-pill" data-v="pileta" onclick="window._togglePill(this,true)">Pileta</span>
        <span class="obs-pill" data-v="patio" onclick="window._togglePill(this,true)">Patio</span>
        <span class="obs-pill" data-v="ascensor" onclick="window._togglePill(this,true)">Ascensor</span>
        <span class="obs-pill" data-v="vista al mar" onclick="window._togglePill(this,true)">Vista al mar</span>
        <span class="obs-pill" data-v="amoblado" onclick="window._togglePill(this,true)">Amoblado</span>
        <span class="obs-pill" data-v="luminoso" onclick="window._togglePill(this,true)">Luminoso</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <input class="form-input" id="eb-extra-new" placeholder="Otro extra..." type="text" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();window._addExtraTag('eb');}">
        <button type="button" onclick="window._addExtraTag('eb')" style="padding:8px 14px;background:var(--black);color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif">+</button>
      </div>
      <div id="eb-extras-custom" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"></div>
      <span class="obs-lbl">Notas adicionales</span>
      <textarea class="form-textarea" id="eb-extra-txt" placeholder="Cualquier detalle extra..." style="min-height:56px"></textarea>
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="cerrarModal('modal-editar-busca')">Cancelar</button>
      <button class="btn-primary" onclick="window._guardarBusca()">Guardar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Verificación manual**

Con `npm run dev`: crear una consulta y agregar un extra custom con el botón `+` (debe seguir funcionando igual que antes). El nuevo modal todavía no se abre desde ningún lado (se conecta en Task 8); por ahora solo verificar que la app carga sin errores en consola.

- [ ] **Step 5: Commit**

```bash
cd ~/llave-maestra && git add index.html src/consultas.js && git commit -m "feat: modal editar-busca (pills eb-) + _addExtraTag parametrizado"
```

---

## Task 8: `_parseObs`, `_fillBuscaForm`, `_editObs`, `_guardarBusca`

**Files:**
- Modify: `src/consultas.js` — reescribe `_editObs` (~329), agrega `_parseObs`, `_fillBuscaForm`, `_guardarBusca`

- [ ] **Step 1: Agregar `_parseObs` (parseo best-effort de string viejo)**

Agregar en `src/consultas.js` (cerca de `_buildObs`):
```js
function _parseObs(str){
  const busca={op:'',tipo:'',tipoOtro:'',amb:'',zona:'',precio:'',moneda:'USD',extras:[],extrasCustom:[],nota:''};
  if(!str) return busca;
  const OPS=['Venta','Alquiler','Alq. temporal'];
  const TIPOS=['Departamento','Casa','PH','Local','Oficina','Terreno'];
  const EXTRAS=['balcón','cochera','pileta','patio','ascensor','vista al mar','amoblado','luminoso'];
  const notas=[];
  str.split(' · ').forEach(tok=>{
    tok=tok.trim(); if(!tok) return;
    if(OPS.includes(tok)){busca.op=tok;return;}
    if(TIPOS.includes(tok)){busca.tipo=tok;return;}
    const mAmb=tok.match(/^(\d\+?|\d)\s*amb\.?$/i);
    if(mAmb){busca.amb=mAmb[1];return;}
    if(/^Zona\s+/i.test(tok)){busca.zona=tok.replace(/^Zona\s+/i,'').trim();return;}
    const mPre=tok.match(/^Hasta\s+(USD|ARS)\s+([\d.,]+)$/i);
    if(mPre){busca.moneda=mPre[1].toUpperCase();busca.precio=mPre[2].replace(/\D/g,'');return;}
    if(/^Con\s+/i.test(tok)){
      tok.replace(/^Con\s+/i,'').split(',').map(s=>s.trim()).filter(Boolean).forEach(x=>{
        if(EXTRAS.includes(x)) busca.extras.push(x); else busca.extrasCustom.push(x);
      });
      return;
    }
    notas.push(tok);
  });
  // token de tipo no reconocido (ej "Loft"): si no hubo tipo, el primer nota libre suele ser tipoOtro
  busca.nota=notas.join(' · ');
  return busca;
}
```

- [ ] **Step 2: Agregar `_fillBuscaForm` (precarga las pills del modal)**

Agregar en `src/consultas.js`:
```js
function _fillBuscaForm(prefix,busca){
  busca=busca||{};
  const $=id=>document.getElementById(prefix+'-'+id);
  // limpiar
  ['op','tipo','amb','extras'].forEach(c=>{
    document.querySelectorAll('#'+prefix+'-'+c+' .obs-pill').forEach(p=>p.classList.remove('sel'));
  });
  ['tipo-otro','zona','precio','extra-txt','extra-new'].forEach(id=>{const e=$(id);if(e)e.value='';});
  const mon=$('moneda'); if(mon) mon.value=busca.moneda||'USD';
  const custom=$('extras-custom'); if(custom) custom.innerHTML='';
  // seleccionar pills por data-v
  const pick=(c,v)=>{if(!v)return;const el=document.querySelector('#'+prefix+'-'+c+' .obs-pill[data-v="'+v+'"]');if(el)el.classList.add('sel');};
  pick('op',busca.op);
  pick('tipo',busca.tipo);
  pick('amb',busca.amb);
  (busca.extras||[]).forEach(v=>pick('extras',v));
  if($('tipo-otro')) $('tipo-otro').value=busca.tipoOtro||'';
  if($('zona')) $('zona').value=busca.zona||'';
  if($('precio')) $('precio').value=busca.precio?parseInt(busca.precio).toLocaleString('es-AR'):'';
  if($('extra-txt')) $('extra-txt').value=busca.nota||'';
  // extras custom como chips
  if(custom){
    (busca.extrasCustom||[]).forEach(v=>{
      const tag=document.createElement('span');
      tag.className='am-chip-custom'; tag.dataset.v=v;
      tag.innerHTML=v+'<button type="button" onclick="window._delExtraTag(this.parentElement)">×</button>';
      custom.appendChild(tag);
    });
  }
}
```

- [ ] **Step 3: Reescribir `_editObs` para abrir el modal de casillas**

Reemplazar `window._editObs` completo (~329-335) por:
```js
window._editObs = (id) => {
  const c=st.consultas[id];
  if(!c) return;
  const busca=c.busca||_parseObs(c.obs||'');
  document.getElementById('eb-id').value=id;
  _fillBuscaForm('eb',busca);
  document.getElementById('modal-editar-busca').classList.add('open');
};
```

- [ ] **Step 4: Agregar `_guardarBusca`**

Agregar en `src/consultas.js`:
```js
window._guardarBusca = () => {
  const id=document.getElementById('eb-id').value;
  if(!id||!st.consultas[id]) return;
  const {obs,busca}=_buildObs('eb');
  st.consultas[id].obs=obs; st.consultas[id].busca=busca;
  update(agRef('consultas',id),{obs,busca});
  cerrarModal('modal-editar-busca');
  window._abrirDetalle(id);
};
```

- [ ] **Step 5: Verificación manual — consulta nueva (con `busca`)**

Con `npm run dev`: crear una consulta con varios criterios. Abrir su detalle → lápiz de "Qué busca" → debe abrir el modal con TODAS las casillas precargadas exactamente como se cargaron. Cambiar algo, Guardar → el detalle refleja el cambio y persiste al recargar.

- [ ] **Step 6: Verificación manual — consulta vieja (solo string `obs`)**

Abrir una consulta vieja (sin `busca`) cuyo "Qué busca" tenga formato tipo `"Venta · Departamento · 3 amb. · Zona Centro · Hasta USD 100.000 · Con cochera, parrilla · texto libre"`. El lápiz debe abrir el modal con op/tipo/amb/zona/precio/extras conocidos precargados y el resto (`parrilla`, texto libre) en custom/nota. Guardar → se normaliza y queda con `busca`.

- [ ] **Step 7: Commit**

```bash
cd ~/llave-maestra && git add src/consultas.js && git commit -m "feat: editar Qué busca con casillas (parse de datos viejos + guardado estructurado)"
```

---

## Task 9: Bump de versión + QA final + build

**Files:**
- Modify: `index.html:79` (`<span class="version">`)

- [ ] **Step 1: Actualizar la versión visible**

En `index.html:79`, cambiar `<span class="version">v29/05 15:28</span>` por la fecha/hora actual de Argentina (UTC-3) en formato `vDD/MM HH:MM`. Obtener la hora:
```bash
TZ=America/Argentina/Buenos_Aires date "+v%d/%m %H:%M"
```
Usar ese string exacto.

- [ ] **Step 2: QA final integral**

Run: `cd ~/llave-maestra && npm run dev`. Verificar de corrido:
1. Propiedad nueva aparece arriba.
2. Reorden de propiedades arrastrando (sin filtros) persiste tras F5; con filtro no reordena; tap abre ficha.
3. Editar propiedad: fotos sin flechitas, se arrastran, portada = primera, persiste.
4. Subir/importar propiedad: fotos se arrastran, ✕ borra la correcta, orden se guarda.
5. Consulta nueva: "Qué busca" con `busca` guardado; editar reabre casillas fieles.
6. Consulta vieja: editar parsea y precarga casillas.
7. Consola del navegador sin errores.

- [ ] **Step 3: Build de producción**

Run:
```bash
cd ~/llave-maestra && npm run build
```
Expected: build OK sin errores.

- [ ] **Step 4: Commit**

```bash
cd ~/llave-maestra && git add index.html && git commit -m "chore: bump versión visible + QA features edición/orden/drag"
```

- [ ] **Step 5: Deploy (solo si el usuario lo pide)**

El deploy es push a `main` → Vercel automático. No hacer push sin que el usuario lo pida explícitamente.

---

## Self-Review (completado por el autor del plan)

- **Cobertura del spec:** Punto 1 → Tasks 6,7,8. Punto 2 (nuevas arriba) → Task 2; (reorden manual) → Task 3. Punto 3 (editar) → Task 4; (subir/importar) → Task 5. SortableJS → Task 1. Versión → Task 9. ✅
- **Consistencia de tipos/nombres:** `_buildObs(prefix)` devuelve `{obs,busca}` y se consume así en `guardarConsulta` (Task 6) y `_guardarBusca` (Task 8). `busca` tiene las mismas claves en `_buildObs`, `_parseObs` y `_fillBuscaForm`. `quitarFoto(el)` (nueva firma) se usa en los tiles de `subirFotos` (Task 5 Step 3) e import (Step 5). Flags `_suppressClickUntil`, `_propSortable`, `_editFotosSortable`, `_previewSortable` declarados en Task 1. ✅
- **Sin placeholders:** todos los pasos tienen código real. ✅
- **Orden numérico de `orden` vs `fecha`:** resuelto usando `orden` en espacio de timestamps (`maxClave+1` y `base=Date.now()` en reorden). ✅
