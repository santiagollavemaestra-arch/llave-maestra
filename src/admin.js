import { db, ref, onValue, functions, httpsCallable } from './firebase.js';

const _crearAgenciaFn = httpsCallable(functions, 'crearAgencia');

export function initAdmin() {
  document.querySelector('.header')?.style.setProperty('display', 'none');
  document.querySelector('.tabs-main')?.style.setProperty('display', 'none');
  document.querySelector('.content')?.style.setProperty('display', 'none');
  document.querySelector('.subtabs')?.style.setProperty('display', 'none');
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('cambiar-wrap')?.classList.remove('visible');
  document.getElementById('admin-panel')?.classList.remove('oculto');

  onValue(ref(db, 'keynet/agencias'), snap => _renderAgencias(snap.val() || {}));

  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
}

function _renderAgencias(data) {
  const arr = Object.entries(data).map(([id, a]) => ({ ...a, id }))
    .sort((a, b) => (b.creada || 0) - (a.creada || 0));

  const el = document.getElementById('admin-body');
  if (!el) return;

  const total = arr.length;
  const activas = arr.filter(a => a.activa).length;
  const trials = arr.filter(a => a.plan === 'trial').length;

  let html =
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">' +
    '<div class="stat-card"><div class="stat-num">' + total + '</div><div class="stat-name">Agencias</div></div>' +
    '<div class="stat-card"><div class="stat-num" style="color:var(--green)">' + activas + '</div><div class="stat-name">Activas</div></div>' +
    '<div class="stat-card"><div class="stat-num" style="color:var(--blue)">' + trials + '</div><div class="stat-name">En trial</div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
    '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400)">Agencias</div>' +
    '<button onclick="document.getElementById(\'modal-crear-agencia\').classList.add(\'open\')" class="btn-primary" style="padding:8px 16px;font-size:13px">+ Nueva agencia</button>' +
    '</div>';

  if (!arr.length) {
    html += '<div class="empty"><div class="empty-icon">🏢</div><div>No hay agencias todavía</div></div>';
  } else {
    html += arr.map(a => {
      const fecha = a.creada ? new Date(a.creada).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
      const planColor = a.plan === 'activo' ? 'var(--green)' : a.plan === 'inactivo' ? 'var(--red)' : 'var(--blue)';
      return '<div class="prop-card" style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div>' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:2px">' + a.nombre + '</div>' +
        '<div style="font-size:11px;color:var(--gray-400);font-family:monospace">' + a.id + '</div>' +
        '</div>' +
        '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;background:var(--gray-100);color:' + planColor + '">' + (a.plan || 'trial').toUpperCase() + '</span>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:12px;color:var(--gray-600)">Admin: ' + (a.adminEmail || '—') + '</div>' +
        '<div style="font-size:11px;color:var(--gray-400);margin-top:4px">Creada: ' + fecha + ' · ' + (a.activa ? '🟢 Activa' : '🔴 Inactiva') + '</div>' +
        '</div>';
    }).join('');
  }

  el.innerHTML = html;
}

window._confirmarCrearAgencia = async () => {
  const nombre = document.getElementById('ag-nombre')?.value.trim();
  const agenciaId = document.getElementById('ag-id')?.value.trim().toLowerCase();
  const adminNombre = document.getElementById('ag-admin-nombre')?.value.trim();
  const adminEmail = document.getElementById('ag-admin-email')?.value.trim();
  const adminPassword = document.getElementById('ag-admin-pass')?.value;
  const btn = document.getElementById('ag-crear-btn');
  const err = document.getElementById('ag-error');

  err.textContent = '';
  if (!nombre || !agenciaId || !adminNombre || !adminEmail || !adminPassword) {
    err.textContent = 'Completá todos los campos'; return;
  }
  if (!/^[a-z0-9-]+$/.test(agenciaId)) {
    err.textContent = 'El ID solo puede tener minúsculas, números y guiones'; return;
  }
  if (adminPassword.length < 6) {
    err.textContent = 'La contraseña debe tener al menos 6 caracteres'; return;
  }

  btn.disabled = true; btn.textContent = 'Creando...';

  try {
    await _crearAgenciaFn({ nombre, agenciaId, adminNombre, adminEmail, adminPassword });
    document.getElementById('modal-crear-agencia').classList.remove('open');
    ['ag-nombre','ag-id','ag-admin-nombre','ag-admin-email','ag-admin-pass'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.value = ''; delete el.dataset.manual; }
    });
  } catch (e) {
    err.textContent = e.message || 'Error al crear la agencia';
  } finally {
    btn.disabled = false; btn.textContent = 'Crear agencia';
  }
};

window._autoSlug = () => {
  const nombre = document.getElementById('ag-nombre')?.value || '';
  const idEl = document.getElementById('ag-id');
  if (!idEl || idEl.dataset.manual) return;
  idEl.value = nombre.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};
