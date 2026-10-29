/* Pen sS1P9 · transactional item selection. No engine/database changes. */
let buildPickerUndo=null,buildPickerBusy=false;
function buildPickerCurrent(d){return d.kind==='g'?state.slots[d.slot]:state.wslots[d.slot];}
function buildPickerItem(kind,id,slot){
 if(!Number.isInteger(id))return null;
 if(kind==='w'){const w=arr(DB.weapons)[id];return w&&!w.not_in_game&&buildWeaponRepresentative(w)&&combatWeaponAllowed(w,slot)?w:null;}
 return GEAR.some(x=>x&&x.raw===id&&x.slot_idx===slot)?GEAR_ITEMS[id]||null:null;
}
function buildPickerSlot(kind,slot){
 const keys=kind==='g'?['slots','core','affix','gtal','gmods']:['wslots','talents','wmods','waffix'];
 const data={};for(const key of keys)data[key]=buildClone(state[key][slot]);
 const ai=kind==='g'?slot:slot+6,au=state.bp.augments;
 data.augment=buildClone(au?.[ai]??null);data.augmentMeta={exists:Array.isArray(au),length:arr(au).length,hadIndex:!!au&&Object.prototype.hasOwnProperty.call(au,ai)};
 if(kind==='w')data.wactive=state.wactive;
 return data;
}
function buildPickerRestore(kind,slot,data){
 for(const key of Object.keys(data))if(!['augment','augmentMeta','wactive'].includes(key))state[key][slot]=buildClone(data[key]);
 const ai=kind==='g'?slot:slot+6,meta=data.augmentMeta;
 if(meta.exists||state.bp.augments){const au=arr(state.bp.augments).slice();if(meta.hadIndex)au[ai]=buildClone(data.augment);else delete au[ai];if(au.slice(meta.length).every(x=>x==null))au.length=meta.length;
  if(!meta.exists&&au.every(x=>x==null))delete state.bp.augments;else state.bp.augments=au;
 }
 if(kind==='w')state.wactive=data.wactive;
}
function buildPickerRowInfo(el,d){
 if(el.dataset.act==='gfill'){const key=el.dataset.k||'';return {kind:'g',id:key.startsWith('raw:')?+key.slice(4):gearRepRaw(d.slot,key),group:key};}
 const row=DLG_ROWS[+el.dataset.row];return row?{kind:d.kind,id:d.kind==='g'?row[2]:row[1]}:null;
}
function buildPickerMount(){
 const d=state.dlg,box=document.getElementById('dlg'),enabled=d&&(d.kind==='g'||d.kind==='w');
 box.classList.toggle('build-picker',!!enabled);delete box.dataset.pickerView;
 if(!enabled)return;
 const list=document.getElementById('dlglist'),work=document.createElement('div');work.className='build-picker-workspace';
 list.before(work);work.append(list);
 const detail=document.createElement('section');detail.id='build-picker-detail';detail.setAttribute('aria-label',L('候选详情与当前装备对照','Candidate details and current item comparison'));work.append(detail);
 const foot=document.createElement('div');foot.className='build-picker-footer';foot.innerHTML='<p id="build-picker-note" role="status" aria-live="polite"></p><button type="button" class="mini primary" id="build-picker-apply" data-act="picker-apply" disabled></button>';box.append(foot);
 box.dataset.pickerView=d.pickerView||'list';
}
function buildPickerRows(){
 const d=state.dlg;if(!d||!['g','w'].includes(d.kind))return;
 document.querySelectorAll('#dlglist [data-act="pickg"],#dlglist [data-act="pickw"],#dlglist [data-act="gfill"]').forEach(el=>{
  const info=buildPickerRowInfo(el,d);if(!info)return;
  const selected=d.pickerId!=null&&d.pickerId===info.id,current=buildPickerCurrent(d);
  const equipped=!!(current===info.id||(info.group&&!info.group.startsWith('raw:')&&gearGroupKey(gearOf(d.slot))===info.group));
  el.classList.toggle('picker-selected',selected);el.classList.toggle('picker-equipped',equipped);el.setAttribute('aria-pressed',String(selected));
  el.dataset.pickerId=String(info.id);
  let mark=el.querySelector('.picker-mark,.badge');if(!mark){mark=document.createElement('span');el.append(mark);}mark.className='picker-mark';
  mark.textContent=equipped?L('已装备','Equipped'):selected?L('待应用','Pending'):L('查看','Details');
  if(selected&&equipped)mark.textContent=L('已装备 · 已选','Equipped · Selected');
 });
}
function buildPickerGearAttrs(it,slot,current){
 if(!it)return [];
 if(current)return collectAttrs(it,slot,{});
 const choices=coreChoices(it),own=arr(it.attrs_max?.slots).find(x=>x.kind==='core'&&x.code),core=choices?(own&&choices.includes(own.code)?own.code:choices[0]):null;
 const affix=[],used=new Set();for(let k=0;k<nRandomSlots(it);k++){const code=randomSlotCodes(it,k).find(c=>c&&!used.has(c));if(code){used.add(code);affix.push(code);}}
 return collectAttrs(it,slot,{core:{[slot]:core},affix:{[slot]:affix}});
}
function buildPickerAttributes(kind,it,slot,current){
 if(kind==='g')return buildPickerGearAttrs(it,slot,current);
 if(!it)return [];
 const fields=[['dmg','基础伤害','Base damage',''],['rpm','射速','RPM',''],['mag','弹匣容量','Magazine',''],['reload','装填时间','Reload time','s'],['range','最佳射程','Optimal range','m']];
 return fields.filter(([key])=>it[key]!=null&&Number.isFinite(+it[key])).map(([key,zh,en,unit])=>({key,name:L(zh,en),unit,val:+it[key]}));
}
function buildPickerAttrLabel(row,items){
 if(LANG!=='en')return row.name||row.key;
 for(const item of items){const source=arr(item?.attrs_max?.slots).find(x=>x.name_zh===row.name&&(x.unit||'')===(row.unit||''));if(source?.name_en)return source.name_en;}
 return AFFIX_EN[row.name]||row.name||row.key;
}
function buildPickerComparison(kind,current,candidate,slot){
 const a=buildPickerAttributes(kind,current,slot,true),b=buildPickerAttributes(kind,candidate,slot,current===candidate);
 const keyed=rows=>{const out=new Map();for(const r of rows){const val=r.val??r.value;if(!Number.isFinite(+val)||val==null)continue;const unit=String(r.unit||''),key=String(r.key||r.name)+'|'+unit;const old=out.get(key);out.set(key,{...r,unit,val:(old?.val||0)+(+val)});}return out;};
 const before=keyed(a),after=keyed(b),keys=[...new Set([...before.keys(),...after.keys()])];
 const value=r=>r?esc(fmtN(r.val))+(r.unit?' '+esc(r.unit):''):'—';
 const rows=keys.map(key=>{const x=before.get(key),y=after.get(key),r=y||x;let delta='—';if(x&&y){const n=y.val-x.val;delta=(n>0?'+':'')+fmtN(n)+(r.unit==='%'?L(' 个百分点',' pp'):r.unit?' '+r.unit:'');}else delta=y?L('新增','Added'):L('移除','Removed');
  return `<tr><th scope="row">${esc(buildPickerAttrLabel(r,[candidate,current]))}</th><td>${value(x)}</td><td>${value(y)}</td><td>${esc(delta)}</td></tr>`;}).join('');
 return `<div class="picker-table-wrap"><table class="picker-table"><caption>${esc(kind==='g'?L('单件属性对照','Single-item attributes'):L('武器基础数值对照','Weapon base statistics'))}</caption><thead><tr>${['属性','当前','候选','差异'].map((s,i)=>'<th scope="col">'+esc(L(s,['Attribute','Current','Candidate','Change'][i]))+'</th>').join('')}</tr></thead><tbody>${rows||'<tr><td colspan="4">'+esc(L('该件暂无可对照数值','No comparable values available'))+'</td></tr>'}</tbody></table></div>`;
}
function buildPickerBrandComparison(candidate,slot){
 const gear=state.slots.map((_,i)=>gearOf(i)),before=effectiveGearCounts(gear);gear[slot]=candidate;const after=effectiveGearCounts(gear),keys=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>(before[k]||0)!==(after[k]||0));
 return keys.length?'<div class="picker-set-changes"><h4>'+esc(L('品牌 / 套装件数变化','Brand / gear set piece changes'))+'</h4>'+keys.map(k=>'<p><span>'+esc(brandRowName(k))+'</span><span>'+esc(String(before[k]||0))+' → '+esc(String(after[k]||0))+'</span></p>').join('')+'</div>':'';
}
function buildPickerPaint(){
 const d=state.dlg,box=document.getElementById('dlg'),host=document.getElementById('build-picker-detail');if(!d||!host||!['g','w'].includes(d.kind))return;
 buildPickerRows();box.dataset.pickerView=d.pickerView||'list';
 const id=d.pickerId,candidate=buildPickerItem(d.kind,id,d.slot),current=buildPickerItem(d.kind,buildPickerCurrent(d),d.slot),same=candidate&&id===buildPickerCurrent(d),apply=document.getElementById('build-picker-apply'),note=document.getElementById('build-picker-note');
 apply.disabled=!candidate||same||buildPickerBusy;apply.textContent=L('应用到配装','Apply to loadout');
 note.textContent=d.pickerError||(!candidate?L('选择候选以查看详情；不会立即装备','Select a candidate to inspect it; your loadout stays unchanged'):same?L('已装备此件，无需重复应用','Already equipped; no need to apply again'):L('候选尚未装备','Candidate not equipped yet'));
 if(!candidate){host.innerHTML='<div class="picker-placeholder"><span class="picker-kicker">'+esc(L('候选详情','CANDIDATE DETAILS'))+'</span><h3>'+esc(L('先选一件，再决定','Inspect before replacing'))+'</h3><p>'+esc(L('详情与当前装备并排对照。关闭或返回不会修改配装。','Compare with your current item. Closing or going back leaves your loadout unchanged.'))+'</p></div>';return;}
 const icon=d.kind==='g'?candidate.gear_icon:candidate.icon,kind=d.kind==='g'?L(G_KIND_ZH[candidate.kind]||'',G_KIND_EN[candidate.kind]||''):L(...W_KIND_ZH[wKindOf(candidate)]);
 const desc=L(candidate.desc_zh||'',candidate.desc_en||candidate.desc_zh||''),tal=d.kind==='g'?gearTalent(candidate):(()=>{const t=weaponFixedTalent(candidate);return t?L(t.zh||t.name||t.en,t.en||t.zh||t.name):'';})();
 const previous=current?nmTxt(current):L('空槽','Empty slot');
 host.innerHTML=`<button type="button" class="mini picker-back" data-act="picker-back">← ${esc(L('返回候选列表','Back to candidates'))}</button><div class="picker-item-head">${icon?iconImg(icon):silIcon(d.slot,'--mut')}<div><span class="picker-kicker">${esc(L('候选 · 未写入','CANDIDATE · PREVIEW'))}</span><h3 tabindex="-1" id="picker-candidate-heading">${esc(nmTxt(candidate))}</h3><p>${esc(kind)}${candidate.brand?' · '+esc(L(candidate.brand,candidate.brand_en||candidate.brand)):''}</p></div></div><p class="picker-current-name">${esc(L('当前：','Current: '))}${esc(previous)}</p>${desc?'<p class="picker-description">'+esc(desc)+'</p>':''}${tal?'<p class="picker-talent"><span>'+esc(L('件自带天赋','Built-in talent'))+'</span> '+esc(tal)+'</p>':''}${buildPickerComparison(d.kind,current,candidate,d.slot)}${d.kind==='g'?buildPickerBrandComparison(candidate,d.slot):''}<p class="picker-disclaimer">${esc(d.kind==='g'?L('候选按该件默认核心 / 副属性预览；应用后仍可编辑。插件与增幅不在本表中。属性差异不是 DPS 提升，整套收益取决于品牌 / 套装门槛及战斗条件。','Candidate uses its default core / affixes; you can edit them after applying. Mods and augments are not included in this table. Attribute differences are not DPS gains; build results depend on set thresholds and combat conditions.'):L('仅比较武器基础数值，不包含天赋、配件和战斗条件；装填时间减少不等于负收益。','Base statistics only, excluding talents, mods and combat conditions. A shorter reload is not a loss.'))}</p>`;
}
function buildPickerSelect(kind,id,source){
 const d=state.dlg;if(!d||d.kind!==kind)return;
 if(!buildPickerItem(kind,id,d.slot)){d.pickerError=L('候选数据已失效，请重新选择','Candidate unavailable. Select another item.');buildPickerPaint();return;}
 d.pickerId=id;d.pickerError='';d.pickerView='detail';d.pickerSource=source;d.pickerScroll=document.getElementById('dlglist')?.scrollTop||0;
 buildPickerPaint();if(matchMedia('(max-width:760px)').matches)document.getElementById('picker-candidate-heading')?.focus({preventScroll:true});
}
function buildPickerCommit(remove=false){
 const d=state.dlg;if(!d||!['g','w'].includes(d.kind)||buildPickerBusy)return;
 const id=remove?null:d.pickerId,item=remove?null:buildPickerItem(d.kind,id,d.slot);
 if((!remove&&!item)||id===buildPickerCurrent(d)){d.pickerError=!item&&!remove?L('候选数据已失效，请重新选择','Candidate unavailable. Select another item.'):'';buildPickerPaint();return;}
 const before=buildPickerSlot(d.kind,d.slot);buildPickerBusy=true;
 try{
  if(d.kind==='g'){state.slots[d.slot]=id;state.gmods[d.slot]=null;state.axopen=-1;autoFillGear(d.slot);}
  else{state.wslots[d.slot]=id;state.talents[d.slot]=-1;state.wmods[d.slot]=null;state.waffix[d.slot]=item?weaponAffixCodes(item)[0]||null:null;
   if(state.bp.augments){state.bp.augments=arr(state.bp.augments).slice();state.bp.augments[d.slot+6]=null;}
   if(remove&&state.wactive===d.slot)state.wactive=state.wslots.findIndex(x=>x!=null);else if(!remove&&state.wactive<0)state.wactive=d.slot;
  }
  const after=buildPickerSlot(d.kind,d.slot);buildPickerUndo={kind:d.kind,slot:d.slot,before,after:JSON.stringify(after),label:remove?L('已卸下装备','Item removed'):L('已装备：','Equipped: ')+nmTxt(item)};
  closeDlg();if(d.kind==='g')document.getElementById('build-item-dialog')?.close();renderAll();buildPickerNotice();
 }catch(error){buildPickerRestore(d.kind,d.slot,before);buildPickerUndo=null;if(state.dlg){d.pickerError=L('应用失败，原配装已保留','Could not apply. Original loadout retained.');buildPickerPaint();}else{const bar=document.getElementById('build-picker-feedback');bar.hidden=false;bar.querySelector('[role=status]').textContent=L('应用失败，原配装已保留','Could not apply. Original loadout retained.');bar.querySelector('button').hidden=true;}}
 finally{buildPickerBusy=false;}
}
function buildPickerNotice(){
 const bar=document.getElementById('build-picker-feedback');if(!bar)return;
 if(buildPickerUndo&&JSON.stringify(buildPickerSlot(buildPickerUndo.kind,buildPickerUndo.slot))!==buildPickerUndo.after)buildPickerUndo=null;
 bar.hidden=!buildPickerUndo;if(!buildPickerUndo)return;bar.querySelector('button').hidden=false;
 bar.querySelector('[role=status]').textContent=buildPickerUndo.label;bar.querySelector('button').textContent=L('撤销替换','Undo replacement');
}
function buildPickerRevert(){
 const u=buildPickerUndo;if(!u)return;
 if(JSON.stringify(buildPickerSlot(u.kind,u.slot))!==u.after){buildPickerUndo=null;buildPickerNotice();return;}
 buildPickerRestore(u.kind,u.slot,u.before);buildPickerUndo=null;renderAll();
 const bar=document.getElementById('build-picker-feedback');bar.hidden=false;bar.querySelector('[role=status]').textContent=L('已撤销替换，原装备已恢复','Replacement undone. Original item restored.');bar.querySelector('button').hidden=true;
 document.querySelector((u.kind==='g'?'#ggrid .gcard':'#wstrip [data-act="wsl"]')+'[data-i="'+u.slot+'"]')?.focus({preventScroll:true});
}
function initBuildPicker(){
 if(document.getElementById('build-picker-feedback'))return;
 const bar=document.createElement('section');bar.id='build-picker-feedback';bar.hidden=true;bar.setAttribute('aria-label',L('配装替换结果','Item replacement result'));bar.innerHTML='<p role="status" aria-live="polite"></p><button type="button" class="mini" data-act="picker-undo"></button>';document.getElementById('build-toolbar').after(bar);
}
function buildPickerBack(){
 const d=state.dlg;if(!d)return;d.pickerView='list';buildPickerPaint();const list=document.getElementById('dlglist');if(list)list.scrollTop=d.pickerScroll||0;
 const source=d.pickerSource?.isConnected?d.pickerSource:document.querySelector('#dlglist .picker-selected');source?.focus({preventScroll:true});
}
