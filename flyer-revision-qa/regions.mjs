import {clean} from './core.mjs';

// Conservative price-led segmentation for live-text newspaper flyers. All
// coordinates are page points. Different/uncertain layouts remain reviewable.
export function extractOffers(items,width,height){
 const seeds=items.filter(i=>i.y>height*.15&&((/^\d+$/.test(i.text.trim())&&i.h>=28)||(/^BOGO$/i.test(i.text.trim())&&i.h>=20)));
 const groups=[];
 for(const seed of seeds.sort((a,b)=>a.y-b.y||a.x-b.x)){
  let g=groups.find(g=>Math.abs(g.y-seed.y)<20&&Math.abs(g.x-seed.x)<95);
  if(g){g.x=Math.min(g.x,seed.x);g.y=Math.min(g.y,seed.y);g.seeds.push(seed);}else groups.push({x:seed.x,y:seed.y,seeds:[seed]});
 }
 for(const g of groups){
  const pieces=items.filter(i=>i.h>=18&&/^[\d/¢$.\s]+$|^BOGO$/i.test(i.text.trim())&&Math.abs(i.y-g.y)<22&&i.x>=g.x-40&&i.x<g.x+110);
  g.pieces=pieces.sort((a,b)=>a.x-b.x);g.x=Math.min(g.x,...pieces.map(i=>i.x));
 }
 const columns=[];
 for(const g of groups.sort((a,b)=>a.x-b.x)){let c=columns.find(c=>Math.abs(c.x-g.x)<20);if(c)c.groups.push(g);else columns.push({x:g.x,groups:[g]});}
 const offers=[];
 for(let ci=0;ci<columns.length;ci++){
  const col=columns[ci];col.groups.sort((a,b)=>a.y-b.y);
  for(let ri=0;ri<col.groups.length;ri++){
   const g=col.groups[ri],left=Math.max(0,col.x-9),right=ci+1<columns.length?columns[ci+1].x-9:width-10;
   const top=Math.max(0,g.y-5),bottom=ri+1<col.groups.length?col.groups[ri+1].y-5:height-14;
   const inside=items.filter(i=>i.x>=left&&i.x<right&&i.y>=top&&i.y<bottom);
   const ordered=inside.filter(i=>!g.pieces.includes(i)).sort((a,b)=>Math.abs(a.y-b.y)<3?a.x-b.x:a.y-b.y);
   const text=ordered.map(i=>clean(i.text)).join('\n');
   const lines=ordered.filter(i=>i.h<18&&!/^LB$|^EACH$|BUY ONE GET|COMPRE|^SED \d|FIND MORE|BOGOS|ENCUENTRE/i.test(clean(i.text)));
   const name=[];
   for(const i of lines){
    const t=clean(i.text);
    if(/^(PECHUGA|FRESCA|LOMO|CA[NÑ]ADA|BISTEC|PAPAS?|AGUACATES|TOMATES|LIMONES|CAFE|CAFÉ|ARROZ|MEZCLA|VINO|PARA COCINAR|HUEVOS|LECHE|CONDENSADA|PAN BLANCO|FILETE|REFRESCO|ACEITE)\b/i.test(t))break;
    if(/\d|LIMIT|VARIETIES|BUY ONE/.test(t))continue;
    name.push(t);
   }
   // Numeric glyphs have semantic value only when their font hierarchy agrees.
   const parts=g.pieces.map(i=>i.text.trim()),joined=parts.join('');let price='';
   if(joined==='BOGO')price='BOGO';
   else if(/¢/.test(joined))price=joined;
   else if(joined.includes('/'))price=joined;
   else if(g.pieces.length===2&&/^\d+$/.test(parts[0])&&/^\d{2}$/.test(parts[1])&&g.pieces[0].h>g.pieces[1].h*1.2)price=parts[0]+'.'+parts[1];
   const unit=ordered.find(i=>/^(LB|EACH)$/i.test(clean(i.text)));
   if(price&&unit)price+=' '+(/LB/i.test(unit.text)?'LB':'EA');
   const limitAt=lines.findIndex(i=>/^LIMIT\b/i.test(clean(i.text)));
   const limitLines=[];
   if(limitAt>=0)for(const i of lines.slice(limitAt)){if(/^LIMITE|DE \$|COMPRA/i.test(clean(i.text)))break;limitLines.push(clean(i.text));}
   const reliable=!!price&&!!name.length&&right-left>=80&&bottom-top>=50;
   if(name.length)offers.push({name:name.join(' '),description:text,price,limits:limitLines.join(' '),text,box:[left,top,right-left,bottom-top],reliable,index:offers.length});
  }
 }
 return offers;
}
