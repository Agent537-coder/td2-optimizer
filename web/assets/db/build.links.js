/* Reference links never equip or overwrite a saved build on arrival. */
function buildDbLink(cat,o){
  if(!o)return '';
  const id=o.uid||o.mitem||o.key;if(!id)return '';
  return `<a class="build-db-link" href="/db?${esc(new URLSearchParams({cat,id}).toString())}" target="_blank" rel="noopener">${esc(L('查看资料','Database'))} ↗</a>`;
}
/* Incoming database inspect links never equip or overwrite a saved build on arrival. */
function buildInspectFromUrl(){
  const p=new URLSearchParams(location.search),id=p.get('inspect'),kind=p.get('kind');if(!id)return;
  const rows=kind==='weapons'?DB.weapons:kind==='gear'?DB.gear:[],item=(rows||[]).find(o=>o.mitem===id||o.uid===id);
  let box=document.getElementById('build-inspect');
  if(!box){box=document.createElement('section');box.id='build-inspect';box.className='build-inspect';document.querySelector('main').prepend(box);}
  if(!item){box.textContent=L('未找到要查看的物品；已保留现有配装。','Item not found; your existing build is unchanged.');return;}
  box.innerHTML=`<strong>${esc(nmTxt(item))}</strong><p>${esc(L('来自资料库。现有配装未改变，请选择位置后在列表中确认。','From the database. Your build is unchanged; choose a slot, then confirm in the picker.'))}</p>`;
  const slots=kind==='gear'?[G_SLOTID.indexOf(item.slot)]:item.type==='手枪'?[2]:[0,1];
  slots.filter(i=>i>=0).forEach(slot=>{
    const button=document.createElement('button');button.type='button';button.textContent=L('选择：','Choose: ')+L(...(kind==='gear'?G_SLOTS[slot]:W_SLOTS[slot]));
    button.onclick=()=>{
      openDlg(kind==='gear'?'g':'w',slot);
      const d=state.dlg;d.q=nmTxt(item);
      if(kind==='gear'){d.mode='list';d.gkind=item.kind;d.sub='';}
      else{d.wtype=WTYPES.indexOf(item.type)+1;d.wkind=wKindOf(item);}
      renderDlg();
    };box.appendChild(button);
  });
}
// Links inside clickable equipment cards must not also open their pickers.
document.addEventListener('click',e=>{if(e.target.closest('.build-db-link'))e.stopPropagation();},true);
window.addEventListener('DOMContentLoaded',()=>onLangChange(buildInspectFromUrl));
