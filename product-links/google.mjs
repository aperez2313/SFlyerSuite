import {fromValues,fromMaster,mergeMaster,masterRequests,syncPlan,fingerprint,requestsFor,HEADERS} from './core.mjs';
// Tokens exist only in this module's memory. No API key, secret, password or
// access token is stored in IndexedDB, localStorage, a URL or a report.
let token='',expires=0,config=null;
export function spreadsheetId(url){const m=String(url).match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);if(m)return m[1];if(/^[A-Za-z0-9_-]{20,}$/.test(url))return url;throw new Error('Enter a Google spreadsheet URL or ID.');}
export async function connect(clientId,url,tab){
 token='';expires=0;
 if(!/^[A-Za-z0-9.-]+\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('Enter the Google OAuth web client ID.');
 config={id:spreadsheetId(url),tab:tab.trim()};if(!config.tab)throw new Error('Enter the catalog tab name.');
 if(!window.google?.accounts?.oauth2)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=resolve;s.onerror=()=>reject(new Error('Google sign-in could not load. Check network policy.'));document.head.append(s);});
 await new Promise((resolve,reject)=>{
  const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:r=>{if(r.error){reject(new Error(r.error));return;}token=r.access_token;expires=Date.now()+Number(r.expires_in)*1000;resolve();},error_callback:r=>reject(new Error(r.type||'Google sign-in cancelled.'))});
  client.requestAccessToken({prompt:'consent'});
 });return snapshot();
}
async function api(path,options={}){
 if(!token||Date.now()>expires)throw new Error('Google session expired or disconnected. Sign in again.');
 const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+config.id+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Google Sheets request failed.');return data;
}
export async function snapshot(){
 const metadata=await api('?fields=sheets(properties(sheetId,title,gridProperties))');
 const sheet=metadata.sheets.find(s=>s.properties.title==='master_products');
 if(!sheet)throw new Error('The existing master_products tab was not found.');
 const aux=metadata.sheets.find(s=>s.properties.title===config.tab);
 if(config.tab==='products'||config.tab==='master_products')throw new Error('Verification tab must be separate from products and master_products.');
 const read=async range=>(await api('/values/'+encodeURIComponent(range)+'?valueRenderOption=FORMULA')).values||[];
 const masterValues=await read("'master_products'");
 const auxValues=aux?await read("'"+config.tab.replaceAll("'","''")+"'"):[];
 const master=fromMaster(masterValues),auxRows=aux?fromValues(auxValues):[];
 return {rows:mergeMaster(master,auxRows),master,auxRows,fingerprint:fingerprint([masterValues,auxValues]),masterId:sheet.properties.sheetId,hasAux:!!aux,
  sheetId:aux?aux.properties.sheetId:Math.max(...metadata.sheets.map(s=>s.properties.sheetId))+1,columns:aux?aux.properties.gridProperties.columnCount:HEADERS.length};
}
export async function save(plan,base){
 const current=await snapshot();if(current.fingerprint!==base.fingerprint)throw new Error('Google catalog changed since loading. Reconnect and review the new changes; nothing was saved.');
 const next=base.rows.filter(r=>!plan.remove.some(x=>x.id===r.id)).map(r=>plan.update.find(x=>x.id===r.id)||r).concat(plan.add);
 const requests=requestsFor(syncPlan(base.auxRows,next),base.auxRows,base.sheetId);
 if(!base.hasAux)requests.unshift({addSheet:{properties:{sheetId:base.sheetId,title:config.tab,gridProperties:{rowCount:Math.max(1000,next.length+1),columnCount:HEADERS.length}}}});
 else if(base.columns<HEADERS.length)requests.unshift({appendDimension:{sheetId:base.sheetId,dimension:'COLUMNS',length:HEADERS.length-base.columns}});
 requests.push(...masterRequests(base.master,next,base.masterId,new Date().toISOString()));
 await api(':batchUpdate',{method:'POST',body:JSON.stringify({requests})});return snapshot();
}
export function disconnect(){if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});token='';expires=0;config=null;}
