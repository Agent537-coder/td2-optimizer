/* Private account data; images are downloaded locally by build.share.js. */
const BUILD_RESUME_KEY='agenthub:build-login:v1';
let buildAccountCurrent=null;
let buildAccountActor=null;
async function buildAccountRequest(method,body){
  const html=await fetch('/forum/',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)throw Error('unavailable');return r.text();});
  const actor=Number(/"userId":(\d+)/.exec(html)?.[1]||0);
  if(!actor)throw Error('login_required');
  if(buildAccountActor!==null&&buildAccountActor!==actor){buildAccountCurrent=null;buildAccountActor=actor;if(method!=='GET')throw Error('account_changed');}
  buildAccountActor=actor;
  const csrf=/"csrfToken":"([^"]+)"/.exec(html)?.[1];if(!csrf)throw Error('unavailable');
  const response=await fetch('/forum/api/builds',{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok)throw Error(result.error||'unavailable');return result;
}
function buildAccountError(error){
  const labels={account_changed:['账号已切换，请关闭后重新保存。当前配装已保留。','Your account changed. Close and save again; your current build is preserved.'],changed:['这份配装在其他设备更新过，请重新打开记录。','This build changed on another device. Reopen your records.'],limit:['配装记录已满，请先删除不需要的记录。','Your build library is full. Remove an unused record first.'],invalid:['名称或配装数据不完整，请检查后重试。','Check the name and build data, then retry.'],not_found:['这份配装已被删除，请刷新记录。','This build was deleted. Refresh your records.']};
  return labels[error.message]?L(...labels[error.message]):L('暂时无法保存，请重试；当前配装已保留在本机。','Unable to save. Retry; your current build remains on this device.');
}
function buildAccountLogin(action,options={}){
  flushPendingBuildSave();sessionStorage.setItem(BUILD_RESUME_KEY,JSON.stringify({action,name:String(options.name||'').slice(0,60),asNew:!!options.asNew,createdAt:Date.now()}));
  if(window.parent!==window&&typeof window.parent.authOpen==='function')window.parent.authOpen('login');else location.assign('/#forum');
}
function buildAccountDialog(title){
  document.getElementById('build-account-dialog')?.remove();
  const d=document.createElement('dialog');d.id='build-account-dialog';d.className='build-account-dialog';
  const h=document.createElement('header'),t=document.createElement('h2'),b=document.createElement('button');t.textContent=title;t.id='build-account-title';d.setAttribute('aria-labelledby',t.id);
  b.type='button';b.textContent=L('关闭','Close');b.onclick=()=>d.close();h.append(t,b);d.append(h);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;
}
async function buildAccountSave(asNew=false,resumeName=''){
  try{await buildAccountRequest('GET');}catch(e){if(e.message==='login_required')return buildAccountLogin('save',{asNew,name:resumeName});buildShareNotice(buildAccountError(e));return;}
  if(!buildShareSelected()){buildShareNotice(L('先装备一件武器或防具。','Equip a weapon or gear first.'));return;}
  const current=asNew?null:buildAccountCurrent,doc=buildShareDocument(),d=buildAccountDialog(L('保存配装','Save build'));
  const f=document.createElement('form'),l=document.createElement('label'),i=document.createElement('input'),help=document.createElement('p'),notice=document.createElement('p'),submit=document.createElement('button');
  l.textContent=L('配装名称','Build name');i.required=true;i.maxLength=60;i.value=resumeName||current?.name||'';i.autocomplete='off';l.append(i);
  help.textContent=L('保存装备、词条、天赋与条件数据。图片仅下载到本地。','Save gear, attributes, talents and conditions. Images download locally.');notice.setAttribute('role','status');submit.type='submit';submit.textContent=current?L('更新这份配装','Update this build'):L('保存到我的配装','Save to my builds');f.append(l,help,notice,submit);
  if(current){const copy=document.createElement('button');copy.type='button';copy.textContent=L('另存为新配装','Save a new copy');copy.onclick=()=>{d.close();buildAccountSave(true);};f.append(copy);}
  d.append(f);i.focus();
  f.onsubmit=async e=>{e.preventDefault();submit.disabled=true;notice.textContent=L('正在保存…','Saving…');try{const r=await buildAccountRequest(current?'PATCH':'POST',{id:current?.id,revision:current?.revision,name:i.value.trim(),document:doc});buildAccountCurrent=r.data;d.close();buildShareNotice(L('配装已保存：','Build saved: ')+r.data.name);}catch(e){if(e.message==='login_required'){d.close();buildAccountLogin('save',{name:i.value,asNew});}else notice.textContent=buildAccountError(e);}finally{submit.disabled=false;}};
}
async function buildAccountRecords(){
  let r;try{r=await buildAccountRequest('GET');}catch(e){if(e.message==='login_required')return buildAccountLogin('records');buildShareNotice(buildAccountError(e));return;}
  const d=buildAccountDialog(L('我的配装','My builds')),notice=document.createElement('p');notice.setAttribute('role','status');d.append(notice);
  if(!r.data.length){notice.textContent=L('还没有保存的配装。装备后点击“保存配装”。','No saved builds yet. Equip your items, then choose Save build.');return;}
  for(const record of r.data.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
    const row=document.createElement('section'),name=document.createElement('strong'),date=document.createElement('time'),load=document.createElement('button'),remove=document.createElement('button');name.textContent=record.name;date.dateTime=record.updatedAt;date.textContent=new Date(record.updatedAt).toLocaleString(L('zh-CN','en'));load.type=remove.type='button';load.textContent=L('载入','Load');remove.textContent=L('删除','Delete');
    const preview=document.createElement('details'),summary=document.createElement('summary');summary.textContent=L('装备与词条','Gear and attributes');preview.append(summary);const data=record.document.preview;
    if(data){const card=window.AgentHubBuildCard.render(data,null,LANG);if(card)preview.append(card);}
    load.onclick=()=>{try{const {raw,missing,moved}=buildShareRemap(structuredClone(record.document));if(!applySaved(raw))throw Error('invalid');buildAccountCurrent=record;renderAll();scheduleSync();d.close();buildShareNotice([missing?L('部分物品已不在当前资料库，对应槽位留空。','Some items are unavailable; those slots remain empty.'):L('已载入：','Loaded: ')+record.name,buildShareWmodNote(moved)].filter(Boolean).join(' '));}catch(e){notice.textContent=buildAccountError(e);}};
    remove.onclick=async()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent=L('确认删除','Confirm delete');return;}remove.disabled=true;try{await buildAccountRequest('DELETE',{id:record.id,revision:record.revision});if(buildAccountCurrent?.id===record.id)buildAccountCurrent=null;row.remove();notice.textContent=L('已删除配装记录。','Build record deleted.');}catch(e){notice.textContent=buildAccountError(e);}finally{remove.disabled=false;}};
    row.append(name,date,preview,load,remove);d.append(row);
  }
}
function buildAccountBoot(){
  const paint=()=>{document.getElementById('build-save').textContent=L('保存配装','Save build');document.getElementById('build-records').textContent=L('我的配装','My builds');if(typeof buildLayoutPaint==='function')buildLayoutPaint();};paint();onLangChange(paint);
  document.getElementById('build-save').onclick=()=>buildAccountSave();document.getElementById('build-records').onclick=buildAccountRecords;
  document.getElementById('reset')?.addEventListener('click',()=>{buildAccountCurrent=null;});document.getElementById('impf')?.addEventListener('change',()=>{buildAccountCurrent=null;});
  let pending;try{pending=JSON.parse(sessionStorage.getItem(BUILD_RESUME_KEY));}catch(_){}
  if(pending&&Date.now()-pending.createdAt<600000){sessionStorage.removeItem(BUILD_RESUME_KEY);if(pending.action==='records')buildAccountRecords();else buildAccountSave(!!pending.asNew,pending.name||'');}
}
