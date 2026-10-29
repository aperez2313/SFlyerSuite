import {text,linkKey,isVerified,checked,edited,validLink,syncPlan,primaryRows,HEADERS} from './core.mjs';
import {readCatalog,mutateCatalog} from './store.mjs';
import * as cloud from './google.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],editing=null,baseline=null,reviewed=null,busy=false;
const status=s=>$('status').textContent=s;
async function refresh(){rows=await readCatalog();render();$('syncReview').hidden=true;reviewed=null;}
function render(){
 const masters=rows.filter(r=>r.flyer==='MASTER'),q=$('search').value.toLowerCase(),filter=$('filter').value;
 const view=masters.filter(r=>[r.upc,r.product_name,r.link].join(' ').toLowerCase().includes(q)).filter(r=>filter==='all'||filter==='verified'&&isVerified(r)||filter==='unverified'&&!isVerified(r)||filter==='missing'&&!r.link||filter==='multiple'&&new Set(masters.filter(x=>text(x.upc)===text(r.upc)).map(x=>x.link).filter(Boolean)).size>1);
 $('rows').innerHTML=`<p class="help">${view.length} matching catalog rows${view.length>100?' · first 100 shown; narrow your search':''}</p>`+view.slice(0,100).map(r=>`<article class="panel"><h3>${esc(r.product_name)}</h3><p>${esc(r.upc)} · ${esc(r.location)} · ${r.is_primary==='true'?'Primary link':'Alternate link'} · <b>${isVerified(r)?'Verified':'Needs verification'}</b></p><p>${r.link&&validLink(r.link)?`<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a>`:'No valid HTTPS link'}</p>${isVerified(r)?`<p class="help">Checked ${esc(r.verified_at)} by ${esc(r.verified_by)}</p>`:''}<button data-edit="${esc(r.id)}" class="secondary">Edit</button> <button data-verify="${esc(r.id)}" ${!validLink(r.link)?'disabled':''}>${isVerified(r)?'Clear verification':'Mark verified'}</button> <button data-primary="${esc(r.id)}" class="secondary">Set primary</button> <button data-delete="${esc(r.id)}" class="secondary">Delete link row</button></article>`).join('');
}
$('search').oninput=render;$('filter').onchange=render;
function reset(){$('editor').reset();editing=null;$('saveLocal').textContent='Add product link';$('cancel').hidden=true;}
$('cancel').onclick=reset;
$('editor').onsubmit=async e=>{e.preventDefault();if(busy)return;
 try{
  const fields={upc:text($('upc').value),product_name:text($('name').value),location:$('market').value,link:text($('link').value)};
  if(fields.link&&!validLink(fields.link))throw new Error('Use an HTTPS product link without embedded credentials.');
  await mutateCatalog(all=>{
   const duplicate=all.find(r=>r.flyer==='MASTER'&&r.id!==editing&&linkKey(r)===linkKey(fields));if(duplicate)throw new Error('That UPC, market and URL already exist.');
   if(editing){const r=all.find(r=>r.id===editing);if(!r)throw new Error('Row no longer exists. Reload.');return all.map(r=>r.id===editing?edited(r,fields):r);}
   return [...all,{id:crypto.randomUUID(),flyer:'MASTER',flyer_date:'',imported_at:new Date().toISOString(),...fields,verified_at:'',verified_by:'',verification_key:'',is_primary:all.some(x=>x.flyer==='MASTER'&&text(x.upc)===fields.upc)?'':'true'}];
  });reset();await refresh();status('Saved locally. Google is unchanged until you review and save.');
 }catch(e){status(e.message);}
};
$('rows').onclick=async e=>{
 const b=e.target.closest('button');if(!b||busy)return;
 const id=b.dataset.edit||b.dataset.verify||b.dataset.delete||b.dataset.primary,r=rows.find(r=>r.id===id);if(!r)return;
 try{
  if(b.dataset.edit){editing=id;$('upc').value=r.upc;$('name').value=r.product_name;$('market').value=r.location||'ALL';$('link').value=r.link;$('saveLocal').textContent='Save link';$('cancel').hidden=false;$('editor').scrollIntoView();return;}
  if(b.dataset.primary){await mutateCatalog(all=>all.map(x=>x.flyer==='MASTER'&&text(x.upc)===text(r.upc)?{...x,is_primary:x.id===id?'true':''}:x));}
  else if(b.dataset.delete){if(!confirm(`Delete this link row for ${r.product_name}? Other links for this UPC remain. Google changes require a separate review.`))return;await mutateCatalog(all=>all.filter(x=>x.id!==id));}
  else await mutateCatalog(all=>all.map(x=>x.id===id?(isVerified(x)?{...x,verified_at:'',verified_by:'',verification_key:''}:checked(x,$('reviewer').value)):x));
  await refresh();status('Catalog updated locally.');
 }catch(e){status(e.message);}
};
function disconnect(){cloud.disconnect();baseline=null;reviewed=null;$('review').disabled=true;$('disconnect').disabled=true;$('syncReview').hidden=true;status('Google disconnected. Local links and verification remain.');}
$('disconnect').onclick=disconnect;
for(const id of ['sheetURL','sheetTab','clientID'])$(id).onchange=()=>{if(baseline)disconnect();};
$('connect').onclick=async()=>{
 baseline=null;reviewed=null;$('review').disabled=true;$('syncReview').hidden=true;
 $('connect').disabled=true;status('Opening Google sign-in…');
 try{
  const snapshot=await cloud.connect($('clientID').value.trim(),$('sheetURL').value.trim(),$('sheetTab').value);
  let conflicts=0;
  await mutateCatalog(all=>{
   const merged=[...all];for(const remote of snapshot.rows){const local=merged.find(r=>r.id===remote.id);if(!local)merged.push(remote);else if(HEADERS.some(h=>text(local[h])!==text(remote[h])))conflicts++;}return merged;
  });baseline=snapshot;await refresh();$('review').disabled=false;$('disconnect').disabled=false;status(`Loaded Google catalog. ${conflicts} existing local rows retained; inspect changes before saving.`);
 }catch(e){status(e.message);}finally{$('connect').disabled=false;}
};
$('review').onclick=async()=>{
 try{if(!baseline)throw new Error('Connect first.');rows=await readCatalog();primaryRows(rows);reviewed={plan:syncPlan(baseline.rows,rows),local:JSON.stringify(rows)};
 const p=reviewed.plan;$('plan').textContent=[`${p.add.length} additions · ${p.update.length} edits · ${p.remove.length} deletions`,...['add','update','remove'].flatMap(k=>p[k].map(r=>`${k.toUpperCase()} | ${r.upc} | ${r.product_name} | ${r.link} | ${r.is_primary==='true'?'PRIMARY':'alternate'} | ${isVerified(r)?'VERIFIED':'unverified'}`))].join('\n');$('syncReview').hidden=false;$('push').disabled=!p.add.length&&!p.update.length&&!p.remove.length&&baseline.hasAux;
 }catch(e){status(e.message);}
};
$('push').onclick=async()=>{
 if(!reviewed||!baseline||busy)return;busy=true;$('push').disabled=true;
 try{const current=await readCatalog();if(JSON.stringify(current)!==reviewed.local)throw new Error('Local catalog changed. Review again before saving.');
  baseline=await cloud.save(reviewed.plan,baseline);await refresh();status('Reviewed catalog changes saved to Google. Original Email workbook unchanged.');
 }catch(e){reviewed=null;$('syncReview').hidden=true;status(e.message);}finally{busy=false;}
};
refresh().catch(e=>status('Browser storage unavailable: '+e.message));
