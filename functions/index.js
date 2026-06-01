const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto'); // eslint-disable-line no-unused-vars

if (!admin.apps.length) admin.initializeApp();

const GEMINI_KEY = defineSecret('GEMINI_KEY');
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
const SCRAPER_KEY = defineSecret('SCRAPER_KEY');
const KEYNET_WORKER_SECRET = defineSecret('KEYNET_WORKER_SECRET');

// ── Proxy Gemini ──────────────────────────────────────────────
exports.geminiProxy = onRequest(
  { secrets: [GEMINI_KEY], region: 'us-central1', cors: true },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    // Verificar token de Firebase Auth
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      await admin.auth().verifyIdToken(authHeader.slice(7));
    } catch(e) {
      res.status(401).json({ error: 'Invalid token' }); return;
    }

    const { prompt, maxOutputTokens = 2000, temperature = 0.7 } = req.body || {};
    if (!prompt || typeof prompt !== 'string') { res.status(400).json({ error: 'Falta el prompt' }); return; }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY.value();
    const gemRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens, temperature } })
    });
    res.json(await gemRes.json());
  }
);

// ── Crear agencia ─────────────────────────────────────────────
exports.crearAgencia = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Se requiere autenticación');

    // Solo keynet-admin puede crear agencias
    const callerSnap = await admin.database().ref('usuarios/' + request.auth.uid).get();
    if ((callerSnap.val() || {}).rol !== 'keynet-admin') {
      throw new HttpsError('permission-denied', 'Solo keynet-admin puede crear agencias');
    }

    const { nombre, agenciaId, adminNombre, adminEmail, adminPassword, colorPrimario } = request.data;
    if (!nombre || !agenciaId || !adminNombre || !adminEmail || !adminPassword) {
      throw new HttpsError('invalid-argument', 'Faltan campos requeridos');
    }
    if (!/^[a-z0-9-]+$/.test(agenciaId)) {
      throw new HttpsError('invalid-argument', 'El ID solo puede tener minúsculas, números y guiones');
    }
    if (adminPassword.length < 6) {
      throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres');
    }

    // Verificar que el ID no exista
    const existing = await admin.database().ref('keynet/agencias/' + agenciaId).get();
    if (existing.exists()) throw new HttpsError('already-exists', 'Ya existe una agencia con ese ID');

    // Crear usuario de Firebase Auth
    const userRecord = await admin.auth().createUser({ email: adminEmail, password: adminPassword, displayName: adminNombre });
    const username = adminNombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

    // Escribir registros en la DB
    await admin.database().ref().update({
      ['usuarios/' + userRecord.uid]: { username, nombre: adminNombre, rol: 'admin', agenciaId },
      ['keynet/agencias/' + agenciaId]: { nombre, adminEmail, adminUid: userRecord.uid, plan: 'trial', activa: true, creada: Date.now(), colorPrimario: colorPrimario || '#0a0a0a' },
      ['agencias/' + agenciaId + '/emails/' + username]: adminEmail
    });

    return { success: true, uid: userRecord.uid };
  }
);

// ── Editar agencia ────────────────────────────────────────────
exports.editarAgencia = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Se requiere autenticación');

    // Solo keynet-admin puede editar agencias
    const callerSnap = await admin.database().ref('usuarios/' + request.auth.uid).get();
    if ((callerSnap.val() || {}).rol !== 'keynet-admin') {
      throw new HttpsError('permission-denied', 'Solo keynet-admin puede editar agencias');
    }

    const { agenciaId, nombre, plan, activa, colorPrimario, whatsapp } = request.data;
    if (!agenciaId || !nombre) {
      throw new HttpsError('invalid-argument', 'Faltan campos requeridos');
    }

    const updates = { nombre, plan, activa, actualizada: Date.now() };
    if (colorPrimario) updates.colorPrimario = colorPrimario;
    if (whatsapp !== undefined) updates.whatsapp = whatsapp;

    await admin.database().ref('keynet/agencias/' + agenciaId).update(updates);

    return { success: true };
  }
);

// ── Borrar agencia ────────────────────────────────────────────
exports.borrarAgencia = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Se requiere autenticación');

    // Solo keynet-admin puede borrar agencias
    const callerSnap = await admin.database().ref('usuarios/' + request.auth.uid).get();
    if ((callerSnap.val() || {}).rol !== 'keynet-admin') {
      throw new HttpsError('permission-denied', 'Solo keynet-admin puede borrar agencias');
    }

    const { agenciaId } = request.data;
    if (!agenciaId) {
      throw new HttpsError('invalid-argument', 'Falta agenciaId');
    }

    // Borrar el registro (los datos en /agencias/{agenciaId} quedan intactos)
    await admin.database().ref('keynet/agencias/' + agenciaId).remove();

    return { success: true };
  }
);

