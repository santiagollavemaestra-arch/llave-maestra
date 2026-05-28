import { st, NOMBRES } from './state.js';
import { agRef, push, update, remove } from './firebase.js';

const cerrarModal = (id) => document.getElementById(id).classList.remove('open');

// PROPIETARIOS
// ============================================================
export function renderPropietarios(){
  const lista=document.getElementById('lista');
  const arr=Object.entries(st.propietarios).map(([id,p])=>({...p,id})).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  let html='<button class="btn-nueva" onclick="document.getElementById(\'modal-propietario\').classList.add(\'open\')">+ Nuevo propietario</button>';
  if(!arr.length){html+='<div class="empty"><div class="empty-icon">👤</div><div>No hay propietarios</div></div>';lista.innerHTML=html;return;}
  html+=arr.map(p=>{
    const susProp=Object.values(st.propiedades).filter(pr=>pr.propietarioId===p.id);
    return '<div class="prop-card">'+
      '<div class="prop-card-nombre">'+p.nombre+'</div>'+
      (p.tel?'<div class="prop-card-tel">📱 '+p.tel+'</div>':'')+
      (p.email?'<div class="prop-card-tel">✉️ '+p.email+'</div>':'')+
      '<div class="prop-card-props">🏠 '+(susProp.length?susProp.length+' propiedad'+(susProp.length>1?'es':'')+': '+susProp.map(pr=>pr.titulo||pr.direccion||'').join(', '):'Sin propiedades')+'</div>'+
      (p.obs?'<div style="font-size:12px;color:var(--gray-600);margin-top:6px">'+p.obs+'</div>':'')+
      '<div style="display:flex;gap:8px;margin-top:10px">'+
      (p.tel?'<a href="https://wa.me/549'+p.tel.replace(/\D/g,'')+'" target="_blank" class="wa-btn" style="margin:0;padding:8px 14px;font-size:12px;flex:1">📱 WhatsApp</a>':'')+
      '<button onclick="window._editPropietario(\''+p.id+'\')" style="padding:8px 12px;background:var(--gray-100);color:var(--gray-600);border:none;border-radius:var(--radius-sm);font-size:12px;font-weight:700;cursor:pointer">✏️</button>'+
      '<button onclick="window._delPropietario(\''+p.id+'\')" style="padding:8px 12px;background:var(--red-light);color:var(--red);border:none;border-radius:var(--radius-sm);font-size:12px;font-weight:700;cursor:pointer">🗑</button>'+
      '</div></div>';
  }).join('');
  lista.innerHTML=html;
}

window.guardarPropietario = () => {
  const nombre=document.getElementById('pr-nombre').value.trim();
  if(!nombre){alert('Ingresá el nombre');return;}
  const editId=document.getElementById('pr-edit-id').value;
  const datos={nombre,tel:document.getElementById('pr-tel').value.trim(),email:document.getElementById('pr-email').value.trim(),obs:document.getElementById('pr-obs').value.trim()};
  if(editId){ update(agRef('propietarios',editId),datos); }
  else { push(agRef('propietarios'),{...datos,fecha:Date.now()}); }
  ['pr-nombre','pr-tel','pr-email','pr-obs'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('pr-edit-id').value='';
  const t=document.getElementById('pr-modal-title');if(t) t.textContent='Nuevo propietario';
  cerrarModal('modal-propietario');
};

window._editPropietario = (id) => {
  const p=st.propietarios[id];
  if(!p) return;
  document.getElementById('pr-edit-id').value=id;
  document.getElementById('pr-nombre').value=p.nombre||'';
  document.getElementById('pr-tel').value=p.tel||'';
  document.getElementById('pr-email').value=p.email||'';
  document.getElementById('pr-obs').value=p.obs||'';
  const t=document.getElementById('pr-modal-title');if(t) t.textContent='Editar propietario';
  document.getElementById('modal-propietario').classList.add('open');
};
window._delPropietario = (id) => {
  const susProp=Object.values(st.propiedades).filter(p=>p.propietarioId===id);
  const msg=susProp.length
    ? '⚠️ Este propietario tiene '+susProp.length+' propiedad'+(susProp.length>1?'es':'')+' asociada'+(susProp.length>1?'s':'')+': '+susProp.map(p=>p.titulo||p.direccion||'').join(', ')+'\n\n¿Eliminar de todas formas?'
    : '¿Eliminar propietario?';
  if(!confirm(msg)) return;
  remove(agRef('propietarios',id));
};

// ============================================================
