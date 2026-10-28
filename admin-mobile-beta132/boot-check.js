(function(){
 const el=document.getElementById('bootStatus');
 function warn(message){el.hidden=false;el.textContent=message;el.classList.add('boot-error');}
 window.addEventListener('error',function(ev){if(ev.filename&&ev.filename.includes('/admin-mobile-beta132/'))warn('Errore JavaScript nella BETA 1.3.2: '+ev.message+'. La versione 1.2 non è stata modificata.');});
 window.addEventListener('unhandledrejection',function(ev){warn('Errore imprevisto della BETA 1.3.2: '+String(ev.reason?.message||ev.reason||'errore sconosciuto'));});
 setTimeout(function(){if(!window.__ARD_BETA132_STARTED)warn('La BETA 1.3.2 non si è avviata correttamente. Controlla il caricamento dei file. La BETA 1.2 resta intatta.');},9500);
})();