// ── Generar link de pago Mercado Pago ─────────────────────────
exports.generarLinkPago = onCall(
  { secrets: [MP_ACCESS_TOKEN], region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Se requiere autenticación');
    const callerSnap = await admin.database().ref('usuarios/' + request.auth.uid).get();
    if ((callerSnap.val() || {}).rol !== 'keynet-admin') {
      throw new HttpsError('permission-denied', 'Solo keynet-admin puede generar links de pago');
    }
    const { agenciaId, monto } = request.data;
    if (!agenciaId || !monto) throw new HttpsError('invalid-argument', 'Faltan campos requeridos');

    const agSnap = await admin.database().ref('keynet/agencias/' + agenciaId).get();
    if (!agSnap.exists()) throw new HttpsError('not-found', 'Agencia no encontrada');
    const agencia = agSnap.val();

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value() },
      body: JSON.stringify({
        items: [{ title: 'Keynet CRM', quantity: 1, currency_id: 'ARS', unit_price: Number(monto) }],
        external_reference: agenciaId,
        back_urls: {
          success: 'https://llave-maestra.vercel.app',
          failure: 'https://llave-maestra.vercel.app',
          pending: 'https://llave-maestra.vercel.app'
        },
        auto_return: 'approved',
        notification_url: 'https://us-central1-llave-maestra.cloudfunctions.net/mpWebhook'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new HttpsError('internal', 'Error MP: ' + (data.message || JSON.stringify(data)));
    return { url: data.init_point };
  }
);

// ── Fetch portal inmobiliario (vía scraping API: pasa Cloudflare) ───
// ZonaProp/Argenprop están detrás de Cloudflare y bloquean todas las IPs de
// datacenter (incluidas las de Google Cloud) y los proxies CORS gratuitos.
// Usamos ScrapingAnt con browser=true (Chrome real que resuelve el desafío JS),
// así devuelve el HTML real con __NEXT_DATA__. El token va en el secret SCRAPER_KEY.
//   firebase functions:secrets:set SCRAPER_KEY     (pegar el API token de Bright Data)
// Requiere crear una zona "Web Unlocker" en Bright Data llamada BRD_ZONE (ver abajo).
const BRD_ZONE = 'keynet_unlocker'; // nombre EXACTO de la zona Web Unlocker en Bright Data
exports.fetchPortal = onRequest(
  { secrets: [SCRAPER_KEY], region: 'us-central1', cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const { url } = req.body || {};
    if (!url || !url.startsWith('http')) { res.status(400).json({ error: 'URL inválida' }); return; }

    const token = SCRAPER_KEY.value();
    if (!token) { res.status(500).json({ error: 'Falta configurar SCRAPER_KEY' }); return; }

    // Bright Data Web Unlocker API: resuelve Cloudflare + render con IPs residenciales.
    // format:'raw' devuelve el body de la página directo; country:'ar' geo-targetea AR.
    try {
      const r = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: BRD_ZONE, url, format: 'raw', country: 'ar' })
      });
      const html = await r.text();
      // Si Bright Data devolvió algo que no es HTML (error de zona, saldo, robots.txt, etc.) lo propagamos.
      // Los errores de BRD son siempre texto plano o JSON, nunca empiezan con '<'.
      if (!html.trim().startsWith('<')) {
        res.json({ error: html.substring(0, 300), status: r.status }); return;
      }
      res.json({ html, status: r.status });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── parseLeadEmail — inbound email de ZonaProp vía Cloudflare Email Worker ───
// El Cloudflare Worker recibe el email, extrae el HTML y lo manda acá como JSON.
// Setup:
//   firebase functions:secrets:set KEYNET_WORKER_SECRET
//   (pegar el mismo valor que pusiste en SHARED_SECRET en el Worker de Cloudflare)

// Convierte el HTML del mail a texto plano para extraer campos "etiqueta: valor".
// ZonaProp pone el valor en el <span> SIGUIENTE a la etiqueta (ej:
// "Teléfono:</span> <span>542236630000</span>"), así que stripear los tags
// colapsa todo a "Teléfono: 542236630000" y los regex simples matchean igual,
// sirviendo tanto para mails iso-8859-1 (con spans) como UTF-8 (texto plano).
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t ]+/g, ' ');
}

