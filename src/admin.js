import { db, ref, onValue, functions, httpsCallable } from './firebase.js';

const _crearAgenciaFn = httpsCallable(functions, 'crearAgencia');
const _editarAgenciaFn = httpsCallable(functions, 'editarAgencia');
const _borrarAgenciaFn = httpsCallable(functions, 'borrarAgencia');
let _startCRM = null;
let _agenciaActualEdit = null;
let _agenciasData = {};
let _wizardPaso = 1;

export function initAdmin(startCRMCallback) {
  _startCRM = startCRMCallback;
  document.querySelector('.header')?.style.setProperty('display', 'none');
  document.querySelector('.tabs-main')?.style.setProperty('display', 'none');
  document.querySelector('.content')?.style.setProperty('display', 'none');
  document.querySelector('.subtabs')?.style.setProperty('display', 'none');
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('cambiar-wrap')?.classList.remove('visible');
  document.getElementById('admin-panel')?.classList.remove('oculto');

  onValue(ref(db, 'keynet/agencias'), snap => {
    _agenciasData = snap.val() || {};
    _renderAgencias(_agenciasData);
  });

  // Cuando se abre el modal de crear agencia, resetear wizard a paso 1
  const modalCrear = document.getElementById('modal-crear-agencia');
  if (modalCrear) {
    const originalClick = modalCrear.onclick;
    document.addEventListener('click', e => {
      if (e.target?.className.includes('btn-primary') && e.target.textContent.includes('Nueva agencia')) {
        _wizardPaso = 1;
        _updateWizardUI();
      }
    });
  }

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
    html += '<div class="empty"><div class="empty-svg"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg></div><div class="empty-title">Sin agencias</div><div class="empty-sub">Creá la primera agencia con el botón de arriba</div></div>';
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
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
        '<div style="font-size:11px;color:var(--gray-400)">Creada: ' + fecha + ' · <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:' + (a.activa ? '#2d6a4f' : '#c0392b') + ';display:inline-block"></span>' + (a.activa ? 'Activa' : 'Inactiva') + '</span></div>' +
        '<div style="display:flex;gap:8px">' +
        '<button onclick="window._verAgencia(\'' + a.id + '\',\'' + a.nombre.replace(/'/g,"\\'") + '\')" style="background:var(--black);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif">Ver CRM →</button>' +
        '<button onclick="window._abrirEditarAgencia(\'' + a.id + '\')" style="background:var(--gray-100);color:var(--black);border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;display:inline-flex;align-items:center;gap:5px"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Editar</button>' +
        '<button onclick="window._abrirBorrarAgencia(\'' + a.id + '\',\'' + a.nombre.replace(/'/g,"\\'") + '\')" style="background:var(--red);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;display:inline-flex;align-items:center;gap:5px"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>Borrar</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  el.innerHTML = html;
}

window._agenteWizardNext = () => {
  const err = document.getElementById('ag-error');
  err.textContent = '';

  if (_wizardPaso === 1) {
    const nombre = document.getElementById('ag-nombre')?.value.trim();
    const agenciaId = document.getElementById('ag-id')?.value.trim().toLowerCase();
    if (!nombre || !agenciaId) { err.textContent = 'Completá nombre e ID'; return; }
    if (!/^[a-z0-9-]+$/.test(agenciaId)) { err.textContent = 'El ID solo puede tener minúsculas, números y guiones'; return; }
    _wizardPaso = 2;
  } else if (_wizardPaso === 2) {
    const adminNombre = document.getElementById('ag-admin-nombre')?.value.trim();
    const adminEmail = document.getElementById('ag-admin-email')?.value.trim();
    const adminPassword = document.getElementById('ag-admin-pass')?.value;
    if (!adminNombre || !adminEmail || !adminPassword) { err.textContent = 'Completá todos los campos'; return; }
    if (adminPassword.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }
    _wizardPaso = 3;
  } else if (_wizardPaso === 3) {
    window._confirmarCrearAgencia();
    return;
  }
  _updateWizardUI();
};

window._agenteWizardPrev = () => {
  if (_wizardPaso > 1) {
    _wizardPaso--;
    _updateWizardUI();
  }
};

function _updateWizardUI() {
  document.getElementById('ag-paso-num').textContent = _wizardPaso;
  document.getElementById('ag-error').textContent = '';
  for (let i = 1; i <= 3; i++) {
    const step = document.getElementById(`ag-step-${i}`);
    if (step) step.style.display = i === _wizardPaso ? 'block' : 'none';
  }
  const backBtn = document.getElementById('ag-back-btn');
  const nextBtn = document.getElementById('ag-next-btn');
  if (backBtn) backBtn.style.display = _wizardPaso > 1 ? 'block' : 'none';
  if (nextBtn) nextBtn.textContent = _wizardPaso === 3 ? 'Crear agencia ✓' : 'Siguiente →';
}

window._confirmarCrearAgencia = async () => {
  const nombre = document.getElementById('ag-nombre')?.value.trim();
  const agenciaId = document.getElementById('ag-id')?.value.trim().toLowerCase();
  const adminNombre = document.getElementById('ag-admin-nombre')?.value.trim();
  const adminEmail = document.getElementById('ag-admin-email')?.value.trim();
  const adminPassword = document.getElementById('ag-admin-pass')?.value;
  const colorPrimario = document.getElementById('ag-color')?.value || '#0a0a0a';
  const err = document.getElementById('ag-error');
  const nextBtn = document.getElementById('ag-next-btn');

  nextBtn.disabled = true; nextBtn.textContent = 'Creando...';

  try {
    await _crearAgenciaFn({ nombre, agenciaId, adminNombre, adminEmail, adminPassword, colorPrimario });
    document.getElementById('modal-crear-agencia').classList.remove('open');
    _wizardPaso = 1;
    ['ag-nombre','ag-id','ag-admin-nombre','ag-admin-email','ag-admin-pass','ag-color'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.value = id === 'ag-color' ? '#0a0a0a' : ''; delete el.dataset.manual; }
    });
    _updateWizardUI();
  } catch (e) {
    err.textContent = e.message || 'Error al crear la agencia';
  } finally {
    nextBtn.disabled = false; nextBtn.textContent = 'Crear agencia ✓';
  }
};

