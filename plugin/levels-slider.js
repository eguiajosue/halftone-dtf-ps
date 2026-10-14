'use strict';
/* Multi-handle Levels slider, as in Photoshop Levels and DTPrep: one track
 * with black / midtone / white handles (input) or black / white (output).
 * The midtone handle sits between black and white at 0.5^gamma, so a gamma of
 * 2 is drawn at a quarter of the range, like Photoshop. Plain elements and
 * pointer/mouse events only, so it runs in UXP without Spectrum. */
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function midPosition(black,white,gamma){return black+(white-black)*Math.pow(.5,gamma);}
function gammaAt(black,white,position){
  const p=clamp((position-black)/Math.max(1,white-black),.001,.999);
  return Math.round(clamp(Math.log(p)/Math.log(.5),.1,9.99)*100)/100;
}
// Moves one handle to a 0–255 position and returns the new values. Input
// black stays below white (gap 1); output may meet (gap 0). Moving black or
// white keeps gamma, so the midtone handle follows, as in Photoshop.
function moveHandle(values,handle,position,gap=1){
  const v={...values};position=Math.round(clamp(position,0,255));
  if(handle==='black')v.black=Math.min(position,v.white-gap);
  else if(handle==='white')v.white=Math.max(position,v.black+gap);
  else if(handle==='mid')v.mid=gammaAt(v.black,v.white,position);
  v.black=clamp(v.black,0,255-gap);v.white=clamp(v.white,gap,255);
  return v;
}
function handlePositions(values){
  const out={black:values.black,white:values.white};
  if(values.mid!=null)out.mid=midPosition(values.black,values.white,values.mid);
  return out;
}
function nearestHandle(values,position){
  const positions=handlePositions(values);let best=null,distance=Infinity;
  for(const [handle,at]of Object.entries(positions)){const d=Math.abs(at-position);if(d<distance||(d===distance&&handle==='mid')){best=handle;distance=d;}}
  return best;
}
const KEY_STEP={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-10,PageUp:10};
function createLevelsSlider({track,handles,get,set,doc,gap=1}){
  let dragging=null;
  const render=()=>{
    const positions=handlePositions(get());
    for(const [handle,element]of Object.entries(handles)){
      if(!Number.isFinite(positions[handle]))continue;  // a value being typed
      element.style.left=(positions[handle]/255*100)+'%';
      if(element.setAttribute){
        const v=get();element.setAttribute('aria-valuenow',String(handle==='mid'?v.mid:v[handle]));
      }
    }
  };
  const positionOf=event=>{
    const rect=track.getBoundingClientRect?track.getBoundingClientRect():null;
    if(!rect||!rect.width)return null;
    return (event.clientX-rect.left)/rect.width*255;
  };
  const apply=(handle,position)=>{if(position==null)return;const next=moveHandle(get(),handle,position,gap);set(next,handle);render();};
  const move=event=>{if(dragging){apply(dragging,positionOf(event));if(event.preventDefault)event.preventDefault();}};
  const end=()=>{dragging=null;};
  const start=event=>{
    if(track.disabled||(event.button!=null&&event.button!==0))return;
    const position=positionOf(event);if(position==null)return;
    const target=Object.entries(handles).find(([,el])=>el===event.target);
    dragging=target?target[0]:nearestHandle(get(),position);
    if(event.pointerId!=null&&track.setPointerCapture){try{track.setPointerCapture(event.pointerId);}catch(_){}}
    apply(dragging,position);if(event.preventDefault)event.preventDefault();
  };
  const pointer=typeof PointerEvent!=='undefined';
  const surface=doc&&doc.addEventListener?doc:track;
  track.addEventListener(pointer?'pointerdown':'mousedown',start);
  surface.addEventListener(pointer?'pointermove':'mousemove',move);
  surface.addEventListener(pointer?'pointerup':'mouseup',end);
  if(pointer)surface.addEventListener('pointercancel',end);
  for(const [handle,element]of Object.entries(handles))element.addEventListener('keydown',event=>{
    const step=KEY_STEP[event.key];if(!step)return;
    const v=get(),positions=handlePositions(v);
    if(handle==='mid'){const next={...v,mid:Math.round(clamp(v.mid-step*.05,.1,9.99)*100)/100};set(next,handle);}
    else apply(handle,positions[handle]+step);
    render();if(event.preventDefault)event.preventDefault();
  });
  render();
  return {render};
}
module.exports={createLevelsSlider,moveHandle,midPosition,gammaAt,handlePositions,nearestHandle};
