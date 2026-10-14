'use strict';
// Loaded first. Any script error or unhandled rejection is written to the red
// banner so a failure never looks like "nothing happens".
(function(){
  function show(text){
    try{
      const banner=document.getElementById('errorBanner');
      if(banner&&!banner.textContent)banner.textContent=text;
      const status=document.getElementById('status');if(status)status.textContent=text;
    }catch(_){}
  }
  try{
    if(typeof window!=='undefined'&&window.addEventListener){
      window.addEventListener('error',event=>{
        const file=event&&event.filename?String(event.filename).split('/').pop():'',line=event&&event.lineno?':'+event.lineno:'';
        show('Error: '+((event&&event.message)||'desconocido')+(file?' ('+file+line+')':''));
      });
      window.addEventListener('unhandledrejection',event=>{
        const reason=event&&event.reason;show('Error: '+((reason&&reason.message)||reason||'operación rechazada'));
      });
    }
  }catch(_){}
})();
