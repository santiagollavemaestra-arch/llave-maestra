import { functions, httpsCallable } from './firebase.js';

// Dev: clave en .env.local → llamada directa a Gemini
// Prod: sin clave en el build → proxy via Firebase Function (clave server-side)
const DEV_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const _proxy = DEV_KEY ? null : httpsCallable(functions, 'geminiProxy');

export async function geminiCall(prompt, opts) {
  const cfg = Object.assign({ maxOutputTokens: 2000, temperature: 0.7 }, opts || {});
  let lastErr;
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      const wait = 3000 * i;
      console.log('Gemini 503, reintentando en ' + wait / 1000 + 's...');
      await new Promise(r => setTimeout(r, wait));
    }
    let data;
    if (DEV_KEY) {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + DEV_KEY,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: cfg }) }
      );
      data = await res.json();
    } else {
      const result = await _proxy({ prompt, maxOutputTokens: cfg.maxOutputTokens, temperature: cfg.temperature });
      data = result.data;
    }
    if (!data.error) return data;
    lastErr = new Error('[' + data.error.code + '] ' + data.error.message);
    if (data.error.code !== 503) throw lastErr;
  }
  throw lastErr;
}
