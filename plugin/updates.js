'use strict';
const REPO='eguiajosue/halftone-dtf-ps';
const API=`https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES=`https://github.com/${REPO}/releases`;
const INTERVAL=8*60*60*1000;
function parts(version){
  if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Versión de actualización inválida.');
  const p=version.split('.').map(Number);if(!p.every(Number.isSafeInteger))throw Error('Versión fuera de rango.');return p;
}
function compare(a,b){const x=parts(a),y=parts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
function asset(release,name){
  const matches=(release.assets||[]).filter(a=>a.name===name);
  if(matches.length!==1)throw Error('El release no contiene un instalador completo.');
  const a=matches[0],expected=`https://github.com/${REPO}/releases/download/${release.tag_name}/${name}`;
  if(a.browser_download_url!==expected||!Number.isSafeInteger(a.size)||a.size<=0)throw Error('Origen del archivo no permitido.');return a;
}
function validateRelease(release,meta,installed,photoshop){
  if(release.draft||release.prerelease)return null;
  if(meta.schema!=='halftone-update-v1'||meta.channel!=='independent'||meta.pluginId!==installed.id)throw Error('Canal de actualización incompatible.');
  parts(meta.version);parts(meta.minPhotoshop);
  if(release.tag_name!==`v${meta.version}`||meta.packaging!=='adobe-udt'||meta.nativeValidated!==true)throw Error('El instalador no está validado para distribución.');
  if(meta.ccx?.name!==`Halftone-DTF-${meta.version}.ccx`||!/^[a-f0-9]{64}$/.test(meta.ccx.sha256)||!Number.isSafeInteger(meta.ccx.size)||meta.ccx.size<=0||meta.ccx.size>50*1024*1024)throw Error('Metadatos del instalador inválidos.');
  const ccx=asset(release,meta.ccx.name);if(ccx.size!==meta.ccx.size)throw Error('Tamaño del instalador inconsistente.');
  if(compare(meta.version,installed.version)<=0)return null;
  const host=(String(photoshop).match(/^\d+\.\d+(?:\.\d+)?/)||[])[0];
  if(!host)throw Error('No se pudo comprobar la versión de Photoshop.');
  return {version:meta.version,compatible:compare(host.split('.').length===2?host+'.0':host,meta.minPhotoshop)>=0,minPhotoshop:meta.minPhotoshop,url:`${RELEASES}/tag/v${meta.version}`,ccx};
}
function createChecker({fetchImpl,installed,photoshop,clock=Date.now,read=()=>null,write=()=>{},timeoutMs=8000}){
  let pending=null;
  function request(url){
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    let timer;
    return Promise.race([
      Promise.resolve().then(()=>fetchImpl(url,{credentials:'omit',headers:{Accept:'application/vnd.github+json'},...(controller?{signal:controller.signal}:{})})).then(async r=>{
        if(r.status===404&&url===API)return null;
        if(!r.ok)throw Error(r.status===403||r.status===429?'GitHub limitó las consultas. Intenta más tarde.':`No se pudo consultar la actualización (HTTP ${r.status}).`);
        return r.json();
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>{if(controller)controller.abort();reject(Error('La consulta de actualizaciones tardó demasiado.'));},timeoutMs);})
    ]).finally(()=>clearTimeout(timer));
  }
  return {check(force=false){
    if(pending)return pending;
    const now=clock();let last=0;try{last=Number(read('halftone-update-check-v1'))||0;}catch(_){}
    if(!force&&last>0&&now>=last&&now-last<INTERVAL)return Promise.resolve({skipped:true});
    pending=(async()=>{
      const release=await request(API);let update=null;
      if(release&&!release.draft&&!release.prerelease){
        const a=asset(release,'halftone-update.json');
        if(a.size>16384)throw Error('Metadatos de actualización demasiado grandes.');
        const meta=await request(a.browser_download_url);update=validateRelease(release,meta,installed,photoshop);
      }
      try{write('halftone-update-check-v1',String(now));}catch(_){}
      return {update,empty:!release};
    })().finally(()=>{pending=null;});return pending;
  }};
}
module.exports={REPO,API,RELEASES,INTERVAL,parts,compare,asset,validateRelease,createChecker};
