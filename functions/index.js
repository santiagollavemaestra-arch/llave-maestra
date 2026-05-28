const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const GEMINI_KEY = defineSecret('GEMINI_KEY');

exports.geminiProxy = onCall(
  { secrets: [GEMINI_KEY], region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Se requiere autenticación');
    }

    const { prompt, maxOutputTokens = 2000, temperature = 0.7 } = request.data;
    if (!prompt || typeof prompt !== 'string') {
      throw new HttpsError('invalid-argument', 'Falta el prompt');
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY.value();

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, temperature }
      })
    });

    // Devuelve la respuesta cruda de Gemini (incluyendo errores 503)
    // para que el frontend maneje los reintentos como siempre
    return await res.json();
  }
);
