# -*- coding: utf-8 -*-
"""天赋计数盘点：哪些天赋的条件/数值真的进了配装器，哪些还空着、为什么。

读三份真值，不做推断：
  ① `web/assets/db/geardb.json` 的 `combat_audit.gear_rules`（数据规则层）
  ② `web/assets/db/build.tiers.js` 的 `TAL_TIER_FAMILIES`（档位层，按族名/键前缀匹配）
  ③ `combat_audit.talents[key].status`（unsupported / conditional_component …）

用法：
    python scripts/devcheck/talent_count_inventory.py            # 打印摘要
    python scripts/devcheck/talent_count_inventory.py --write    # 写 docs/audits/TALENT-COUNT.md
"""
import argparse
import json
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "web", "assets", "db", "geardb.json")
TIERS = os.path.join(ROOT, "web", "assets", "db", "build.tiers.js")
OUT = os.path.join(ROOT, "docs", "audits", "TALENT-COUNT.md")

DAMAGE_HINT = re.compile(r"damage|dmg|crit|headshot|rate|rpm", re.I)


def load():
    with open(DB, encoding="utf8") as f:
        db = json.load(f)
    with open(TIERS, encoding="utf8") as f:
        tiers_src = f.read()
    return db, tiers_src


def tier_families(src):
    """从 build.tiers.js 里取 {id, family}（不执行 JS，只认写法稳定的两个字面量）。"""
    out = []
    for m in re.finditer(r"\{id:'([^']+)',family:'([^']+)'", src):
        out.append({"id": m.group(1), "family": m.group(2)})
    return out


def classify(db, fams):
    rules = {r.get("k"): r for r in (db.get("combat_audit", {}).get("gear_rules") or [])}
    status = db.get("combat_audit", {}).get("talents") or {}
    rows = []
    for t in (db.get("talents_official") or []):
        key = t.get("key")
        if not key:
            continue
        rule = rules.get(key)
        via = ""
        if rule and (rule.get("rows") or []):
            via = "rule"
        else:
            for f in fams:
                if key == f["family"] or key.startswith(f["family"]):
                    via = "tier:" + f["id"]
                    break
        if not via:
            st = (status.get(key) or {}).get("status") or ""
            via = "mechanic" if st == "conditional_component" else ("unsupported" if st else "unmapped")
        nums = [b for b in (t.get("bonus") or []) if b.get("value") is not None]
        rows.append({
            "key": key,
            "zh": t.get("zh") or t.get("en") or key,
            "kind": t.get("kind") or "",
            "via": via,
            "numeric": len(nums),
            "damage_like": any(DAMAGE_HINT.search(str(b.get("code") or "")) for b in nums),
            "note": ((rule or {}).get("note") or [""])[0],
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    db, src = load()
    fams = tier_families(src)
    rows = classify(db, fams)
    counts = Counter(r["via"].split(":")[0] for r in rows)

    backlog = [r for r in rows if r["via"] in ("mechanic", "unsupported", "unmapped") and r["numeric"] and r["damage_like"]]
    lines = [
        "# 天赋计数盘点（配装器）",
        "",
        "由 `python scripts/devcheck/talent_count_inventory.py --write` 生成，勿手改。",
        "",
        "## 总量",
        "",
        "| 通道 | 条数 |",
        "|---|---|",
    ]
    for k in ("rule", "tier", "mechanic", "unsupported", "unmapped"):
        lines.append(f"| {k} | {counts.get(k, 0)} |")
    lines += [
        "",
        f"档位族：{len(fams)}（{', '.join(f['id'] for f in fams)}）",
        "",
        "## 仍在「有数值但没进枪械计算」的（待定口径）",
        "",
    ]
    if backlog:
        lines += ["| 天赋 | 类型 | key | 数值条数 | 现规则说明 |", "|---|---|---|---|---|"]
        for r in sorted(backlog, key=lambda x: (-x["numeric"], x["zh"]))[:40]:
            note = (r["note"] or "").replace("|", "/")[:70]
            lines.append(f"| {r['zh']} | {r['kind']} | `{r['key']}` | {r['numeric']} | {note} |")
    else:
        lines.append("无。")
    text = "\n".join(lines) + "\n"

    print(json.dumps({"counts": dict(counts), "tiers": len(fams), "backlog": len(backlog)}, ensure_ascii=False))
    if args.write:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", encoding="utf8") as f:
            f.write(text)
        print("written:", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
