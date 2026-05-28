const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

const GEMINI_KEY = defineSecret('GEMINI_KEY');

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
