import {clean,readEmailRows,selectTabs,readRepublica,assignMarkets,pair,assess,compare,report} from './core.mjs';
import {readPageOne,crop} from './pdf.mjs';
import {readCatalog} from '../product-links/store.mjs';
import {linkKey,isVerified} from '../product-links/core.mjs';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let results=[],meta={},pages={},sheets={},script=null,chosen={},runGeneration=0,catalog=[];
const badge=s=>`<span class="badge ${s.toLowerCase().replaceAll(' ','-')}">${s}</span>`;
async function workbook(file){const w=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});return Object.fromEntries(w.SheetNames.map(n=>[n,XLSX.utils.sheet_to_json(w.Sheets[n],{header:1,defval:'',raw:true})]));}
function warn(t){meta.warnings.push(t);}
function invalidate(){runGeneration++;results=[];$('output').hidden=true;$('tabChoice').hidden=true;$('progress').textContent='Files or week changed. Run comparison again.';}
for(const id of ['workbook','republica','miami','orlando','week'])$(id).addEventListener('change',invalidate);
$('run').onclick=async()=>{
 const generation=++runGeneration;$('run').disabled=true;$('error').hidden=true;$('output').hidden=true;$('tabChoice').hidden=true;chosen={};
 meta={week:$('week').value,warnings:[],sources:[]};pages={};script=null;
 try{
  if(!$('workbook').files[0]||!meta.week)throw new Error('Select the Email workbook and week starting date.');
  $('progress').textContent='Reading the workbook…';sheets=await workbook($('workbook').files[0]);meta.sources.push('Email: '+$('workbook').files[0].name);
  try{catalog=await readCatalog();}catch{catalog=[];warn('Saved link verification is unavailable in this browser.');}
  if($('republica').files[0]){
   try{script=readRepublica(await workbook($('republica').files[0]),meta.week);meta.sources.push('REPUBLICA: '+$('republica').files[0].name+' · MIAMI sheet');}
   catch(e){warn('REPUBLICA: '+e.message);}
  }else warn('REPUBLICA not supplied. Market assignments, UPCs and EMAIL POSITION are unverified.');
  for(const market of ['miami','orlando']){
   const file=$(market).files[0];if(!file){pages[market]={loaded:false,offers:[]};warn(market.toUpperCase()+' flyer not supplied.');continue;}
   $('progress').textContent=`Reading ${market} page 1…`;
   try{
    pages[market]=await readPageOne(file);meta.sources.push(`${market.toUpperCase()}: ${file.name} · page 1 of ${pages[market].pages} (remaining pages unread)`);
    const page=pages[market],dates=page.text.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g)||[];
    const expected=new Date(meta.week+'T00:00:00Z'),through=new Date(+expected+6*86400000);
    const format=d=>`${d.getUTCMonth()+1}.${d.getUTCDate()}.${String(d.getUTCFullYear()).slice(-2)}`;
    const normalize=d=>d.split(/[./-]/).map(Number).join('.');
    if(!dates.map(normalize).includes(normalize(format(expected)))||!dates.map(normalize).includes(normalize(format(through)))){page.dateUncertain=true;warn(`${market.toUpperCase()} printed week does not match or could not be read. Every result requires review.`);}
    if(/MIAMI|ORLANDO/i.test(file.name)&&!new RegExp(market,'i').test(file.name)){page.marketUncertain=true;warn(`${market.toUpperCase()} input filename identifies the other market. Replace the file.`);}
   }catch(e){pages[market]={loaded:false,offers:[]};warn(`${market.toUpperCase()} PDF: ${e.message}`);}
  }
  if(generation!==runGeneration)return;
  let needsChoice=false;$('tabOptions').replaceChildren();
  for(const market of ['miami','orlando']){
   const tabs=selectTabs(sheets,meta.week,market);
   if(tabs.length===1)chosen[market]=tabs[0];
   else if(tabs.length===0)warn(`No verified ${market.toUpperCase()} FLYER tab for ${meta.week} and its through date.`);
   else{needsChoice=true;const label=document.createElement('label');label.textContent=market.toUpperCase();const select=document.createElement('select');select.id='tab-'+market;select.innerHTML='<option value="">Choose a tab…</option>'+tabs.map(t=>`<option>${escape(t)}</option>`).join('');label.append(select);$('tabOptions').append(label);}
  }
  if(needsChoice){$('tabChoice').hidden=false;$('progress').textContent='Resolve duplicate workbook tabs to continue.';}else build();
 }catch(e){$('error').textContent=e.message;$('error').hidden=false;$('progress').textContent='Comparison stopped.';}
 finally{$('run').disabled=false;}
};
$('useTabs').onclick=()=>{for(const s of $('tabOptions').querySelectorAll('select')){if(!s.value){$('progress').textContent='Choose each duplicate tab.';return;}chosen[s.id.slice(4)]=s.value;}$('tabChoice').hidden=true;build();};
function assignment(item,assigned){
 const upc=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
 const exact=assigned.rows.filter(r=>upc(r.upc)&&upc(r.upc)===upc(item.upc));
 const candidates=exact.length?exact:assigned.rows.filter(r=>r.position===item.position);
 return candidates.length===1&&!candidates[0].assignmentUncertain?candidates[0]:null;
}
function enrich(r,item,market,assigned){
 r.item=item;r.market=market.toUpperCase();r.sheet=chosen[market];r.script=assignment(item,assigned);r.pageMarket=market;
 const links=catalog.filter(x=>x.flyer==='MASTER'&&clean(x.upc).toUpperCase().replace(/[^A-Z0-9]/g,'')===clean(item.upc).toUpperCase().replace(/[^A-Z0-9]/g,'')&&['ALL',r.market,''].includes(x.location||''));
 const verified=links.find(x=>x.link===item.link&&isVerified(x));
 r.linkReview=verified?`Verified exact link · ${verified.verified_by} · ${verified.verified_at}`:`Link not previously verified${new Set(links.map(x=>x.link)).size>1?' · multiple catalog links for this UPC':''}`;
 if(!script||!r.script||assigned.uncertain.length){r.fields.push({field:'market assignment',expected:'REPUBLICA MIAMI / UNIQUE CITY / EMAIL POSITION',actual:'Unverified',status:'NEEDS REVIEW',reason:'Expected market-specific product cannot be confirmed.'});if(r.status==='MATCH')r.status='NEEDS REVIEW';}
 if(r.script){
  const changed=r.script.position!==item.position||clean(r.script.upc).replace(/\W/g,'')!==clean(item.upc).replace(/\W/g,'');
  const f={field:'REPUBLICA assignment',expected:`${r.script.upc} / position ${r.script.position}`,actual:`${item.upc} / position ${item.position}`,status:changed?'MISMATCH':r.script.assignedByOrder?'NEEDS REVIEW':'MATCH',reason:changed?'Compare only against this market’s script assignment.':r.script.assignedByOrder?'Slot inferred in source order (v9 convention); verify intent.':'UPC and EMAIL POSITION agree within this market.'};
  r.fields.push(f);if(f.status==='MISMATCH'&&r.status!=='NOT ON PAGE 1')r.status='MISMATCH';else if(f.status==='NEEDS REVIEW'&&r.status==='MATCH')r.status='NEEDS REVIEW';
 }
 if(pages[market].dateUncertain||pages[market].marketUncertain){r.status='NEEDS REVIEW';r.reason='Source week or market is unverified. '+r.reason;}
 if(r.secondary.status==='MISMATCH'&&r.status==='MATCH'){r.status='NEEDS REVIEW';r.reason='Flyer and REPUBLICA disagree. Review both sources before revising the workbook.';}
 return r;
}
function build(){
 results=[];
 for(const market of ['miami','orlando']){
  if(!chosen[market])continue;
  const rows=readEmailRows(sheets[chosen[market]]),assigned=script?assignMarkets(script.rows,market):{rows:[],uncertain:[],issues:[]};
  assigned.issues.forEach(x=>warn(market.toUpperCase()+': '+x));
  for(const item of rows)results.push(enrich(assess(item,pages[market],assignment(item,assigned)),item,market,assigned));
  if(script)for(const expected of assigned.rows){
   if(!rows.some(i=>assignment(i,assigned)===expected))warn(`${market.toUpperCase()} REPUBLICA row ${expected.row} (${expected.name}, position ${expected.position}) has no unambiguous workbook counterpart.`);
  }
  // A crop cannot silently satisfy two workbook products.
  const marketResults=results.filter(r=>r.pageMarket===market);
  for(const r of marketResults)if(r.offer&&marketResults.filter(x=>x.offer===r.offer).length>1){r.status='NEEDS REVIEW';r.reason='The same flyer region was paired with multiple rows; verify the pairing.';}
 }
 meta.warnings=[...new Set(meta.warnings)];$('output').hidden=false;$('progress').textContent=`Compared ${results.length} workbook rows. ${meta.warnings.length?'Report is incomplete; review source warnings.':''}`;
 $('pages').innerHTML=['miami','orlando'].filter(m=>pages[m]?.canvas).map(m=>`<details><summary>${m.toUpperCase()} original page 1 — inspect all regions</summary><img class="source-image full" src="${pages[m].canvas.toDataURL()}" alt="${m} original flyer page 1"></details>`).join('');render();
}
function checks(fields){return `<table class="checks"><thead><tr><th>Field</th><th>Workbook</th><th>Source / result</th></tr></thead><tbody>${fields.map(f=>`<tr><td>${escape(f.field)}</td><td>${escape(f.expected)}</td><td>${escape(f.actual)}<small>${escape(f.status)} · ${escape(f.reason)}</small></td></tr>`).join('')}</tbody></table>`;}
function render(){
 $('warnings').textContent=meta.warnings.join('\n');$('warnings').style.whiteSpace='pre-line';$('warnings').hidden=!meta.warnings.length;
 $('counts').textContent=['MATCH','MISMATCH','NEEDS REVIEW','NOT ON PAGE 1'].map(s=>`${results.filter(r=>r.status===s).length} ${s}`).join(' · ');
 $('results').innerHTML=results.map((r,i)=>{
  if($('filter').value!=='all'&&$('filter').value!==r.status)return '';
  const p=pages[r.pageMarket],it=r.item;
  return `<article class="result" data-result="${i}"><div class="result-head"><div><h3>${escape(it.label)} · ${escape(it.name)}</h3><small>${escape(r.market)} · ${escape(r.sheet)} · Excel row ${it.row}</small></div>${badge(r.status)}</div><div class="columns"><div><h3>Original flyer region</h3>${r.offer?`<img class="source-image" src="${crop(p,r.offer.box)}" alt="Original page 1 crop for ${escape(it.name)}"><p class="source-caption">${escape(p.name)} · page 1 · automatic candidate</p>`:`<p>${escape(r.reason)}</p>`}
  ${p.offers?.length?`<label class="region-picker">Inspect a different candidate region<select data-region="${i}"><option value="">Choose a region…</option>${p.offers.map((o,n)=>`<option value="${n}">${escape(o.name)} — ${escape(o.price)}</option>`).join('')}</select></label>`:''}
  ${r.offer?`<details><summary>Extracted text (verify against image)</summary><pre>${escape(r.offer.text)}</pre></details>`:''}</div><div><h3>Email workbook values</h3><dl><dt>UPC</dt><dd>${escape(it.upc)}</dd><dt>English</dt><dd>${escape(it.name)}</dd><dt>Spanish</dt><dd>${escape(it.nameEs)}</dd><dt>Size / details</dt><dd>${escape(it.description)}<br>${escape(it.descriptionEs)}</dd><dt>Price</dt><dd>${escape(it.price)}</dd><dt>Limits</dt><dd>${escape(it.limits||'None stated')}</dd><dt>Product link</dt><dd>${escape(it.link||'None')}<br><b>${escape(r.linkReview)}</b></dd></dl><p class="help">${escape(r.reason)}</p></div></div>
  ${checks(r.fields)}<details><summary>REPUBLICA secondary verification · ${escape(r.secondary.status)}</summary>${r.script?`<p>MIAMI row ${r.script.row} · UNIQUE CITY: ${escape(r.script.city||'shared')} · EMAIL POSITION: ${escape(r.script.positionRaw||'source order')}</p>`:'<p>No unambiguous, verified script item is available.</p>'}${checks(r.secondary.fields||[])}</details>
  <label class="help">Reviewer note (included in report)<textarea data-note="${i}" rows="2" placeholder="Record a visual finding or unresolved question">${escape(r.note||'')}</textarea></label></article>`;
 }).join('');syncReport();
}
function syncReport(){$('report').value=report(results,meta);}
$('filter').onchange=render;
$('results').addEventListener('input',e=>{if(e.target.dataset.note!==undefined){results[+e.target.dataset.note].note=e.target.value;syncReport();}});
$('results').addEventListener('change',e=>{
 if(e.target.dataset.region===undefined||e.target.value==='')return;
 const i=+e.target.dataset.region,r=results[i],offer=pages[r.pageMarket].offers[+e.target.value];
 // Manual candidate selection never certifies extraction or clears unresolved source checks.
 const previous=r.fields.filter(f=>/assignment/i.test(f.field));results[i]={...r,...compare(r.item,{...offer,reliable:false}),offer,status:'NEEDS REVIEW',reason:'Reviewer selected a candidate region; verify every extracted field.',note:r.note};results[i].fields.push(...previous);render();
});
$('copy').onclick=async()=>{syncReport();try{await navigator.clipboard.writeText($('report').value);$('progress').textContent='Revision report copied.';}catch{const details=$('report').parentElement;details.open=true;$('report').focus();$('report').select();$('progress').textContent='Clipboard access unavailable. Copy the selected report text.';}};
$('download').onclick=()=>{syncReport();const url=URL.createObjectURL(new Blob([$('report').value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`Flyer-Revision-QA-${meta.week}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
