// ============================================================
// main.js — scroll animations + dynamic content rendering
// Uses DOM methods and HTML escaping instead of raw innerHTML
// to prevent XSS even if content.js values are tampered.
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  renderAll();
  renderArchive();
  initScrollReveal();
  initScrollChevron();
  initNav();
});

// ── HTML Escape (prevent XSS in content values) ───────────
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Safe URL: only allow http/https schemes
function safeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (_) { /* ignore */ }
  return "#";
}

// ── Platform SVG Icons (static, not from content) ─────────
const PLATFORM_ICONS = {
  patreon: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M14.82 2.41C18.78 2.41 22 5.65 22 9.62c0 3.96-3.22 7.18-7.18 7.18-3.96 0-7.18-3.22-7.18-7.18 0-3.97 3.22-7.21 7.18-7.21zM2 21.6h3.5V2.41H2V21.6z"/>
  </svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>`,
  threads: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.068c0-3.52.85-6.374 2.495-8.423C5.845 1.24 8.598.059 12.18.035h.014c2.536.017 4.71.69 6.463 2.001 1.72 1.284 2.995 3.156 3.789 5.566l-2.287.764c-.63-1.888-1.629-3.38-2.969-4.434-1.35-1.06-3.023-1.595-4.982-1.611-2.912.019-5.14.905-6.624 2.63-1.47 1.71-2.22 4.225-2.22 7.472 0 3.248.75 5.762 2.22 7.472 1.483 1.726 3.712 2.611 6.626 2.63 1.742-.013 3.22-.395 4.394-1.134 1.174-.74 1.97-1.842 2.366-3.273.28-.977.422-2.077.422-3.27a7.8 7.8 0 00-.032-.683c-.175-1.476-.78-2.59-1.8-3.31-.677-.48-1.497-.76-2.44-.836-.09.29-.196.567-.32.826-.46.972-1.19 1.7-2.17 2.162-.743.347-1.59.503-2.518.465-.764-.033-1.46-.213-2.07-.535-.606-.322-1.1-.784-1.46-1.37-.38-.618-.572-1.36-.572-2.204 0-.844.192-1.6.572-2.25.366-.63.886-1.12 1.543-1.45.65-.328 1.41-.494 2.255-.494.458 0 .9.05 1.318.148l-.455 2.1a3.17 3.17 0 00-.863-.115c-.482 0-.878.1-1.178.297-.287.19-.494.458-.616.796-.127.348-.19.77-.19 1.257 0 .498.063.924.19 1.268.124.34.332.607.618.794.3.197.694.297 1.174.297.75 0 1.348-.218 1.78-.648.34-.336.582-.798.72-1.374a12.46 12.46 0 00.083-.53c.033-.27.05-.548.05-.832 0-.206-.007-.407-.02-.602a6.04 6.04 0 00-.076-.645c-.175-.984-.616-1.76-1.31-2.308-.69-.545-1.59-.82-2.676-.82h-.05c-1.19.013-2.21.36-3.035 1.033-.822.672-1.387 1.64-1.68 2.882-.113.48-.17.993-.17 1.524 0 .63.073 1.214.217 1.738.29 1.053.86 1.876 1.698 2.447.838.57 1.9.858 3.16.858h.048c.924-.012 1.76-.217 2.49-.61.73-.39 1.34-.955 1.81-1.675.285-.436.512-.926.676-1.46.13.12.254.25.37.386.56.655.9 1.49.993 2.48.02.205.03.418.03.634 0 1.158-.137 2.225-.406 3.172-.536 1.876-1.62 3.31-3.22 4.264-1.595.95-3.57 1.44-5.87 1.455z"/>
  </svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>`,
  medium: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
  </svg>`,
};

// ── DOM Builder Helpers ───────────────────────────────────
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v; // only for static SVG strings
      else node.setAttribute(k, v);
    });
  }
  children.forEach(c => c && node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return node;
}

function link(url, attrs, ...children) {
  return el("a", { href: safeUrl(url), target: "_blank", rel: "noopener noreferrer", ...attrs }, ...children);
}

// ── Render All Sections ───────────────────────────────────
function renderAll() {
  const c = SITE_CONTENT;
  renderHero(c.author);
  renderStory(c.story);
  renderAbout(c.about);
  renderArticles(c.articles);
  renderDiscordFree(c.discordFree);
  renderDiscordPaid(c.discordPaid);
  renderTiers(c.tiers);
  renderSocial(c.social);
  renderFooter(c.author, c.seo);
  updateMeta(c.seo, c.author);
}

function renderHero(author) {
  const container = document.getElementById("hero-content");
  if (!container) return;

  // Background image
  const bgImg = document.getElementById("hero-bg");
  if (bgImg && (author.bgImage || author.avatar)) {
    bgImg.src = esc(author.bgImage || author.avatar);
  }

  const avatarWrap = el("div", { class: "avatar-wrap" });
  const img = el("img", { src: esc(author.avatar), alt: esc(author.name), class: "avatar" });
  const fallback = el("div", { class: "avatar-fallback", style: "display:none", text: author.name.charAt(0) });
  img.onerror = () => { img.style.display = "none"; fallback.style.display = "flex"; };
  avatarWrap.appendChild(img);
  avatarWrap.appendChild(fallback);

  const ctaLink = link(
    SITE_CONTENT.social.find(s => s.highlight)?.url || "#social",
    { class: "btn-primary", text: "立即訂閱" }
  );
  // Override href to local anchor for smooth scroll
  ctaLink.href = "#story";
  ctaLink.removeAttribute("target");
  ctaLink.removeAttribute("rel");

  // Data tools rows
  const dbRow = el("div", { class: "hero-tool-row" });
  dbRow.append(
    el("span", { class: "hero-tool-label", text: "資料庫" }),
    el("a", { href: "/hk-stocks-db.html", class: "btn-tool", text: "港股" }),
    el("a", { href: "/us-stocks-db.html", class: "btn-tool", text: "美股" })
  );

  const kwRow = el("div", { class: "hero-tool-row" });
  kwRow.append(
    el("span", { class: "hero-tool-label", text: "關鍵字" }),
    el("a", { href: "/hk-keywords.html", class: "btn-tool", text: "港股" }),
    el("a", { href: "/us-keywords.html", class: "btn-tool", text: "美股" }),
    el("a", { href: "/cn-keywords.html", class: "btn-tool", text: "A股" })
  );

  container.append(
    avatarWrap,
    el("h1", { class: "hero-name", text: author.name }),
    el("p", { class: "hero-tagline", text: author.tagline }),
    el("p", { class: "hero-sub", text: author.subTagline }),
    el("div", { class: "hero-cta-group" },
      ctaLink,
      el("div", { class: "hero-tool-group" }, dbRow, kwRow)
    )
  );
}

// Helper: render text with \n as <br>
function textWithBreaks(container, text) {
  const parts = text.split("\n");
  parts.forEach((part, i) => {
    container.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) container.appendChild(document.createElement("br"));
  });
}

function renderStory(story) {
  const container = document.getElementById("story-content");
  if (!container || !story) return;

  // Hook — large opening pull-quote
  const hookEl = el("p", { class: "story-hook reveal" });
  textWithBreaks(hookEl, story.hook);
  container.appendChild(hookEl);

  // Journey — grouped in one reveal container
  const journeyWrap = el("div", { class: "story-journey reveal" });
  (story.journey || []).forEach(para => {
    const p = el("p", { class: "story-paragraph" });
    textWithBreaks(p, para);
    journeyWrap.appendChild(p);
  });
  container.appendChild(journeyWrap);

  // Turning point — emphatic moment
  if (story.turningPoint) {
    const tp = el("div", { class: "story-turning-point reveal" });
    tp.appendChild(el("p", { class: "story-tp-before", text: story.turningPoint.before }));
    tp.appendChild(el("p", { class: "story-tp-emphasis", text: story.turningPoint.emphasis }));
    container.appendChild(tp);
  }

  // Insight
  if (story.insight) {
    const insightEl = el("p", { class: "story-insight reveal" });
    textWithBreaks(insightEl, story.insight);
    container.appendChild(insightEl);
  }

  // Three pillars
  if (story.pillars) {
    const pillarsWrap = el("div", { class: "story-pillars-wrap reveal" });
    pillarsWrap.appendChild(el("p", { class: "story-pillars-intro", text: story.pillars.intro }));
    const grid = el("div", { class: "story-pillars" });
    (story.pillars.items || []).forEach(item => {
      grid.appendChild(
        el("div", { class: "story-pillar" },
          el("div", { class: "story-pillar-label", text: item.label }),
          el("p", { class: "story-pillar-desc", text: item.desc })
        )
      );
    });
    pillarsWrap.appendChild(grid);
    container.appendChild(pillarsWrap);
  }

  // AI note — intentionally understated
  if (story.aiNote) {
    const aiEl = el("p", { class: "story-aside reveal" });
    textWithBreaks(aiEl, story.aiNote);
    container.appendChild(aiEl);
  }

  // Value proposition
  const valuePropWrap = el("div", { class: "story-value-prop reveal" });
  (story.valueProp || []).forEach(para => {
    const p = el("p", { class: "story-paragraph" });
    textWithBreaks(p, para);
    valuePropWrap.appendChild(p);
  });
  container.appendChild(valuePropWrap);

  // Closing hook + CTA
  if (story.closingHook || story.cta) {
    const closing = el("div", { class: "story-closing reveal" });
    if (story.closingHook) {
      const hookP = el("p", { class: "story-closing-hook" });
      textWithBreaks(hookP, story.closingHook);
      closing.appendChild(hookP);
    }
    if (story.cta) {
      closing.appendChild(
        link(story.cta.url, { class: "btn-primary", text: story.cta.text })
      );
    }
    container.appendChild(closing);
  }
}

function renderAbout(about) {
  const container = document.getElementById("about-content");
  if (!container || !about) return;

  const statsEl = el("div", { class: "about-stats reveal" });
  (about.stats || []).forEach(s => {
    statsEl.appendChild(
      el("div", { class: "about-stat" },
        el("div", { class: "about-stat-value", text: s.value }),
        el("div", { class: "about-stat-label", text: s.label })
      )
    );
  });

  if ((about.stats || []).length) container.appendChild(statsEl);
}

function renderPatreonPage(data) {
  const container = document.getElementById("patreon-content");
  if (!container || !data) return;

  const desc = el("p", { class: "content-desc reveal", text: data.description });

  const grid = el("div", { class: "feature-grid" });
  (data.features || []).forEach((f, i) => {
    const card = el("div", { class: "feature-card reveal" });
    card.style.transitionDelay = `${0.05 + i * 0.07}s`;
    card.append(
      el("div", { class: "feature-title", text: f.title }),
      el("p", { class: "feature-desc", text: f.desc })
    );
    grid.appendChild(card);
  });

  const ctaWrap = el("div", { class: "content-cta reveal" });
  if (data.cta) {
    ctaWrap.appendChild(link(data.cta.url, { class: "btn-primary", text: data.cta.text }));
  }

  container.append(desc, grid, ctaWrap);
}

function renderDiscordPaid(data) {
  const container = document.getElementById("discord-paid-content");
  if (!container || !data) return;

  const desc = el("p", { class: "content-desc reveal", text: data.description });

  const channelList = el("div", { class: "channel-list" });
  (data.channels || []).forEach((ch, i) => {
    const item = el("div", { class: "channel-item reveal" });
    item.style.transitionDelay = `${0.05 + i * 0.06}s`;
    item.append(
      el("div", { class: "channel-name", text: ch.name }),
      el("p", { class: "channel-desc", text: ch.desc })
    );
    channelList.appendChild(item);
  });

  const ctaWrap = el("div", { class: "content-cta reveal" });
  if (data.cta) {
    ctaWrap.appendChild(link(data.cta.url, { class: "btn-primary", text: data.cta.text }));
  }

  container.append(desc, channelList, ctaWrap);
}

function renderDiscordFree(data) {
  const container = document.getElementById("discord-free-content");
  if (!container || !data) return;

  const desc = el("p", { class: "content-desc reveal", text: data.description });

  const channelList = el("div", { class: "channel-list channel-list--free" });
  (data.channels || []).forEach((ch, i) => {
    const item = el("div", { class: "channel-item reveal" });
    item.style.transitionDelay = `${0.05 + i * 0.06}s`;
    item.append(
      el("div", { class: "channel-name", text: ch.name }),
      el("p", { class: "channel-desc", text: ch.desc })
    );
    channelList.appendChild(item);
  });

  const ctaWrap = el("div", { class: "content-cta reveal" });
  if (data.cta) {
    ctaWrap.appendChild(link(data.cta.url, { class: "btn-primary btn-primary--free", text: data.cta.text }));
  }

  container.append(desc, channelList, ctaWrap);
}

function renderArticles(articles) {
  const grid = document.getElementById("articles-grid");
  if (!grid) return;
  grid.textContent = "";

  articles.forEach(a => {
    const iconHtml = PLATFORM_ICONS[a.platform] || "";

    const platformDiv = el("div", { class: "article-platform" });
    if (iconHtml) platformDiv.innerHTML = iconHtml; // static SVG
    platformDiv.appendChild(el("span", { text: capitalize(a.platform) }));

    const card = link(a.url, { class: "article-card reveal" },
      platformDiv,
      el("h3", { class: "article-title", text: a.title }),
      el("p", { class: "article-excerpt", text: a.excerpt }),
      el("div", { class: "article-footer" },
        el("time", { datetime: esc(a.date), text: formatDate(a.date) }),
        el("span", { class: "article-arrow", text: "→" })
      )
    );
    grid.appendChild(card);
  });

  // CTA button
  const ctaWrap = document.getElementById("articles-cta");
  if (ctaWrap) {
    ctaWrap.className = "content-cta reveal";
    ctaWrap.appendChild(
      link("https://www.patreon.com/collection/503820?view=expanded",
        { class: "btn-primary", text: "睇免費報告 →" })
    );
  }
}

function renderTiers(tiers) {
  const wrap = document.getElementById("tiers-wrap");
  if (!wrap) return;
  wrap.textContent = "";

  tiers.forEach(t => {
    const card = el("div", { class: `tier-card ${t.highlight ? "tier-highlight" : ""} reveal` });

    if (t.highlight) {
      card.appendChild(el("div", { class: "tier-badge", text: "最多人選擇" }));
    }

    const priceEl = el("div", { class: "tier-price", text: t.price });
    priceEl.appendChild(el("span", { class: "tier-period", text: t.period }));

    const featuresList = el("ul", { class: "tier-features" });
    t.features.forEach(f => {
      featuresList.appendChild(
        el("li", {},
          el("span", { class: "check", text: "✓" }),
          f
        )
      );
    });

    card.append(
      el("div", { class: "tier-name", text: t.name }),
      priceEl,
      featuresList,
      link(t.url, { class: `tier-cta ${t.highlight ? "tier-cta-highlight" : ""}`, text: t.cta })
    );
    wrap.appendChild(card);
  });
}

function renderSocial(social) {
  const wrap = document.getElementById("social-wrap");
  if (!wrap) return;
  wrap.textContent = "";

  social.forEach(s => {
    const iconHtml = PLATFORM_ICONS[s.platform.toLowerCase()] || "";

    const pill = link(s.url, { class: `social-pill ${s.highlight ? "social-pill-highlight" : ""} reveal` });
    if (iconHtml) {
      const iconSpan = el("span", { class: "social-icon" });
      iconSpan.innerHTML = iconHtml; // static SVG
      pill.appendChild(iconSpan);
    }
    pill.appendChild(el("span", { text: s.label }));
    wrap.appendChild(pill);
  });
}

function renderFooter(author, seo) {
  const year = new Date().getFullYear();
  const container = document.getElementById("footer-content");
  if (!container) return;
  container.textContent = "";
  container.append(
    el("p", { class: "footer-copy", text: `© ${year} ${author.name}. All rights reserved.` }),
    el("p", { class: "footer-disclaimer",
      text: "本網站所有內容僅供參考及教育用途，並不構成投資建議、推薦或誘使進行任何投資交易。投資有風險，過去表現不保證未來成果。在作出任何投資決定前，讀者應獨立判斷、評估風險並自行承擔相關責任。"
    })
  );
}

function updateMeta(seo, author) {
  document.title = seo.title;
  setMeta("description", seo.description);
  setOg("title", seo.title);
  setOg("description", seo.description);
  setOg("image", `${safeUrl(seo.siteUrl)}/${esc(seo.ogImage)}`);
  setOg("url", safeUrl(seo.siteUrl));
  setOg("type", "website");
}

// ── Archive: fetch web_data.json + render searchable grid ─
function renderArchive() {
  const controlsEl  = document.getElementById("archive-controls");
  const gridEl      = document.getElementById("archive-grid");
  const pageEl      = document.getElementById("archive-pagination");
  if (!controlsEl || !gridEl) return;

  const PAGE_SIZE = 12;
  let allPosts   = [];
  let filtered   = [];
  let catLabels  = {};
  let activeCat  = "all";
  let activeYear = "all";
  let activeMon  = "all";
  let searchQ    = "";
  let page       = 0;

  gridEl.appendChild(el("div", { class: "archive-loading", text: "載入中…" }));

  fetch("web_data.json")
    .then(r => r.json())
    .then(data => {
      allPosts  = data.posts || [];
      catLabels = data.cat_labels || {};
      buildControls();
      applyFilters();
    })
    .catch(err => {
      gridEl.textContent = "";
      gridEl.appendChild(el("div", { class: "archive-empty", text: "載入失敗：" + err.message }));
    });

  function buildControls() {
    controlsEl.textContent = "";

    // Category pills
    const pillsRow = el("div", { class: "archive-pills" });
    [{ id: "all", label: "全部" },
     ...Object.entries(catLabels).map(([id, label]) => ({ id, label }))]
      .forEach(c => {
        const pill = el("button", {
          class: "archive-pill" + (c.id === "all" ? " archive-pill-active" : ""),
          text: c.label, type: "button"
        });
        pill.dataset.cat = c.id;
        pill.addEventListener("click", () => {
          activeCat = c.id;
          page = 0;
          pillsRow.querySelectorAll(".archive-pill").forEach(p =>
            p.classList.toggle("archive-pill-active", p.dataset.cat === c.id));
          applyFilters();
        });
        pillsRow.appendChild(pill);
      });

    // Year pills — derived from data
    const years = [...new Set(allPosts.map(p => p.date.slice(0, 4)))].sort().reverse();
    const yearRow = el("div", { class: "archive-pills archive-pills--year" });
    [{ id: "all", label: "全部年份" }, ...years.map(y => ({ id: y, label: y + " 年" }))]
      .forEach(y => {
        const pill = el("button", {
          class: "archive-pill" + (y.id === activeYear ? " archive-pill-active" : ""),
          text: y.label, type: "button"
        });
        pill.dataset.year = y.id;
        pill.addEventListener("click", () => {
          activeYear = y.id;
          activeMon = "all";
          page = 0;
          yearRow.querySelectorAll(".archive-pill").forEach(p =>
            p.classList.toggle("archive-pill-active", p.dataset.year === y.id));
          refreshMonthRow();
          applyFilters();
        });
        yearRow.appendChild(pill);
      });

    // Month pills — shown only when a year is selected
    const monthRow = el("div", { class: "archive-pills archive-pills--month" });

    function refreshMonthRow() {
      monthRow.textContent = "";
      if (activeYear === "all") { monthRow.style.display = "none"; return; }
      monthRow.style.display = "";
      const months = [...new Set(
        allPosts.filter(p => p.date.startsWith(activeYear)).map(p => p.date.slice(5, 7))
      )].sort();
      [{ id: "all", label: "全部月份" }, ...months.map(m => ({ id: m, label: parseInt(m) + " 月" }))]
        .forEach(m => {
          const pill = el("button", {
            class: "archive-pill archive-pill--sm" + (m.id === activeMon ? " archive-pill-active" : ""),
            text: m.label, type: "button"
          });
          pill.dataset.mon = m.id;
          pill.addEventListener("click", () => {
            activeMon = m.id;
            page = 0;
            monthRow.querySelectorAll(".archive-pill").forEach(p =>
              p.classList.toggle("archive-pill-active", p.dataset.mon === m.id));
            applyFilters();
          });
          monthRow.appendChild(pill);
        });
    }
    refreshMonthRow();

    // Search input
    const searchInput = el("input", {
      class: "archive-search", type: "search",
      placeholder: "搜尋股票代碼或標題（如：0700、NVDA、DMI）"
    });
    searchInput.addEventListener("input", () => {
      searchQ = searchInput.value.trim().toUpperCase();
      page = 0;
      applyFilters();
    });

    controlsEl.append(pillsRow, yearRow, monthRow, searchInput);
  }

  function applyFilters() {
    filtered = allPosts.filter(p => {
      if (activeCat  !== "all" && !p.cats.includes(activeCat))      return false;
      if (activeYear !== "all" && !p.date.startsWith(activeYear))    return false;
      if (activeMon  !== "all" && p.date.slice(5, 7) !== activeMon)  return false;
      if (!searchQ) return true;
      const q = searchQ;
      const hkHit   = p.hk.some(s => s.c === q || s.c.replace(/^0+/, "") === q.replace(/^0+/, ""));
      const usHit   = p.us.some(s => s.c === q);
      const titleHit = p.title.toUpperCase().includes(q);
      return hkHit || usHit || titleHit;
    });
    renderPage();
  }

  function renderPage() {
    gridEl.textContent = "";
    pageEl.textContent = "";
    const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (!slice.length) {
      gridEl.appendChild(el("div", { class: "archive-empty", text: "未搵到符合條件嘅文章" }));
      return;
    }

    slice.forEach(p => {
      // Badges
      const badgesEl = el("div", { class: "archive-card-cats" });
      p.cats.filter(c => c !== "other").forEach(c => {
        badgesEl.appendChild(el("span", { class: "archive-badge archive-badge-" + c, text: catLabels[c] || c }));
      });

      // Stock tags (clickable, with company name + signal colour)
      const stocksEl = el("div", { class: "archive-stocks" });
      const allStocks = [
        ...p.hk.slice(0, 7).map(s => ({ ...s, market: "hk" })),
        ...p.us.slice(0, 4).map(s => ({ ...s, market: "us" })),
      ];
      allStocks.forEach(s => {
        const label = s.n ? `${s.c} ${s.n}` : s.c;
        const sigClass = s.s === "b" ? " stock-bull" : s.s === "r" ? " stock-bear" : "";
        const title = s.s === "b" ? "睇好" : s.s === "r" ? "睇淡" : "點擊搜索";
        const tag = el("span", { class: "archive-stock-tag" + sigClass, text: label, title });
        tag.addEventListener("click", (e) => {
          e.preventDefault();
          const input = document.querySelector(".archive-search");
          if (input) {
            input.value = s.c;
            input.dispatchEvent(new Event("input"));
          }
          document.getElementById("archive").scrollIntoView({ behavior: "smooth" });
        });
        stocksEl.appendChild(tag);
      });

      const card = link(p.url, { class: "archive-card reveal" },
        el("div", { class: "archive-card-top" },
          el("time", { class: "archive-date", datetime: esc(p.date), text: formatDate(p.date) }),
          badgesEl
        ),
        el("h3", { class: "archive-card-title", text: p.title }),
        el("p",  { class: "archive-card-preview", text: p.preview }),
        (p.hk.length || p.us.length) ? stocksEl : null
      );
      gridEl.appendChild(card);
    });

    // Pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages > 1) {
      const wrap = el("div", { class: "archive-page-wrap" });
      const prev = el("button", { class: "archive-page-btn", text: "← 上一頁", type: "button" });
      const next = el("button", { class: "archive-page-btn", text: "下一頁 →", type: "button" });
      const info = el("span", { class: "archive-page-info",
        text: `第 ${page + 1} / ${totalPages} 頁，共 ${total} 篇` });
      prev.disabled = page === 0;
      next.disabled = page >= totalPages - 1;
      prev.addEventListener("click", () => { page--; renderPage(); scrollToArchive(); });
      next.addEventListener("click", () => { page++; renderPage(); scrollToArchive(); });
      wrap.append(prev, info, next);
      pageEl.appendChild(wrap);
    }
  }

  function scrollToArchive() {
    document.getElementById("archive").scrollIntoView({ behavior: "smooth" });
  }
}

// ── Nav: active highlight + scroll bg + mobile menu ───────
function initNav() {
  const nav    = document.getElementById("site-nav");
  const links  = document.querySelectorAll(".nav-link");
  const menuBtn = document.getElementById("nav-menu-btn");
  const navLinks = document.querySelector(".nav-links");

  // Scroll: add background when scrolled
  window.addEventListener("scroll", () => {
    nav.classList.toggle("nav-scrolled", window.scrollY > 60);
  }, { passive: true });

  // Mobile menu toggle
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      const open = navLinks.classList.toggle("nav-links-open");
      menuBtn.classList.toggle("nav-menu-open", open);
    });
    // Close on link click
    links.forEach(l => l.addEventListener("click", () => {
      navLinks.classList.remove("nav-links-open");
      menuBtn.classList.remove("nav-menu-open");
    }));
  }

  // Active section highlight via IntersectionObserver
  const sections = ["hero", "story", "about", "articles", "discord-free", "archive", "tiers", "discord-paid", "social"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (!sections.length) return;

  const setActive = (id) => {
    links.forEach(l => {
      l.classList.toggle("nav-link-active", l.dataset.section === id);
    });
  };

  // Set hero active initially
  setActive("hero");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) setActive(e.target.id);
    });
  }, { threshold: 0.3, rootMargin: "-80px 0px -40% 0px" });

  sections.forEach(s => observer.observe(s));
}

// ── Scroll Reveal ─────────────────────────────────────────
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("revealed");
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".section-header").forEach(el => observer.observe(el));

  // Observe .reveal elements already in the DOM (added by renderAll before this runs)
  function observeRevealNodes() {
    document.querySelectorAll(".reveal:not(.observed)").forEach(node => {
      node.classList.add("observed");
      observer.observe(node);
    });
  }
  observeRevealNodes();

  // Also watch for any future .reveal elements
  const mo = new MutationObserver(observeRevealNodes);
  mo.observe(document.body, { childList: true, subtree: true });
}

function initScrollChevron() {
  const chevron = document.getElementById("scroll-chevron");
  if (!chevron) return;
  window.addEventListener("scroll", () => {
    chevron.style.opacity = window.scrollY > 80 ? "0" : "1";
  }, { passive: true });
}

// ── Helpers ───────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function setMeta(name, content) {
  let node = document.querySelector(`meta[name="${name}"]`);
  if (!node) { node = document.createElement("meta"); node.name = name; document.head.appendChild(node); }
  node.content = content;
}

function setOg(prop, content) {
  let node = document.querySelector(`meta[property="og:${prop}"]`);
  if (!node) { node = document.createElement("meta"); node.setAttribute("property", `og:${prop}`); document.head.appendChild(node); }
  node.content = content;
}
