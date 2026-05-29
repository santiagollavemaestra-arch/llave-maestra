import { auth } from './firebase.js';

const DEV_KEY = import.meta.env.VITE_GEMINI_KEY || '';
const PROXY_URL = 'https://us-central1-llave-maestra.cloudfunctions.net/geminiProxy';

export async function geminiCall(prompt, opts) {
  const cfg = Object.assign({ maxOutputTokens: 2000, temperature: 0.7 }, opts || {});
  let lastErr;
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 3000 * i));
    }
    try {
      let data;
      if (DEV_KEY) {
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + DEV_KEY,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: cfg }) }
        );
        data = await res.json();
      } else {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') },
          body: JSON.stringify({ prompt, maxOutputTokens: cfg.maxOutputTokens, temperature: cfg.temperature })
        });
        data = await res.json();
      }
      if (!data?.error) return data;
      lastErr = new Error('[' + data.error.code + '] ' + data.error.message);
      if (data.error.code !== 503) throw lastErr;
    } catch(e) {
      lastErr = e;
      if (i < 2) continue;
      throw lastErr;
    }
  }
  throw lastErr;
}
