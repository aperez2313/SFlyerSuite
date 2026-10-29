import * as pdfjs from '../vendor/pdf.mjs';
import {extractOffers} from './regions.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.mjs',import.meta.url).href;

// Only getPage(1) is ever called. The whole file is local; no PDF URL is fetched.
export async function readPageOne(file){
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});
 const doc=await task.promise;
 try{
  const page=await doc.getPage(1),viewport=page.getViewport({scale:1});
  const scale=Math.min(2.5,Math.sqrt(14000000/(viewport.width*viewport.height)));
  const canvas=document.createElement('canvas'),vp=page.getViewport({scale});canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
  const text=await page.getTextContent();
  const items=text.items.filter(i=>i.str?.trim()).map(i=>{
   const tx=pdfjs.Util.transform(viewport.transform,i.transform),h=Math.hypot(tx[2],tx[3]);
   return {text:i.str,x:tx[4],y:tx[5]-h*.85,w:i.width,h,baseline:tx[5]};
  });
  const offers=extractOffers(items,viewport.width,viewport.height);
  return {loaded:true,readable:items.length>=20&&offers.length>0,offers,items,canvas,width:viewport.width,height:viewport.height,scale,pages:doc.numPages,name:file.name,text:items.map(i=>i.text).join(' ')};
 }finally{await doc.destroy();}
}

export function crop(page,box){
 const c=document.createElement('canvas');const [x,y,w,h]=box;
 c.width=Math.max(1,Math.ceil(w*page.scale));c.height=Math.max(1,Math.ceil(h*page.scale));
 c.getContext('2d').drawImage(page.canvas,x*page.scale,y*page.scale,w*page.scale,h*page.scale,0,0,c.width,c.height);
 return c.toDataURL('image/png');
}
