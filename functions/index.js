const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

const GEMINI_KEY = defineSecret('GEMINI_KEY');
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

// ── Proxy Gemini ──────────────────────────────────────────────
exports.geminiProxy = onCall(
  { secrets: [GEMINI_KEY], region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Se requiere autenticación');
    const { prompt, maxOutputTokens = 2000, temperature = 0.7 } = request.data;
    if (!prompt || typeof prompt !== 'string') throw new HttpsError('invalid-argument', 'Falta el prompt');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY.value();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens, temperature } })
    });
    return await res.json();
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

    const { agenciaId, nombre, plan, activa, colorPrimario } = request.data;
    if (!agenciaId || !nombre) {
      throw new HttpsError('invalid-argument', 'Faltan campos requeridos');
    }

    const updates = { nombre, plan, activa, actualizada: Date.now() };
    if (colorPrimario) updates.colorPrimario = colorPrimario;

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
        auto_return: 'approved'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new HttpsError('internal', 'Error MP: ' + (data.message || JSON.stringify(data)));
    return { url: data.init_point };
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
