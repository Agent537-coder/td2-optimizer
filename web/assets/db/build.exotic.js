/* 奇特武器收起天赋 · 只读链接。不改 engine.js，不参加 combatInPlay。
   ───────────────────────────────────────────────────────────────────────────────
   结论：Y8S3.1 解包和 geardb 都没有可复现的「武器 → 收起天赋」链接。
   exoticHolsterLinks() 因此返回 []。不要用中文名、英文名或代号前缀补配对。

   已核对、并且都接不上的位置：
   · weapons[] 只有 talent 一个指针，来自 ItemGenerationConfig.myTalentSlots
     .ItemTalentSlot.myPresetTalent（阶段 12 / 21）。没有 holster 字段。
   · 70 把 exotic 的 mitem、family、tags、share_group、src 都不含收起天赋 key。
     share_group 只把变体指回另一把武器（摇篮曲→美梦、无情→冷酷无情）。
   · talents_official 里 8 条 talent_exotic_*_holstered 的 mitem 是自身 .mtalent
     文件名。gun / guns 只到枪种（assaultrifle、rifle…），marksman 那条连枪种都空。
     枪种对不上具体 mitem。
   · 全库 ItemGenerationConfig 的 myPresetTalent 没有任何一条等于 *_holstered。
     随机天赋池 talentlist 里也没有这些 exotic 收起天赋；池里的是
     talent_slot_holstered_*，那是可滚的部位天赋，不是奇特武器的第二条。
   · .mitem / .mweapon 没有天赋列表。WeaponItem 类本身也没有 Talent 字段。
   · myIsHolsteredTalent 只决定「这条天赋已经在件上时，收起才生效」
     （talent.fruit）。它不是件指针。防护火力的 uid
     3797E3755C4242A8000321E7E0D0F95A 只出现在它自己的 .mtalent，以及
     itemgenerationsettings.rejuice 的 Exotic 分类总表。

   缺的那一环：武器生成配置（或 .mitem）上的第二条官方指针。没有它，收起天赋
   不会进入 weapons[].talent，combatInPlay 也只会拿到当前手持武器的 talent.key。

   前缀不是挂接规则，所以不生成：
   驯鹰人的配置 exotic_assaultrifle_mk1 明确写了两条 preset：
   talent_exotic_assault_rifle_mk1_a 与 talent_exotic_assault_rifle_mk1_b。
   同文件的 talent_exotic_assault_rifle_mk1_holstered 不在槽里。
   _a / _b 要被点名才挂上，_holstered 没有被点名。下面三组只是代号相邻，不是链接：
   · player_weapon_assaultrifle_exotic_t1_v1
       talent_exotic_assault_rifle_mk1_a ↛ talent_exotic_assault_rifle_mk1_holstered
   · player_weapon_lightmachinegun_m249_exotic_v1
       talent_exotic_lmg_mk1_a ↛ talent_exotic_lmg_mk1_holstered
   · player_weapon_submachinegun_p90_exotic_v1
       talent_exotic_smg_mk1 ↛ talent_exotic_smg_mk1_holstered
   另外 talent_exotic_shotgun_mk1_holstered 的标志是 myIsHolsteredTalent FALSE、
   myIsWeaponSetTalent TRUE。美梦的规则读过它的属性名，但武器 preset 仍是
   talent_exotic_shotgun_mk2，没有把这条天赋装到 mitem 上。

   有些收起效果写在当前那条 preset 里面，不另开 key，例如煽动者
   talent_exotic_assault_rifle_pandoran_harmony、鞭挞
   talent_exotic_pistol_faster_than_reloading。那不是本文件要补的第二条链接。

   数量：70 把 exotic 全部无法链接；8 条 talent_exotic_*_holstered 全部没有武器指针。
   其中 7 条在 .mtalent 里 myIsHolsteredTalent TRUE（shotgun 那条不是）。 */

function exoticHolsterLinks(){
  return [];
}

/* activeIndex 留作以后按手持槽过滤。链接为空时不读 DB / state。 */
function exoticHolsterRows(activeIndex){
  const links=exoticHolsterLinks();
  if(!links.length||activeIndex==null||activeIndex<0)return [];
  const slots=typeof state!=="undefined"&&state&&state.wslots;
  const weapons=typeof DB!=="undefined"&&DB&&DB.weapons;
  const weapon=slots&&weapons&&weapons[slots[activeIndex]];
  if(!weapon)return [];
  return links.filter(function(row){return row.weaponMitem===weapon.mitem;});
}
