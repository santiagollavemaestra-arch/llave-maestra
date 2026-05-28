# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ¿Qué es esto?
CRM inmobiliario **Keynet** para uso interno de **Llave Maestra** (Mar del Plata, Argentina), con visión de comercializarlo como SaaS B2B (~30 USD/mes) a otras inmobiliarias pyme, compitiendo con Tokko Broker. Diferencial: IA integrada (Gemini 2.5 Flash).

## Comandos

```bash
npm run dev      # servidor local en localhost:5173
npm run build    # build de producción en dist/
git add -p && git commit -m "mensaje" && git push  # deploy
```

GitHub Actions corre `npm run build` y publica `dist/` en GitHub Pages automáticamente al hacer push a `main`. Actualizar `<span class="version">vDD/MM HH:MM</span>` en `index.html` (hora Argentina, UTC-3) antes de cada commit.

## Arquitectura

### Estructura de módulos (`src/`)

| Archivo | Responsabilidad |
|---|---|
| `state.js` | Constantes (`EQUIPO`, `NOMBRES`, `COLORES`, `CHECKS`, `AMENITY_INFO`, etc.) + objeto `st` con estado compartido |
| `firebase.js` | Inicialización de Firebase App, Auth y DB; refs (`cRef`, `pRef`, etc.); re-exports de CRUD y Auth |
| `gemini.js` | `geminiCall(prompt, opts)` — wrapper con retry x3 en 503 |
| `utils.js` | Helpers puros: `diasDesde`, `ultimoCheck`, `countdownInfo`, `sigRotacion`, `_amLabel`, `_propLabel` |
| `auth.js` | Firebase Auth: `initAuth(onLogin, onLogout)`, `loginSubmit`, `_cerrarSesion`, `_cambiarPassword`, `enviarMail` |
| `consultas.js` | Sección consultas completa: renders, detalle, matching IA, CRUD, nueva consulta |
| `propiedades.js` | Sección propiedades: renders, importación desde portal, Cloudinary, matching inverso, lightbox |
| `propietarios.js` | Sección propietarios: render y CRUD |
| `visitas.js` | Sección visitas: render y CRUD |
| `main.js` | Entry point: `initAuth` → `startListeners()` → Firebase `onValue()` listeners + navegación |
| `style.css` | Todo el CSS |

`index.html` contiene solo el markup HTML (modales, tabs, estructura). Sin CSS ni JS inline.

### Estado compartido

El objeto `st` exportado desde `state.js` es el único estado mutable compartido entre módulos:

```js
st.consultas / st.propiedades / st.propietarios / st.visitas / st.emails
st.seccion / st.subTab / st.filtroEstado
st.usuarioActivo   // username string: 'santiago', 'mariana', etc.
st.usuarioRol      // 'admin' | 'agente'
st.matchCache      // cache de matching IA; se limpia cuando cambia st.propiedades
```

Variables de estado locales a su módulo (no en `st`): `fotosSubidas`, `propDirCompleta`, `lbFotos`, `_editFotos`, `_alarmasExpanded`, `autocomplete`.

### Flujo de autenticación

`onAuthStateChanged` → lee `/usuarios/{uid}` en Firebase DB → setea `st.usuarioActivo` y `st.usuarioRol` → llama `startListeners()`. Los `onValue()` arrancan **solo después del login**; no se llaman en cold-start sin sesión.

### Flujo de datos

Firebase `onValue()` listeners en `main.js` → actualizan `st.*` → llaman `render*()` de la sección activa. Cambios de escritura: `push/update/remove` en el módulo correspondiente → Firebase replica → listener re-renderiza automáticamente.

### Funciones `window.*`

Todas las funciones llamadas desde `onclick`/`onchange` en el HTML deben asignarse a `window.nombre`. Las funciones internas de módulo no necesitan `window.`.

## Reglas técnicas críticas

1. **API keys en arrays** — `['parte1','parte2'].join('')` en todo el código. Nunca una key entera en un string.
2. **Sin template literals con saltos de línea** — Safari los rompe. Usar concatenación de strings en HTML generado.
3. **Sin backticks anidados** dentro de template literals.
4. **IA solo bajo demanda** — nunca al cargar; siempre detrás de un botón explícito.
5. **`overscroll-behavior-x:none`** en `html` y `body` — evita swipe-back en iOS.
6. **Fotos en miniaturas** — 68×68px en listas; nunca tamaño completo en grillas.
7. **Gemini siempre por `geminiCall()`** — nunca `fetch` directo a la API.
8. **Header sin `position:relative` inline** — `.header` ya tiene `position:sticky; top:0` en CSS.

## Servicios externos

- **Firebase Realtime DB** — `llave-maestra-default-rtdb.firebaseio.com`; reglas: `auth != null`
- **Firebase Auth** — email/password; `/usuarios/{uid}` guarda `{ username, rol, agenciaId }`
- **Gemini 2.5 Flash** — `geminiCall()` en `gemini.js`
- **Cloudinary** — cloud `dgaixfvxa`, preset `keynet_props` (unsigned upload)
- **EmailJS** — service `service_iorm3vh`, template `template_lqgp3ki`
- **Google Maps Places** — cargado dinámicamente al final de `main.js`

## Equipo y roles

- `santiago` — `rol: 'admin'`; único que puede eliminar consultas (`st.usuarioRol === 'admin'`)
- `mariana`, `milagros`, `gabriel` — `rol: 'agente'`

La verificación de permisos usa `st.usuarioRol`, nunca el nombre hardcodeado.

## Backups

GitHub Actions (`.github/workflows/backup.yml`) corre diario a las 6am Argentina y exporta la DB completa a la rama `backups` (conserva 30 días). Requiere secret `FIREBASE_DB_SECRET` en GitHub → Settings → Secrets.

## Roadmap

1. **Etapa 1 pendiente**: namespace de agencia en Firebase (`/agencias/{id}/...`), security rules por agencia, Firebase Functions como proxy de Gemini
2. **Etapa 2**: panel admin Keynet, onboarding de agencias, Vercel, billing
3. **Etapa 3**: landing keynet.app, portal público de propiedades
