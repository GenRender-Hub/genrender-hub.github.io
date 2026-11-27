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

  /* ---- Chapter 3 Ramp Story & Animated Decision Loops ---- */
  const RAMP_SCENARIOS = {
    base: {
      dot: "#c0392b",
      eventPct: 40,
      caption: "<b>Baseline Ramp Shot:</b> Red ball rolls down and knocks the blue ball through the exit archway (~2.0 s).",
    },
    director: {
      dot: "#ad803b",
      eventPct: 54,
      caption: "<b>Creative Production · Director Decides:</b> Red ball delays +0.6 s on a locked camera—edit one thing without reshooting.",
    },
    engine: {
      dot: "#785c84",
      eventPct: 16,
      caption: "<b>Interactive Worlds · Engine Decides:</b> Player removes the blue ball at 0.7 s—authoritative state overrides visual memory.",
    },
    robot: {
      dot: "#1e5246",
      eventPct: 31,
      caption: "<b>Physical &amp; Embodied · Simulator &amp; Scene Decide:</b> Robot gripper picks up the blue ball before the red ball glides underneath.",
    },
  };

  const WD_DOMAINS = {
    director: {
      color: "#ad803b",
      kicker: "CREATIVE PRODUCTION · THE DIRECTOR DECIDES",
      title: "Targeted Revision: Delay Impact +0.6 s on a Locked Camera",
      loopStatus: "Loop closes via director review · T1 / T2 / T3a",
      baseCompareLabel: "Baseline Render (t ≈ 2.0 s hit)",
      editCompareLabel: "Director Revision (+0.6 s delayed hit)",
      svg: () => `
        <svg viewBox="0 0 680 184" fill="none" role="img" aria-label="Creative production closed decision loop">
          <defs>
            <marker id="wd-arr-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#ad803b"/>
            </marker>
            <marker id="wd-arr-ag" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
              <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#2d7868"/>
            </marker>
          </defs>
          <!-- Column labels -->
          <g font-family="Inter,sans-serif" font-size="9.5" font-weight="700" fill="#5e6d68" letter-spacing="0.8">
            <text x="86" y="16" text-anchor="middle">FINAL SAY</text>
            <text x="256" y="16" text-anchor="middle">SPECIFICATION</text>
            <text x="434" y="16" text-anchor="middle">RENDERS</text>
            <text x="594" y="16" text-anchor="middle">RESULT</text>
          </g>
          <!-- Outside agent drafting into specification -->
          <rect x="200" y="25" width="112" height="26" rx="13" fill="#e8f4ef" stroke="#2d7868" stroke-width="1.3"/>
          <text x="256" y="42" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" font-weight="600" fill="#1e5246">Agents draft</text>
          <path d="M256 51 V68" stroke="#2d7868" stroke-width="1.5" class="wd-dash-flow" marker-end="url(#wd-arr-ag)"/>

          <!-- Main loop paths -->
          <path id="loop-dir-main" d="M148 102 H188 M324 102 H372 M496 102 H538" stroke="#ad803b" stroke-width="2" marker-end="url(#wd-arr-d)"/>
          <path d="M148 102 H186" stroke="#ad803b" stroke-width="2" marker-end="url(#wd-arr-d)"/>
          <path d="M324 102 H370" stroke="#ad803b" stroke-width="2" marker-end="url(#wd-arr-d)"/>
          <path d="M496 102 H536" stroke="#ad803b" stroke-width="2" marker-end="url(#wd-arr-d)"/>
          <!-- Closing feedback return wire -->
          <path id="loop-dir-ret" d="M594 128 V158 Q594 166 586 166 H94 Q86 166 86 158 V130" stroke="#ad803b" stroke-width="1.9" class="wd-dash-flow" fill="none" marker-end="url(#wd-arr-d)"/>
          <rect x="250" y="154" width="180" height="22" rx="11" fill="#fdf8ee" stroke="#e4cfa5" stroke-width="1"/>
          <text x="340" y="169" text-anchor="middle" font-family="Inter,sans-serif" font-size="10.5" font-weight="600" fill="#8b6220">review, change one thing</text>

          <!-- Final Say: Director (double border + pulse halo) -->
          <rect class="wd-final-pulse" x="20" y="74" width="132" height="56" rx="12" fill="none" stroke="#ad803b" stroke-width="3.5"/>
          <rect x="24" y="78" width="124" height="48" rx="9" fill="#fffdf8" stroke="#ad803b" stroke-width="2.2"/>
          <rect x="28" y="82" width="116" height="40" rx="6" fill="none" stroke="#ad803b" stroke-width="0.9" stroke-opacity="0.55"/>
          <text x="86" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12.5" font-weight="700" fill="#182723">Director</text>
          <text x="86" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.5" fill="#8b6220">hit 0.5 s later</text>

          <!-- Specification stack (T1/T2/T3a) -->
          <rect x="190" y="69" width="132" height="66" rx="9" fill="#ffffff" stroke="#cfd8d3" stroke-width="1.2"/>
          <rect x="197" y="75" width="118" height="16" rx="4" fill="#fbf3e2" stroke="#d4a653" stroke-width="0.9"/>
          <text x="256" y="86.5" text-anchor="middle" font-family="Inter,sans-serif" font-size="9.5" font-weight="700" fill="#8a6121">T1 references</text>
          <rect x="197" y="94" width="118" height="16" rx="4" fill="#faeae7" stroke="#c86b5e" stroke-width="0.9"/>
          <text x="256" y="105.5" text-anchor="middle" font-family="Inter,sans-serif" font-size="9.5" font-weight="700" fill="#943f34">T2 storyboard</text>
          <rect x="197" y="113" width="118" height="16" rx="4" fill="#f3ecf7" stroke="#8b6a98" stroke-width="1.2"/>
          <text x="256" y="124.5" text-anchor="middle" font-family="Inter,sans-serif" font-size="9.5" font-weight="700" fill="#634570">T3a white-box clay</text>

          <!-- Video model node -->
          <rect x="374" y="78" width="122" height="48" rx="9" fill="#1c2f2a" stroke="#1c2f2a" stroke-width="1.5"/>
          <text x="435" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="700" fill="#ffffff">Video Model</text>
          <text x="435" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#9cd0be">renders pixels</text>

          <!-- Result: Draft shot -->
          <rect x="540" y="78" width="110" height="48" rx="9" fill="#ffffff" stroke="#b9c6c0" stroke-width="1.4"/>
          <text x="595" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="700" fill="#182723">Draft Shot</text>
          <text x="595" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#5b6d68">locked layout</text>

          <!-- Glowing animated pulse traveling around closed loop -->
          <circle r="4.5" fill="#ad803b" stroke="#ffffff" stroke-width="1.5">
            <animateMotion dur="4.2s" repeatCount="indefinite" path="M148 102 H594 V158 Q594 166 586 166 H94 Q86 166 86 158 V102 Z"/>
          </circle>
        </svg>`,
    },
    engine: {
      color: "#785c84",
      kicker: "INTERACTIVE WORLDS · THE ENGINE DECIDES",
      title: "Live State Intervention: Player Removes Blue Ball (Zero Memory Revival)",
      loopStatus: "Loop closes in real-time play · T3b Streamed",
      baseCompareLabel: "Baseline Render (blue ball hit)",
      editCompareLabel: "Engine State Edit (blue ball removed)",
      svg: () => `
        <svg viewBox="0 0 680 184" fill="none" role="img" aria-label="Interactive worlds closed decision loop">
          <defs>
            <marker id="wd-arr-e" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#785c84"/>
            </marker>
            <marker id="wd-arr-ag2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
              <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#2d7868"/>
            </marker>
          </defs>
          <g font-family="Inter,sans-serif" font-size="9.5" font-weight="700" fill="#5e6d68" letter-spacing="0.8">
            <text x="86" y="16" text-anchor="middle">FINAL SAY</text>
            <text x="256" y="16" text-anchor="middle">SPECIFICATION</text>
            <text x="434" y="16" text-anchor="middle">RENDERS</text>
            <text x="594" y="16" text-anchor="middle">RESULT</text>
          </g>
          <!-- Outside coding agent writing rules into engine -->
          <rect x="26" y="25" width="120" height="26" rx="13" fill="#e8f4ef" stroke="#2d7868" stroke-width="1.3"/>
          <text x="86" y="42" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" font-weight="600" fill="#1e5246">Coding agent</text>
          <path d="M86 51 V75" stroke="#2d7868" stroke-width="1.5" class="wd-dash-flow" marker-end="url(#wd-arr-ag2)"/>
          <text x="95" y="66" font-family="JetBrains Mono,monospace" font-size="9.5" fill="#1e5246">rules</text>

          <!-- Main horizontal arrows -->
          <path d="M148 102 H186" stroke="#785c84" stroke-width="2" marker-end="url(#wd-arr-e)"/>
          <path d="M324 102 H370" stroke="#785c84" stroke-width="2" marker-end="url(#wd-arr-e)"/>
          <path d="M496 102 H536" stroke="#785c84" stroke-width="2" marker-end="url(#wd-arr-e)"/>
          <!-- Closing feedback return wire -->
          <path d="M594 128 V158 Q594 166 586 166 H94 Q86 166 86 158 V130" stroke="#785c84" stroke-width="1.9" class="wd-dash-flow" fill="none" marker-end="url(#wd-arr-e)"/>
          <rect x="246" y="154" width="188" height="22" rx="11" fill="#f6f1fa" stroke="#d5c2df" stroke-width="1"/>
          <text x="340" y="169" text-anchor="middle" font-family="Inter,sans-serif" font-size="10.5" font-weight="600" fill="#634570">live player action: remove ball</text>

          <!-- Final Say: Engine state and rules -->
          <rect class="wd-final-pulse" x="20" y="74" width="132" height="56" rx="12" fill="none" stroke="#785c84" stroke-width="3.5"/>
          <rect x="24" y="78" width="124" height="48" rx="9" fill="#fcfafe" stroke="#785c84" stroke-width="2.2"/>
          <rect x="28" y="82" width="116" height="40" rx="6" fill="none" stroke="#785c84" stroke-width="0.9" stroke-opacity="0.55"/>
          <text x="86" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12.5" font-weight="700" fill="#182723">Engine</text>
          <text x="86" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.5" fill="#634570">state &amp; rules</text>

          <!-- Specification: T3b White-box frames -->
          <rect x="190" y="78" width="132" height="48" rx="9" fill="#f3ecf7" stroke="#785c84" stroke-width="1.5"/>
          <text x="256" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="11.5" font-weight="700" fill="#5e416b">White-Box Frames</text>
          <text x="256" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#785c84">T3b chunk stream</text>

          <!-- Video model -->
          <rect x="374" y="78" width="122" height="48" rx="9" fill="#1c2f2a" stroke="#1c2f2a" stroke-width="1.5"/>
          <text x="435" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="700" fill="#ffffff">Video Model</text>
          <text x="435" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#9cd0be">causal memory</text>

          <!-- Player -->
          <rect x="540" y="78" width="110" height="48" rx="9" fill="#ffffff" stroke="#b9c6c0" stroke-width="1.4"/>
          <text x="595" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="700" fill="#182723">Player</text>
          <text x="595" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#5b6d68">interactive play</text>

          <!-- Glowing animated pulse -->
          <circle r="4.5" fill="#785c84" stroke="#ffffff" stroke-width="1.5">
            <animateMotion dur="3.4s" repeatCount="indefinite" path="M148 102 H594 V158 Q594 166 586 166 H94 Q86 166 86 158 V102 Z"/>
          </circle>
        </svg>`,
    },
    robot: {
      color: "#1e5246",
      kicker: "PHYSICAL & EMBODIED · SIMULATOR & SCENE DECIDE",
      title: "Embodied Grounding: Robot Picks Up Blue Ball While Red Ball Passes",
      loopStatus: "Sim renders T3a training data · Real table closes loop",
      baseCompareLabel: "Baseline Render (blue ball blocks)",
      editCompareLabel: "Embodied Control (robot lifts ball)",
      svg: () => `
        <svg viewBox="0 0 680 184" fill="none" role="img" aria-label="Physical and embodied simulation decision loop">
          <defs>
            <marker id="wd-arr-r" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#1e5246"/>
            </marker>
            <marker id="wd-arr-sim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
              <path d="M1 1.5 L8.5 5 L1 8.5 Z" fill="#785c84"/>
            </marker>
          </defs>
          <g font-family="Inter,sans-serif" font-size="9.5" font-weight="700" fill="#5e6d68" letter-spacing="0.8">
            <text x="86" y="16" text-anchor="middle">FINAL SAY</text>
            <text x="256" y="16" text-anchor="middle">OBSERVATION / SIM</text>
            <text x="434" y="16" text-anchor="middle">ACTS / RENDERS</text>
            <text x="594" y="16" text-anchor="middle">RESULT</text>
          </g>

          <!-- Top training / prediction branch: Simulator -> Video Model -> Planner -->
          <rect x="196" y="24" width="120" height="32" rx="8" fill="#f7f2fa" stroke="#785c84" stroke-width="1.8"/>
          <rect x="200" y="28" width="112" height="24" rx="5" fill="none" stroke="#785c84" stroke-width="0.8" stroke-opacity="0.5"/>
          <text x="256" y="44" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" font-weight="700" fill="#5e416b">Simulator (T3a)</text>

          <path d="M316 40 H370" stroke="#785c84" stroke-width="1.5" class="wd-dash-flow" marker-end="url(#wd-arr-sim)"/>
          <rect x="374" y="24" width="122" height="32" rx="8" fill="#1c2f2a" stroke="#1c2f2a" stroke-width="1.3"/>
          <text x="435" y="44" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" font-weight="700" fill="#ffffff">Video Model</text>

          <path d="M435 56 V75" stroke="#785c84" stroke-width="1.5" class="wd-dash-flow" marker-end="url(#wd-arr-sim)"/>
          <text x="444" y="69" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#634570">sim2real data / rollouts</text>

          <!-- Main physical control loop -->
          <path d="M148 102 H186" stroke="#1e5246" stroke-width="2" marker-end="url(#wd-arr-r)"/>
          <path d="M324 102 H370" stroke="#1e5246" stroke-width="2" marker-end="url(#wd-arr-r)"/>
          <path d="M496 102 H536" stroke="#1e5246" stroke-width="2" marker-end="url(#wd-arr-r)"/>
          <path d="M594 128 V158 Q594 166 586 166 H94 Q86 166 86 158 V130" stroke="#1e5246" stroke-width="1.9" class="wd-dash-flow" fill="none" marker-end="url(#wd-arr-r)"/>
          <rect x="242" y="154" width="196" height="22" rx="11" fill="#ebf6f1" stroke="#bdd9ce" stroke-width="1"/>
          <text x="340" y="169" text-anchor="middle" font-family="Inter,sans-serif" font-size="10.5" font-weight="600" fill="#1e5246">physical grasp confirms contact</text>

          <!-- Final Say: Physical scene (the real table) -->
          <rect class="wd-final-pulse" x="20" y="74" width="132" height="56" rx="12" fill="none" stroke="#1e5246" stroke-width="3.5"/>
          <rect x="24" y="78" width="124" height="48" rx="9" fill="#f7fcfa" stroke="#1e5246" stroke-width="2.2"/>
          <rect x="28" y="82" width="116" height="40" rx="6" fill="none" stroke="#1e5246" stroke-width="0.9" stroke-opacity="0.55"/>
          <text x="86" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="700" fill="#182723">Physical Scene</text>
          <text x="86" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.5" fill="#1e5246">the real table</text>

          <!-- Camera observation -->
          <rect x="190" y="78" width="132" height="48" rx="9" fill="#ffffff" stroke="#b9c6c0" stroke-width="1.4"/>
          <text x="256" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="11.5" font-weight="700" fill="#182723">Camera Obs.</text>
          <text x="256" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#5b6d68">realigns state</text>

          <!-- Planner -->
          <rect x="374" y="78" width="122" height="48" rx="20" fill="#e8f4ef" stroke="#1e5246" stroke-width="1.6"/>
          <text x="435" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="700" fill="#1e5246">Planner / Policy</text>
          <text x="435" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#2d6e5e">robot control</text>

          <!-- Robot arm -->
          <rect x="540" y="78" width="110" height="48" rx="9" fill="#ffffff" stroke="#b9c6c0" stroke-width="1.4"/>
          <text x="595" y="100" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="700" fill="#182723">Robot Arm</text>
          <text x="595" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9.2" fill="#5b6d68">lifts blue ball</text>

          <!-- Glowing pulse on real-world loop + secondary sim-to-real pulse -->
          <circle r="4.5" fill="#1e5246" stroke="#ffffff" stroke-width="1.5">
            <animateMotion dur="3.8s" repeatCount="indefinite" path="M148 102 H594 V158 Q594 166 586 166 H94 Q86 166 86 158 V102 Z"/>
          </circle>
          <circle r="3.5" fill="#785c84" stroke="#ffffff" stroke-width="1.2">
            <animateMotion dur="2.6s" repeatCount="indefinite" path="M316 40 H435 V78"/>
          </circle>
        </svg>`,
    },
  };

  function syncVideoPair(master, slave) {
    if (!master || !slave) return;
    if (master.readyState >= 2 && slave.readyState >= 2) {
      if (Math.abs(master.currentTime - slave.currentTime) > 0.06) {
        slave.currentTime = master.currentTime;
      }
      if (!master.paused && slave.paused) slave.play().catch(() => {});
      if (master.paused && !slave.paused) slave.pause();
    }
  }

  function loadSyncedVideos(vA, vB, srcA, srcB, posterB) {
    vA.pause();
    vB.pause();
    vA.src = srcA;
    vB.src = srcB;
    if (posterB) vB.poster = posterB;
    vA.currentTime = 0;
    vB.currentTime = 0;
    let readyA = false, readyB = false;
    const go = () => {
      if (readyA && readyB) {
        vA.currentTime = 0;
        vB.currentTime = 0;
        vA.play().catch(() => {});
        vB.play().catch(() => {});
      }
    };
    vA.addEventListener("canplay", () => { readyA = true; go(); }, { once: true });
    vB.addEventListener("canplay", () => { readyB = true; go(); }, { once: true });
    vA.load();
    vB.load();
  }

  function telemetryFor(sc, t) {
    if (sc === "robot") {
      if (t < 1.35) return "STATE: GRIPPER_APPROACH";
      if (t < 1.72) return "STATE: GRASP_CLOSED [blue_ball]";
      if (t < 3.10) return "STATE: LIFTED · PATH_CLEAR";
      return "STATE: RED_EXITS · GRASP_HELD";
    }
    if (sc === "director") {
      if (t < 0.85) return "STATE: HOLD_RELEASE (+0.6s EDIT)";
      if (t < 2.65) return "STATE: ROLLING · LOCKED_CAM";
      return "STATE: DELAYED_IMPACT -> EXIT";
    }
    if (sc === "engine") {
      if (t < 0.72) return "STATE: BLUE_BLOCKING_EXIT";
      if (t < 1.10) return "EVENT: ENTITY_DELETE(blue_ball)";
      return "STATE: MEM_PURGED · OPEN_EXIT";
    }
    return t < 1.95 ? "STATE: RED_ACCELERATING" : "STATE: COLLISION -> BLUE_EXITS";
  }

  async function init() {
    // 1. Full-Bleed Cinematic Shader-Scan Opening Controller
    const vp = document.getElementById("opening-cinema");
    const dock = document.getElementById("cinema-dock");
    const range = document.getElementById("stage-range");
    const sweepBtn = document.getElementById("stage-sweep-btn");
    const cursorBtn = document.getElementById("stage-cursor-btn");
    const playBtn = document.getElementById("hero-play-btn");
    const vProxy = document.getElementById("hero-vid-proxy");
    const vRender = document.getElementById("hero-vid-render");
    const tlFill = document.getElementById("hero-tl-fill");
    const tlEvent = document.getElementById("hero-tl-event");
    const capDot = document.getElementById("hero-cap-dot");
    const capText = document.getElementById("hero-cap-text");
    const heroTc = document.getElementById("hero-tc");
    const heroState = document.getElementById("hero-state");

    let activeHeroSc = "robot";
    let splitVal = 50;
    let targetSplit = 50;
    let sweepPhase = 0;
    let autoSweep = true;
    let cursorFollow = false;
    let dragging = false;

    const setSplit = (pct) => {
      splitVal = Math.max(4, Math.min(96, pct));
      vp.style.setProperty("--split", `${splitVal.toFixed(2)}%`);
      if (range) range.value = Math.round(splitVal);
    };

    // 2. Chapter 3 "Who Decides?" Interactive Decision-Loop Theatre
    const wdLeft = document.getElementById("wd-vid-left");
    const wdRight = document.getElementById("wd-vid-right");
    const wdLeftPill = document.getElementById("wd-left-pill");
    const wdRightPill = document.getElementById("wd-right-pill");
    const wdKicker = document.getElementById("wd-stage-kicker");
    const wdTitle = document.getElementById("wd-stage-title");
    const wdStatus = document.getElementById("wd-loop-status");
    const wdSvgHost = document.getElementById("wd-loop-svg-host");
    let activeWd = "director";
    let activeVMode = "pair";

    const setWhoDecides = (key) => {
      const d = WD_DOMAINS[key];
      if (!d) return;
      activeWd = key;
      document.querySelectorAll("#wd-cards .wd-card").forEach((c) => c.classList.toggle("active", c.dataset.wd === key));
      wdKicker.textContent = d.kicker;
      wdKicker.style.color = d.color;
      wdTitle.textContent = d.title;
      wdStatus.textContent = d.loopStatus;
      wdSvgHost.innerHTML = d.svg();
      if (activeVMode === "pair") {
        wdLeftPill.textContent = "Upstream 3D Clay Proxy · S(t)";
        wdRightPill.textContent = "MiniMax-H3 2K Render · Y(t)";
        loadSyncedVideos(wdLeft, wdRight, `assets/ramp/proxy_${key}.mp4`, `assets/ramp/render_${key}.mp4`, `assets/ramp/poster_${key}.jpg`);
      } else {
        wdLeftPill.textContent = d.baseCompareLabel;
        wdRightPill.textContent = d.editCompareLabel;
        loadSyncedVideos(wdLeft, wdRight, `assets/ramp/render_base.mp4`, `assets/ramp/render_${key}.mp4`, `assets/ramp/poster_${key}.jpg`);
      }
    };

    document.querySelectorAll("#wd-cards .wd-card").forEach((card) => {
      card.addEventListener("click", () => setWhoDecides(card.dataset.wd));
    });
    document.querySelectorAll("#wd-mode-toggle .wd-mbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#wd-mode-toggle .wd-mbtn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeVMode = btn.dataset.vmode;
        setWhoDecides(activeWd);
      });
    });
    setWhoDecides("director");

    // Combined 60fps RAF loop: smooth optical beam motion + frame-lock video sync + live CAD telemetry
    const tickFrame = () => {
      if (autoSweep && !dragging && !cursorFollow) {
        sweepPhase += 0.011;
        setSplit(50 + Math.sin(sweepPhase) * 32);
      } else if (cursorFollow && !dragging) {
        setSplit(splitVal + (targetSplit - splitVal) * 0.14);
      }
      syncVideoPair(vProxy, vRender);
      syncVideoPair(wdLeft, wdRight);
      if (vProxy && vProxy.duration > 0) {
        const t = vProxy.currentTime;
        const pct = Math.min(100, (t / vProxy.duration) * 100);
        tlFill.style.width = `${pct.toFixed(1)}%`;
        const activeBar = document.querySelector("#hero-scenario-btns .dock-sc.active .dsc-bar i");
        if (activeBar) activeBar.style.width = `${pct.toFixed(1)}%`;
        const secs = Math.floor(t);
        const frms = Math.floor((t - secs) * 24);
        if (heroTc) heroTc.textContent = `TC 00:0${secs}:${String(frms).padStart(2, "0")} · 24 FPS`;
        if (heroState) heroState.textContent = telemetryFor(activeHeroSc, t);
      }
      requestAnimationFrame(tickFrame);
    };
    requestAnimationFrame(tickFrame);

    const setBeamModes = (auto, follow) => {
      autoSweep = auto;
      cursorFollow = follow;
      sweepBtn.classList.toggle("active", autoSweep);
      cursorBtn.classList.toggle("active", cursorFollow);
    };

    const pctFromClientX = (clientX) => {
      const rect = vp.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * 100;
    };

    vp.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".cinema-dock-wrap")) return;
      dragging = true;
      setBeamModes(false, false);
      vp.setPointerCapture(e.pointerId);
      setSplit(pctFromClientX(e.clientX));
    });
    vp.addEventListener("pointermove", (e) => {
      if (dragging) {
        setSplit(pctFromClientX(e.clientX));
      } else if (cursorFollow && !e.target.closest(".cinema-dock-wrap")) {
        targetSplit = Math.max(6, Math.min(94, pctFromClientX(e.clientX)));
      }
    });
    vp.addEventListener("pointerup", () => (dragging = false));

    sweepBtn.addEventListener("click", () => {
      if (autoSweep) setBeamModes(false, false);
      else {
        sweepPhase = Math.asin(Math.max(-1, Math.min(1, (splitVal - 50) / 32)));
        setBeamModes(true, false);
      }
    });
    cursorBtn.addEventListener("click", () => {
      if (cursorFollow) setBeamModes(false, false);
      else {
        targetSplit = splitVal;
        setBeamModes(false, true);
      }
    });

    const ICO_PAUSE = '<svg class="dt-ico" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="3" y="2.5" width="3.5" height="11" rx="1"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1"/></svg>';
    const ICO_PLAY  = '<svg class="dt-ico" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5 13.5 8 4 13.5Z"/></svg>';

    playBtn.addEventListener("click", () => {
      if (vProxy.paused) {
        vProxy.play().catch(() => {});
        vRender.play().catch(() => {});
        playBtn.innerHTML = ICO_PAUSE;
      } else {
        vProxy.pause();
        vRender.pause();
        playBtn.innerHTML = ICO_PLAY;
      }
    });

    document.querySelectorAll("#hero-scenario-btns .dock-sc[data-sc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sc = btn.dataset.sc;
        const meta = RAMP_SCENARIOS[sc];
        if (!meta) return;
        activeHeroSc = sc;
        document.querySelectorAll("#hero-scenario-btns .dock-sc").forEach((b) => {
          b.classList.remove("active");
          const bar = b.querySelector(".dsc-bar i");
          if (bar) bar.style.width = "0%";
        });
        btn.classList.add("active");
        capDot.style.background = meta.dot;
        capDot.style.boxShadow = `0 0 0 3px ${meta.dot}55`;
        capText.innerHTML = meta.caption;
        tlEvent.style.left = `${meta.eventPct}%`;
        playBtn.innerHTML = ICO_PAUSE;
        loadSyncedVideos(vProxy, vRender, `assets/ramp/proxy_${sc}.mp4`, `assets/ramp/render_${sc}.mp4`, `assets/ramp/poster_${sc}.jpg`);
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
