/* One compact, read-only loadout renderer for forum posts and saved records.
   Strings use textContent; icons are restricted to the site's catalog paths. */
(()=>{
  const labels={weapons:['武器','Weapons'],gear:['装备','Gear'],skills:['技能','Skills'],optics:['瞄具','Optics'],muzzle:['枪口','Muzzle'],underbarrel:['握把','Underbarrel'],magazine:['弹匣','Magazine'],empty:['未装备','Empty'],open:['打开完整配装','Open full build']};
  function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e;}
  function render(preview,url,lang='zh'){
    if(!preview||!Array.isArray(preview.weapons)||!Array.isArray(preview.gear)||!Array.isArray(preview.skills))return null;
    const en=lang==='en',t=k=>labels[k]?.[en?1:0]||k,name=o=>o&&String(en?o.en||o.zh:o.zh||o.en||'').slice(0,160),root=element('div','ah-loadout');root.lang=en?'en':'zh-CN';
    const image=(path,cls)=>{if(typeof path!=='string'||path.includes('..')||!/^[-\w/ .]+\.png$/.test(path))return null;const e=element('img',cls);e.src=dbIcon('/assets/db/img/'+path.split('/').map(encodeURIComponent).join('/'));e.alt='';e.loading='lazy';e.decoding='async';e.onerror=()=>e.remove();return e;};
    const attrs=(rows,parent)=>{for(const row of (Array.isArray(rows)?rows:[]).slice(0,8)){if(!row||typeof row!=='object')continue;const line=element('div','ah-loadout-attr');line.dataset.kind=['off','def','uti'].includes(row.kind)?row.kind:'';const label=element('span','ah-loadout-attr-label');if(line.dataset.kind){const glyph=element('i','ah-loadout-attr-icon');glyph.setAttribute('aria-hidden','true');glyph.style.setProperty('--attr-image',"url('"+dbIcon('/assets/db/img/modfilter/'+({off:'offense',def:'defense',uti:'utility'}[line.dataset.kind])+'.png')+"')");label.append(glyph);}label.append(element('span','',name(row)));line.append(label,element('b','',String(row.value??'').slice(0,40)));parent.append(line);}};
    const effect=(row,parent,augment=false)=>{if(!row)return;const e=element('span','ah-loadout-effect'),ic=image(row.icon,'ah-loadout-glyph');if(ic)e.append(ic);e.append(element('span','',name(row)+(augment?' · Lv.'+Math.max(1,Math.min(10,Number(row.level)||10)):'')));parent.append(e);};
    const context=preview.context||{},spec=name(context.specialization);root.append(element('div','ah-loadout-context',[context.mode==='PvP'?'PvP':'PvE',spec,context.prototype?(en?'Prototype':'原型'):''].filter(Boolean).join(' · ')));
    for(const [kind,slots] of [['weapons',preview.weapons.slice(0,3)],['gear',preview.gear.slice(0,6)],['skills',preview.skills.slice(0,2)]]){
      root.append(element('h3','ah-loadout-heading',t(kind)));const grid=element('div','ah-loadout-'+kind);root.append(grid);
      slots.forEach((item,i)=>{const card=element('section','ah-loadout-item');card.dataset.quality=['proto','exotic','gearset','named','brand'].includes(item?.quality)?item.quality:'brand';
        /* `rarity` = 物品真实身份：原型档下 `quality` 会被压成 proto（色条跟卡面），但名称色仍要跟着身份走。 */
        if(item?.rarity)card.dataset.rarity=item.rarity;
        /* 品质色条：与配装页卡片顶部那条同源（`base.css` 的 --rar-*），导出图不能再只有名字颜色。 */
        card.append(element('i','ah-loadout-bar'));
        const slot=kind==='weapons'?(en?['Primary','Secondary','Sidearm']:['主武器','副武器','手枪'])[i]:kind==='skills'?['Q','E'][i]:(en?['Mask','Backpack','Chest','Gloves','Holster','Kneepads']:['面具','背包','胸甲','手套','枪套','护膝'])[i];
        const slotLabel=element('span','ah-loadout-slot');if(kind==='gear'){const slotIc=image(['ui/gs_mask.png','ui/gs_backpack.png','ui/gs_chest.png','ui/gs_gloves.png','ui/gs_holster.png','ui/gs_knees.png'][i],'ah-loadout-slot-icon');if(slotIc)slotLabel.append(slotIc);}slotLabel.append(document.createTextNode(slot));card.append(slotLabel);if(!item){card.append(element('p','ah-loadout-empty',t('empty')));grid.append(card);return;}
        const head=element('div','ah-loadout-head'),ic=image(item.icon,'ah-loadout-art');if(ic)head.append(ic);head.append(element('strong','ah-loadout-name',name(item)));card.append(head);
        const mark=image(item.brandIcon,'ah-loadout-brand');if(mark)card.append(mark);
        const values=element('div','ah-loadout-attrs');attrs(item.attrs,values);card.append(values);
        const effects=element('div','ah-loadout-effects');effect(item.talent,effects);effect(item.augment,effects,true);if(effects.childNodes.length)card.append(effects);
        if(item.mod){const mod=element('div','ah-loadout-mod');mod.append(element('span','',name(item.mod)));attrs(item.mod.attrs,mod);card.append(mod);}
        if(kind==='weapons'){
          const mods=element('div','ah-loadout-mods'),entries=Array.isArray(item.mods)?item.mods:[];
          ['optics','muzzle','underbarrel','magazine'].forEach((slot,index)=>{
            const entry=entries.find(m=>m&&m.slot===slot),rows=Array.isArray(entry?.item?.attrs)?entry.item.attrs.filter(a=>a&&typeof a==='object').slice(0,4):[];
            const row=element('div','ah-loadout-weapon-mod'+(!entry?' is-unavailable':!entry.item?' is-empty':rows.length?' has-bonus':''));
            row.title=entry?.item?name(entry.item):entry?t('empty'):(en?'No slot':'无插槽');
            const slotLabel=element('span','ah-loadout-mod-slot'),glyph=image('weaponmod'+(index+1)+'.png','ah-loadout-slot-icon');if(glyph)slotLabel.append(glyph);slotLabel.append(document.createTextNode(t(slot)));
            const bonus=element('span','ah-loadout-mod-bonus');
            if(rows.length){for(const a of rows){const line=element('span','ah-loadout-mod-stat');line.append(element('span','',name(a)),element('b','',String(a.value??'').slice(0,40)));bonus.append(line);}}
            else bonus.textContent=!entry?(en?'None':'无'):!entry.item?t('empty'):(en?'No stat bonus':'无数值加成');
            row.append(slotLabel,bonus);mods.append(row);
          });card.append(mods);
        }
        if(kind==='skills'&&item.tier!=null)card.append(element('span','ah-loadout-skill-tier',(en?'Skill tier ':'技能分阶 ')+String(item.tier).slice(0,8)));grid.append(card);
      });
    }
    if(url){const link=element('a','ah-loadout-open',t('open'));link.href=url;root.append(link);}return root;
  }
  window.AgentHubBuildCard={render};
})();
