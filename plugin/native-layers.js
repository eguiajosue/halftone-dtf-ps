'use strict';
/* Native structure of the live working document, as in DTPrep:
 *   [Arte DTF]        pixel layer, RGB written once, halftone in its user mask
 *   [Color de prenda] solid color fill layer below it, used by the garment view
 * Slider moves only rewrite the 1-channel mask; views toggle visibility.
 * Must run inside core.executeAsModal. */
function createNativeLayers({action,imaging,constants}){
  const play=async descriptors=>{
    const result=await action.batchPlay(descriptors,{});
    for(const r of result||[])if(r&&r._obj==='error')throw Error(r.message||'Photoshop rechazó la operación de capas.');
    return result;
  };
  const layerRef=(documentID,layerID)=>[{_ref:'layer',_id:layerID},{_ref:'document',_id:documentID}];
  const rgbColor=([r,g,b])=>({_obj:'RGBColor',red:r,grain:g,blue:b});
  const findLayer=(doc,id)=>Array.from(doc.layers).find(l=>l.id===id);
  const available=()=>!!(action&&action.batchPlay&&imaging&&imaging.putLayerMask);
  async function select(documentID,layerID){await play([{_obj:'select',_target:layerRef(documentID,layerID),makeVisible:false}]);}
  async function addMask(documentID,layerID){
    await select(documentID,layerID);
    await play([{_obj:'make',new:{_class:'channel'},at:{_ref:'channel',_enum:'channel',_value:'mask'},using:{_enum:'userMaskEnabled',_value:'revealAll'}}]);
  }
  async function putMask(documentID,layerID,mask,width,height){
    let im;
    try{
      im=await imaging.createImageDataFromBuffer(mask,{width,height,components:1,chunky:true,colorSpace:'Grayscale',colorProfile:'Gray Gamma 2.2'});
      await imaging.putLayerMask({documentID,layerID,imageData:im,replace:true,targetBounds:{left:0,top:0}});
    }finally{if(im)im.dispose();}
  }
  async function setMaskEnabled(documentID,layerID,enabled){
    await play([{_obj:'set',_target:layerRef(documentID,layerID),to:{_obj:'layer',userMaskEnabled:enabled}}]);
  }
  async function deleteMask(documentID,layerID){
    await select(documentID,layerID);
    await play([{_obj:'delete',_target:[{_ref:'channel',_enum:'channel',_value:'mask'}]}]);
  }
  // Returns the new fill layer, placed directly below the art layer.
  async function createFill(doc,artLayerID,rgb){
    const before=new Set(Array.from(doc.layers).map(l=>l.id));
    await select(doc.id,artLayerID);
    await play([{_obj:'make',_target:[{_ref:'contentLayer'}],using:{_obj:'contentLayer',name:'Color de prenda · vista (no se exporta)',type:{_obj:'solidColorLayer',color:rgbColor(rgb)}}}]);
    const fill=Array.from(doc.layers).find(l=>!before.has(l.id));
    if(!fill)throw Error('Photoshop no creó la capa de color de prenda.');
    const art=findLayer(doc,artLayerID);
    await fill.move(art,constants.ElementPlacement.PLACEAFTER);
    await select(doc.id,artLayerID);
    return fill;
  }
  async function setFillColor(documentID,fillID,artLayerID,rgb){
    await select(documentID,fillID);
    await play([{_obj:'set',_target:[{_ref:'contentLayer',_enum:'ordinal',_value:'targetEnum'}],to:{_obj:'solidColorLayer',color:rgbColor(rgb)}}]);
    await select(documentID,artLayerID);
  }
  return {available,addMask,putMask,setMaskEnabled,deleteMask,createFill,setFillColor,findLayer};
}
module.exports={createNativeLayers};
