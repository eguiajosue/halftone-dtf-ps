'use strict';
function folder(name='destino',faults={}){
 const entries=new Map();return {name,isFolder:true,nativePath:'/test/'+name,entries,
  getEntries:async()=>Array.from(entries.values()),getEntry:async n=>{if(!entries.has(n))throw Error('missing '+n);return entries.get(n);},
  createFolder:async n=>{if(entries.has(n))throw Error('exists');const child=folder(n,faults);const remove=child.delete;child.delete=async()=>{await remove();entries.delete(n);};entries.set(n,child);return child;},
  createFile:async(n,{overwrite}={})=>{if(entries.has(n)&&!overwrite)throw Error('exists');const f={name:n,isFile:true,data:'',
   read:async()=>f.data,getMetadata:async()=>({size:typeof f.data==='string'?Buffer.byteLength(f.data):f.data.byteLength,dateModified:new Date('2026-10-09T00:00:00Z')}),
   write:async data=>{if(faults.write?.(n,data))throw Error('write failure '+n);f.data=data instanceof ArrayBuffer?data.slice(0):data;},delete:async()=>entries.delete(n)};entries.set(n,f);return f;},
  delete:async()=>{entries.clear();}
 };
}
module.exports={folder};
