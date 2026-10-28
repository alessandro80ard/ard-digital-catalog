/* A.R.D. E2E isolated Mac/iPad sync trial: only one file on a dedicated branch.
 * No access to catalogo.json, no writes to main, no token persistence. */
'use strict';
const REPO='alessandro80ard/ard-digital-catalog';
const BRANCH='ard-sync-e2e-20261028';
const FILE='admin-mobile-sync-e2e/data/demo.json';
const API=`https://api.github.com/repos/${REPO}/contents/${FILE}`;
const DRAFT_KEY='ard.e2e.macipad.20261028.v1.draft';
const $=id=>document.getElementById(id);
const deep=x=>JSON.parse(JSON.stringify(x));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let st={base:null,baseSha:null,draft:null,remote:null,plan:null,choices:{},ready:null,busy:false,message:'',tone:'',lastError:null};
const apiHeaders={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
function encodeUTF8(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
function decodeUTF8(b64){const binary=atob(b64.replace(/\s/g,''));const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
function validate(doc){
 if(!doc||doc.schema!=='ard-sync-e2e-v1'||!Array.isArray(doc.promotions)||doc.promotions.length<1||doc.promotions.length>10)throw Error('File di prova non riconosciuto: schema o numero di promozioni errato.');
 const ids=new Set();for(const p of doc.promotions){if(!p||!Number.isInteger(p.id)||p.id<9900||p.id>=9910||ids.has(p.id)||typeof p.titolo!=='string'||typeof p.prezzo!=='string'||typeof p.note!=='string'||p.prezzo.length>200||p.note.length>1000)throw Error('Dati demo non validi: controllo interrotto.');ids.add(p.id);}
 return doc;
}
function setStatus(msg,tone=''){st.message=msg;st.tone=tone;const el=$('status');el.textContent=msg;el.className='state '+tone;}
function busy(isBusy){st.busy=isBusy;updateButtons();}
function dirty(){return Boolean(st.base&&st.draft&&!eq(st.base.promotions,st.draft.promotions));}
function saveDraft(){try{if(st.draft&&st.base&&dirty())localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,base:st.base,baseSha:st.baseSha,draft:st.draft,at:Date.now()}));else localStorage.removeItem(DRAFT_KEY);}catch(e){setStatus('Impossibile salvare la bozza nel browser: '+e.message,'error');}}
function restoreDraft(){try{const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return false;const d=JSON.parse(raw);if(d.version!==1||!d.baseSha||!validate(d.base)||!validate(d.draft))throw Error('Backup locale non valido');st.base=d.base;st.baseSha=d.baseSha;st.draft=d.draft;setStatus('Bozza locale recuperata: non è stata sovrascritta. Premi «Confronta con GitHub».','warn');return true;}catch(e){setStatus('Bozza locale non leggibile: non verrà eliminata automaticamente. '+e.message,'error');return false;}}
function clearMerge(){st.plan=null;st.choices={};st.ready=null;}
async function readRemote(){
 const url=API+'?ref='+encodeURIComponent(BRANCH)+'&ts='+Date.now();
 let response;
 try{response=await fetch(url,{headers:apiHeaders,cache:'no-store'});}catch(e){throw Error('GitHub non raggiungibile. Bozza conservata: '+e.message);}
 if(!response.ok){if(response.status===404)throw Error('Ramo o file di prova assente (404). Controlla di aver pubblicato il ramo '+BRANCH+' da GitHub Desktop.');if(response.status===403)throw Error('GitHub ha negato la lettura (403). Verifica i limiti API e la connessione.');throw Error('GitHub ha risposto '+response.status+'. Nessuna bozza eliminata.');}
 const object=await response.json();if(typeof object.sha!=='string'||!object.content)throw Error('Risposta GitHub incompleta.');
 let doc;try{doc=validate(JSON.parse(decodeUTF8(object.content)));}catch(e){throw Error('JSON remoto non valido: '+e.message);}
 return {sha:object.sha,doc};
}
async function load(){if(st.busy)return;busy(true);try{const r=await readRemote();st.remote=r;if(!st.draft){st.base=deep(r.doc);st.baseSha=r.sha;st.draft=deep(r.doc);setStatus('Collegamento GitHub di prova attivo. Dati caricati, nessuna modifica locale.','ok');}else if(dirty()){setStatus('Remoto aggiornato. La bozza locale è conservata: esegui il confronto.','warn');}else{st.base=deep(r.doc);st.baseSha=r.sha;st.draft=deep(r.doc);setStatus('Versione remota aggiornata, nessuna bozza da proteggere.','ok');}clearMerge();saveDraft();render();}catch(e){setStatus(e.message,'error');render();}finally{busy(false);}}
function previewPromo(p){return `<article class="promo"><div class="code">DEMO #${p.id} · ${esc(p.codice||'')}</div><h3>${esc(p.titolo)}</h3><label>Prezzo TEST<input data-id="${p.id}" data-field="prezzo" maxlength="200" value="${esc(p.prezzo)}" aria-label="Prezzo test ${p.id}"></label><label>Note TEST<textarea data-id="${p.id}" data-field="note" maxlength="1000" aria-label="Note test ${p.id}">${esc(p.note)}</textarea></label></article>`;}
function render(){
 $('cards').innerHTML=st.draft?st.draft.promotions.map(previewPromo).join(''):'<p class="muted">Nessun catalogo dimostrativo caricato.</p>';
 $('version').textContent=st.remote?`SHA file GitHub: ${st.remote.sha.slice(0,12)} · SHA file iniziale della bozza: ${st.baseSha?.slice(0,12)||'—'}`:'';
 renderComparison();updateButtons();
}
function updateButtons(){
 $('load').disabled=st.busy;
 $('discard').disabled=st.busy||!st.draft||!dirty();
 $('compare').disabled=st.busy||!st.base||!st.draft||!dirty();
 const choicesReady=st.plan&&st.plan.conflicts.every(c=>['local','remote'].includes(st.choices[c.key]));
 $('apply').disabled=st.busy||!choicesReady;
 $('publish').disabled=st.busy||!st.ready;
}
function changedSummary(base,which){const out=[];for(const p of which.promotions){const b=base.promotions.find(x=>x.id===p.id);if(!b){out.push(`#${p.id} nuova`);continue;}for(const field of Object.keys(p))if(!eq(p[field],b[field]))out.push(`#${p.id} ${field}`);}for(const p of base.promotions)if(!which.promotions.some(x=>x.id===p.id))out.push(`#${p.id} eliminata`);return out;}
function renderComparison(){
 const e=$('comparison');const r=$('result');r.innerHTML='';
 if(!st.plan){e.innerHTML='<p class="muted">Nessun confronto attivo. Le modifiche locali sono conservate fino a una pubblicazione completata e verificata.</p>';updateButtons();return;}
 const c=st.plan.conflicts;
 const locals=changedSummary(st.base,st.draft),remotes=changedSummary(st.base,st.remote.doc);
 let html=`<p class="small"><strong>Bozza locale:</strong> ${locals.length?locals.map(esc).join(' · '):'nessuna modifica'}<br><strong>GitHub rispetto alla partenza:</strong> ${remotes.length?remotes.map(esc).join(' · '):'nessuna modifica'}</p>`;
 html+=`<div class="banner ${c.length?'error':'ok'}"><strong>${c.length?'Conflitti rilevati: '+c.length:'Nessun conflitto — fusione possibile'}</strong><p>${c.length?'Seleziona esplicitamente quale versione mantenere per ogni conflitto.':'Le variazioni dei due dispositivi possono essere unite.'}</p></div>`;
 for(const x of c){const v=x.localValue===null?'(eliminata)':JSON.stringify(x.localValue);const rv=x.remoteValue===null?'(eliminata)':JSON.stringify(x.remoteValue);html+=`<div class="conflict"><strong>${esc(x.label)}</strong><div class="values"><div><b>Bozza su questo dispositivo</b><p>${esc(v)}</p></div><div><b>GitHub (altro dispositivo)</b><p>${esc(rv)}</p></div></div><label>Quale versione mantenere?<select data-choice="${esc(x.key)}"><option value="">Seleziona…</option><option value="local" ${st.choices[x.key]==='local'?'selected':''}>Questo dispositivo</option><option value="remote" ${st.choices[x.key]==='remote'?'selected':''}>GitHub (altro dispositivo)</option></select></label></div>`;}
 if(st.ready){html+='<div class="preview"><strong>Fusione preparata: pronta per pubblicare SOLO il JSON di prova.</strong>';
 for(const p of st.ready.doc.promotions)html+=`<dl><dt>#${p.id}</dt><dd>${esc(p.titolo)}</dd><dt>Prezzo</dt><dd>${esc(p.prezzo)}</dd><dt>Note</dt><dd>${esc(p.note)}</dd></dl>`;
 html+='</div>';
 }
 e.innerHTML=html;updateButtons();
}
async function compare(){if(st.busy||!dirty())return;busy(true);try{const remote=await readRemote();st.remote=remote;st.plan=ARDMerge.plan(st.base.promotions,st.draft.promotions,remote.doc.promotions);st.choices={};st.ready=null;setStatus(st.plan.conflicts.length?`Confronto completato: ${st.plan.conflicts.length} conflitto/i. Bozza preservata.`:'Confronto completato: nessun conflitto. Bozza preservata.',st.plan.conflicts.length?'warn':'ok');render();}catch(e){clearMerge();setStatus('Confronto non completato: '+e.message,'error');render();}finally{busy(false);}}
function prepareMerge(){if(!st.plan)return;const r=ARDMerge.resolve(st.plan,st.choices);if(!r.ok){setStatus('Non tutte le scelte sono state effettuate.','warn');return;}st.ready={doc:validate({...st.remote.doc,promotions:r.items}),sha:st.remote.sha};setStatus('Fusione preparata soltanto in memoria. Per pubblicare serve il token.','ok');renderComparison();}
async function publish(){
 if(st.busy||!st.ready)return;
 const token=$('token').value.trim();if(!token){setStatus('Inserisci il token GitHub per pubblicare nel ramo di prova.','warn');return;}
 if(!confirm(`PUBBLICAZIONE DI PROVA: vuoi aggiornare SOLO ${FILE} sul ramo ${BRANCH}? Nessun altro file verrà modificato.`))return;
 busy(true);const requested=st.ready;try{
  const content=encodeUTF8(JSON.stringify(requested.doc,null,2)+'\n');
  const response=await fetch(API,{method:'PUT',cache:'no-store',headers:{...apiHeaders,'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:'E2E Mac-iPad demo: aggiornamento dati fittizi',content,sha:requested.sha,branch:BRANCH})});
  $('token').value='';
  if(!response.ok){if([409,422].includes(response.status))throw Error('Concorrenza GitHub (409/422): il file potrebbe essere cambiato. La bozza resta. Esegui nuovamente «Confronta».');if([401,403].includes(response.status))throw Error('Token non autorizzato (401/403). Verifica scadenza e permesso Contents read/write. La bozza resta.');throw Error('Pubblicazione non riuscita: HTTP '+response.status+'. Bozza preservata.');}
  const uploaded=await response.json();if(!uploaded.content?.sha)throw Error('Risposta di pubblicazione incompleta: verifica manualmente su GitHub. La bozza resta.');
  // Verify using GitHub after write. No draft is discarded until a read-back succeeds.
  const after=await readRemote();
  if(after.sha!==uploaded.content.sha||!eq(after.doc,requested.doc))throw Error('Scrittura GitHub effettuata, ma verifica successiva non coerente. Conserva la bozza e controlla prima di riprovare.');
  st.remote=after;st.base=deep(after.doc);st.draft=deep(after.doc);st.baseSha=after.sha;clearMerge();saveDraft();setStatus('Pubblicazione sul ramo TEST completata e verificata su GitHub. Nessun file commerciale modificato.','ok');render();
  $('result').innerHTML='<div class="banner ok"><strong>✓ Pubblicazione TEST verificata</strong><p>Apri l’altro dispositivo: «Carica / verifica GitHub» per vedere i dati sincronizzati.</p></div>';
 }catch(e){st.ready=null;setStatus(e.message,'error');render();}finally{$('token').value='';busy(false);}
}
function discard(){if(!dirty())return;if(!confirm('Scartare SOLO le modifiche di prova su questo dispositivo? Il catalogo commerciale non è coinvolto.'))return;if(!st.remote){setStatus('Prima verifica lo stato remoto.','warn');return;}st.base=deep(st.remote.doc);st.baseSha=st.remote.sha;st.draft=deep(st.remote.doc);clearMerge();saveDraft();setStatus('Bozza di prova scartata. Caricata la versione GitHub nota.','ok');render();}
$('cards').addEventListener('input',e=>{
 const f=e.target.dataset.field;const id=Number(e.target.dataset.id);if(!['prezzo','note'].includes(f)||!id||!st.draft)return;
 const p=st.draft.promotions.find(x=>x.id===id);if(!p)return;p[f]=e.target.value;clearMerge();saveDraft();setStatus('Modifica salvata SOLO in questo browser. Per sincronizzare usa «Confronta con GitHub».','warn');updateButtons();
});
$('cards').addEventListener('change',()=>render());
$('comparison').addEventListener('change',e=>{if(e.target.matches('[data-choice]')){st.choices[e.target.dataset.choice]=e.target.value;st.ready=null;renderComparison();}});
$('load').addEventListener('click',load);
$('compare').addEventListener('click',compare);
$('apply').addEventListener('click',prepareMerge);
$('publish').addEventListener('click',publish);
$('discard').addEventListener('click',discard);
restoreDraft();render();load();
