export const HEADERS=['id','flyer','flyer_date','location','product_name','upc','link','imported_at','verified_at','verified_by','verification_key','is_primary'];
export const text=v=>String(v??'').trim();
export function linkKey(row){return [text(row.upc).toUpperCase().replace(/[^A-Z0-9]/g,''),text(row.location||'ALL').toUpperCase(),text(row.link)].join('|');}
export function isVerified(row){return !!row.verified_at&&!!row.link&&row.verification_key===linkKey(row);}
export function checked(row,reviewer,now=new Date().toISOString()){
 if(!validLink(row.link))throw new Error('Enter a valid HTTPS product link before verifying it.');
 return {...row,verified_at:now,verified_by:text(reviewer)||'Local reviewer',verification_key:linkKey(row)};
}
export function validLink(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
export function edited(row,fields){
 const next={...row,...fields};if(linkKey(next)!==linkKey(row))Object.assign(next,{verified_at:'',verified_by:'',verification_key:''});return next;
}
export function fromValues(values){
 const headers=(values[0]||[]).map(text);
 if(![8,11,12].includes(headers.length)||headers.some((v,i)=>v!==HEADERS[i]))throw new Error('Catalog headers must be the original 8 lookup columns, or 11/12 columns including verification. See Google Sheets setup.');
 const rows=[];const ids=new Set();
 values.slice(1).forEach((v,index)=>{
  if(!v.some(text))return;
  if(v.some(c=>text(c).startsWith('=')))throw new Error('Formula cells in the catalog require review; sync stopped.');
  const r=Object.fromEntries(HEADERS.map((h,i)=>[h,text(v[i])]));r._sheetRow=index+2;
  if(!r.id||ids.has(r.id))throw new Error('Every catalog row needs a unique nonempty id.');
  if(!/^[A-Za-z0-9:_%.\-]+$/.test(r.id))throw new Error('Unsupported catalog id characters; review before importing.');
  if(r.flyer!=='MASTER')throw new Error('Use a dedicated MASTER product-link catalog tab, not weekly FLYER rows.');
  ids.add(r.id);rows.push(r);
 });return rows;
}
export const fingerprint=values=>JSON.stringify(values);
const cells=r=>HEADERS.map(h=>text(r[h]));
export function syncPlan(base,local){
 const before=new Map(base.map(r=>[r.id,r])),after=new Map(local.filter(r=>r.flyer==='MASTER').map(r=>[r.id,r]));
 return {add:[...after.values()].filter(r=>!before.has(r.id)),update:[...after.values()].filter(r=>before.has(r.id)&&JSON.stringify(cells(r))!==JSON.stringify(cells(before.get(r.id)))),remove:[...before.values()].filter(r=>!after.has(r.id))};
}
export function requestsFor(plan,base,sheetId){
 const valueRow=r=>({values:cells(r).map(v=>({userEnteredValue:{stringValue:v}}))});
 const requests=[{updateCells:{range:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:HEADERS.length},rows:[{values:HEADERS.map(stringValue=>({userEnteredValue:{stringValue}}))}],fields:'userEnteredValue'}}];
 // Updates use original row coordinates; then delete descending; then append.
 for(const row of plan.update){const old=base.find(r=>r.id===row.id);requests.push({updateCells:{range:{sheetId,startRowIndex:old._sheetRow-1,endRowIndex:old._sheetRow,startColumnIndex:0,endColumnIndex:HEADERS.length},rows:[valueRow(row)],fields:'userEnteredValue'}});}
 for(const row of [...plan.remove].sort((a,b)=>b._sheetRow-a._sheetRow))requests.push({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:row._sheetRow-1,endIndex:row._sheetRow}}});
 if(plan.add.length)requests.push({appendCells:{sheetId,rows:plan.add.map(valueRow),fields:'userEnteredValue'}});
 return requests;
}
export function fromMaster(values){
 const headers=['upc','product_name','link','last_updated'];
 if(JSON.stringify(values[0])!==JSON.stringify(headers))throw new Error('master_products must have upc, product_name, link, last_updated columns.');
 const seen=new Set();return values.slice(1).flatMap((v,i)=>{
  if(!v.some(text))return [];if(v.some(c=>text(c).startsWith('=')))throw new Error('Formula in master_products: review before sync.');
  const upc=text(v[0]);if(!upc||seen.has(upc))throw new Error('Duplicate or empty master UPC; resolve before sync.');seen.add(upc);
  return [{upc,product_name:text(v[1]),link:text(v[2]),last_updated:text(v[3]),_sheetRow:i+2}];
 });
}
export function mergeMaster(master,aux){
 const rows=aux.map(r=>({...r,is_primary:''}));
 for(const m of master){
  let row=rows.find(r=>text(r.upc)===m.upc&&text(r.link)===m.link);
  if(!row){row={id:'master:'+encodeURIComponent(m.upc).replaceAll("'",'%27'),flyer:'MASTER',flyer_date:'',location:'ALL',product_name:m.product_name,upc:m.upc,link:m.link,imported_at:m.last_updated,verified_at:'',verified_by:'',verification_key:''};
   // A stale former primary keeps its URL as an alternate, with a distinct ID.
   const collision=rows.find(r=>r.id===row.id);if(collision)collision.id+=':alternate:'+encodeURIComponent(collision.link).replaceAll("'",'%27');
   rows.push(row);
  }row.is_primary='true';
 }return rows;
}
export function primaryRows(rows){
 const out=[],seen=new Set();for(const r of rows.filter(r=>r.flyer==='MASTER'&&String(r.is_primary)==='true')){
  if(seen.has(text(r.upc)))throw new Error('Multiple primary links for UPC '+r.upc+'. Choose one before saving.');seen.add(text(r.upc));out.push(r);
 }return out;
}
export function masterRequests(base,rows,sheetId,now){
 const primary=primaryRows(rows),requests=[],removed=base.filter(m=>!primary.some(r=>text(r.upc)===m.upc));
 const values=r=>({values:[text(r.upc),text(r.product_name),text(r.link),now].map(stringValue=>({userEnteredValue:{stringValue}}))});
 const added=[];for(const row of primary){const old=base.find(m=>m.upc===text(row.upc));if(!old)added.push(row);else if(old.link!==text(row.link)||old.product_name!==text(row.product_name))requests.push({updateCells:{range:{sheetId,startRowIndex:old._sheetRow-1,endRowIndex:old._sheetRow,startColumnIndex:0,endColumnIndex:4},rows:[values(row)],fields:'userEnteredValue'}});}
 for(const r of removed.sort((a,b)=>b._sheetRow-a._sheetRow))requests.push({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:r._sheetRow-1,endIndex:r._sheetRow}}});
 if(added.length)requests.push({appendCells:{sheetId,rows:added.map(values),fields:'userEnteredValue'}});
 return requests;
}
