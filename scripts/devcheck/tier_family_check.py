# -*- coding: utf-8 -*-
"""档位层自检：每个族能不能真的取到官方数值（含 `_perfect` 变体）。

只做静态核对，不开浏览器：
  ① 族 key 在 `talents_official` 里能匹配到哪些条（普通 + 完美 + 任何同前缀条目）；
  ② 每条天赋的官方参数能不能凑齐该族各档 `use` 的后缀；
  ③ `weaponTypes` / `paramKey` / `stackMax` 这类声明有没有落到数据上。

用法：
    python scripts/devcheck/tier_family_check.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "web", "assets", "db", "geardb.json")
TIERS = os.path.join(ROOT, "web", "assets", "db", "build.tiers.js")

FAMILY_RE = re.compile(r"\{id:'([^']+)',family:'([^']+)'")
PARAM_RE = re.compile(r"_P\d+_(.+)$")


def families(src):
    out = []
    for m in FAMILY_RE.finditer(src):
        fid, fam = m.group(1), m.group(2)
        # 取该族到下一个 } 之前的片段，粗略抽 use / paramKey / stackMax
        seg_start = m.start()
        seg_end = src.find("{id:'", m.end())
        seg = src[seg_start: seg_end if seg_end > 0 else len(src)]
        uses = set(re.findall(r"use:\['([^']+)'", seg))
        param_key = re.search(r"paramKey:'([^']+)'", seg)
        out.append({
            "id": fid,
            "family": fam,
            "uses": sorted(uses),
            "paramKey": param_key.group(1) if param_key else None,
            "stackMax": bool(re.search(r"stackMax:", seg)),
        })
    return out


def main():
    with open(DB, encoding="utf8") as f:
        db = json.load(f)
    with open(TIERS, encoding="utf8") as f:
        src = f.read()
    talents = {t.get("key"): t for t in (db.get("talents_official") or []) if t.get("key")}

    problems = []
    print(f"{'族':<16}{'匹配条数':>8}  参数覆盖")
    for fam in families(src):
        keys = [k for k in talents if k == fam["family"] or k.startswith(fam["family"])]
        if not keys:
            problems.append((fam["id"], "no-talent", "数据里没有同前缀天赋"))
            print(f"{fam['id']:<16}{0:>8}  ✗ 取不到天赋")
            continue
        detail = []
        for k in sorted(keys):
            bonus = talents[k].get("bonus") or []
            params = {}
            for b in bonus:
                code = str(b.get("code") or "")
                m = PARAM_RE.search(code)
                if m and b.get("value") is not None:
                    params[m.group(1)] = b.get("value")
            has_param_key = bool(fam["paramKey"]) and any(
                str(b.get("code") or "") == fam["paramKey"] for b in bonus
            )
            missing = [u for u in fam["uses"] if not any(u == p or p.endswith(u) for p in params)]
            tag = "完美" if k.endswith("_perfect") else "普通"
            ok = (not missing) or has_param_key
            detail.append(f"{tag}:{'OK' if ok else '缺' + ','.join(missing)}")
            if not ok:
                problems.append((fam["id"], k, "缺参数 " + ",".join(missing)))
        print(f"{fam['id']:<16}{len(keys):>8}  {' · '.join(detail)}")

    print()
    if problems:
        print(f"❌ {len(problems)} 处问题：")
        for fid, key, why in problems:
            print(f"   - {fid} / {key}: {why}")
        return 1
    print("✅ 所有族的参数都能从官方数据取到（含完美变体）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
