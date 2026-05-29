import { db, ref, get } from './firebase.js';
import { AMENITY_INFO } from './state.js';

export async function initPropiedad() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // URL: /propiedad/{agenciaId}/{propId}
  const agenciaId = parts[1];
  const propId = parts[2];
  const el = document.getElementById('ficha-publica');

  if (!agenciaId || !propId) { el.innerHTML = _errorHtml('URL inválida'); return; }

  try {
    const [propSnap, agSnap] = await Promise.all([
      get(ref(db, 'agencias/' + agenciaId + '/propiedades/' + propId)),
      get(ref(db, 'keynet/agencias/' + agenciaId))
    ]);
    if (!propSnap.exists()) { el.innerHTML = _errorHtml('Propiedad no encontrada'); return; }
    _render(propSnap.val(), agSnap.val() || {}, el);
  } catch(e) {
    el.innerHTML = _errorHtml('Error al cargar la propiedad');
  }
}

function _render(prop, ag, el) {
  const color = ag.colorPrimario || '#0a0a0a';
  document.documentElement.style.setProperty('--brand', color);
  document.title = (prop.titulo || prop.direccion || 'Propiedad') + ' · ' + (ag.nombre || 'Keynet');

  const fotos = prop.fotos?.length ? prop.fotos : prop.foto ? [prop.foto] : [];
  let lbIdx = 0;

  // WhatsApp
  const waMensaje = encodeURIComponent(
    'Hola! Me interesa la propiedad: ' + (prop.titulo || prop.direccion || '') +
    (prop.precio ? ' — ' + prop.precio : '') +
    '. ' + window.location.href
  );
  const waNum = (ag.whatsapp || '').replace(/\D/g, '');
  const waUrl = waNum ? 'https://wa.me/' + waNum + '?text=' + waMensaje : null;

  // Galería
  const galHtml = fotos.length ? (
    '<div style="position:relative;background:#111;overflow:hidden;max-height:480px;aspect-ratio:4/3">' +
    '<img id="fp-img" src="' + fotos[0] + '" style="width:100%;height:100%;object-fit:cover" onclick="window._fpLb(0)">' +
    (fotos.length > 1 ?
      '<div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:20px;cursor:pointer" onclick="window._fpLb(0)">📷 ' + fotos.length + ' fotos</div>' +
      '<button onclick="event.stopPropagation();window._fpNav(-1)" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:36px;height:36px;font-size:20px;cursor:pointer;line-height:1">‹</button>' +
      '<button onclick="event.stopPropagation();window._fpNav(1)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:36px;height:36px;font-size:20px;cursor:pointer;line-height:1">›</button>'
      : '') +
    '</div>' +
    (fotos.length > 1 ?
      '<div style="display:flex;gap:4px;padding:6px;background:#111;overflow-x:auto">' +
      fotos.slice(0, 8).map((f, i) =>
        '<img id="fp-th-' + i + '" src="' + f + '" onclick="window._fpGo(' + i + ')" style="width:60px;height:46px;object-fit:cover;border-radius:4px;cursor:pointer;flex-shrink:0;' + (i === 0 ? 'opacity:1;outline:2px solid var(--brand)' : 'opacity:.55') + '">'
      ).join('') +
      (fotos.length > 8 ? '<div onclick="window._fpLb(8)" style="width:60px;height:46px;background:rgba(255,255,255,.1);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0">+' + (fotos.length - 8) + '</div>' : '') +
      '</div>' : '')
  ) : '<div style="height:180px;background:var(--stone-100,#f5f5f4);display:flex;align-items:center;justify-content:center;color:#999">Sin fotos</div>';

  // Pills de detalles
  const pills = [
    prop.tipo && ['Tipo', prop.tipo],
    prop.ambientes && ['Ambientes', prop.ambientes],
    prop.dormitorios && ['Dormitorios', prop.dormitorios],
    prop.banos && ['Baños', prop.banos],
    (prop.supCubierta || prop.supTotal) && ['Superficie', (prop.supCubierta || prop.supTotal) + ' m²'],
    prop.piso && ['Piso', prop.piso],
    prop.cochera && prop.cochera !== 'No' && ['Cochera', prop.cochera],
    prop.orientacion && ['Orientación', prop.orientacion],
    prop.calefaccion && ['Calefacción', prop.calefaccion],
    prop.antiguedad && ['Antigüedad', prop.antiguedad],
  ].filter(Boolean).map(([l, v]) =>
    '<div style="padding:10px 14px;background:#f8f8f6;border-radius:10px">' +
    '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">' + l + '</div>' +
    '<div style="font-size:14px;font-weight:700;color:#1c1917">' + v + '</div></div>'
  ).join('');

  // Amenities
  const amenHtml = (prop.amenities || []).map(a => {
    const info = AMENITY_INFO[a];
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:#f8f8f6;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:500">' + (info || a) + '</span>';
  }).join('');

  // Maps link
  const mapsUrl = prop.direccion ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(prop.direccion) : null;

  el.innerHTML =
    // Header sticky
    '<div style="position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e7e5e4;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">' +
    '<div style="font-size:17px;font-weight:800;letter-spacing:-.03em;color:#1c1917">' + (ag.nombre || 'Keynet') + '</div>' +
    '<button onclick="window._fpShare()" style="background:#f4f4f2;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;display:flex;align-items:center;gap:5px;color:#1c1917">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Compartir</button>' +
    '</div>' +

    // Galería
    galHtml +

    // Contenido
    '<div style="max-width:640px;margin:0 auto;padding:20px 16px 120px">' +

    // Operación + precio + título
    '<div style="margin-bottom:20px">' +
    (prop.operacion ? '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--brand);margin-bottom:6px">' + prop.operacion + '</div>' : '') +
    '<div style="font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1;margin-bottom:6px;color:#1c1917">' + (prop.precio || 'Consultar precio') + '</div>' +
    '<div style="font-size:16px;font-weight:600;color:#44403c">' + (prop.titulo || prop.direccion || '') + '</div>' +
    (prop.barrio ? '<div style="font-size:13px;color:#78716c;margin-top:2px">' + prop.barrio + '</div>' : '') +
    '</div>' +

    // Pills
    (pills ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:24px">' + pills + '</div>' : '') +

    // Descripción
    (prop.desc ?
      '<div style="margin-bottom:24px">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px">Descripción</div>' +
      '<div style="font-size:14px;line-height:1.7;color:#57534e;white-space:pre-line">' + prop.desc + '</div>' +
      '</div>' : '') +

    // Amenities
    (prop.amenities?.length ?
      '<div style="margin-bottom:24px">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px">Características</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' + amenHtml + '</div>' +
      '</div>' : '') +

    // Ubicación
    (mapsUrl ?
      '<div style="margin-bottom:24px">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px">Ubicación</div>' +
      '<a href="' + mapsUrl + '" target="_blank" style="display:flex;align-items:center;gap:10px;padding:14px;background:#f8f8f6;border-radius:12px;text-decoration:none;color:#1c1917">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
      '<div><div style="font-size:13px;font-weight:700">' + (prop.direccion || '') + '</div><div style="font-size:12px;color:#78716c;margin-top:1px">Ver en Google Maps →</div></div>' +
      '</a>' +
      '</div>' : '') +

    '</div>' +

    // Barra fija de contacto
    '<div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e7e5e4;padding:12px 16px;display:flex;gap:10px;z-index:50">' +
    (waUrl ?
      '<a href="' + waUrl + '" target="_blank" style="flex:1;background:#25d366;color:#fff;border:none;border-radius:10px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px;font-family:\'DM Sans\',sans-serif">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
      'Consultar por WhatsApp</a>' : '') +
    '<button onclick="window._fpShare()" style="' + (waUrl ? 'padding:14px 16px' : 'flex:1;padding:14px') + ';background:var(--brand);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
    (waUrl ? '' : 'Compartir propiedad') + '</button>' +
    '</div>' +

    // Lightbox
    '<div id="fp-lb" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999;flex-direction:column;align-items:center;justify-content:center">' +
    '<button onclick="document.getElementById(\'fp-lb\').style.display=\'none\'" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.12);color:#fff;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;line-height:1">✕</button>' +
    '<img id="fp-lb-img" style="max-width:95vw;max-height:80vh;object-fit:contain;border-radius:8px">' +
    '<div id="fp-lb-cnt" style="color:rgba(255,255,255,.5);font-size:13px;margin-top:12px"></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button onclick="window._fpLbNav(-1)" style="background:rgba(255,255,255,.12);color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:20px;cursor:pointer;line-height:1">‹</button>' +
    '<button onclick="window._fpLbNav(1)" style="background:rgba(255,255,255,.12);color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:20px;cursor:pointer;line-height:1">›</button>' +
    '</div></div>';

  // Lightbox logic
  const total = fotos.length;
  window._fpLb = (i) => {
    lbIdx = Math.max(0, Math.min(total - 1, i));
    document.getElementById('fp-lb').style.display = 'flex';
    document.getElementById('fp-lb-img').src = fotos[lbIdx];
    document.getElementById('fp-lb-cnt').textContent = (lbIdx + 1) + ' / ' + total;
  };
  window._fpLbNav = (d) => window._fpLb(lbIdx + d);

  // Inline gallery nav
  window._fpGo = (i) => {
    lbIdx = Math.max(0, Math.min(total - 1, i));
    const img = document.getElementById('fp-img');
    if (img) img.src = fotos[lbIdx];
    document.querySelectorAll('[id^="fp-th-"]').forEach((t, j) => {
      t.style.opacity = j === lbIdx ? '1' : '.55';
      t.style.outline = j === lbIdx ? '2px solid var(--brand)' : 'none';
    });
  };
  window._fpNav = (d) => window._fpGo(lbIdx + d);

  // Share
  window._fpShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: prop.titulo || prop.direccion, url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        const t = document.createElement('div');
        t.textContent = '¡Link copiado!';
        t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1c1917;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;font-family:\'DM Sans\',sans-serif';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2000);
      });
    }
  };
}

function _errorHtml(msg) {
  return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:\'DM Sans\',sans-serif">' +
    '<div style="font-size:40px;margin-bottom:16px">🏠</div>' +
    '<div style="font-size:18px;font-weight:700;color:#1c1917">' + msg + '</div>' +
    '</div>';
}
