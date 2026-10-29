// Pure comparison rules. No network, storage, workbook writes, OCR or AI.
export const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
export const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const dateISO=d=>d.toISOString().slice(0,10);
function isoValue(v){
 if(v instanceof Date)return dateISO(v);
 if(typeof v==='number')return dateISO(new Date(Date.UTC(1899,11,30)+v*86400000));
 const s=clean(v);if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
 const m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
 return m?`${+m[3]<100?2000+ +m[3]:m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:'';
}
export function selectTabs(sheets,week,market){
 const [y,m,d]=week.split('-').map(Number),through=dateISO(new Date(Date.parse(week+'T00:00:00Z')+6*86400000));
 return Object.keys(sheets).filter(name=>{
  const hit=name.match(/^FLYER\s+(\d{1,2})\s*\.\s*(\d{1,2})(?:\s*\.\s*(\d{2,4}))?\s+(MIAMI|ORLANDO)\b/i);
  if(!hit||+hit[1]!==m||+hit[2]!==d||hit[4].toLowerCase()!==market.toLowerCase())return false;
  const valid=sheets[name].find(r=>/VALID THROUGH DATE/i.test(r[1]||''));
  const year=hit[3]?(+hit[3]<100?2000+ +hit[3]:+hit[3]):y;
  return year===y&&!!valid&&isoValue(valid[2])===through;
 });
}
export function readEmailRows(rows){
 return rows.flatMap((r,i)=>{
  const label=clean(r[1]);if(!/^(Main Item|Spot\s+\d+)$/i.test(label)||!r.slice(2,9).some(v=>clean(v)))return [];
  return [{row:i+1,label,position:/Main Item/i.test(label)?1:Number(label.match(/\d+/)[0])+1,upc:clean(r[2]),name:clean(r[3]),nameEs:clean(r[4]),description:clean(r[5]),descriptionEs:clean(r[6]),price:clean(r[7]),limits:clean(r[8]),link:clean(r[9])}];
 });
}
export function price(value){
 let s=norm(value).split('|')[0].trim();
 if(/^(BOGO|BUY ONE GET ONE FREE|BUY 1 GET 1 FREE|COMPRE UNA LLEVE UNA GRATIS)$/.test(s))return {kind:'bogo',quantity:2,cents:null,unit:null};
 const unit=/\b(LB|LBS|POUND)\b/.test(s)?'LB':/\b(EA|EACH|CADA UNA|CADA UNO)\b/.test(s)?'EA':null;
 s=s.replace(/\b(LBS?|POUND|EA|EACH|CADA UNA|CADA UNO)\b/g,'').trim().replace(/\s*(FOR|POR)\s*/g,'/').replace(/\s/g,'');
 const match=s.match(/^(?:(\d+)\/)?\$?(\d+(?:\.\d{1,2})?|\.\d{1,2})(¢)?$/);
 if(!match||+match[1]===0)return null;
 return {kind:'price',quantity:match[1]?+match[1]:1,cents:Math.round(+match[2]*(match[3]?1:100)),unit};
}
export function sizes(text){
 const s=norm(text).replace(/FLUID\s+OUNCES?|FL\.\s*OZ/g,'FL OZ').replace(/OUNCES?/g,'OZ').replace(/POUNDS?|LBS\b/g,'LB').replace(/LITERS?|LITRES?/g,'LT').replace(/GALLONS?/g,'GAL').replace(/COUNTS?/g,'CT').replace(/PACKS?/g,'PK').replace(/[–—]/g,'-');
 const result=[];const re=/(\d*\.?\d+)\s*(?:-\s*(\d*\.?\d+)\s*)?(FL OZ|OZ|LB|LT|ML|GAL|CT|PK)\b/g;
 let m;while((m=re.exec(s)))result.push({min:+m[1],max:m[2]?+m[2]:+m[1],unit:m[3]});
 return [...new Map(result.map(x=>[JSON.stringify(x),x])).values()].sort((a,b)=>a.unit.localeCompare(b.unit)||a.min-b.min);
}
export function limits(text){
 const s=norm(text).split('|')[0].replace(/\bONE\b/g,'1').replace(/\bTWO\b/g,'2').replace(/\bTHREE\b/g,'3').replace(/\bUNA?\b/g,'1');
 const m=s.match(/\bLIMIT(?:E)?\s+(\d+)/),amt=s.match(/\$(\d+(?:\.\d+)?)/);
 return {count:m?+m[1]:null,amount:amt?Math.round(+amt[1]*100):null,half:/\bHALF|MITAD\b/.test(s),deal:/\bDEAL|OFERTA\b/.test(s),meat:/MEAT DEPARTMENT|CARNICERIA/.test(s),purchase:/PURCHASE|COMPRA|\bW\//.test(s),raw:clean(text)};
}
const stop=new Set('THE A AN AND OR OF DE DEL LA LAS LOS EL Y O EN PARA CON USDA INSPECTED CHOICE NOT GRADED FDA PRODUCT'.split(' '));
export function tokens(text){return [...new Set(norm(text).replace(/POTATOES/g,'POTATO').replace(/TOMATOES/g,'TOMATO').replace(/\bFARMS\b/g,'FARM').replace(/\bEGGS\b/g,'EGG').replace(/\bLIMES\b/g,'LIME').replace(/\bAVOCADOS\b/g,'AVOCADO').match(/[A-Z0-9]+/g)||[])].filter(x=>!stop.has(x));}
function field(field,expected,actual,status,reason){return {field,expected:clean(expected),actual:clean(actual),status,reason};}
const worst=fields=>fields.some(f=>f.status==='MISMATCH')?'MISMATCH':fields.some(f=>f.status==='NEEDS REVIEW')?'NEEDS REVIEW':'MATCH';
const variety=s=>/\bALL VARIETIES|TODAS LAS VARIEDADES/.test(norm(s))?'all':/\bSELECTED VARIETIES|VARIEDADES SELECTAS/.test(norm(s))?'selected':null;
export function compare(expected,actual){
 const fields=[];const add=(...args)=>fields.push(field(...args));
 const a=tokens(expected.name),b=tokens(actual.name),missing=a.filter(x=>!b.includes(x)),extra=b.filter(x=>!a.includes(x)&&!tokens(expected.description).includes(x));
 const conflict=(/\bCREAMER\b/.test(norm(expected.name))&&/\bMILK\b/.test(norm(actual.name)))||(/\bBONELESS\b/.test(norm(expected.name))&&/\bBONE IN\b/.test(norm(actual.name)));
 add('name',expected.name,actual.name,conflict?'MISMATCH':missing.length||extra.length?'NEEDS REVIEW':'MATCH',conflict?'Different product type is explicitly stated.':missing.length||extra.length?`Check name/qualifiers; workbook-only: ${missing.join(', ')||'none'}; source-only: ${extra.join(', ')||'none'}.`:'Normalized product words agree.');
 const p=price(expected.price),q=price(actual.price);
 add('price',expected.price,actual.price,!p||!q?'NEEDS REVIEW':p.kind!==q.kind||p.cents!==q.cents||p.quantity!==q.quantity?'MISMATCH':'MATCH',!p||!q?'Price could not be parsed unambiguously.':'Compare promotion type, total price and buy quantity; equal unit cost alone is insufficient.');
 const unit=(r,p)=>p?.unit||(/^LB$/i.test(clean(r.description))?'LB':/^(CT|COUNT)$/i.test(clean(r.description))?'EA':null);
 const u=unit(expected,p),v=unit(actual,q);
 add('unit',u||'Not specified',v||'Not specified',u&&v?(u===v?'MATCH':'MISMATCH'):u||v?'NEEDS REVIEW':'MATCH',u||v?'Price unit compared independently of package size.':'Neither source states a price unit.');
 const x=sizes(expected.description),y=sizes(actual.description);
 const canonical=arr=>arr.map(s=>s.unit==='GAL'?{min:s.min*128,max:s.max*128,unit:'FL OZ'}:s.unit==='LT'?{min:s.min*1000,max:s.max*1000,unit:'ML'}:s).sort((a,b)=>a.unit.localeCompare(b.unit)||a.min-b.min);
 const same=JSON.stringify(canonical(x))===JSON.stringify(canonical(y));
 const volume=x.length===1&&y.length===1&&((x[0].unit==='OZ'&&y[0].unit==='GAL'&&x[0].min===128*y[0].min)||(y[0].unit==='OZ'&&x[0].unit==='GAL'&&y[0].min===128*x[0].min));
 add('size',expected.description,actual.description,same?'MATCH':volume||!x.length||!y.length?'NEEDS REVIEW':'MISMATCH',volume?'Possible volume equivalence (128 fluid oz = 1 US gallon); OZ is not explicitly fluid.':same?'Package sizes/counts agree.':!x.length||!y.length?'Size is missing or unparsed on one side.':'Package sizes/counts or range differ.');
 const va=variety(expected.name+' '+expected.description),vb=variety(actual.name+' '+actual.description);
 add('varieties',va||'Not specified',vb||'Not specified',va===vb?'MATCH':va&&vb?'MISMATCH':'NEEDS REVIEW','Compare variety scope; omitted or unrecognized qualifiers require review.');
 const l=limits(expected.limits),r=limits(actual.limits);
 add('limit',expected.limits||'None stated',actual.limits||'None stated',l.count===r.count&&l.half===r.half&&l.deal===r.deal?'MATCH':'MISMATCH','Limit quantity, half/deal restrictions must agree.');
 const otherTerms=/EXCLUD|EXCEPT|COUPON|DIGITAL|MEMBER|LOYALTY|MUST BUY|MINIMUM|PER HOUSEHOLD|PER CUSTOMER|PER DAY|WHILE SUPPLIES|NO RAIN/i.test(expected.limits+' '+actual.limits);
 add('conditions',expected.limits||'None stated',actual.limits||'None stated',l.amount!==r.amount||l.meat!==r.meat?'MISMATCH':l.purchase!==r.purchase||(!l.count&&l.raw)||(!r.count&&r.raw)||otherTerms&&norm(expected.limits)!==norm(actual.limits)?'NEEDS REVIEW':'MATCH','Check purchase threshold and meat-department restriction; other wording needs manual review.');
 // Do not turn OCR, incomplete crops or uncertain grouping into assertions.
 if(actual.reliable===false)for(const f of fields){f.status='NEEDS REVIEW';f.reason='Uncertain source extraction. '+f.reason;}
 return {status:worst(fields),fields};
}
export function readRepublica(sheets,week){
 const keys=Object.keys(sheets).filter(s=>norm(s)==='MIAMI');if(keys.length!==1)throw new Error('REPUBLICA must contain exactly one MIAMI sheet.');
 const rows=sheets[keys[0]],header=rows.findIndex(r=>r.some(x=>norm(x)==='ITEM DESCRIPTION')&&r.some(x=>norm(x)==='EMAIL POSITION'));
 if(header<0)throw new Error('REPUBLICA headers ITEM DESCRIPTION, UNIQUE CITY and EMAIL POSITION are required.');
 const headings=rows[header].map(norm);for(const h of ['UPC','ITEM DESCRIPTION','SIZE','UNIQUE CITY','EMAIL POSITION'])if(!headings.includes(h))throw new Error('REPUBLICA header missing: '+h);
 const headingRows=rows.slice(0,header),headingText=headingRows.flat().map(clean).join(' ');
 if(!/ADVERTISING\s+PROGRAM|WEEK\s+OF/i.test(headingText))throw new Error('REPUBLICA advertising program week heading is missing.');
 const dates=headingText.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g)||[];
 const parsed=dates.map(isoValue);
 for(const v of headingRows.flat())if(v instanceof Date||typeof v==='number'&&v>40000&&v<80000)parsed.push(isoValue(v));
 const months={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
 for(const m of headingText.matchAll(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi))parsed.push(`${m[3]}-${String(months[m[1].toUpperCase()]).padStart(2,'0')}-${m[2].padStart(2,'0')}`);
 const through=dateISO(new Date(Date.parse(week+'T00:00:00Z')+6*86400000));
 if(!parsed.includes(week)||!parsed.includes(through))throw new Error('REPUBLICA program week could not be verified against the selected week and through date.');
 const out=[];
 for(let i=header+1;i<rows.length;i++){
  const r=rows[i];if(r.some(v=>/BOGO\s*GATE/i.test(v)))break;
  const get=h=>clean(r[headings.indexOf(h)]),name=get('ITEM DESCRIPTION');if(!name||!get('UPC')&&!get('SALE PRICE')&&!get('PRICE'))continue;
  const pos=get('EMAIL POSITION');out.push({name,nameEs:get('SUGGESTED TRANSLATION'),upc:get('UPC'),description:get('SIZE'),price:get('SALE PRICE')||get('PRICE'),limits:get('LIMITS'),city:get('UNIQUE CITY'),position:/^\d+$/.test(pos)?+pos:null,positionRaw:pos,row:i+1,sheet:keys[0],reliable:true});
 }
 return {rows:out,sheet:keys[0],week};
}
export function assignMarkets(rows,market){
 const eligible=[],uncertain=[],issues=[];
 for(const r of rows){
  const city=norm(r.city).replace(/[^A-Z]/g,'');
  if(!['','ALL','BOTH','MIAMIORLANDO','MIAMIANDORLANDO','MIAMIONLY','ORLANDOONLY','MIAMI','ORLANDO'].includes(city)){uncertain.push(r);continue;}
  if((city==='MIAMI'||city==='MIAMIONLY')&&market!=='miami'||(city==='ORLANDO'||city==='ORLANDOONLY')&&market!=='orlando')continue;
  eligible.push({...r});
 }
 const used=new Set(eligible.filter(r=>r.position>0).map(r=>r.position));
 for(const r of eligible){
  if(r.position>0&&eligible.filter(x=>x.position===r.position).length>1){r.assignmentUncertain=true;issues.push(`Duplicate EMAIL POSITION ${r.position} in ${market}.`);}
  if(r.positionRaw&&!r.position){r.assignmentUncertain=true;issues.push(`Unrecognized EMAIL POSITION at MIAMI row ${r.row}.`);}
 }
 let next=1;for(const r of eligible)if(!r.position){while(used.has(next))next++;r.position=next;used.add(next);r.assignedByOrder=true;}
 if(uncertain.length)issues.push(`${uncertain.length} rows have unknown UNIQUE CITY assignments; market completeness needs review.`);
 for(let p=1;p<=5;p++)if(!rows.some(r=>r.position===p))issues.push(`EMAIL POSITION ${p} is absent; any inferred slot needs review.`);
 return {rows:eligible,uncertain,issues:[...new Set(issues)]};
}
export function pair(item,offers){
 const a=tokens(item.name);
 const ranked=offers.map(offer=>{const b=tokens(offer.name),hits=a.filter(w=>b.includes(w)).length;return {offer,score:hits/Math.max(a.length,b.length,1),hits};}).sort((a,b)=>b.score-a.score);
 const best=ranked[0];if(!best||best.score<.42||best.hits<Math.min(2,a.length))return {status:'absent'};
 if(ranked[1]&&best.score-ranked[1].score<.12)return {status:'ambiguous',candidates:ranked.slice(0,2)};
 return {status:'found',offer:best.offer,score:best.score};
}
export function assess(item,page,secondary){
 const secondaryResult=secondary?compare(item,secondary):{status:'NEEDS REVIEW',fields:[],reason:'REPUBLICA item is unavailable or ambiguous.'};
 if(!page.loaded||!page.readable)return {status:'NEEDS REVIEW',fields:[],secondary:secondaryResult,reason:!page.loaded?'Flyer not supplied.':'Page 1 has insufficient or uncertain text; absence cannot be established.'};
 const hit=pair(item,page.offers);
 if(hit.status==='ambiguous')return {status:'NEEDS REVIEW',fields:[],secondary:secondaryResult,reason:'Multiple plausible flyer regions. Select and inspect the original page.'};
 if(hit.status==='absent'){
  const words=tokens(item.name),all=tokens(page.text||'');
  if(words.length&&words.filter(w=>all.includes(w)).length/words.length>=.65)return {status:'NEEDS REVIEW',fields:[],secondary:secondaryResult,reason:'Product words appear on page 1 but a region could not be paired confidently. Inspect the full page.'};
  return {status:'NOT ON PAGE 1',fields:[],secondary:secondaryResult,reason:'No confident text match on page 1. This is not a missing-ad error; verify the full page visually and use REPUBLICA below.'};
 }
 return {...compare(item,hit.offer),offer:hit.offer,secondary:secondaryResult,reason:'Compared with the candidate page-one region.'};
}
export function report(results,meta){
 return ['Flyer Revision QA',`Week of ${meta.week} · Page 1 only`,...(meta.sources||[]),...(meta.warnings||[]).map(s=>'UNVERIFIED: '+s),'Original workbook was not modified.','',...results.flatMap(r=>[
  `${r.market} | ${r.sheet} | ${r.item.label||'Unassigned'} | row ${r.item.row||'?'} | ${r.item.name} | ${r.status}`,
  `Workbook UPC: ${r.item.upc||'not supplied'}; price: ${r.item.price}; size: ${r.item.description}; limits: ${r.item.limits||'none'}`,
  r.linkReview?`Link verification: ${r.linkReview}`:'',
  r.reason||'',...(r.fields||[]).filter(f=>f.status!=='MATCH').map(f=>`  ${f.status} ${f.field}: workbook [${f.expected}] / source [${f.actual}] — ${f.reason}`),
  `  REPUBLICA secondary: ${r.secondary?.status||'NEEDS REVIEW'}${r.script?` (MIAMI row ${r.script.row}; UNIQUE CITY: ${r.script.city||'shared'}; EMAIL POSITION: ${r.script.positionRaw||'source order'})`:''}`,
  ...(r.secondary?.fields||[]).filter(f=>f.status!=='MATCH').map(f=>`    ${f.status} ${f.field}: workbook [${f.expected}] / REPUBLICA [${f.actual}] — ${f.reason}`),
  r.note?'  Reviewer note: '+r.note:'',''
 ])].join('\n');
}
