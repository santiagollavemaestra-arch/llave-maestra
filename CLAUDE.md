# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Producto

**Keynet CRM** — CRM inmobiliario SaaS B2B para Argentina (~30 USD/mes, compite con Tokko Broker). En producción para Llave Maestra (Mar del Plata). Diferencial: IA integrada con Gemini 2.5 Flash.

## Comandos

```bash
npm run dev      # servidor local en localhost:5173
npm run build    # build de producción en dist/

# Deploy: push a main → Vercel automático vía GitHub
git add src/... index.html && git commit -m "mensaje" && git push

# Firebase Functions (una función específica)
cd functions && firebase deploy --only functions:nombreFuncion

# Firebase Security Rules
firebase deploy --only database
```

## Arquitectura multi-tenant

### Roles de usuario

| Rol | Acceso |
|---|---|
| `keynet-admin` | Panel `/admin` — gestiona todas las agencias. Al hacer "Ver CRM" de una agencia, `st.usuarioRol` se setea a `'admin'` temporalmente para tener permisos dentro de esa agencia. |
| `admin` | CRM de su agencia con permisos completos (puede eliminar). |
| `agente` | CRM de su agencia sin permisos de eliminación. |

El nodo `/usuarios/{uid}` contiene `{ username, nombre, rol, agenciaId }`.

### Namespacing en Firebase

```
/agencias/{agenciaId}/consultas|propiedades|propietarios|visitas|emails
/keynet/agencias/{agenciaId}   ← metadata (nombre, plan, colorPrimario, activa, adminEmail)
/usuarios/{uid}                ← global, sin namespace
```

`agRef(col)` en `firebase.js` construye paths dinámicamente con `st.agenciaId`. Las Security Rules aíslan cada agencia: un usuario solo puede leer/escribir su propio `$agenciaId`.

### Flujo de autenticación

```
onAuthStateChanged
  → lee /usuarios/{uid} → setea st.usuarioActivo, st.usuarioRol, st.agenciaId
  → si keynet-admin && en /admin:
      si sessionStorage 'keynetViewAs' → startCRM(agenciaId, nombre)
      sino → initAdmin(startCRM)  [carga admin.js lazy]
  → sino → aplicarBrand(st.agenciaId) → startListeners()
```

`startCRM(agenciaId, nombre)` persiste en `sessionStorage` para sobrevivir refreshes, llama `stopListeners()` + `startListeners()` con el nuevo contexto.

### Módulos `src/`

| Archivo | Responsabilidad |
|---|---|
| `state.js` | Constantes (`EQUIPO`, `NOMBRES`, `COLORES`, `CHECKS`, `AMENITY_INFO`) + objeto `st` mutable compartido |
| `firebase.js` | Init Firebase App/Auth/DB/Functions; `agRef(col)` helper |
| `icons.js` | SVGs Lucide-style como strings (`IC.key`, `IC.logout`, `IC.edit`, etc.) |
| `auth.js` | `initAuth`, `mostrarPerfil`, `enviarMail`, `enviarNotifPush`, `pedirNotif` |
| `main.js` | Entry point: listeners, `startCRM`, `startListeners`, `stopListeners`, `aplicarBrand`, navegación |
| `admin.js` | Panel keynet-admin: wizard de alta de agencia, edit/delete (carga lazy) |
| `consultas.js` | Sección consultas: render, detalle, matching IA, CRUD |
| `propiedades.js` | Sección propiedades: render, importación desde portal, Cloudinary, matching inverso |
| `propietarios.js` | Sección propietarios |
| `visitas.js` | Sección visitas |
| `style.css` | Design system completo |

### Firebase Functions (`functions/index.js`)

Todas usan `onCall` + validan `rol === 'keynet-admin'` server-side:

- `geminiProxy` — proxy de Gemini API (oculta la key; requiere secret `GEMINI_KEY`)
- `crearAgencia` — crea Firebase Auth user + escribe en `/usuarios`, `/keynet/agencias`, `/agencias/{id}/emails`
- `editarAgencia` — actualiza nombre/plan/activa/colorPrimario
- `borrarAgencia` — elimina el registro de `/keynet/agencias` (datos de la agencia quedan intactos)

### Sistema de branding

`aplicarBrand(agenciaId)` en `main.js`:
1. Lee `colorPrimario` de `/keynet/agencias/{agenciaId}`
2. Setea `--brand` y `--brand-ring` como CSS custom properties en `:root`
3. Todos los elementos interactivos usan `var(--brand)`; se resetea a `#1C1917` en logout

### Estado compartido (`st`)

```js
st.consultas / st.propiedades / st.propietarios / st.visitas / st.emails
st.seccion / st.subTab / st.filtroEstado
st.usuarioActivo   // username: 'santiago', 'mariana', etc.
st.usuarioRol      // 'keynet-admin' | 'admin' | 'agente'
st.agenciaId       // slug: 'llave-maestra', etc.
st.matchCache      // cache matching IA; se limpia cuando cambia st.propiedades
```

### Funciones `window.*`

Todas las funciones llamadas desde `onclick`/`onchange` en HTML deben asignarse a `window.*`.

## Reglas técnicas críticas

1. **API keys en arrays** — `['parte1','parte2'].join('')`. Nunca una key entera en string.
2. **Sin template literals con saltos de línea literales** — Safari bug. Usar concatenación.
3. **Sin backticks anidados** dentro de template literals.
4. **IA solo bajo demanda** — nunca automática al cargar; siempre detrás de botón explícito.
5. **`overscroll-behavior-x:none`** en `html` y `body` — evita swipe-back en iOS.
6. **Fotos en miniaturas 68×68px** en listas; tamaño completo solo en lightbox.
7. **Gemini siempre vía Firebase Function** `geminiProxy` — nunca fetch directo al cliente.
8. **Sin React/Vue/Svelte** — módulos ES6 vanilla con Vite como bundler.

## Servicios externos

- **Firebase Realtime DB** — `llave-maestra-default-rtdb.firebaseio.com`
- **Firebase Auth** — email/password
- **Firebase Functions** — región `us-central1`; secret `GEMINI_KEY` en Secret Manager
- **Cloudinary** — cloud `dgaixfvxa`, preset `keynet_props` (unsigned upload)
- **EmailJS** — service `service_iorm3vh`, template `template_lqgp3ki`
- **Google Maps Places** — cargado dinámicamente al final de `main.js`
- **Vercel** — hosting con SPA rewrite (`vercel.json`: `/(.*) → /index.html`)

## Archivos raíz adicionales

- `landing.html` — Landing page standalone (vanilla HTML/CSS/JS, sin build). No depende del CRM.
- `database.rules.json` — Firebase Security Rules; deploy con `firebase deploy --only database`
- `landing-v0/` — proyecto Next.js de referencia, no se usa en producción

## Design System

- **Font**: DM Sans único, pesos 400/500/600/700/800. Sin fuentes serif en ningún componente.
- **Paleta CRM**: warm stone (`--stone-50` → `--stone-900`) + `--brand` configurable por agencia
- **Paleta landing**: copper `#C47A2E` + warm cream `#FAF8F5` + dark `#100C08`
- **Stats bar**: fondo oscuro con números blancos — no usar tarjetas blancas para esta sección
- **Iconos**: SVGs Lucide-style en `src/icons.js`; sin emojis como iconos estructurales
