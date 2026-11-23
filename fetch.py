"""審議会の顔ぶれ：内閣府男女共同参画局「国の審議会等における女性委員の参画状況調べ」の審議会別の表から、
女性委員の割合が低い審議会・府省を並べる（政府目標は40％以上60％以下）。"""
import io
import re
from collections import defaultdict

from lib import oc

PAGE = "https://www.gender.go.jp/research/kenkyu/ratio/index.html"


def tables():
    """審議会ごとの表（Excel優先、なければPDF）を探して行を返す。"""
    import pandas as pd
    xl = oc.links(PAGE, r"\.xlsx?$")
    for u in xl:
        for _, df in pd.read_excel(io.BytesIO(oc.get(u, cache="g_" + u.rsplit("/", 1)[-1])), sheet_name=None, header=None).items():
            for r in df.itertuples(index=False):
                yield u, [None if (isinstance(v, float) and v != v) else v for v in r]
    if xl:
        return
    import pdfplumber
    pdfs = [u for u in oc.links(PAGE, r"\.pdf$") if re.search(r"betten|bessi|別添|list|ichiran|houkoku", u)]
    oc.check(pdfs, "審議会別の表が見つかりません")
    for u in pdfs[:3]:
        with pdfplumber.open(io.BytesIO(oc.get(u, cache="g_" + u.rsplit("/", 1)[-1]))) as pdf:
            for pg in pdf.pages:
                for t in pg.extract_tables():
                    for r in t:
                        yield u, r


def run():
    rows, src = {}, None
    org = ""
    for u, r in tables():
        cells = [str(c).strip() if c is not None else "" for c in r]
        if any(re.search(r"(省|庁|府|委員会)$", c) for c in cells[:1]) and not any("審議会" in c or "会議" in c for c in cells[:2]):
            org = cells[0]
        name = next((c for c in cells if re.search(r"(審議会|会議|審査会|委員会|分科会)$", c)), None)
        nums = [oc.num(c) for c in cells if re.fullmatch(r"[\d,.]+%?", c.replace(" ", ""))]
        nums = [n for n in nums if n is not None]
        if not name or len(nums) < 2:
            continue
        total, women = nums[0], nums[1]
        if not (2 <= total <= 200 and 0 <= women <= total):
            continue
        rows.setdefault(name, {"name": name, "org": org, "total": total, "women": women, "share": women / total})
        src = u
    rows = list(rows.values())
    oc.check(len(rows) > 80, "審議会の数が少なすぎます(%d)" % len(rows))
    share_all = sum(r["women"] for r in rows) / sum(r["total"] for r in rows)
    oc.check(0.25 < share_all < 0.6, "女性委員の割合が想定外です(%.3f)" % share_all)
    low = sorted(rows, key=lambda r: (r["share"], -r["total"]))
    agg = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        a = agg[r["org"] or "（府省不明）"]; a[0] += r["total"]; a[1] += r["women"]; a[2] += 1
    orgs = sorted([{"org": k, "share": v[1] / v[0], "total": v[0], "n": v[2]} for k, v in agg.items()], key=lambda r: r["share"])
    cols = [{"key": "name", "label": "審議会等"}, {"key": "share", "label": "女性委員の割合", "type": "num", "fmt": "pct", "bar": True},
            {"key": "women", "label": "女性委員", "type": "num"}, {"key": "total", "label": "委員数", "type": "num"}, {"key": "org", "label": "府省"}]
    meth = ("内閣府男女共同参画局の調査に載っている、審議会等ごとの委員数と女性委員数から割合を計算しました。"
            "政府の目標は「40％以上60％以下」です。専門委員・臨時委員は含みません。職務指定（○○大臣など、役職で決まる委員）が多い会議は割合が低くなりやすいです。")
    R = [{"id": "low", "tab": "審議会", "title": "女性委員の割合が低い国の審議会等", "desc": "政府目標（40％以上）に届いていない会議が上位に来ます。",
          "rows": low, "columns": cols, "method": meth, "trend": oc.trend(low, "org", 30, "会議", "会議"), "share_label": "name", "share_value": "share"},
         {"id": "org", "tab": "府省", "title": "府省別 審議会等の女性委員の割合", "rows": orgs, "method": meth,
          "columns": [{"key": "org", "label": "府省"}, {"key": "share", "label": "女性委員の割合", "type": "num", "fmt": "pct", "bar": True},
                      {"key": "total", "label": "委員数", "type": "num"}, {"key": "n", "label": "審議会等の数", "type": "num"}],
          "share_label": "org", "share_value": "share"}]
    meta = {"data_period": "最新の調査時点",
            "stats": [{"label": "女性委員の割合（全体）", "value": share_all, "fmt": "pct"},
                      {"label": "目標（40％）未満の審議会等", "value": sum(1 for r in rows if r["share"] < 0.4), "unit": "会議"},
                      {"label": "数えた審議会等", "value": len(rows), "unit": "会議"}],
            "sources": [{"name": "国の審議会等における女性委員の参画状況調べ", "org": "内閣府男女共同参画局", "url": src or PAGE,
                         "license": "政府標準利用規約（第2.0版）"}]}
    oc.write(meta, R, search=[{"n": r["name"], "s": r["org"], "k": [["女性委員", "%d/%d人" % (r["women"], r["total"])]]} for r in rows])


if __name__ == "__main__":
    oc.main(run)
