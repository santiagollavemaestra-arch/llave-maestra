import { st, EQUIPO, DIAS, AMENITY_INFO } from './state.js';

export function _amLabel(a){return AMENITY_INFO[a]||('✓ '+a);}

export function diasDesde(ts){return ts?Math.floor((Date.now()-ts)/(864e5)):null;}
export function ultimoCheck(c){
  if(!c.checkTs){
    return c.lastReset?Math.max(c.lastReset,c.fecha||0):c.fecha;
  }
  const v=Object.values(c.checkTs).filter(Boolean);
  const maxCheck=v.length?Math.max(...v):c.fecha;
  return c.lastReset?Math.max(maxCheck,c.lastReset):maxCheck;
}
export function countdownInfo(c){
  if(['Cerrado','Sin interés','Reserva'].includes(c.estado)||c.checks?.res) return null;
  const d=diasDesde(ultimoCheck(c));
  if(d===null) return null;
  const r=DIAS-d;
  if(r>DIAS) return null;
  if(r>2) return {tipo:'ok',txt:'Seguimiento en '+r+' días'};
  if(r>0) return {tipo:'warn',txt:'⚠️ Contactar en '+r+(r>1?' días':' día')};
  if(r===0) return {tipo:'warn',txt:'⚠️ Contactar hoy'};
  return {tipo:'vencida',txt:'🔴 Vencido hace '+Math.abs(r)+(Math.abs(r)>1?' días':' día')};
}

// ============================================================
// ROTACION
// ============================================================
export function sigRotacion(){
  const cnt={};
  EQUIPO.forEach(m=>cnt[m]=0);
  Object.values(st.consultas).filter(c=>!['Cerrado','Sin interés'].includes(c.estado)).forEach(c=>{if(c.asignado)cnt[c.asignado]++;});
  return EQUIPO.reduce((a,b)=>cnt[a]<=cnt[b]?a:b);
}

export function _propLabel(p){
  return (p.direccion||p.titulo||'')+(p.barrio?', '+p.barrio:'')+(p.precio?' — '+p.precio:'');
}