window._verAgencia = (agenciaId, agenciaNombre) => {
  if(_startCRM) _startCRM(agenciaId, agenciaNombre);
};

window._autoSlug = () => {
  const nombre = document.getElementById('ag-nombre')?.value || '';
  const idEl = document.getElementById('ag-id');
  if (!idEl || idEl.dataset.manual) return;
  idEl.value = nombre.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};

window._abrirEditarAgencia = (agenciaId) => {
  _agenciaActualEdit = agenciaId;
  const agencia = _agenciasData[agenciaId];
  if (!agencia) return;
  document.getElementById('ag-edit-nombre').value = agencia.nombre || '';
  document.getElementById('ag-edit-plan').value = agencia.plan || 'trial';
  document.getElementById('ag-edit-activa').checked = agencia.activa !== false;
  document.getElementById('ag-edit-color').value = agencia.colorPrimario || '#0a0a0a';
  document.getElementById('ag-edit-error').textContent = '';
  document.getElementById('modal-editar-agencia').classList.add('open');
};

window._confirmarEditarAgencia = async () => {
  if (!_agenciaActualEdit) return;
  const nombre = document.getElementById('ag-edit-nombre')?.value.trim();
  const plan = document.getElementById('ag-edit-plan')?.value;
  const activa = document.getElementById('ag-edit-activa')?.checked;
  const colorPrimario = document.getElementById('ag-edit-color')?.value || '#0a0a0a';
  const btn = document.getElementById('ag-edit-btn');
  const err = document.getElementById('ag-edit-error');

  err.textContent = '';
  if (!nombre) { err.textContent = 'El nombre es requerido'; return; }

  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await _editarAgenciaFn({ agenciaId: _agenciaActualEdit, nombre, plan, activa, colorPrimario });
    document.getElementById('modal-editar-agencia').classList.remove('open');
  } catch (e) {
    err.textContent = e.message || 'Error al editar la agencia';
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar cambios';
  }
};

window._abrirBorrarAgencia = (agenciaId, agenciaNombre) => {
  _agenciaActualEdit = agenciaId;
  document.getElementById('ag-borrar-nombre').textContent = agenciaNombre;
  document.getElementById('modal-borrar-agencia').classList.add('open');
};

window._confirmarBorrarAgencia = async () => {
  if (!_agenciaActualEdit) return;
  const btn = document.getElementById('ag-borrar-btn');
  btn.disabled = true; btn.textContent = 'Borrando...';
  try {
    await _borrarAgenciaFn({ agenciaId: _agenciaActualEdit });
    document.getElementById('modal-borrar-agencia').classList.remove('open');
  } catch (e) {
    alert('Error al borrar: ' + (e.message || 'Intenta de nuevo'));
  } finally {
    btn.disabled = false; btn.textContent = 'Borrar';
  }
};