function parseZonaPropEmail(bodyHtml, fromHeader) {
  const text = htmlToText(bodyHtml);

  // Nombre: del fromHeader si viene directo de ZonaProp, si no del cuerpo (*Nombre*)
  const nombreHeaderMatch = fromHeader.match(/^(.+?)\s+mediante ZonaProp/i);
  const nombreBodyMatch = text.match(/lo que busca\s*\*?\s*([A-Za-zÁÉÍÓÚáéíóúÑñ' ]+?)\s*\*?\s+en una propiedad/i)
                       || text.match(/busca\s*\*([^*]+)\*/i);
  const nombre = nombreHeaderMatch ? nombreHeaderMatch[1].trim()
               : nombreBodyMatch ? nombreBodyMatch[1].trim()
               : null;

  // Teléfono: tolera tags/espacios entre la etiqueta y el número
  const telMatch = text.match(/Tel[eé]fono\s*:?\s*(\d[\d\s().+\-]{6,}\d)/i);
  const telefonoRaw = telMatch ? telMatch[1].replace(/[^\d+]/g, '') : null;
  const telefono = telefonoRaw
    ? (telefonoRaw.startsWith('+') ? telefonoRaw : '+' + telefonoRaw)
    : null;

  // Email: link mailto (más fiable) o texto plano "E-mail: xxx@xxx"
  const emailHrefMatch = bodyHtml.match(/href="mailto:([^"@?]+@[^"?]+)"/i);
  const emailPlainMatch = text.match(/E-?mail\s*:?\s*([\w.+%-]+@[\w.-]+\.[a-z]{2,})/i);
  const emailInteresado = emailPlainMatch ? emailPlainMatch[1]
                        : emailHrefMatch ? emailHrefMatch[1]
                        : null;

  // Código de aviso: "Código de aviso: 59220019"
  const codigoMatch = text.match(/C[oó]digo de aviso\s*:?\s*(\d+)/i);
  const codigoAviso = codigoMatch ? codigoMatch[1] : null;

  // Código del anunciante: "Código del anunciante: LAP6793625"
  const codAnuncianteMatch = text.match(/C[oó]digo del anunciante\s*:?\s*([A-Za-z0-9]+)/i);
  const codigoAnunciante = codAnuncianteMatch ? codAnuncianteMatch[1].trim() : null;

  const propiedadUrl = codigoAviso
    ? 'https://www.zonaprop.com.ar/propiedades/-' + codigoAviso + '.html'
    : null;

  // Dirección del aviso. ZonaProp la muestra como calle (span font-size:16px) +
  // zona/ciudad (span siguiente, que SIEMPRE trae coma "Barrio, Ciudad"). La coma
  // del 2º span filtra spans que no son dirección, sin depender del color del
  // template. Verificado contra dos templates distintos de ZonaProp.
  let direccion = null;
  const dirSpan = bodyHtml.match(/font-size:16px;[^"]*"[^>]*>([^<]{2,55})<\/span>\s*<span[^>]*>([^<]{2,60},[^<]{2,40})<\/span>/i);
  if (dirSpan) {
    direccion = (dirSpan[1].trim() + ', ' + dirSpan[2].trim()).replace(/\s+/g, ' ');
  } else {
    // Fallback (parte text/plain): línea con coma justo antes de un link de ZonaProp.
    const dirTxt = bodyHtml.match(/\n\s*([^\n<>]{4,55}?,\s*[A-Za-zÁÉÍÓÚáéíóúñ ]{3,30})\s*\r?\n\s*<https?:\/\/link\.zonaprop/i);
    if (dirTxt) direccion = dirTxt[1].replace(/\s+/g, ' ').trim();
  }

  // Lo que se muestra en la columna "Propiedad": dirección real > código.
  const propiedad = direccion || (codigoAviso ? 'ZonaProp #' + codigoAviso : null);

  const perfilMatch = text.match(/Tu contacto busca:([\s\S]*?)(?:Ver perfil|Este es el mensaje)/i);
  const perfilBuscador = perfilMatch
    ? perfilMatch[1].replace(/\s+/g, ' ').trim().substring(0, 500)
    : null;

  return { nombre, telefono, emailInteresado, codigoAviso, codigoAnunciante, propiedadUrl, perfilBuscador, propiedad };
}

// Devuelve el username del agente con menos consultas activas (Cerrado/Sin interés
// no cuentan), empate → orden del equipo. Replica sigRotacion() del frontend.
async function asignarPorRotacion(agenciaId) {
  const equipoSnap = await admin.database().ref('/agencias/' + agenciaId + '/equipo').get();
  const equipo = equipoSnap.val();
  if (!Array.isArray(equipo) || !equipo.length) return null;

  const consSnap = await admin.database().ref('/agencias/' + agenciaId + '/consultas').get();
  const consultas = consSnap.val() || {};

  const cnt = {};
  equipo.forEach((m) => { cnt[m] = 0; });
  Object.values(consultas).forEach((c) => {
    if (c && c.asignado && cnt[c.asignado] !== undefined &&
        c.estado !== 'Cerrado' && c.estado !== 'Sin interés') {
      cnt[c.asignado]++;
    }
  });
  return equipo.reduce((a, b) => (cnt[a] <= cnt[b] ? a : b));
}

exports.parseLeadEmail = onRequest(
  { secrets: [KEYNET_WORKER_SECRET], region: 'us-central1', cors: false },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send(''); return; }

    const receivedSecret = req.headers['x-keynet-secret'] || '';
    const expectedSecret = KEYNET_WORKER_SECRET.value().trim();
    if (receivedSecret !== expectedSecret) { res.status(403).send(''); return; }

    const { agenciaId, from: fromHeader = '', html: bodyHtml = '' } = req.body || {};
    if (!agenciaId) { res.status(400).send(''); return; }

    const {
      nombre, telefono, emailInteresado,
      codigoAviso, codigoAnunciante, propiedadUrl, perfilBuscador, propiedad
    } = parseZonaPropEmail(bodyHtml, fromHeader);

    // Componemos "obs" (campo "Qué busca" que muestra la app) con el perfil del
    // buscador + datos de contacto/aviso que no tienen columna propia en la UI.
    const obsPartes = [];
    if (perfilBuscador) obsPartes.push(perfilBuscador);
    if (emailInteresado) obsPartes.push('✉️ ' + emailInteresado);
    if (propiedadUrl) obsPartes.push('🔗 ' + propiedadUrl);

    // IMPORTANTE: usar los MISMOS nombres de campo que el frontend (consultas.js):
    // tel, obs, propiedad, canal, fecha, estado:'Activo'. Si no, la consulta
    // aparece "vacía" porque la UI no lee telefono/perfilBuscador/fechaCreacion.
    const consulta = {
      nombre: nombre || 'Lead ZonaProp',
      estado: 'Activo',
      canal: 'ZonaProp',
      fecha: admin.database.ServerValue.TIMESTAMP,
      checks: {},
      checkTs: {},
    };
    if (telefono) consulta.tel = telefono;
    if (propiedad) consulta.propiedad = propiedad;
    if (obsPartes.length) consulta.obs = obsPartes.join('\n');
    // Guardamos también los crudos por si se necesitan más adelante.
    if (emailInteresado) consulta.emailInteresado = emailInteresado;
    if (codigoAnunciante) consulta.codigoAnunciante = codigoAnunciante;
    if (propiedadUrl) consulta.propiedadUrl = propiedadUrl;

    if (!nombre && !telefono && !emailInteresado) {
      consulta.obs = bodyHtml.substring(0, 1500);
    }

    // Asignación automática por rotación (igual que sigRotacion en el frontend):
    // al agente con MENOS consultas activas; empate → orden del equipo. El equipo
    // se lee de /agencias/{id}/equipo (array de usernames). Si no existe, queda sin
    // asignar y aparece en "Todas" para que el equipo la tome a mano.
    const asignado = await asignarPorRotacion(agenciaId);
    if (asignado) consulta.asignado = asignado;

    await admin.database().ref('/agencias/' + agenciaId + '/consultas').push(consulta);
    res.status(200).send('OK');
  }
);

// ── Webhook Mercado Pago ─────────────────────────────────────
// URL de este endpoint: se obtiene al deployar con `firebase deploy --only functions:mpWebhook`
// Configurar en MP Dashboard → Notificaciones IPN con esa URL
exports.mpWebhook = onRequest(
  { secrets: [MP_ACCESS_TOKEN], region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(200).send('ok'); return; }
    const { type, data } = req.body || {};
    // MP también notifica via query param para algunos eventos
    const paymentId = data?.id || req.query['data.id'];
    if (type !== 'payment' || !paymentId) { res.status(200).send('ok'); return; }
    try {
      const mpRes = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
        headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value() }
      });
      const payment = await mpRes.json();
      const agenciaId = payment.external_reference;
      if (!agenciaId) { res.status(200).send('ok'); return; }
      if (payment.status === 'approved') {
        await admin.database().ref('keynet/agencias/' + agenciaId).update({
          activa: true,
          plan: 'activo',
          ultimoPago: Date.now(),
          ultimoPaymentId: String(paymentId)
        });
      }
      res.status(200).send('ok');
    } catch (e) {
      console.error('mpWebhook error:', e);
      res.status(200).send('ok'); // MP requiere 200 para no reintentar
    }
  }
);
