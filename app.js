(() => {
  let CATALOG = null;
  let METRO = null;
  let activeMatrixTier = "all";
  let matrixQuery = "";
  let activeTrack = "all";
  let activeYear = "all";
  let rtOnly = false;
  let libQuery = "";
  let libSort = "newest";
  let visibleCount = 30;
  let activePathway = null;

  const TIER_INFO = {
    T0: {
      color: "#1e5246",
      kicker: "Tier 0 · Text Specification — Two Fighters in a Courtyard (0:04)",
      A: [["Identity", "described"], ["Appearance", "described"], ["Voice", "described"], ["Style", "described"]],
      S: [["Layout", "described"], ["Motion", "described"], ["Camera", "described"], ["Events", "described"]],
      up: "Text prompt",
      syn: "Faces, choreography, timing, camera",
      fail: "Wrong fighter falls or spontaneously stands back up",
    },
    T1: {
      color: "#ad803b",
      kicker: "Tier 1 · Appearance Anchoring — Two Fighters in a Courtyard (0:04)",
      A: [["Identity", "exemplified"], ["Appearance", "exemplified"], ["Voice", "open"], ["Style", "described"]],
      S: [["Layout", "open"], ["Motion", "described"], ["Camera", "described"], ["Events", "described"]],
      up: "One reference portrait per fighter + prompt",
      syn: "Choreography, timing, camera, courtyard background",
      fail: "Portrait poses, lighting, and studio backgrounds copied verbatim",
    },
    T2: {
      color: "#a75246",
      kicker: "Tier 2 · Compositional Specification — Two Fighters in a Courtyard (0:04)",
      A: [["Identity", "exemplified"], ["Appearance", "exemplified"], ["Voice", "exemplified"], ["Style", "exemplified"]],
      S: [["Layout", "open"], ["Motion", "exemplified"], ["Camera", "exemplified"], ["Events", "exemplified"]],
      up: "Portraits + fight clip + '0:04 red falls' + audio",
      syn: "Exact 3D layout, contact timing, entity routing",
      fail: "Outfits swap between fighters; original actors from clip leak in",
    },
    T3a: {
      color: "#785c84",
      kicker: "Tier 3a · Pre-Fixed External Structure — Two Fighters in a Courtyard (0:04)",
      A: [["Identity", "exemplified"], ["Appearance", "exemplified"], ["Voice", "exemplified"], ["Style", "described"]],
      S: [["Layout", "aligned"], ["Motion", "aligned"], ["Camera", "aligned"], ["Events", "aligned"]],
      up: "Pre-fixed clay clip with skeletons + portraits",
      syn: "Materials, lighting, secondary cloth & fine motion detail",
      fail: "Stiff placeholder keyframing or grey shading copied verbatim",
    },
    T3b: {
      color: "#4e6e91",
      kicker: "Tier 3b · Causal Evolving-State Stream — Two Fighters in a Courtyard (0:04)",
      A: [["Identity", "exemplified"], ["Appearance", "exemplified"], ["Voice", "exemplified"], ["Style", "described"]],
      S: [["Layout", "aligned"], ["Motion", "aligned"], ["Camera", "aligned"], ["Events", "aligned"]],
      up: "Live engine state streamed chunk by chunk",
      syn: "Surface continuity via visual memory subordinate to state",
      fail: "Cached visual memory revives the fallen red fighter or delays the fall",
    },
  };

  const PATHWAY_META = {
    mfus: { label: "Input or feature fusion (16)", color: "#785c84", bg: "#f3eef7" },
    mbr:  { label: "Control branch or adapter (13)", color: "#a58cb1", bg: "#f7f3fa" },
    mh3:  { label: "MiniMax-H3 ref. seq. (12)", color: "#ad803b", bg: "#f8f1e4" },
    mctx: { label: "Other in-context seq. (4)", color: "#4e6e91", bg: "#edf3f9" },
    mxat: { label: "Cross-attention (3)", color: "#2d7868", bg: "#e9f5f1" },
    mtf:  { label: "Training-free inv. (1)", color: "#b66155", bg: "#f9ecea" },
    mnr:  { label: "Undisclosed (1)", color: "#7d8885", bg: "#f2f3f2" },
    grblue: { label: "Implicit WM contrast (6)", color: "#4e6e91", bg: "#ffffff" },
  };

  const TRACK_ORDER = [
    ["all", "All Cited Works"],
    ["T3b", "Tier 3b · Streamed & Stateful"],
    ["T3a", "Tier 3a · Pre-Fixed Structure"],
    ["T1-2", "Tiers 1–2 · Reference Lineage"],
    ["Benchmark", "Evaluation & Benchmarks"],
    ["Systems & Training", "Streaming, Codecs & Distillation"],
    ["World Models & Surveys", "World Models & Surveys"],
    ["Foundations & Context", "Foundations & Context"],
  ];

  const esc = (s) =>
    String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    const orig = btn.textContent;
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = orig), 1400);
  }

  /* ---- Perspective Ladder Live Inspector ---- */
  function setActiveTier(tier) {
    const d = TIER_INFO[tier];
    if (!d) return;
    document.querySelectorAll("#ladder-paths .path").forEach((c) => c.classList.toggle("active", c.dataset.tier === tier));
    document.getElementById("ladder-live-bar").style.borderLeftColor = d.color;
    const renderRow = (id, lbl, cells) => {
      document.getElementById(id).innerHTML =
        `<span class="factor-lbl">${lbl}</span>` +
        cells.map(([n, st]) => `<div class="f-cell ${st}"><strong>${n}</strong><small>${st[0].toUpperCase() + st.slice(1)}</small></div>`).join("");
    };
    renderRow("row-appearance", "A · Look", d.A);
    renderRow("row-structure", "S · Struct", d.S);
    document.getElementById("duel-kicker").textContent = d.kicker;
    document.getElementById("duel-kicker").style.color = d.color;
    document.getElementById("duel-up").textContent = d.up;
    document.getElementById("duel-syn").textContent = d.syn;
    document.getElementById("duel-fail").textContent = d.fail;
  }

  /* ---- 1:1 Native Interactive Figure 2 Metro Evolution Map ---- */
  function wireExactMetro(svgText) {
    const host = document.getElementById("metro-svg-host");
    host.innerHTML = svgText;
    const svg = host.querySelector("svg");
    if (!svg) return;

    // Lineage filter pills highlight exact subway tracks & stations
    document.querySelectorAll("#metro-line-pills .line-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("#metro-line-pills .line-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        const target = pill.dataset.mline;
        svg.querySelectorAll(".metro-track-grp").forEach((el) => {
          el.classList.toggle("dimmed", target !== "all" && el.dataset.mline !== target);
        });
      });
    });

    // Panel (b) pathway legend interactively highlights matching terminal chips + monthly bars!
    svg.querySelectorAll(".metro-pw-legend").forEach((leg) => {
      leg.addEventListener("click", () => {
        const pw = leg.dataset.pw;
        activePathway = activePathway === pw ? null : pw;
        svg.querySelectorAll(".metro-pw-legend").forEach((l) => l.classList.toggle("active", l.dataset.pw === activePathway));
        svg.querySelectorAll(".metro-bar-blk").forEach((b) => b.classList.toggle("dimmed", Boolean(activePathway && b.dataset.pw !== activePathway)));
        svg.querySelectorAll(".metro-tchip").forEach((c) => c.classList.toggle("dimmed", Boolean(activePathway && c.dataset.pw !== activePathway)));
      });
    });

    // Zoom toggle
    const scroller = document.getElementById("metro-svg-scroll");
    const zoomBtn = document.getElementById("metro-zoom-btn");
    zoomBtn.addEventListener("click", () => {
      const z = scroller.classList.toggle("zoomed");
      zoomBtn.textContent = z ? "🔍 Fit 100%" : "🔍 Zoom 145%";
    });
  }

  /* ---- Orthogonality Quadrants ---- */
  function renderQuadrants() {
    const t3aSlow = [], t3aFast = [], t3bSlow = [], t3bFast = [];
    for (const s of CATALOG.systems) {
      if (s.tier === "T3a") {
        const note = (s.realtime_note || "").toLowerCase();
        if (s.realtime || note.includes("var.") || s.name === "CoCode-World") t3aFast.push(s);
        else t3aSlow.push(s);
      } else if (s.tier === "T3b") {
        if (s.realtime) t3bFast.push(s);
        else t3bSlow.push(s);
      }
    }
    const chips = (list, isVar = false) =>
      list
        .map((s) => {
          let tag = "";
          if (s.realtime && s.realtime_note && s.realtime_note !== "Yes") tag = s.realtime_note.replace(/^Yes\s*\((.*)\)$/, "$1");
          else if (s.name === "CoCode-World") tag = "8-step";
          else if (s.realtime_note && !["No", "Yes", "NR"].includes(s.realtime_note)) tag = s.realtime_note;
          const href = s.url ? `href="${esc(s.url)}" target="_blank" rel="noopener"` : `href="#matrix"`;
          return `<a class="sys-chip ${isVar ? "var" : ""}" ${href}>${esc(s.name)}${tag ? ` <span class="fps">${esc(tag)}</span>` : ""}</a>`;
        })
        .join("");

    document.getElementById("q-t3a-slow-cnt").textContent = `${t3aSlow.length} systems`;
    document.getElementById("q-t3a-fast-cnt").textContent = `${t3aFast.length} systems`;
    document.getElementById("q-t3b-slow-cnt").textContent = `${t3bSlow.length} systems`;
    document.getElementById("q-t3b-fast-cnt").textContent = `${t3bFast.length} systems`;
    document.getElementById("q-t3a-slow").innerHTML = chips(t3aSlow);
    document.getElementById("q-t3a-fast").innerHTML = chips(t3aFast, true);
    document.getElementById("q-t3b-slow").innerHTML = chips(t3bSlow);
    document.getElementById("q-t3b-fast").innerHTML = chips(t3bFast);
  }

  /* ---- System Matrix ---- */
  function formatRtBadge(s) {
    const note = s.realtime_note || (s.realtime ? "Yes" : "No");
    if (s.realtime) {
      const clean = note === "Yes" ? "Real-Time" : note.replace(/^Yes\s*\((.*)\)$/, "$1");
      return `<span class="rt-badge fast">⚡ ${esc(clean)}</span>`;
    }
    if (/var\./i.test(note)) return `<span class="rt-badge var">${esc(note)}</span>`;
    if (note === "No") return `<span class="rt-badge slow">${s.tier === "T3a" ? "Pre-fixed clip" : "Sub-RT"}</span>`;
    return `<span class="rt-badge slow">${esc(note)}</span>`;
  }

  function renderMatrix() {
    const tbody = document.getElementById("matrix-tbody");
    const q = matrixQuery.trim().toLowerCase();
    const rows = CATALOG.systems.filter((s) => {
      if (activeMatrixTier === "rt" && !s.realtime) return false;
      if (activeMatrixTier !== "all" && activeMatrixTier !== "rt" && s.tier !== activeMatrixTier) return false;
      if (!q) return true;
      return `${s.name} ${s.tier} ${s.upstream} ${s.inputs} ${s.state_owner} ${s.injection} ${s.training_data} ${s.realtime_note}`.toLowerCase().includes(q);
    });
    tbody.innerHTML = rows.length
      ? rows
          .map((s) => {
            const nameHtml = s.url ? `<a class="sys-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>` : `<span class="sys-link">${esc(s.name)}</span>`;
            return `<tr>
              <td>${nameHtml}<span class="t-badge ${esc(s.tier)}">${esc(s.tier)}</span></td>
              <td>${esc(s.upstream)}</td><td>${esc(s.inputs)}</td><td>${esc(s.state_owner)}</td>
              <td>${esc(s.injection)}</td><td>${esc(s.training_data)}</td><td>${formatRtBadge(s)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">No matching systems.</td></tr>`;
  }

  /* ---- Library ---- */
  function renderTrackFilters() {
    const box = document.getElementById("track-filters");
    const counts = { all: CATALOG.papers.length };
    for (const p of CATALOG.papers) counts[p.track] = (counts[p.track] || 0) + 1;
    box.innerHTML = TRACK_ORDER.map(([id, lbl]) => {
      return `<button type="button" class="track-btn ${activeTrack === id ? "active" : ""}" data-track="${esc(id)}"><b>${esc(lbl)}</b><span>${counts[id] || 0}</span></button>`;
    }).join("");
    box.querySelectorAll(".track-btn").forEach((b) => {
      b.addEventListener("click", () => {
        activeTrack = b.dataset.track; visibleCount = 30; renderTrackFilters(); renderLibrary();
      });
    });
  }

  function populateYears() {
    const sel = document.getElementById("year-filter");
    const years = [...new Set(CATALOG.papers.map((p) => p.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    sel.innerHTML = `<option value="all">All years</option>` + years.map((y) => `<option value="${esc(y)}">${esc(y)}</option>`).join("");
  }

  function renderLibrary() {
    const q = libQuery.trim().toLowerCase();
    let list = CATALOG.papers.filter((p) => {
      if (activeTrack !== "all" && p.track !== activeTrack) return false;
      if (activeYear !== "all" && p.year !== activeYear) return false;
      if (rtOnly && !p.realtime) return false;
      if (!q) return true;
      return `${p.name} ${p.title} ${p.authors} ${p.year} ${p.eprint} ${p.track} ${p.summary} ${p.venue}`.toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => {
      if (libSort === "newest") return (b.year || "0").localeCompare(a.year || "0") || a.title.localeCompare(b.title);
      if (libSort === "oldest") return (a.year || "9").localeCompare(b.year || "9") || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });
    document.getElementById("results-count").textContent = `Showing ${Math.min(visibleCount, list.length)} of ${list.length} cited works`;
    const slice = list.slice(0, visibleCount);
    const el = document.getElementById("paper-list");
    el.innerHTML = slice.length
      ? slice
          .map((p, idx) => {
            const titleHtml = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
            const rtChip = p.realtime ? `<span class="rt-badge fast">⚡ ${esc((p.realtime_note || "Real-Time").replace(/^Yes\s*\((.*)\)$/, "$1"))}</span>` : "";
            const linkHtml = p.eprint
              ? `<a class="p-lnk" href="https://arxiv.org/abs/${esc(p.eprint)}" target="_blank" rel="noopener">arXiv:${esc(p.eprint)} ↗</a>`
              : p.url
              ? `<a class="p-lnk" href="${esc(p.url)}" target="_blank" rel="noopener">Paper / Link ↗</a>`
              : "";
            return `<article class="paper-item">
              <div class="paper-top">
                <span class="t-badge ${esc(p.track)}">${esc(p.track)}</span>
                ${p.name ? `<b style="color:var(--ink);">${esc(p.name)}</b>` : ""}
                ${p.year ? `<span>${esc(p.year)}</span>` : ""}
                ${rtChip}
              </div>
              <h3>${titleHtml}</h3>
              ${p.authors ? `<p class="p-auth">${esc(p.authors)}</p>` : ""}
              ${p.summary ? `<p class="p-sum">${esc(p.summary)}</p>` : ""}
              <div class="p-foot"><div>${linkHtml}</div>${p.bibtex ? `<button type="button" class="copy-btn" data-idx="${idx}">Copy BibTeX</button>` : ""}</div>
            </article>`;
          })
          .join("")
      : `<p style="padding:24px 0;color:var(--muted);">No works match the current filters.</p>`;

    el.querySelectorAll(".copy-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const item = slice[Number(b.dataset.idx)];
        if (item && item.bibtex) copyText(item.bibtex, b);
      });
    });

    const lm = document.getElementById("load-more");
    if (list.length > visibleCount) {
      lm.style.display = "inline-flex";
      lm.textContent = `Show more (${list.length - visibleCount} remaining)`;
    } else {
      lm.style.display = "none";
    }
  }

  async function init() {
    // Interactive Classical Courtyard Clay <-> Cinema Wipe Controller
    const vp = document.getElementById("stage-viewport");
    const range = document.getElementById("stage-range");
    const sweepBtn = document.getElementById("stage-sweep-btn");
    let splitVal = 48;
    let sweepDir = 1;
    let autoSweep = true;
    let dragging = false;

    const setSplit = (pct) => {
      splitVal = Math.max(6, Math.min(94, pct));
      vp.style.setProperty("--split", `${splitVal.toFixed(1)}%`);
      range.value = Math.round(splitVal);
    };

    const tickSweep = () => {
      if (autoSweep && !dragging) {
        splitVal += sweepDir * 0.22;
        if (splitVal >= 82) sweepDir = -1;
        if (splitVal <= 18) sweepDir = 1;
        setSplit(splitVal);
      }
      requestAnimationFrame(tickSweep);
    };
    requestAnimationFrame(tickSweep);

    const stopAuto = () => {
      autoSweep = false;
      sweepBtn.textContent = "▶ Auto-Wipe";
    };

    range.addEventListener("input", (e) => {
      stopAuto();
      setSplit(Number(e.target.value));
    });

    const updatePointer = (clientX) => {
      const rect = vp.getBoundingClientRect();
      setSplit(((clientX - rect.left) / rect.width) * 100);
    };
    vp.addEventListener("pointerdown", (e) => {
      dragging = true;
      stopAuto();
      vp.setPointerCapture(e.pointerId);
      updatePointer(e.clientX);
    });
    vp.addEventListener("pointermove", (e) => {
      if (dragging) updatePointer(e.clientX);
    });
    vp.addEventListener("pointerup", () => (dragging = false));

    sweepBtn.addEventListener("click", () => {
      autoSweep = !autoSweep;
      sweepBtn.textContent = autoSweep ? "⏸ Auto-Wipe" : "▶ Auto-Wipe";
    });

    document.querySelectorAll(".stage-btn[data-moment]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".stage-btn[data-moment]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        vp.dataset.moment = btn.dataset.moment;
      });
    });

    setActiveTier("T3a");
    document.querySelectorAll("#ladder-paths .path").forEach((c) => {
      c.addEventListener("click", () => setActiveTier(c.dataset.tier));
    });

    const [catRes, svgRes] = await Promise.all([fetch("data/catalog.json"), fetch("assets/metro_exact.svg")]);
    CATALOG = await catRes.json();
    const metroSvgText = await svgRes.text();

    const c = CATALOG.meta.counts;
    document.getElementById("stat-cited").textContent = c.cited_works;
    document.getElementById("stat-systems").textContent = c.systems_total;
    document.getElementById("stat-t3").textContent = c.tier3_total;
    document.getElementById("stat-bench").textContent = c.benchmarks;

    wireExactMetro(metroSvgText);
    renderQuadrants();
    populateYears();
    renderTrackFilters();
    renderMatrix();
    renderLibrary();

    document.querySelectorAll("#matrix-pills .pill").forEach((p) => {
      p.addEventListener("click", () => {
        document.querySelectorAll("#matrix-pills .pill").forEach((x) => x.classList.remove("active"));
        p.classList.add("active"); activeMatrixTier = p.dataset.mt; renderMatrix();
      });
    });
    document.getElementById("matrix-search").addEventListener("input", (e) => { matrixQuery = e.target.value; renderMatrix(); });
    document.getElementById("year-filter").addEventListener("change", (e) => { activeYear = e.target.value; visibleCount = 30; renderLibrary(); });
    document.getElementById("rt-only").addEventListener("change", (e) => { rtOnly = e.target.checked; visibleCount = 30; renderLibrary(); });
    document.getElementById("lib-search").addEventListener("input", (e) => { libQuery = e.target.value; visibleCount = 30; renderLibrary(); });
    document.getElementById("lib-sort").addEventListener("change", (e) => { libSort = e.target.value; renderLibrary(); });
    document.getElementById("reset-filters").addEventListener("click", () => {
      activeTrack = "all"; activeYear = "all"; rtOnly = false; libQuery = ""; visibleCount = 30;
      document.getElementById("year-filter").value = "all";
      document.getElementById("rt-only").checked = false;
      document.getElementById("lib-search").value = "";
      renderTrackFilters(); renderLibrary();
    });
    document.getElementById("load-more").addEventListener("click", () => { visibleCount += 40; renderLibrary(); });
    document.getElementById("copy-survey-bib").addEventListener("click", (e) => copyText(document.getElementById("survey-bibtex").textContent, e.currentTarget));
  }

  init().catch((err) => {
    console.error(err);
    document.getElementById("results-count").textContent = "Failed to load catalog data.";
  });
})();
