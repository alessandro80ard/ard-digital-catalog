// A.R.D. BETA 1.4.1 — pure three-way merge. No network, token or writes.
// Atomic image+thumbnail bundle, derived update dates, status and order conflict protection.
(function(global){'use strict';
const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const equal=(a,b)=>stable(a)===stable(b);
const byId=items=>new Map(items.map(p=>[p.id,p]));
const uniq=items=>[...new Set(items)];
const imagePair=p=>({immagine:p?.immagine,thumb:p?.thumb});
function plan(base,local,remote){
 const B=byId(base),L=byId(local),R=byId(remote),keys=uniq([...B.keys(),...L.keys(),...R.keys()]);
 const conflicts=[],merged=new Map();
 const push=(id,type,field,localValue,remoteValue,label)=>conflicts.push({key:type+':'+id+(field?':'+field:''),id,type,field:field||null,label,localValue,remoteValue});
 for(const id of keys){const b=B.get(id),l=L.get(id),r=R.get(id);
  if(!b){if(l&&r){if(equal(l,r))merged.set(id,r);else push(id,'new',null,l,r,`#${id} · Nuova promozione presente su entrambi`);}else merged.set(id,l||r);continue;}
  if(!l&&!r)continue;
  if(!l||!r){const remaining=l||r;if(equal(remaining,b))continue;push(id,'delete',null,l||null,r||null,`#${id} · Eliminazione contro modifica`);continue;}
  const combined={};
  const fields=uniq([...Object.keys(b),...Object.keys(l),...Object.keys(r)]).filter(f=>!['immagine','thumb','dataAggiornamento'].includes(f));
  for(const field of fields){const orig=b[field],lv=l[field],rv=r[field],lc=!equal(lv,orig),rc=!equal(rv,orig);
   if(lc&&rc&&!equal(lv,rv)){push(id,'field',field,lv,rv,`#${id} · ${l.titolo||r.titolo} · ${field}`);combined[field]=rv;}
   else if(lc)combined[field]=lv;else combined[field]=rv;
  }
  // Le due immagini devono essere scelte insieme: vietati accoppiamenti misti.
  const bi=imagePair(b),li=imagePair(l),ri=imagePair(r),lc=!equal(li,bi),rc=!equal(ri,bi);
  let selected=ri;
  if(lc&&rc&&!equal(li,ri)){push(id,'image',null,li,ri,`#${id} · ${l.titolo||r.titolo} · immagine + miniatura`);}
  else if(lc)selected=li;
  combined.immagine=selected.immagine;combined.thumb=selected.thumb;
  // dataAggiornamento e' derivata dall'editor: evita falsi conflitti su campi diversi.
  const dates=[b.dataAggiornamento,l.dataAggiornamento,r.dataAggiornamento].filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v));
  if(dates.length)combined.dataAggiornamento=dates.sort().at(-1);
  else if('dataAggiornamento' in b||'dataAggiornamento' in l||'dataAggiornamento' in r)combined.dataAggiornamento=r.dataAggiornamento??l.dataAggiornamento??b.dataAggiornamento;
  merged.set(id,combined);
 }
 const common=base.map(p=>p.id).filter(id=>L.has(id)&&R.has(id)),cs=new Set(common);
 const lo=local.map(p=>p.id).filter(id=>cs.has(id)),ro=remote.map(p=>p.id).filter(id=>cs.has(id));
 const localMoved=!equal(common,lo),remoteMoved=!equal(common,ro);
 if(localMoved&&remoteMoved&&!equal(lo,ro))push(0,'order',null,lo,ro,'Ordine promozioni modificato in modo incompatibile');
 const defaultOrder=localMoved&&!remoteMoved?'local':'remote';
 return {base,local,remote,merged,conflicts,defaultOrder,localMoved,remoteMoved};
}
function resolve(p,choices={}){
 const merged=new Map(p.merged),unresolved=[];let order=p.defaultOrder;
 for(const c of p.conflicts){const choice=choices[c.key];if(!['local','remote'].includes(choice)){unresolved.push(c.key);continue;}
  if(c.type==='order'){order=choice;continue;}
  const v=choice==='local'?c.localValue:c.remoteValue;
  if(c.type==='field'){const obj={...merged.get(c.id)};if(v===undefined)delete obj[c.field];else obj[c.field]=v;merged.set(c.id,obj);}
  else if(c.type==='image'){const obj={...merged.get(c.id)};obj.immagine=v.immagine;obj.thumb=v.thumb;merged.set(c.id,obj);}
  else if(v===null)merged.delete(c.id);else merged.set(c.id,v);
 }
 if(unresolved.length)return {ok:false,unresolved};
 const preferred=(order==='local'?p.local:p.remote).map(x=>x.id);
 const secondary=(order==='local'?p.remote:p.local).map(x=>x.id);
 const ordered=uniq([...preferred,...secondary,...p.base.map(x=>x.id)]).filter(id=>merged.has(id));
 if(ordered.length!==merged.size)throw Error('Fusione interrotta: ordine promozioni incompleto.');
 return {ok:true,items:ordered.map(id=>merged.get(id)),order};
}
global.ARDMerge=Object.freeze({plan,resolve});
})(window);
