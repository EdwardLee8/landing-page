/**
 * 「支持創作」層原始資料下載。
 *
 * 流程:
 *   1. 用支持者密碼 POST /api/login → 攞 session cookie 同解密密碼。
 *      伺服器會喺回應講明 supporter: true/false(見 worker/index.js)。
 *   2. 取 /exports/index.json.enc 拎清單。worker 會擋住非支持者(403)。
 *   3. 撳「下載」→ 取 .csv.gz.enc → AES 解密 → gunzip → Blob → 存檔。
 *
 * 點解要 gzip:成套 CSV 明文 16MB,gzip 之後 5MB。唔壓縮嘅話每次重新
 * 產生資料,repo 就要多幾十 MB(密文每次都完全唔同,git 慳唔到)。
 */
(function () {
  "use strict";

  var SESSION_KEY = "supporter_auth";
  var dataPassword = null;

  var $ = function (id) { return document.getElementById(id); };

  function show(isSupporter) {
    $("pw-overlay").style.display = "none";
    $("page").style.display = "block";
    if (isSupporter) {
      $("supporter-body").style.display = "block";
      loadList();
    } else {
      $("not-supporter").style.display = "block";
    }
  }

  function status(msg, isError) {
    var el = $("dl-status");
    el.textContent = msg || "";
    el.className = "dl-status" + (isError ? " err" : "");
  }

  function fmtSize(bytes) {
    return bytes >= 1048576
      ? (bytes / 1048576).toFixed(1) + "MB"
      : Math.round(bytes / 1024) + "KB";
  }

  async function loadList() {
    status("載入清單…");
    var files;
    try {
      var resp = await fetch("/exports/index.json.enc", { cache: "no-store" });
      if (resp.status === 401) { MemberAuth.handleUnauthorized(SESSION_KEY); return; }
      if (resp.status === 403) {
        status("");
        $("supporter-body").style.display = "none";
        $("not-supporter").style.display = "block";
        return;
      }
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      files = JSON.parse(await MemberAuth.decryptText(await resp.text(), dataPassword, SESSION_KEY));
    } catch (e) {
      console.error(e);
      status("清單載入唔到,請重新整理頁面。", true);
      return;
    }
    status("");
    var list = $("dl-list");
    list.textContent = "";
    files.forEach(function (f) { list.appendChild(row(f)); });
  }

  function row(f) {
    var item = document.createElement("div");
    item.className = "dl-item";

    var name = document.createElement("div");
    name.className = "dl-name";
    name.textContent = f.name;
    item.appendChild(name);

    var desc = document.createElement("div");
    desc.className = "dl-desc";
    desc.textContent = f.desc;
    item.appendChild(desc);

    var meta = document.createElement("div");
    meta.className = "dl-meta";
    meta.textContent = f.rows.toLocaleString("en-US") + " 行 · 下載 "
      + fmtSize(f.bytes) + " · 解開後 " + fmtSize(f.plain_bytes);
    item.appendChild(meta);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dl-btn";
    btn.textContent = "下載 CSV";
    btn.addEventListener("click", function () { download(f, btn); });
    item.appendChild(btn);
    return item;
  }

  async function gunzip(bytes) {
    // DecompressionStream:Chrome 80+ / Safari 16.4+ / Firefox 113+。
    if (typeof DecompressionStream !== "function") {
      throw new Error("瀏覽器唔支援 gzip 解壓");
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function download(f, btn) {
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "處理中…";
    try {
      var resp = await fetch("/exports/" + f.file, { cache: "no-store" });
      if (resp.status === 401) { MemberAuth.handleUnauthorized(SESSION_KEY); return; }
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var packed = await MemberAuth.decryptBytes(await resp.text(), dataPassword, SESSION_KEY);
      var csv = await gunzip(packed);
      var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      var a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 即刻 revoke 有機會喺部分瀏覽器令下載中斷,隔一陣先放。
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      btn.textContent = "已下載 ✓";
      setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2500);
    } catch (e) {
      console.error(e);
      status(f.name + " 下載失敗,請再試一次。", true);
      btn.textContent = label;
      btn.disabled = false;
    }
  }

  async function attempt() {
    var input = $("pw-input");
    var raw = input.value;
    if (!raw) return;
    $("pw-error").textContent = "";
    var resp;
    try {
      resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: raw }),
        credentials: "same-origin",
      });
    } catch (e) {
      $("pw-error").textContent = "連線唔到伺服器,請再試";
      return;
    }
    if (!resp.ok) {
      $("pw-error").textContent = resp.status === 429
        ? "嘗試太頻密,請稍後再試"
        : "密碼錯誤,請再試";
      input.value = "";
      input.focus();
      return;
    }
    var body = await resp.json();
    dataPassword = body.dataPassword;
    MemberAuth.store(dataPassword, SESSION_KEY);
    show(!!body.supporter);
  }

  $("pw-submit").addEventListener("click", attempt);
  $("pw-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") attempt();
    else $("pw-error").textContent = "";
  });

  // cookie 未過期就唔使再打密碼。/api/session 會講返係咪支持者。
  fetch("/api/session", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (s) {
      if (s && s.authenticated && s.dataPassword) {
        dataPassword = s.dataPassword;
        MemberAuth.store(dataPassword, SESSION_KEY);
        show(!!s.supporter);
      } else {
        $("pw-input").focus();
      }
    })
    .catch(function () { $("pw-input").focus(); });
})();
