/**
 * 會員驗證與資料解密的共用模組。
 *
 * 原本這段邏輯在 15 個 HTML 頁面各自內嵌一份,任何修正都要改 15 次。
 * 集中在這裡之後,頁面只需引用本檔並提供自己的初始化函式。
 *
 * 加密格式必須與 Python 端 enc_utils.py 完全一致:
 *   base64( salt[16] || nonce[12] || AES-256-GCM(ciphertext) )
 *   key = PBKDF2-HMAC-SHA256(password, salt, 100000 iterations, 256 bit)
 *
 * 注意:這是前端加密,只能擋住隨手抓檔,擋不住已取得密碼的人。
 * 真正的存取控制見 docs/server-auth.md。
 */
(function (global) {
  "use strict";

  // 會員密碼的 SHA-256。更換密碼請用 rotate_password.py --update-html,
  // 它會同時重新加密所有 .enc 並更新此處與各頁面的雜湊值。
  var PW_HASH = "86f2eb06149717c68e0a3fc4cb3876a4c17258de79f3f19c96f3137b342a3c2b";

  var DEFAULT_SESSION_KEY = "unified_auth";
  var ITERATIONS = 100000;

  function keyOf(sessionKey) {
    return sessionKey || DEFAULT_SESSION_KEY;
  }

  function toHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  async function sha256(str) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return toHex(buf);
  }

  /** 密碼是否正確(不改變任何狀態)。 */
  async function verify(raw) {
    return (await sha256(raw)) === PW_HASH;
  }

  /** 取出本次 session 的原始密碼,未登入時回傳空字串。 */
  function password(sessionKey) {
    return sessionStorage.getItem(keyOf(sessionKey) + "_pw") || "";
  }

  /** 是否已登入。密碼遺失時視為未登入,避免頁面卡在解不開的狀態。 */
  function isAuthed(sessionKey) {
    return sessionStorage.getItem(keyOf(sessionKey)) === "1" && !!password(sessionKey);
  }

  function store(raw, sessionKey) {
    sessionStorage.setItem(keyOf(sessionKey), "1");
    sessionStorage.setItem(keyOf(sessionKey) + "_pw", raw);
  }

  function clear(sessionKey) {
    sessionStorage.removeItem(keyOf(sessionKey));
    sessionStorage.removeItem(keyOf(sessionKey) + "_pw");
  }

  async function deriveKey(pw, salt) {
    var keyMat = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
      keyMat, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  /** 解密為原始文字。pw 省略時使用本次 session 的密碼。 */
  async function decryptText(b64, pw, sessionKey) {
    var raw = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    var salt = raw.slice(0, 16), nonce = raw.slice(16, 28), ct = raw.slice(28);
    var key = await deriveKey(pw || password(sessionKey), salt);
    var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct);
    return new TextDecoder().decode(plain);
  }

  /** 解密並解析為 JSON。 */
  async function decrypt(b64, pw, sessionKey) {
    return JSON.parse(await decryptText(b64, pw, sessionKey));
  }

  /** 下載並解密一個 .enc 檔(JSON)。 */
  async function fetchEncrypted(url, pw, sessionKey) {
    var resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " for " + url);
    return decrypt(await resp.text(), pw, sessionKey);
  }

  /**
   * 掛上密碼閘門。
   *
   * opts:
   *   sessionKey  — sessionStorage 前綴,預設 "unified_auth"
   *   onAuthed    — 驗證通過後呼叫(自動登入與手動輸入皆會呼叫)
   *   onReveal    — 隱藏遮罩之外要做的額外顯示動作(選填)
   *   overlayId / inputId / errorId / submitId — 元素 id(有預設值)
   */
  function gate(opts) {
    opts = opts || {};
    var sessionKey = opts.sessionKey;
    var overlay = document.getElementById(opts.overlayId || "pw-overlay");
    var input = document.getElementById(opts.inputId || "pw-input");
    var error = document.getElementById(opts.errorId || "pw-error");
    var submit = document.getElementById(opts.submitId || "pw-submit");
    var onAuthed = opts.onAuthed || function () {};

    function reveal() {
      if (overlay) overlay.style.display = "none";
      if (opts.onReveal) opts.onReveal();
    }

    async function attempt() {
      var raw = input ? input.value : "";
      if (!raw) return;
      if (await verify(raw)) {
        store(raw, sessionKey);
        reveal();
        onAuthed();
      } else {
        if (error) error.textContent = "密碼錯誤，請再試";
        if (input) { input.value = ""; input.focus(); }
      }
    }

    if (submit) submit.addEventListener("click", attempt);
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") attempt();
        else if (error) error.textContent = "";
      });
    }

    if (isAuthed(sessionKey)) {
      reveal();
      onAuthed();
    } else {
      // 只有旗標沒有密碼(例如舊分頁殘留)一律當作未登入
      clear(sessionKey);
      if (input) input.focus();
    }

    return attempt;
  }

  global.MemberAuth = {
    PW_HASH: PW_HASH,
    sha256: sha256,
    verify: verify,
    password: password,
    isAuthed: isAuthed,
    store: store,
    clear: clear,
    deriveKey: deriveKey,
    decrypt: decrypt,
    decryptText: decryptText,
    fetchEncrypted: fetchEncrypted,
    gate: gate
  };
})(window);
