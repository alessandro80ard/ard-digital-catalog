"use strict";
// A.R.D. Catalog Builder · DIAGNOSTICA v1.3.1
// Sola lettura. Non sono presenti richieste POST, PATCH, PUT o DELETE.
// Nessun service worker e nessun accesso a localStorage / IndexedDB.
const REPO="alessandro80ard/ard-digital-catalog";
const API="https://api.github.com/repos/"+REPO;
const PUBLIC="https://promo.autoricambidese.it/";
const $=id=>document.getElementById(id);
const diagnostics=[];
let catalog=null; // null = non caricato, [] = catalogo GitHub realmente vuoto (anomalia)
let head=null;
let lastError=null;
let lastAttempt=null;
let lastSuccess=null;
let refreshBusy=false;
function log(message){const time=new Date().toLocaleTimeString('it-IT');const line=`[${time}] ${message}`; diagnostics.push(line);if(diagnostics.length>150)diagnostics.shift();$('log').textContent=diagnostics.join('\n');}
function message(text,kind='normal'){$('details').replaceChildren();const p=document.createElement('p');p.textContent=text;if(kind==='error')p.className='failure';$('details').append(p);}
function status(text,kind='waiting'){$('pill').textContent=text;$('pill').className='pill '+kind;}
function safePath(path){return typeof path==='string'&&/^assets\/(?:img|thumbs)\/[^\\/]+$/u.test(path)&&!path.includes('..')&&!/[\x00-\x1F]/.test(path);}
function imgURL(path){return safePath(path)?PUBLIC+path.split('/').map(encodeURIComponent).join('/')+(head?'?rev='+encodeURIComponent(head.slice(0,12)):''):null;}
function verifyPromotions(items){
 if(!Array.isArray(items))throw new Error('Il catalogo remoto non è un array JSON.');
 if(items.length===0)throw new Error('Il catalogo remoto contiene ZERO promozioni: visualizzazione bloccata per sicurezza.');
 if(items.length>3000)throw new Error('Il numero di promozioni supera il limite di sicurezza.');
 const ids=new Set();
 for(const [n,p] of items.entries()){
  if(!p||!Number.isSafeInteger(p.id)||ids.has(p.id)||typeof p.titolo!=='string'||!p.titolo.trim()||!safePath(p.immagine)||!safePath(p.thumb)){
    throw new Error('Dati incoerenti nella promozione n. '+(n+1)+'. Controlla ID, titolo e percorsi delle immagini.');
  }
  ids.add(p.id);
 }
 return items;
}
function decodeBase64(content){if(typeof content!=='string')throw new Error('GitHub non ha restituito il contenuto del file.');const raw=atob(content.replace(/\s/g,''));const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
function embeddedCatalog(html){
 const marker=/\blet\s+CATALOGO\s*=\s*/.exec(html);
 if(!marker)throw new Error('La pagina index.html non contiene il catalogo incorporato atteso.');
 let from=html.indexOf('[',marker.index+marker[0].length);
 if(from<0)throw new Error('Non trovo la lista del catalogo in index.html.');
 let depth=0,quote=false,escape=false;
 for(let i=from;i<html.length;i++){
  const c=html[i];
  if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c==='"')quote=false;continue;}
  if(c==='"'){quote=true;continue;}
  if(c==='[')depth++;
  if(c===']'){
   depth--;
   if(depth===0){return JSON.parse(html.slice(from,i+1));}
  }
 }
 throw new Error('Non riesco a leggere il JSON incorporato in index.html.');
}
async function github(path){
 const response=await fetch(API+path,{headers:{'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},cache:'no-store',credentials:'omit'});
 if(!response.ok){let suffix='';if(response.status===403)suffix=' (limite pubblico GitHub: riprova più tardi)';if(response.status===404)suffix=' (file assente o percorso errato)';throw new Error('GitHub HTTP '+response.status+' per '+path+suffix);}
 return response.json();
}
function addText(parent,tag,text,cls){const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;parent.append(node);return node;}
function render(){
 const cards=$('cards');cards.replaceChildren();
 if(catalog===null){addText(cards,'p','Nessuna promozione caricata in questa sessione. Il catalogo ONLINE non viene modificato.','empty');$('count').textContent='—';$('search').disabled=true;$('checkImages').disabled=true;return;}
 $('count').textContent=String(catalog.length);$('search').disabled=false;$('checkImages').disabled=false;
 const q=$('search').value.trim().toLocaleLowerCase('it');
 const filtered=catalog.filter(p=>[p.titolo,p.marca,p.codice,p.applicazione,p.keywords].join(' ').toLocaleLowerCase('it').includes(q));
 if(!filtered.length){addText(cards,'p',`Nessun risultato per «${$('search').value}». Le ${catalog.length} promozioni sono comunque caricate.`,'empty');return;}
 const fragment=document.createDocumentFragment();
 for(const p of filtered){
  const item=document.createElement('article');item.className='card';
  const pic=document.createElement('img');pic.loading='lazy';pic.alt='Immagine di '+p.titolo;pic.src=imgURL(p.thumb)||'./icons/icon-192.png';item.append(pic);
  const inner=document.createElement('div');inner.className='cardbody';
  addText(inner,'p',`#${p.id} · ${p.titolo}`,'card-title');
  addText(inner,'p',(p.marca||'')+' · '+(p.codice||''),'cardmeta');
  addText(inner,'p',p.categoria||'Categoria non indicata','cardmeta');
  addText(inner,'span',p.attiva?'Attiva':'Archiviata','tag'+(p.attiva?' on':''));item.append(inner);fragment.append(item);
 }
 cards.append(fragment);
}
async function reload(){
 if(refreshBusy)return;refreshBusy=true;$('reload').disabled=true;lastAttempt=new Date().toISOString();lastError=null;status('Caricamento…');message('Leggo l’ultimo commit e verifico sia catalogo.json sia index.html…');log('Avvio lettura GitHub: '+REPO);
 try{
  const ref=await github('/git/ref/heads/main');
  const sha=ref?.object?.sha;
  if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('GitHub ha restituito un riferimento di commit non valido.');
  log('Commit di riferimento: '+sha.slice(0,12));
  const [remoteJson,remoteHtml]=await Promise.all([
   github('/contents/data/catalogo.json?ref='+encodeURIComponent(sha)),
   github('/contents/index.html?ref='+encodeURIComponent(sha))
  ]);
  const data=verifyPromotions(JSON.parse(decodeBase64(remoteJson.content)));
  const inHTML=verifyPromotions(embeddedCatalog(decodeBase64(remoteHtml.content)));
  if(JSON.stringify(data)!==JSON.stringify(inHTML))throw new Error('catalogo.json e index.html non contengono gli stessi dati.');
  const newer=await github('/git/ref/heads/main');
  if(newer?.object?.sha!==sha)throw new Error('GitHub è stato aggiornato durante il controllo: premi nuovamente Verifica.');
  catalog=data;head=sha;lastSuccess=new Date().toISOString();$('search').value='';$('imageResults').replaceChildren();
  status(data.length+' promozioni','ok');message('Verifica riuscita: '+data.length+' promozioni caricate, ID univoci e JSON coerente con index.html. Commit '+sha.slice(0,12)+'.');
  log('OK: '+data.length+' promozioni; HTML e JSON identici; nessuna scrittura.');render();
 }catch(err){
  lastError=err instanceof Error?err.message:String(err);
  status(catalog?'Ultimi dati mantenuti':'Errore lettura','bad');
  message('Impossibile completare il controllo: '+lastError+(catalog?'\nMantengo le promozioni già caricate nella memoria di questa sessione.':'\nIl catalogo online non è stato modificato.'),'error');
  log('ERRORE: '+lastError);
  // Mai sostituire una lista valida con una vuota dopo un errore di rete.
  render();
 }finally{refreshBusy=false;$('reload').disabled=false;}
}
function imageTest(imageUrl,timeoutMs=9000){return new Promise(resolve=>{
 if(!imageUrl)return resolve(false);
 const image=new Image();let settled=false;
 const done=ok=>{if(settled)return;settled=true;clearTimeout(tid);image.onload=null;image.onerror=null;resolve(ok);};
 const tid=setTimeout(()=>done(false),timeoutMs);image.onload=()=>done(true);image.onerror=()=>done(false);image.src=imageUrl;
 });}
async function checkImages(){
 if(!catalog||!head)return;
 $('checkImages').disabled=true;$('imageResults').replaceChildren();
 const chosen=[catalog.find(p=>p.id===32),...catalog.filter(p=>p.id!==32).slice(0,3)].filter(Boolean);
 let ok=0;
 for(const p of chosen){
  const worked=await imageTest(imgURL(p.immagine));if(worked)ok++;
  const el=addText($('imageResults'),'p',(worked?'✓ ':'✕ ')+`#${p.id} — ${p.titolo}: `+(worked?'immagine raggiungibile':'immagine non caricata'),' '+(worked?'good':'badtext'));
 }
 log('Immagini verificate: '+ok+'/'+chosen.length);
 $('checkImages').disabled=false;
}
function exportDiagnostic(){
 const lines=["A.R.D. Catalog Builder Diagnostica 1.3.1","Modalità: sola lettura / nessuna scrittura su GitHub","Repository: "+REPO,"Ultimo tentativo: "+(lastAttempt||'n/d'),"Ultima verifica riuscita: "+(lastSuccess||'n/d'),"Commit: "+(head||'n/d'),"Promozioni caricate: "+(catalog===null?'non caricate':catalog.length),"Ultimo errore: "+(lastError||'nessuno'),"Ambiente: "+navigator.userAgent,"---- EVENTI ----",...diagnostics];
 const blob=new Blob([lines.join('\n')+'\n'],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ARD_diagnostica_catalogo_'+new Date().toISOString().slice(0,10)+'.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
$('reload').addEventListener('click',reload);
$('export').addEventListener('click',exportDiagnostic);
$('search').addEventListener('input',render);
$('checkImages').addEventListener('click',checkImages);
log('Diagnostica 1.3.1 avviata. Nessun service worker installato, nessuna modifica a dati remoti o locali.');
reload();
