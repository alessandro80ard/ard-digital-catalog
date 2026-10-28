// A.R.D. Three-way merge: pure logic, no network or storage access.
// base=versione di partenza; local=bozza iPad; remote=versione GitHub corrente.
(function(global){'use strict';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const byId=items=>new Map(items.map(p=>[p.id,p]));
const uniq=a=>[...new Set(a)];
function plan(base,local,remote){
 const B=byId(base),L=byId(local),R=byId(remote),keys=uniq([...B.keys(),...L.keys(),...R.keys()]);
 const conflicts=[], merged=new Map();
 const push=(id,type,field,localValue,remoteValue,label)=>conflicts.push({key:type+':'+id+(field?':'+field:''),id,type,field:field||null,label,localValue,remoteValue});
 for(const id of keys){const b=B.get(id),l=L.get(id),r=R.get(id);
  if(!b){if(l&&r){if(equal(l,r))merged.set(id,r);else push(id,'new',null,l,r,`#${id} · Nuova promozione presente in entrambe le versioni`);}else merged.set(id,l||r);continue;}
  if(!l&&!r)continue;
  if(!l||!r){const remaining=l||r;
   if(equal(remaining,b))continue; // solo l'altra parte l'ha eliminata
   push(id,'delete',null,l||null,r||null,`#${id} · Eliminazione contro modifica`);continue;
  }
  const combined={};const fields=uniq([...Object.keys(b),...Object.keys(l),...Object.keys(r)]);
  for(const field of fields){const orig=b[field],lv=l[field],rv=r[field],lc=!equal(lv,orig),rc=!equal(rv,orig);
   if(lc&&rc&&!equal(lv,rv)){push(id,'field',field,lv,rv,`#${id} · ${l.titolo||r.titolo} · ${field}`);combined[field]=rv;}
   else if(lc)combined[field]=lv;
   else combined[field]=rv;
  }
  merged.set(id,combined);
 }
 // Confronta l'ordine fra ID comuni alla base e presenti in entrambe le versioni.
 const common=base.map(p=>p.id).filter(id=>L.has(id)&&R.has(id));const cset=new Set(common);
 const ordA=local.map(p=>p.id).filter(id=>cset.has(id));const ordB=remote.map(p=>p.id).filter(id=>cset.has(id));
 const locMoved=!equal(common,ordA),remMoved=!equal(common,ordB);
 if(locMoved&&remMoved&&!equal(ordA,ordB))push(0,'order',null,ordA,ordB,'Ordine delle promozioni cambiato su entrambi i dispositivi');
 const defaultOrder=locMoved&&!remMoved?'local':'remote';
 return {base,local,remote,merged,conflicts,defaultOrder,localMoved:locMoved,remoteMoved:remMoved};
}
function resolve(p,choices={}){
 const merged=new Map(p.merged),unresolved=[];let order=p.defaultOrder;
 for(const conflict of p.conflicts){const choice=choices[conflict.key];if(choice!=='local'&&choice!=='remote'){unresolved.push(conflict.key);continue;}
  if(conflict.type==='order'){order=choice;continue;}
  const v=choice==='local'?conflict.localValue:conflict.remoteValue;
  if(conflict.type==='field'){const obj={...merged.get(conflict.id)};if(v===undefined)delete obj[conflict.field];else obj[conflict.field]=v;merged.set(conflict.id,obj);}
  else if(v===null)merged.delete(conflict.id);
  else merged.set(conflict.id,v);
 }
 if(unresolved.length)return {ok:false,unresolved};
 const preferred=(order==='local'?p.local:p.remote).map(x=>x.id);
 const secondary=(order==='local'?p.remote:p.local).map(x=>x.id);
 const ordered=uniq([...preferred,...secondary,...p.base.map(x=>x.id)]).filter(id=>merged.has(id));
 const items=ordered.map(id=>merged.get(id));
 if(items.length!==merged.size)throw new Error('Confronto interrotto: ID non coperti dall’ordinamento.');
 return {ok:true,items,order};
}
global.ARDMerge=Object.freeze({plan,resolve});
})(window);
