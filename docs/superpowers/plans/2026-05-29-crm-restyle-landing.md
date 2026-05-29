# CRM Restyle → Landing Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el CRM adopte el lenguaje visual de la landing (copper sobre cream, hero login, botones con glow/shimmer, toasts) sin tocar lógica ni datos.

**Architecture:** Restyle 100% cosmético. El motor de color por agencia (`--brand`) se conserva; solo cambia su valor por defecto a copper, lo que propaga el acento a tabs/pills/chips/botones/foco automáticamente. El resto son estilos a medida (login hero, glow/shimmer, calidez de cards) y un componente toast nuevo que reemplaza los `alert()`.

**Tech Stack:** Vanilla ES6 + Vite, CSS custom properties, DM Sans. Sin framework de tests → verificación = `npm run build` sin errores + chequeo visual.

**Verificación por tarea:** `cd ~/llave-maestra && npm run build` debe terminar en `✓ built` sin errores. Commits frecuentes (sin push — el push lo decide el usuario).

---

### Task 1: Tokens copper + fondo cream + fallbacks de marca

**Files:**
- Modify: `src/style.css` (`:root`, `body`)
- Modify: `src/main.js` (fallbacks de `--brand`)

- [ ] **Step 1:** En `src/style.css` `:root`, cambiar `--brand: #1C1917;` → `--brand: #C47A2E;` y `--brand-ring: rgba(28,25,23,0.12);` → `--brand-ring: rgba(196,122,46,0.18);`
- [ ] **Step 2:** Agregar tras la línea `--brand-ring`: `--copper:#C47A2E; --copper-light:#D4943E; --copper-dark:#A86424; --gold:#D4A843; --cream:#FAF8F5;`
- [ ] **Step 3:** En `body`, `background:var(--stone-50);` → `background:var(--cream);`
- [ ] **Step 4:** En `src/main.js`, `aplicarBrand`: fallback `|| '#0a0a0a'` → `|| '#C47A2E'`.
- [ ] **Step 5:** En `src/main.js` logout: `setProperty('--brand', '#0a0a0a')` → `'#C47A2E'`; `'--brand-ring','rgba(10,10,10,0.12)'` → `'rgba(196,122,46,0.18)'`.
- [ ] **Step 6:** `npm run build` → `✓ built`. Commit: `style: copper como marca por defecto + fondo cream`.

### Task 2: Login → hero fotográfico copper

**Files:** Modify `src/style.css` (`.user-screen`, `.email-btn`)

- [ ] **Step 1:** `.user-screen` background dark sólido → foto de casa + overlay cálido. Añadir `background-image` (Unsplash, misma familia que `.loading`), `background-size:cover`, pseudo `::before` con `linear-gradient(rgba(16,12,8,.82),rgba(16,12,8,.7))` y `animation:slowZoom 20s ease-in-out infinite alternate` en una capa de fondo. Agregar `@keyframes slowZoom{from{transform:scale(1)}to{transform:scale(1.06)}}`. Los hijos (`.user-title`, inputs) con `position:relative;z-index:1`.
- [ ] **Step 2:** `.email-btn` background `#fff` → `var(--brand)`, color `#fff`, agregar `box-shadow:0 4px 24px rgba(196,122,46,.4)`.
- [ ] **Step 3:** `npm run build` → `✓ built`. Commit: `style: login con hero fotográfico y botón copper`.

### Task 3: Botones primarios con glow + shimmer

**Files:** Modify `src/style.css` (`.btn-nueva`, `.btn-primary`)

- [ ] **Step 1:** `.btn-nueva`: agregar `position:relative;overflow:hidden;box-shadow:0 4px 20px rgba(196,122,46,.35)` y `::after` shimmer: `content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent);transform:skewX(-15deg);animation:shimmerSweep 3.5s 1s infinite`. Agregar `@keyframes shimmerSweep{0%{left:-100%}60%{left:150%}100%{left:150%}}`.
- [ ] **Step 2:** `.btn-primary`: agregar `box-shadow:0 4px 16px rgba(196,122,46,.3)`.
- [ ] **Step 3:** `npm run build` → `✓ built`. Commit: `style: glow y shimmer copper en botones primarios`.

