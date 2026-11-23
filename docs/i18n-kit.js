/* i18n-kit: 日本語で作られた画面を、辞書（i18n.json）で英語・中国語・韓国語に置き換える小さな仕組み。
   - 文字だけを置き換える（数字・データの中身は変えない）。辞書に無い文は日本語のまま。
   - 画面が書き換わったとき（MutationObserver）も追従する。
   - ?lang=en / zh / ko で直接開ける。選んだ言語はこの端末に保存。 */
(function () {
  "use strict";
  var LANGS = [["ja", "日本語"], ["en", "English"], ["zh", "中文"], ["ko", "한국어"]];
  var KEY = "aswk-lang";
  var dict = null, lang = "ja", busy = false, orig = new WeakMap(), origAttr = new WeakMap();
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  var PREF = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
  var PREF_EN = ["Hokkaido","Aomori","Iwate","Miyagi","Akita","Yamagata","Fukushima","Ibaraki","Tochigi","Gunma","Saitama","Chiba","Tokyo","Kanagawa","Niigata","Toyama","Ishikawa","Fukui","Yamanashi","Nagano","Gifu","Shizuoka","Aichi","Mie","Shiga","Kyoto","Osaka","Hyogo","Nara","Wakayama","Tottori","Shimane","Okayama","Hiroshima","Yamaguchi","Tokushima","Kagawa","Ehime","Kochi","Fukuoka","Saga","Nagasaki","Kumamoto","Oita","Miyazaki","Kagoshima","Okinawa"];
  var PREF_KO = ["홋카이도","아오모리현","이와테현","미야기현","아키타현","야마가타현","후쿠시마현","이바라키현","도치기현","군마현","사이타마현","지바현","도쿄도","가나가와현","니가타현","도야마현","이시카와현","후쿠이현","야마나시현","나가노현","기후현","시즈오카현","아이치현","미에현","시가현","교토부","오사카부","효고현","나라현","와카야마현","돗토리현","시마네현","오카야마현","히로시마현","야마구치현","도쿠시마현","가가와현","에히메현","고치현","후쿠오카현","사가현","나가사키현","구마모토현","오이타현","미야자키현","가고시마현","오키나와현"];
  // 数字＋単位の言い換え（辞書に無い文でも、よく出る形だけは訳す）
  var UNITS = {
    en: [[/^([\d,.]+)\s*兆円$/, "¥$1 trillion"], [/^([\d,.]+)\s*億円$/, "¥$1 hundred million"], [/^([\d,.]+)\s*万円$/, "¥$1 ten-thousand"], [/^([\d,.]+)\s*円$/, "¥$1"],
         [/^([\d,.]+)\s*件$/, "$1 items"], [/^([\d,.]+)\s*人$/, "$1 people"], [/^([\d,.]+)\s*位$/, "No. $1"], [/^第([\d,.]+)位$/, "No. $1"], [/^([\d,.]+)\s*倍$/, "$1×"],
         [/^([\d,.]+)\s*点$/, "$1 pts"], [/^([\d,.]+)\s*年度$/, "FY$1"], [/^([\d,.]+)\s*年$/, "$1"], [/^([\d,.]+)\s*か所$/, "$1 sites"], [/^([\d,.]+)\s*団体$/, "$1 bodies"], [/^([\d,.]+)\s*社$/, "$1 companies"], [/^全([\d,.]+)件$/, "All $1"]],
    zh: [[/^([\d,.]+)\s*兆円$/, "$1万亿日元"], [/^([\d,.]+)\s*億円$/, "$1亿日元"], [/^([\d,.]+)\s*万円$/, "$1万日元"], [/^([\d,.]+)\s*円$/, "$1日元"],
         [/^([\d,.]+)\s*件$/, "$1件"], [/^([\d,.]+)\s*人$/, "$1人"], [/^([\d,.]+)\s*位$/, "第$1名"], [/^第([\d,.]+)位$/, "第$1名"], [/^([\d,.]+)\s*倍$/, "$1倍"],
         [/^([\d,.]+)\s*点$/, "$1分"], [/^([\d,.]+)\s*年度$/, "$1财年"], [/^([\d,.]+)\s*か所$/, "$1处"], [/^([\d,.]+)\s*団体$/, "$1个团体"], [/^([\d,.]+)\s*社$/, "$1家公司"], [/^全([\d,.]+)件$/, "全部$1件"]],
    ko: [[/^([\d,.]+)\s*兆円$/, "$1조 엔"], [/^([\d,.]+)\s*億円$/, "$1억 엔"], [/^([\d,.]+)\s*万円$/, "$1만 엔"], [/^([\d,.]+)\s*円$/, "$1엔"],
         [/^([\d,.]+)\s*件$/, "$1건"], [/^([\d,.]+)\s*人$/, "$1명"], [/^([\d,.]+)\s*位$/, "$1위"], [/^第([\d,.]+)位$/, "$1위"], [/^([\d,.]+)\s*倍$/, "$1배"],
         [/^([\d,.]+)\s*点$/, "$1점"], [/^([\d,.]+)\s*年度$/, "$1년도"], [/^([\d,.]+)\s*か所$/, "$1곳"], [/^([\d,.]+)\s*団体$/, "$1개 단체"], [/^([\d,.]+)\s*社$/, "$1개사"], [/^全([\d,.]+)件$/, "전체 $1건"]]
  };

  function pick() {
    var q = (location.search.match(/[?&]lang=(ja|en|zh|ko)/) || [])[1];
    if (q) return q;
    try { var s = localStorage.getItem(KEY); if (s) return s; } catch (e) {}
    return "ja"; // 既定は日本語（日本のデータなので）。選べば保存される
  }
  function tr(t) {
    var k = t.trim();
    if (!k) return null;
    var e = dict[k];
    if (e && e[lang]) return t.replace(k, e[lang]);
    var i = PREF.indexOf(k);
    if (i >= 0) return t.replace(k, lang === "en" ? PREF_EN[i] : lang === "ko" ? PREF_KO[i] : k);
    var u = UNITS[lang] || [];
    for (var j = 0; j < u.length; j++) if (u[j][0].test(k)) return t.replace(k, k.replace(u[j][0], u[j][1]));
    // 「データ更新：…　対象期間：…」のように、見出し語（：で終わる語）が文中に入っている場合
    var out = k, hit = false;
    for (var p in dict) {
      if (/(：|表示 )$/.test(p) && dict[p][lang] && out.indexOf(p) >= 0) { out = out.split(p).join(dict[p][lang]); hit = true; }
    }
    return hit ? t.replace(k, out) : null;
  }
  function walk(root) {
    if (!dict || lang === "ja") return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (n) {
      var p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName) || p.closest("[data-no-i18n]")) return;
      var last = orig.get(n);
      if (last && n.nodeValue === last.out) return; // 訳したまま
      var r = tr(n.nodeValue);
      if (r != null) {
        if (lang !== "zh" && (n.previousSibling || n.nextSibling)) r = (/^\s/.test(r) || !n.previousSibling ? "" : " ") + r.trim() + (n.nextSibling ? " " : "");
        orig.set(n, { src: n.nodeValue, out: r }); n.nodeValue = r;
      }
    });
    var els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[title],[aria-label],[alt]") : [];
    Array.prototype.forEach.call(els, function (el) {
      var o = origAttr.get(el) || {};
      ATTRS.forEach(function (a) {
        var v = el.getAttribute(a); if (!v) return;
        var src = o[a] != null ? o[a] : v, r = tr(src);
        if (r != null) { o[a] = src; if (v !== r) el.setAttribute(a, r); }
      });
      origAttr.set(el, o);
    });
  }
  function restore() { location.reload(); }
  function apply() {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
    busy = true; walk(document.body);
    var t = tr(document.title); if (t) document.title = t;
    busy = false;
    var note = document.getElementById("aswk-note");
    if (note) note.hidden = lang === "ja";
  }
  function ui() {
    var box = document.createElement("div");
    box.id = "aswk-lang"; box.setAttribute("data-no-i18n", "");
    box.innerHTML = '<select aria-label="Language / 言語">' + LANGS.map(function (l) {
      return '<option value="' + l[0] + '"' + (l[0] === lang ? " selected" : "") + ">" + l[1] + "</option>";
    }).join("") + "</select>";
    box.querySelector("select").addEventListener("change", function () {
      var v = this.value;
      try { localStorage.setItem(KEY, v); } catch (e) {}
      var u = new URL(location.href);
      if (v === "ja") u.searchParams.delete("lang"); else u.searchParams.set("lang", v);
      location.href = u.toString();
    });
    document.body.appendChild(box);
    var note = document.createElement("div");
    note.id = "aswk-note"; note.hidden = true; note.setAttribute("data-no-i18n", "");
    note.textContent = { en: "Names and source data are shown in Japanese as published.", zh: "名称和原始数据按公开时的日文显示。", ko: "명칭과 원자료는 공개된 일본어 그대로 표시합니다." }[lang] || "";
    document.body.appendChild(note);
    var st = document.createElement("style");
    st.textContent = "#aswk-lang{position:fixed;right:10px;bottom:10px;z-index:9999}#aswk-lang select{font:600 13px/1.2 system-ui,sans-serif;padding:7px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.25);background:#fff;color:#111;box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer}#aswk-note{position:fixed;left:10px;bottom:10px;z-index:9998;max-width:60vw;font:12px/1.4 system-ui,sans-serif;background:rgba(17,17,17,.85);color:#fff;padding:6px 10px;border-radius:8px}@media print{#aswk-lang,#aswk-note{display:none}}" + (lang !== "ja" ? "html[lang=en] body,html[lang=ko] body{overflow-wrap:anywhere}html[lang=en] h1,html[lang=en] h2,html[lang=en] h3{word-break:normal;overflow-wrap:anywhere;hyphens:auto}html:not([lang=ja]) h1 *,html:not([lang=ja]) a.tag,html:not([lang=ja]) .chips a{white-space:normal!important}" : "");
    document.head.appendChild(st);
  }
  function start() {
    lang = pick();
    ui();
    if (lang === "ja") return;
    fetch("i18n.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (d) {
      dict = d; apply();
      var pending = false;
      new MutationObserver(function () {
        if (busy || pending) return; pending = true;
        requestAnimationFrame(function () { pending = false; apply(); });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
      setTimeout(function () { var n = document.getElementById("aswk-note"); if (n) n.style.display = "none"; }, 6000);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
