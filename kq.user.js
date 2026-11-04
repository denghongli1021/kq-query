// ==UserScript==
// @name         K中 作業小考查詢
// @namespace    k-center
// @version      3.0.1
// @description  米豆奶右下角加「K中查詢」按鈕：查詢 K中到班學生的作業、小考與老師規定（只讀取，不修改米豆奶）
// @match        https://wenyanwen.mido-9.com/*
// @updateURL    https://gist.github.com/denghongli1021/28fe7b2f8bde6755f7807c12097c6768/raw/kq.user.js
// @downloadURL  https://gist.github.com/denghongli1021/28fe7b2f8bde6755f7807c12097c6768/raw/kq.user.js
// @grant        none
// ==/UserScript==
var KQ_OPEN = function () {
(function () {
  'use strict';
  if (!/mido-9\.com/.test(location.host)) { alert('請在米豆奶系統頁面（已登入）使用'); return; }
  var KQV = '11'; var old = document.getElementById('kq-root'); if (old && old.getAttribute('data-v') === KQV) { old.style.display = 'flex'; return; } if (old) old.remove();

  // ---------- helpers ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var deco = document.createElement('textarea');
  function decode(h) { deco.innerHTML = String(h || '').replace(/<[^>]+>/g, ''); return deco.value.replace(/\r/g, '').trim(); }
  function post(url, data) {
    var body = new URLSearchParams();
    (function add(prefix, v) {
      if (Array.isArray(v)) v.forEach(function (x, i) { add(prefix + '[' + i + ']', x); });
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { add(prefix ? prefix + '[' + k + ']' : k, v[k]); });
      else body.append(prefix, v == null ? '' : v);
    })('', data);
    return fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: body }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  var SUBJ = ['數學', '自然', '理化', '物理', '化學', '生物', '英文', '國文', '社會', '作文'];
  function subjectOf(cls) {
    for (var i = 0; i < SUBJ.length; i++) if (cls.indexOf(SUBJ[i]) >= 0) return SUBJ[i];
    if (/數/.test(cls)) return '數學';
    return '其他';
  }
  function gradeOf(cls) { var m = cls.match(/(國[一二三]|高[一二三]|小[一二三四五六]|中\/?高年級)/); if (m) return m[1]; if (/國中/.test(cls)) return '國中'; if (/國小|小[五六]/.test(cls)) return '國小'; return '個指/其他'; }
  function yes(v) { return /^是/.test(v || ''); }
  function none(v) { return !v || /^(無|沒有|暫無|no|none|-|－|x|X|\/)$/i.test(v.trim()); }

  function parseRow(r) {
    var cont = r[10] || {};
    var html = (cont.filter || cont.display || '') + '';
    var f = {};
    html.split(/<br\s*\/?>/i).forEach(function (seg) {
      var m = seg.match(/<b>\s*([^<]*?)\s*[:：]?\s*<\/b>([\s\S]*)/i);
      if (m) f[m[1].replace(/[:：]\s*$/, '').trim()] = decode(m[2]);
    });
    var files = [];
    String(cont.display || '').replace(/<a[^>]+href="(\/metronic\/showfile\/[^"]+)"[^>]*>([^<]*)<\/a>/g, function (_, h, n) { files.push({ href: h, name: decode(n) }); });
    function pick(test) { var k = Object.keys(f).filter(test)[0]; return k ? f[k] : ''; }
    var hwText = pick(function (k) { return /作業/.test(k) && !/是否|老師|檢討/.test(k); });
    var qzText = pick(function (k) { return /課前|K中|k中/.test(k) && /小考/.test(k); }) || pick(function (k) { return /小考/.test(k) && /範圍|內容/.test(k); });
    var qzNext = pick(function (k) { return /下次課堂小考/.test(k); });
    var hwFlag = pick(function (k) { return /今日是否有作業/.test(k); });
    var qzFlag = pick(function (k) { return /今日是否有小考/.test(k); });
    var hasHw = hwFlag ? yes(hwFlag) : !none(hwText);
    var hasQz = qzFlag ? yes(qzFlag) : !none(qzText);
    var hwDone = yes(f['作業是否寫完成']), hwRev = yes(f['作業是否檢討完成']);
    var qzDone = yes(f['小考是否寫完成']), qzRev = yes(f['小考是否檢討完成']);
    var hwTrack = '作業是否寫完成' in f, qzTrack = '小考是否寫完成' in f;
    var cls = decode(r[7]);
    return {
      status: decode(r[1]), date: decode(r[5]), teacher: decode(r[6]), cls: cls, student: decode(r[9]),
      subject: subjectOf(cls), grade: gradeOf(cls), progress: pick(function (k) { return /進度/.test(k); }),
      hwText: hwText, qzText: qzText, hasHw: hasHw, hasQz: hasQz,
      hwDone: hwDone, hwRev: hwRev, hwT: f['作業檢討老師'] || '', qzDone: qzDone, qzRev: qzRev, qzT: f['小考檢討老師'] || '',
      note: f['備註'] || '', files: files, score: f['小考成績'] || '', qzNext: qzNext,
      hwTrack: hwTrack, qzTrack: qzTrack,
      hwPending: hasHw && hwTrack && !(hwDone && hwRev), qzPending: hasQz && qzTrack && !(qzDone && qzRev)
    };
  }

  var DOC_GZ = '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';
  function openDoc(anchor) {
    var w = window.open('about:blank', '_blank');
    var bin = Uint8Array.from(atob(DOC_GZ), function (c) { return c.charCodeAt(0); });
    new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(function (h) {
      var u = URL.createObjectURL(new Blob([h], { type: 'text/html;charset=utf-8' })) + (anchor ? '#' + encodeURIComponent(anchor) : '');
      if (w) w.location.href = u; else location.href = u;
    });
  }
  var GENERAL = ['作業檢討完才能小考（老師另有交代除外）', '所有答案印 A4；考卷、校用卷印 B4', '老師指定上課檢討的作業／小考，檢討老師登記「上課老師」', '小考 1 小時內；自行檢討每 10 分鐘看一次，超過 20 分鐘直接幫忙檢討；單次解題 15～20 分鐘'];
  // lv: 國中 / 高中 / 個指 / '' (全部班級)
  var RULES = [
    { k: ['世平'], r: [['', '作業、小考訂正：給學生答案，請學生把正確答案謄寫到考卷上（老師上課檢討）'], ['國中', '國三國文：作業自行上課處理；小考批改＋學生謄上答案即可'], ['', '有小考時，全班考完後把考卷＋詳解放到老師座位上']] },
    { k: ['柏勳', '陳勳'], r: [['', '作業小考來 K中批改檢討'], ['', '講義作業要在講義上登記答對率（算「格子數」，不算題數），也登記在米豆奶備註欄'], ['', '所有訂正一律用紅筆；計算過程不要塗掉，訂正寫在空白處'], ['', '作業進度超前小考的話，可以先考小考'], ['', '只寫答案沒過程、錯題沒紅筆訂正 → 通報 K中行政老師／柏勳老師'], ['', '自編考卷與答案印 A3、每張 2 頁、雙面']] },
    { k: ['柏言'], r: [['國中', '作業小考來 K中批改檢討（作業答案在櫃子最上方資料夾）'], ['個指', '作業小考來 K中批改檢討'], ['高中', '作業小考自行上課處理（考卷印 A4）']] },
    { k: ['世東'], r: [['', '作業自行上課處理；小考來 K中批改檢討'], ['高中', '小考檢討可給詳解參考；考卷印 A4']] },
    { k: ['卓思良', '小卓'], r: [['國中', '作業小考來 K中批改檢討（作業答案在櫃子最上方資料夾）'], ['高中', '作業小考自行上課處理（有小考則印 A4）']] },
    { k: ['湘妮'], r: [['', '小考：給學生答案，請學生謄寫正確答案（老師上課檢討）'], ['國中', '作業自行上課處理；國三複習班學生自行決定，基本上不會到 K中']] },
    { k: ['金浩'], r: [['', '一題一題批改：對的打勾、錯的寫答案（老師會跳題出）'], ['', '訂正請學生用條列式把算式寫清楚（雲端有範例）'], ['', '考卷檢討完要在考卷上寫檢討老師姓名'], ['', '曙光專班、國一數學：週三老師統一輔導解題；國二數學以週三輔導為主；國三數學來 K中批改檢討']] },
    { k: ['怡君'], r: [['', '嚴格按老師答案批改（大小寫、句子要完全一致），不幫忙寫正確答案：漏字畫插入符號、拼錯圈起來打叉、選擇題也不寫答案'], ['', '作業、小考：批改＋學生謄上答案，老師上課檢討（考卷印 A4）']] },
    { k: ['國勝'], r: [['', 'K中只檢查作業、小考有沒有寫完，老師上課批改檢討']] },
    { k: ['鈞宇'], r: [['', '作業自行上課處理；小考在 K中考、批改即可，老師上課檢討']] },
    { k: ['馬立', '治宇'], r: [['', '作業自行上課處理；小考來 K中批改檢討（考卷印 A4）'], ['', 'K中無法檢討的題目，請學生標註起來上課問老師']] },
    { k: ['門翰'], r: [['', '作業小考來 K中批改檢討，作業、小考盡量同一天完成']] },
    { k: ['建惟'], r: [['', '作業小考來 K中批改檢討（作業由 K中列印給學生）'], ['', '寫錯先打一個 X，訂正第二次還錯再加一個 X']] },
    { k: ['韋翔'], r: [['國中', '作業小考來 K中批改檢討（作業答案在櫃子最上方資料夾）'], ['個指', '作業小考自行上課處理']] },
    { k: ['皓琦'], r: [['', '張毓婕數學個指：作業小考來 K中批改檢討；其餘班級自行上課處理']] },
    { k: ['昀譱'], r: [['', '作業小考自行上課處理（老師另有交代除外）']] },
    { k: ['家偉', '駿瑋', '立皓', '宇柔', '延靜', '侃璇', '芳宜', '子昕', 'Iris', '瑋珊', '灝禹'], r: [['', '作業小考自行上課處理（老師另有交代除外）']] }
  ];
  function levelOf(cls) { return /\[個\]|個指/.test(cls) ? '個指' : /^(\d+)?高|高[一二三]/.test(cls) ? '高中' : '國中'; }
  function rulesFor(teacher, cls) {
    var tn = (teacher || '').replace(/\s/g, ''), lv = levelOf(cls), out = [];
    RULES.forEach(function (g) {
      if (g.k.some(function (k) { return tn.indexOf(k) >= 0 || cls.indexOf(k) >= 0; }))
        g.r.forEach(function (x) { if (!x[0] || x[0] === lv) out.push(x[1]); });
    });
    return out;
  }

  // ---------- UI ----------
  var css = '#kq-root{position:fixed;inset:0;z-index:2147483000;background:#f6f7f9;display:flex;flex-direction:column;font:14px/1.5 "Microsoft JhengHei","PingFang TC",sans-serif;color:#1f2328}' +
    '#kq-root *{box-sizing:border-box}#kq-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;background:#fff;border-bottom:1px solid #d0d7de}' +
    '#kq-bar h1{font-size:16px;margin:0 8px 0 0}#kq-bar label{display:flex;align-items:center;gap:4px;font-size:13px;color:#57606a}' +
    '#kq-bar input,#kq-bar select{height:30px;border:1px solid #d0d7de;border-radius:6px;padding:0 6px;font:inherit;background:#fff}' +
    '#kq-bar button{height:30px;border:1px solid #d0d7de;border-radius:6px;padding:0 10px;background:#f6f8fa;cursor:pointer;font:inherit}' +
    '#kq-bar button.pri{background:#1f6feb;border-color:#1f6feb;color:#fff}.kq-quick button{height:26px!important;padding:0 8px!important;font-size:12px!important}' +
    '#kq-sum{padding:8px 14px;color:#57606a;font-size:13px;line-height:1.8}#kq-sum b{color:#1f2328}' +
    '#kq-main{flex:1;overflow:auto;padding:0 14px 24px}' +
    '.kq-grp{background:#fff;border:1px solid #d0d7de;border-radius:8px;margin:10px 0;overflow:hidden}' +
    '.kq-grp>h2{margin:0;font-size:15px;padding:8px 12px;background:#f6f8fa;border-bottom:1px solid #d0d7de;display:flex;gap:10px;align-items:center;cursor:pointer}' +
    '.kq-grp table{width:100%;border-collapse:collapse}.kq-grp th,.kq-grp td{padding:6px 10px;border-top:1px solid #eaeef2;vertical-align:top;text-align:left}' +
    '.kq-grp th{font-size:12px;color:#57606a;font-weight:600;background:#fafbfc;border-top:0}' +
    '.kq-pre{white-space:pre-wrap;max-width:420px}.kq-b{display:inline-block;font-size:11px;padding:0 6px;border-radius:10px;margin:1px 2px 1px 0;white-space:nowrap}' +
    '.kq-ok{background:#dafbe1;color:#1a7f37}.kq-no{background:#ffebe9;color:#cf222e}.kq-mid{background:#fff8c5;color:#9a6700}.kq-na{background:#eaeef2;color:#57606a}' +
    '.kq-muted{color:#8c959f;font-size:12px}.kq-files a{display:block;font-size:12px;color:#0969da}#kq-close{margin-left:auto}' +
    '.kq-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.kq-more{display:inline-block;margin-top:2px;font-size:12px;color:#0969da;cursor:pointer;user-select:none}.kq-more:hover{text-decoration:underline}' +
    '#kq-bar #kq-doc{border-color:#1a7f37;background:#dafbe1;color:#1a7f37}' +
    '.kq-rules{background:#fffbea;border:1px solid #e9d38a;border-radius:8px;margin:10px 0;padding:10px 14px}.kq-rules h3{margin:0 0 6px;font-size:15px}.kq-rules .c{margin-top:6px;font-weight:600}.kq-rules ul{margin:2px 0 0 0;padding-left:20px}.kq-rules li{margin:1px 0}' +
    '#kq-tip{position:fixed;display:none;z-index:2147483001;max-width:520px;max-height:70vh;overflow:hidden;background:#fff;border:1px solid #d0d7de;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:8px 10px;font-size:13px;pointer-events:none}.kq-tip-h{font-weight:600;margin-bottom:4px}.kq-tip-r{border-top:1px solid #eaeef2;padding:4px 0;white-space:pre-wrap}' +
    '.kq-sort{cursor:pointer;white-space:nowrap;color:#0969da!important;user-select:none}.kq-sort:hover{background:#eef4ff!important}.kq-dir tbody tr{cursor:pointer}.kq-dir tbody tr:hover{background:#f6f8fa}.kq-dir a{color:#0969da;font-weight:600;text-decoration:none;font-size:15px}.kq-s{display:inline-block;font-size:12px;padding:1px 8px;border-radius:10px;margin:1px 4px 1px 0;background:#ddf4ff;color:#0550ae}' +
    '#kq-msg{padding:40px;text-align:center;color:#57606a}@media (max-width:700px){.kq-pre{max-width:220px}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var today = new Date(), from = new Date(); from.setDate(from.getDate() - 30);
  var root = document.createElement('div'); root.id = 'kq-root'; root.setAttribute('data-v', KQV);
  root.innerHTML =
    '<div id="kq-bar"><h1>K中 作業小考查詢</h1>' +
    '<label>起<input type="date" id="kq-s" value="' + ymd(from) + '"></label>' +
    '<label>迄<input type="date" id="kq-e" value="' + ymd(today) + '"></label>' +
    '<span class="kq-quick"><button data-d="7">近7天</button> <button data-d="14">近14天</button> <button data-d="30">近1個月</button></span>' +
    '<button class="pri" id="kq-load">載入</button>' +
    '<label>到班<select id="kq-vis"><option value="range">期間內有到K中</option><option value="today">今天有到K中</option></select></label>' +
    '<label>狀態<select id="kq-st"><option value="pend">未完成</option><option value="hw">作業未完成</option><option value="qz">小考未完成</option><option value="done">已完成</option><option value="k">K中要處理的全部</option><option value="all">全部</option></select></label>' +
    '<label>科目<select id="kq-sub"><option value="">全部</option></select></label>' +
    '<label>年級<select id="kq-gr"><option value="">全部</option></select></label>' +
    '<label>班級<select id="kq-cls"><option value="">全部</option></select></label>' +
    '<label>老師<select id="kq-t"><option value="">全部</option></select></label>' +
    '<label>學生<input id="kq-stu" placeholder="姓名關鍵字" size="8"></label>' +
    '<label>分組<select id="kq-grp"><option value="student">依學生</option><option value="cls">依班級</option><option value="date">依日期</option></select></label>' +
    '<button id="kq-doc">📘 看詳細規定</button>' +
    '<button id="kq-back" style="display:none">← 回目錄</button><button id="kq-all">看全部明細</button><button id="kq-csv">匯出 CSV</button><button id="kq-close">關閉 ✕</button></div>' +
    '<div id="kq-tip"></div><div id="kq-sum"></div><div id="kq-main"><div id="kq-msg">選好日期後按「載入」。只列出在 K書中心「登入記錄」裡有到班的學生。只讀取資料，不會修改米豆奶。</div></div>';
  document.body.appendChild(root);
  var $ = function (id) { return document.getElementById(id); };
  var DATA = [], VIEW = [], ALL = [], VIS = {}, VIS_TODAY = {}, MODE = 'dir', SEL = null, ORD = 'desc';

  root.querySelectorAll('.kq-quick button').forEach(function (b) {
    b.onclick = function () { var d = new Date(); d.setDate(d.getDate() - (+b.dataset.d)); $('kq-s').value = ymd(d); $('kq-e').value = ymd(new Date()); load(); };
  });
  $('kq-close').onclick = function () { root.style.display = 'none'; };
  $('kq-load').onclick = load;
  ['kq-vis', 'kq-st', 'kq-sub', 'kq-gr', 'kq-cls', 'kq-t', 'kq-grp'].forEach(function (id) { $(id).onchange = render; });
  $('kq-stu').oninput = render;
  $('kq-csv').onclick = exportCsv;
  $('kq-doc').onclick = function () { openDoc(''); };
  $('kq-main').addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('kq-more')) {
      var nd = e.target.previousElementSibling, open = nd.classList.toggle('kq-clamp');
      e.target.textContent = open ? 'more ▾' : 'less ▴'; return;
    } if (e.target.classList && e.target.classList.contains('kq-doclink')) { e.stopPropagation(); openDoc('各班老師特殊要求'); } });
  $('kq-back').onclick = function () { MODE = 'dir'; SEL = null; render(); };
  $('kq-all').onclick = function () { MODE = 'detail'; SEL = null; render(); };

  function fillSel(id, vals) {
    var s = $(id), cur = s.value;
    s.innerHTML = '<option value="">全部</option>' + vals.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('');
    if (vals.indexOf(cur) >= 0) s.value = cur;
  }
  function uniq(k) { var o = {}; ALL.forEach(function (d) { if (d[k]) o[d[k]] = 1; }); return Object.keys(o).sort(); }

  function load() {
    var s = $('kq-s').value, e = $('kq-e').value;
    if (!s || !e || s > e) { alert('日期區間有誤'); return; }
    $('kq-main').innerHTML = '<div id="kq-msg">讀取中…</div>';
    var td = ymd(new Date());
    function logins(a, b) {
      return post('/yii/battle/battle-login-all', { other: { template: 'attendances', start_time: a, end_time: b } }).then(function (rows) {
        var m = {};
        rows.forEach(function (r) {
          var n = decode(r[1]); if (!n) return;
          (m[n] = m[n] || []).push({ tin: decode(r[2]), tout: decode(r[3]), cost: decode(r[4]) });
        });
        return m;
      });
    }
    var visP = Promise.all([logins(s, e), logins(td, td)]);
    var cwP = post('/yii/coursework/coursework-log-ship', { start: s, end: e }).then(function (ship) {
      var done = 0, out = [], i = 0, total = ship.length;
      if (!total) return [];
      return new Promise(function (res, rej) {
        function next() {
          if (i >= total) return;
          var chunk = ship[i++];
          post('/yii/coursework/coursework-log', { other: {}, datas: chunk }).then(function (rows) {
            out = out.concat(rows); done++;
            $('kq-msg') && ($('kq-msg').textContent = '讀取中… ' + done + '/' + total);
            if (done === total) res(out); else next();
          }).catch(rej);
        }
        next(); next(); next();
      });
    });
    Promise.all([cwP, visP]).then(function (res) {
      var rows = res[0]; VIS = res[1][0]; VIS_TODAY = res[1][1];
      ALL = rows.map(parseRow).filter(function (d) { return d.student && !/^測試/.test(d.cls) && (VIS[d.student] || VIS_TODAY[d.student]); });
      fillSel('kq-sub', uniq('subject')); fillSel('kq-gr', uniq('grade')); fillSel('kq-cls', uniq('cls')); fillSel('kq-t', uniq('teacher'));
      render();
    }).catch(function (err) {
      $('kq-main').innerHTML = '<div id="kq-msg">讀取失敗：' + esc(err.message) + '<br>請確認仍在登入狀態，重新整理米豆奶後再試。</div>';
    });
  }

  function badge(ok, txt) { return '<span class="kq-b ' + (ok === true ? 'kq-ok' : ok === false ? 'kq-no' : ok === 'mid' ? 'kq-mid' : 'kq-na') + '">' + esc(txt) + '</span>'; }
  function stateBadges(has, track, done, rev, t) {
    if (!has) return badge(null, '無');
    if (!track) return badge(null, '不需在K中處理');
    if (done && rev) return badge(true, '檢討完成') + (t && t !== '未選擇' ? '<span class="kq-muted">' + esc(t) + '</span>' : '');
    if (done) return badge('mid', '已寫完・未檢討');
    return badge(false, '未完成');
  }

  function render() {
    var visSet = $('kq-vis').value === 'today' ? VIS_TODAY : VIS;
    DATA = ALL.filter(function (d) { return visSet[d.student]; });
    (function () {
      var sb = $('kq-sub').value, g0 = $('kq-gr').value, o1 = {}, o2 = {};
      ALL.forEach(function (d) { if ((!sb || d.subject === sb) && (!g0 || d.grade === g0)) { o1[d.cls] = 1; o2[d.teacher] = 1; } });
      fillSel('kq-cls', Object.keys(o1).sort()); fillSel('kq-t', Object.keys(o2).sort());
    })();
    var stv = $('kq-st').value, sub = $('kq-sub').value, gr = $('kq-gr').value, cls = $('kq-cls').value, t = $('kq-t').value, q = $('kq-stu').value.trim();
    VIEW = DATA.filter(function (d) {
      if (sub && d.subject !== sub) return false;
      if (gr && d.grade !== gr) return false;
      if (cls && d.cls !== cls) return false;
      if (t && d.teacher !== t) return false;
      if (q && d.student.indexOf(q) < 0) return false;
      if (SEL && d.student !== SEL) return false;
      if (stv === 'pend') return d.hwPending || d.qzPending;
      if (stv === 'hw') return d.hwPending;
      if (stv === 'qz') return d.qzPending;
      if (stv === 'done') return ((d.hasHw && d.hwTrack) || (d.hasQz && d.qzTrack)) && !d.hwPending && !d.qzPending;
      if (stv === 'k') return (d.hasHw && d.hwTrack) || (d.hasQz && d.qzTrack);
      return true;
    }).sort(function (a, b) { var o = ORD === 'asc' ? 1 : -1; return a.date < b.date ? -o : a.date > b.date ? o : a.student.localeCompare(b.student, 'zh-Hant'); });

    var stuSet = {}, hwP = 0, qzP = 0;
    VIEW.forEach(function (d) { stuSet[d.student] = 1; if (d.hwPending) hwP++; if (d.qzPending) qzP++; });
    var noRec = Object.keys(visSet).filter(function (n) { return !ALL.some(function (d) { return d.student === n; }); });
    $('kq-sum').innerHTML = '到班學生 <b>' + Object.keys(visSet).length + '</b> 人' + (noRec.length ? '（無聯絡簿紀錄：' + esc(noRec.join('、')) + '）' : '') + '<br>期間 <b>' + esc($('kq-s').value) + ' ～ ' + esc($('kq-e').value) + '</b>　符合 <b>' + VIEW.length + '</b> 筆（共 ' + DATA.length + ' 筆）　學生 <b>' + Object.keys(stuSet).length + '</b> 人　作業未完成 <b>' + hwP + '</b>　小考未完成 <b>' + qzP + '</b>';

    $('kq-back').style.display = MODE === 'dir' ? 'none' : '';
    $('kq-all').style.display = MODE === 'dir' ? '' : 'none';
    if (MODE === 'dir') { renderDir(visSet, sub, gr, cls, t, q); return; }
    var gk = SEL ? 'student' : $('kq-grp').value, groups = {}, order = [];
    VIEW.forEach(function (d) {
      var k = gk === 'student' ? d.student : gk === 'cls' ? d.cls : d.date;
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(d);
    });
    if (gk !== 'date') order.sort(function (a, b) { return a.localeCompare(b, 'zh-Hant'); });
    var showStu = gk !== 'student', showCls = gk !== 'cls';
    var rulesBox = '';
    if (SEL) {
      var seen = {}, cl = [];
      DATA.forEach(function (d) { if (d.student === SEL && !seen[d.cls] && (!sub || d.subject === sub) && (!gr || d.grade === gr) && (!cls || d.cls === cls) && (!t || d.teacher === t)) { seen[d.cls] = 1; cl.push(d); } });
      rulesBox = '<div class="kq-rules"><h3>上課注意事項（' + esc(SEL) + '）<a class="kq-doclink" style="font-size:12px;font-weight:400;margin-left:8px;color:#0969da;cursor:pointer">看各班老師特殊要求 →</a></h3>' +
        '<div class="kq-muted">通則：' + esc(GENERAL.join('；')) + '</div>' +
        cl.map(function (d) { var rs = rulesFor(d.teacher, d.cls); return '<div class="c">' + esc(d.cls) + '<span class="kq-muted">（' + esc(d.teacher) + '）</span></div>' + (rs.length ? '<ul>' + rs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<div class="kq-muted">沒有特別規定，依通則處理</div>'); }).join('') + '</div>';
    }
    if (!order.length) { $('kq-main').innerHTML = rulesBox + '<div id="kq-msg">沒有符合條件的項目（可把「狀態」改成「全部」）</div>'; return; }
    $('kq-main').innerHTML = rulesBox + order.map(function (k) {
      var rows = groups[k];
      var p = rows.filter(function (d) { return d.hwPending || d.qzPending; }).length;
      var vinfo = '';
      if (gk === 'student') {
        var tv = VIS_TODAY[k], v = VIS[k] || [];
        vinfo = tv ? '<span class="kq-b kq-ok">今天 ' + esc(tv.map(function (x) { return x.tin.slice(11, 16) + '–' + (x.tout ? x.tout.slice(11, 16) : '在班'); }).join('、')) + '</span>' : '';
        vinfo += '<span class="kq-muted">期間到班 ' + v.length + ' 次' + (v.length ? '・最近 ' + esc(v.map(function (x) { return x.tin; }).sort().pop().slice(5, 16)) : '') + '</span>';
      }
      return '<div class="kq-grp"><h2>' + esc(k) + ' ' + vinfo + ' <span class="kq-muted">' + rows.length + ' 筆' + (p ? '・未完成 ' + p : '') + '</span></h2><table><thead><tr><th class="kq-sort" title="點一下切換排序">上課日' + (ORD === 'asc' ? ' ▲' : ' ▼') + '<div class="kq-muted">' + (ORD === 'asc' ? '舊→新' : '新→舊') + '</div></th>' +
        (showStu ? '<th>學生</th>' : '') + (showCls ? '<th>班級／老師</th>' : '') +
        '<th>作業</th><th>小考範圍</th><th>備註</th><th>檔案</th></tr></thead><tbody>' +
        rows.map(function (d) {
          return '<tr><td>' + esc(d.date.slice(5)) + '</td>' +
            (showStu ? '<td>' + esc(d.student) + '</td>' : '') +
            (showCls ? '<td>' + esc(d.cls) + '<div class="kq-muted">' + esc(d.teacher) + '・' + esc(d.subject) + '</div></td>' : '') +
            '<td><div>' + stateBadges(d.hasHw, d.hwTrack, d.hwDone, d.hwRev, d.hwT) + '</div><div class="kq-pre">' + esc(d.hwText) + '</div></td>' +
            '<td><div>' + stateBadges(d.hasQz, d.qzTrack, d.qzDone, d.qzRev, d.qzT) + '</div><div class="kq-pre">' + esc(d.qzText) + '</div>' + (d.score ? '<div class="kq-muted">成績：' + esc(d.score) + '</div>' : '') + (d.qzNext && d.qzNext !== d.qzText ? '<div class="kq-muted">下次課堂小考：' + esc(d.qzNext) + '</div>' : '') + '</td>' +
            '<td>' + (d.note.length > 60 || (d.note.match(/\n/g) || []).length > 2 ? '<div class="kq-pre kq-clamp">' + esc(d.note) + '</div><a class="kq-more">more ▾</a>' : '<div class="kq-pre">' + esc(d.note) + '</div>') + '</td>' +
            '<td class="kq-files">' + d.files.map(function (f) { return '<a target="_blank" href="' + esc(f.href) + '">' + esc(f.name) + '</a>'; }).join('') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('');
    $('kq-main').querySelectorAll('.kq-sort').forEach(function (th) { th.onclick = function () { ORD = ORD === 'asc' ? 'desc' : 'asc'; render(); }; });
    $('kq-main').querySelectorAll('.kq-grp>h2').forEach(function (h) { h.onclick = function () { var tb = h.nextElementSibling; tb.style.display = tb.style.display === 'none' ? '' : 'none'; }; });
  }

  function visText(n) {
    var tv = VIS_TODAY[n];
    return tv ? '<span class="kq-b kq-ok">今天 ' + esc(tv.map(function (x) { return x.tin.slice(11, 16) + '–' + (x.tout ? x.tout.slice(11, 16) : '在班'); }).join('、')) + '</span>' : '';
  }
  function renderDir(visSet, sub, gr, cls, t, q) {
    var names = Object.keys(visSet).filter(function (n) {
      if (q && n.indexOf(q) < 0) return false;
      if (!(sub || gr || cls || t)) return true;
      return DATA.some(function (d) { return d.student === n && (!sub || d.subject === sub) && (!gr || d.grade === gr) && (!cls || d.cls === cls) && (!t || d.teacher === t); });
    });
    var info = {};
    names.forEach(function (n) {
      var recs = DATA.filter(function (d) { return d.student === n; });
      var subj = {};
      recs.forEach(function (d) { (subj[d.subject] = subj[d.subject] || {})[d.cls + '（' + d.teacher + '）'] = 1; });
      var hw = recs.filter(function (d) { return d.hwPending; }).length, qz = recs.filter(function (d) { return d.qzPending; }).length;
      var v = VIS[n] || [];
      var pend = recs.filter(function (d) { return d.hwPending || d.qzPending; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      info[n] = { pend: pend, subj: subj, hw: hw, qz: qz, today: !!VIS_TODAY[n], cnt: v.length, last: v.map(function (x) { return x.tin; }).sort().pop() || '' };
    });
    names.sort(function (a, b) { return (info[b].today - info[a].today) || a.localeCompare(b, 'zh-Hant'); });
    $('kq-main').innerHTML = !names.length ? '<div id="kq-msg">沒有符合條件的學生</div>' :
      '<div class="kq-grp"><h2>學生目錄 <span class="kq-muted">' + names.length + ' 人・點姓名看明細</span></h2><table class="kq-dir"><thead><tr><th>姓名</th><th>到班</th><th>報名科目（期間內有聯絡簿的班級）</th><th>未完成</th></tr></thead><tbody>' +
      names.map(function (n) {
        var I = info[n], ks = Object.keys(I.subj).sort();
        return '<tr data-n="' + esc(n) + '"><td><a href="javascript:void(0)">' + esc(n) + '</a></td>' +
          '<td>' + visText(n) + '<div class="kq-muted">期間 ' + I.cnt + ' 次' + (I.last ? '・最近 ' + esc(I.last.slice(5, 16)) : '') + '</div></td>' +
          '<td>' + (ks.length ? ks.map(function (k) { var c = Object.keys(I.subj[k]); return '<span class="kq-s" title="' + esc(c.join('\n')) + '">' + esc(k) + (c.length > 1 ? '×' + c.length : '') + '</span>'; }).join('') +
            '<div class="kq-muted">' + esc(ks.map(function (k) { return Object.keys(I.subj[k]).join('、'); }).join('、')) + '</div>' : '<span class="kq-muted">無聯絡簿紀錄</span>') + '</td>' +
          '<td>' + (I.hw ? badge(false, '作業 ' + I.hw) : '') + (I.qz ? badge(false, '小考 ' + I.qz) : '') + (!I.hw && !I.qz ? badge(true, '無') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var tip = $('kq-tip');
    $('kq-main').querySelectorAll('tr[data-n]').forEach(function (tr) {
      var n = tr.getAttribute('data-n');
      tr.onclick = function () { tip.style.display = 'none'; MODE = 'detail'; SEL = n; render(); };
      tr.onmouseenter = function () {
        var P = info[n].pend;
        tip.innerHTML = '<div class="kq-tip-h">' + esc(n) + '　未完成 ' + P.length + ' 筆（新→舊）</div>' + (P.length ? P.map(function (d) {
          return '<div class="kq-tip-r"><b>' + esc(d.date.slice(5)) + '</b> ' + esc(d.cls) + '<span class="kq-muted">（' + esc(d.teacher) + '）</span>' +
            (d.hwPending ? '<div>' + stateBadges(true, true, d.hwDone, d.hwRev, '') + '作業：' + esc(d.hwText) + '</div>' : '') +
            (d.qzPending ? '<div>' + stateBadges(true, true, d.qzDone, d.qzRev, '') + '小考：' + esc(d.qzText) + '</div>' : '') + '</div>';
        }).join('') : '<div class="kq-tip-r kq-muted">沒有未完成的作業或小考</div>');
        tip.style.display = 'block';
      };
      tr.onmousemove = function (ev) {
        var w = tip.offsetWidth, h = tip.offsetHeight, x = ev.clientX + 16, y = ev.clientY + 16;
        if (x + w > innerWidth - 8) x = Math.max(8, ev.clientX - w - 16);
        if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
      };
      tr.onmouseleave = function () { tip.style.display = 'none'; };
    });
  }

  function exportCsv() {
    if (!VIEW.length) { alert('沒有資料可匯出'); return; }
    var head = ['上課日', '學生', '班級', '老師', '科目', '年級', '作業', '作業寫完', '作業檢討完成', '作業檢討老師', '小考範圍', '小考寫完', '小考檢討完成', '小考檢討老師', '小考成績', '備註'];
    var lines = [head].concat(VIEW.map(function (d) {
      return [d.date, d.student, d.cls, d.teacher, d.subject, d.grade, d.hwText, !d.hasHw ? '無' : !d.hwTrack ? '不需在K中' : (d.hwDone ? '是' : '否'), !d.hasHw || !d.hwTrack ? '' : (d.hwRev ? '是' : '否'), d.hwT,
        d.qzText, !d.hasQz ? '無' : !d.qzTrack ? '不需在K中' : (d.qzDone ? '是' : '否'), !d.hasQz || !d.qzTrack ? '' : (d.qzRev ? '是' : '否'), d.qzT, d.score, d.note];
    })).map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'K中作業小考_' + $('kq-s').value + '_' + $('kq-e').value + '.csv'; a.click();
  }

  load();
})();

};
(function () {
  function add() {
    if (document.getElementById('kq-launch')) return;
    var b = document.createElement('button'); b.id = 'kq-launch'; b.textContent = 'K中查詢';
    b.title = '版本 3.0.1';
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147482000;padding:10px 16px;border:0;border-radius:20px;background:#1f6feb;color:#fff;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer';
    b.onclick = function () { KQ_OPEN(); };
    document.body.appendChild(b);
  }
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();