### Task 4: Calidez en cards/modales + header/stats + theme-color

**Files:** Modify `src/style.css` (`.cons-card`, `.modal`, `.header`), `index.html` (meta theme-color)

- [ ] **Step 1:** `.cons-card:hover`: agregar `border-color:rgba(196,122,46,.35)`.
- [ ] **Step 2:** `.header`: `border-bottom:1px solid rgba(196,122,46,.14)` → `.22)` (refuerzo copper).
- [ ] **Step 3:** `index.html`: meta `theme-color` `#0a0a0a` → `#100C08`.
- [ ] **Step 4:** `npm run build` → `✓ built`. Commit: `style: calidez copper en cards, header y theme-color`.

### Task 5: Componente toast + reemplazo de los 9 alert()

**Files:** Modify `index.html` (contenedor toast), `src/style.css` (estilos toast), `src/main.js` (helper `window.toast`), y los 9 call sites.

- [ ] **Step 1:** En `index.html` antes de `</body>`, agregar `<div id="toast-wrap" style="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9998;display:flex;flex-direction:column;gap:8px;pointer-events:none"></div>`.
- [ ] **Step 2:** En `src/style.css` agregar `.toast{background:var(--stone-900);color:#fff;border:1px solid rgba(196,122,46,.4);border-radius:12px;padding:12px 18px;font-size:14px;font-weight:600;box-shadow:var(--shadow-lg);animation:toastIn .3s cubic-bezier(.16,1,.3,1);max-width:90vw}` `.toast.err{border-color:rgba(153,27,27,.5)}` `@keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`.
- [ ] **Step 3:** En `src/main.js` agregar helper:
```js
window.toast = (msg, tipo) => {
  const wrap = document.getElementById('toast-wrap');
  if(!wrap){ alert(msg); return; }
  const t = document.createElement('div');
  t.className = 'toast' + (tipo==='err'?' err':'');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity .3s'; t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2600);
};
```
- [ ] **Step 4:** Reemplazar los `alert(...)` por `window.toast(..., 'err')` en validaciones/errores y `window.toast(...)` en éxitos. Call sites: `visitas.js:62`, `propietarios.js:32`, `admin.js:233`, `consultas.js:370`, `consultas.js:457`, `propiedades.js:82`, `propiedades.js:628`, `propiedades.js:640`, `auth.js:81` (éxito → toast normal).
- [ ] **Step 5:** `grep -rn "alert(" src/` → vacío. `npm run build` → `✓ built`. Commit: `feat: toasts copper en reemplazo de alert() nativos`.

### Task 6: Verificación final

- [ ] **Step 1:** `npm run build` → `✓ built` sin errores.
- [ ] **Step 2:** `grep -n "0a0a0a" src/main.js` → vacío (fallbacks migrados).
- [ ] **Step 3:** Levantar `npm run dev` y revisar visualmente: login (hero), lista consultas (cards/pills copper), un modal, stats bar, y disparar un toast (ej. guardar sin nombre).
- [ ] **Step 4:** Reportar resultado al usuario; el push/deploy lo decide el usuario.

## Self-Review

- **Cobertura spec:** tokens (T1), login hero (T2), botones glow/shimmer (T3), cards/modales/header/theme-color (T4), toasts+alerts (T5), verificación (T6). Tabs/pills/chips/foco copper → automáticos vía `--brand` (T1), verificados en T6. ✓
- **Placeholders:** ninguno; código real en cada step. ✓
- **Consistencia:** `window.toast(msg, tipo)` con `tipo==='err'` usado igual en helper (T5.3) y call sites (T5.4). ✓
- **Fuera de alcance confirmado:** hallazgos #1 (key Gemini), #4 (prompt duplicado), #5 (catch vacíos) NO se tocan.
