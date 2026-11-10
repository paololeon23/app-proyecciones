/** App principal — Proyecciones (lista + modal + cartilla de muestras) */
window.QB = window.QB || {};

QB.App = (() => {
  const SAMPLE_START = () => Math.max(1, Number((QB.CONFIG && QB.CONFIG.SAMPLE_START) || 1) || 1);
  const SAMPLE_MAX = () => Math.max(1, Number((QB.CONFIG && QB.CONFIG.SAMPLE_MAX) || 40) || 40);
  const DRAFT_KEY = "qb_proy_draft";
  const LOCAL_LIST_KEY = "qb_proy_local_list";
  const PREFS_KEY = "qb_proy_prefs";

  const state = {
    screen: "home",
    create: {
      evaluadorId: "",
      evaluadorNombre: "",
      modulo: "",
      turno: "",
      loteId: "",
      loteMeta: null,
    },
    cartilla: null,
    muestraIndex: 0,
    saving: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function emptySample_() {
    const o = {};
    (QB.SAMPLE_FIELDS || []).forEach((f) => {
      o[f.id] = "";
    });
    return o;
  }

  function ensureSamples_(cartilla) {
    if (!cartilla) return [];
    if (!Array.isArray(cartilla.samples) || !cartilla.samples.length) {
      cartilla.samples = [emptySample_()];
    }
    return cartilla.samples;
  }

  function sampleCount_(cartilla) {
    return ensureSamples_(cartilla).length;
  }

  function sampleHasData_(sample) {
    return (QB.SAMPLE_FIELDS || []).some((f) => String(sample?.[f.id] ?? "").trim() !== "");
  }

  function pruneEmptySamples_(cartilla) {
    const samples = ensureSamples_(cartilla);
    while (samples.length > 1 && !sampleHasData_(samples[samples.length - 1])) {
      samples.pop();
    }
    if (state.muestraIndex >= samples.length) {
      state.muestraIndex = Math.max(0, samples.length - 1);
    }
    return samples;
  }

  function emptySampleIndexes_(cartilla) {
    return ensureSamples_(cartilla)
      .map((s, i) => (sampleHasData_(s) ? 0 : i + 1))
      .filter(Boolean);
  }

  function emptyCartilla_(partial) {
    const n = SAMPLE_START();
    const samples = [];
    for (let i = 0; i < n; i++) samples.push(emptySample_());
    return {
      clientId: null,
      fecha: todayISO_(),
      evaluadorId: "",
      evaluadorNombre: "",
      cartillaId: "proyecciones",
      cartillaLabel: "Proyecciones",
      modulo: "",
      turno: "",
      loteId: "",
      loteNum: "",
      loteCode: "",
      etapa: "",
      variedad: "",
      area: "",
      observacion: "",
      samples,
      ...(partial || {}),
    };
  }

  function todayISO_() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      const d = new Date();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${m}-${day}`;
    }
  }

  /** Semana ISO (1–53) en America/Lima */
  function isoWeek_(fechaYYYYMMDD) {
    const s = String(fechaYYYYMMDD || todayISO_());
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7));
  }

  /* ——— Feedback / toast ——— */
  const FB_ICONS = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/></svg>',
  };

  let fbTimer = null;
  let fbResolve = null;
  let fbHideTimer = 0;

  function ensureToastStack() {
    let stack = document.getElementById("qb-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "qb-toast-stack";
      stack.className = "qb-toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(msg, type = "ok") {
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = `qb-toast-item ${type === "warn" ? "warn" : type}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .2s";
      setTimeout(() => el.remove(), 220);
    }, 2800);
  }

  function closeFeedback(result) {
    const root = $("#qb-fb");
    if (!root) return;
    clearTimeout(fbTimer);
    clearTimeout(fbHideTimer);
    root.classList.remove("open");
    root.hidden = true;
    if (fbResolve) {
      const r = fbResolve;
      fbResolve = null;
      r(result);
    }
  }

  function feedback({ title, text = "", type = "ok", confirmText = "Listo", cancelText = null, autoClose = 0 }) {
    return new Promise((resolve) => {
      const root = $("#qb-fb");
      const icon = $("#qb-fb-icon");
      const titleEl = $("#qb-fb-title");
      const textEl = $("#qb-fb-text");
      const actions = $("#qb-fb-actions");
      if (!root || !icon || !titleEl || !textEl || !actions) {
        toast(title, type === "error" ? "error" : type === "warn" ? "warn" : "ok");
        resolve(true);
        return;
      }
      if (fbResolve) fbResolve(false);
      fbResolve = resolve;
      clearTimeout(fbTimer);
      clearTimeout(fbHideTimer);

      icon.className = `qb-fb-icon ${type}`;
      icon.innerHTML = FB_ICONS[type] || FB_ICONS.info;
      titleEl.textContent = title;
      textEl.textContent = text;
      textEl.hidden = !text;

      actions.innerHTML = "";
      if (cancelText) {
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "qb-fb-secondary";
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener("click", () => closeFeedback(false));
        actions.appendChild(cancelBtn);
      }
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "qb-fb-primary";
      okBtn.textContent = confirmText;
      okBtn.addEventListener("click", () => closeFeedback(true));
      actions.appendChild(okBtn);

      root.hidden = false;
      requestAnimationFrame(() => root.classList.add("open"));
      if (autoClose > 0) {
        fbTimer = setTimeout(() => closeFeedback(true), autoClose);
      }
    });
  }

  function setLoader(on, text) {
    const el = $("#qb-loader");
    const t = $("#qb-loader-text");
    if (!el) return;
    if (t && text) t.textContent = text;
    el.hidden = !on;
  }

  let resetKeyboardBar_ = () => {
    document.documentElement.style.setProperty("--kb", "0px");
  };

  /* ——— Screens ——— */
  function showScreen(id) {
    state.screen = id;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${id}`));
    document.body.dataset.qbScreen = id;
    // Salir de cartilla: bajar barra (como Calidad)
    if (id !== "cartilla") resetKeyboardBar_();
  }

  /** Saca las barras a body: si viven dentro del screen (overflow:hidden), Android las recorta/repinta */
  function mountActionBars_() {
    document
      .querySelectorAll("#screen-home > .form-actions, #screen-cartilla > .form-actions")
      .forEach((bar) => {
        document.body.appendChild(bar);
      });
    document.body.dataset.qbScreen = state.screen || "home";
  }

  /* ——— Local list (historial de cartillas guardadas) ——— */
  function readLocalList_() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_LIST_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function writeLocalList_(list) {
    try {
      localStorage.setItem(LOCAL_LIST_KEY, JSON.stringify(list.slice(0, 200)));
          } catch (_) {}
  }

  function upsertLocalList_(entry) {
    const list = readLocalList_().filter((x) => x.clientId !== entry.clientId);
    list.unshift(entry);
    writeLocalList_(list);
  }

  function saveDraft_() {
    try {
      if (!state.cartilla || state.screen !== "cartilla") return;
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ cartilla: state.cartilla, muestraIndex: state.muestraIndex, at: Date.now() })
      );
    } catch (_) {}
  }

  function clearDraft_() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (_) {}
  }

  function loadDraft_() {
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!raw || !raw.cartilla) return null;
      if (raw.at && Date.now() - raw.at > 7 * 24 * 60 * 60 * 1000) {
        clearDraft_();
        return null;
      }
      return raw;
    } catch {
      return null;
    }
  }

  /* ——— Create modal ——— */
  function setSelectLabel(btn, text, empty) {
    if (!btn) return;
    const ph = btn.dataset.placeholder || "Seleccionar";
    btn.textContent = text || ph;
    btn.classList.toggle("is-empty", !text || empty);
  }

  function readPrefs_() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  }

  function writePrefs_(patch) {
    try {
      const next = { ...readPrefs_(), ...patch };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
          } catch (_) {}
        }

  function cartillaOptions_(query) {
    const q = String(query || "").trim().toLowerCase();
    const list = (QB.CARTILLAS || []).map((c) => ({
      id: c.id,
      label: c.label,
      meta: c.meta || "Cartilla",
    }));
    if (!q) return list;
    return list.filter(
      (o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
  }

  function resetCreateForm_() {
    const prefs = readPrefs_();
    const defaultCartilla = (QB.CARTILLAS && QB.CARTILLAS[0]) || {
      id: "proyecciones",
      label: "Proyecciones",
    };
    const cartillaId = prefs.cartillaId || defaultCartilla.id;
    const cartillaLabel =
      prefs.cartillaLabel ||
      ((QB.CARTILLAS || []).find((c) => c.id === cartillaId) || defaultCartilla).label;
    state.create = {
      evaluadorId: prefs.evaluadorId || "",
      evaluadorNombre: prefs.evaluadorNombre || "",
      cartillaId,
      cartillaLabel,
      modulo: prefs.modulo || "",
      turno: prefs.turno || "",
      loteId: "",
      loteMeta: null,
    };
    setSelectLabel(
      $("#sel-evaluador"),
      prefs.evaluadorNombre
        ? QB.Data.shortName(prefs.evaluadorNombre) || prefs.evaluadorNombre
        : ""
    );
    setSelectLabel($("#sel-cartilla"), cartillaLabel || "");
    setSelectLabel($("#sel-modulo"), prefs.modulo || "");
    setSelectLabel($("#sel-turno"), prefs.turno ? `Turno ${prefs.turno}` : "");
    setSelectLabel($("#sel-lote"), "");
  }

  async function openCreateModal() {
    const draft = loadDraft_();
    if (draft && draft.cartilla) {
      const cont = await feedback({
        title: "Hay un borrador en curso",
        text: "Solo puede haber una cartilla a la vez. Continúa para terminarla, o abandona la muestra para armar otra en otro lote.",
        type: "warn",
        confirmText: "Continuar",
        cancelText: "Abandonar muestra",
      });
      if (cont) {
        openCartilla(draft.cartilla, draft.muestraIndex || 0);
        return;
      }
      clearDraft_();
      if (state.cartilla) state.cartilla = null;
      renderHomeList();
    }
    resetCreateForm_();
    const modal = $("#create-modal");
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("open"));
  }

  function closeCreateModal() {
    const modal = $("#create-modal");
    if (!modal) return;
    modal.classList.remove("open");
    setTimeout(() => {
      modal.hidden = true;
    }, 180);
  }

  function openEvaluadorSelect() {
    QB.PreciseSelect.open({
      title: "Evaluador",
      placeholder: "Buscar nombre o DNI…",
      value: state.create.evaluadorId,
      listColumns: true,
      getOptions: (q) => QB.Data.evaluadorOptions(q),
      onSelect: (opt) => {
        state.create.evaluadorId = opt.dni || String(opt.id).replace(/\D.*/, "") || opt.id;
        state.create.evaluadorNombre = opt.nombre || opt.label || "";
        setSelectLabel($("#sel-evaluador"), opt.nombreCorto || opt.label || state.create.evaluadorNombre);
      },
    });
  }

  function openCartillaSelect() {
    QB.PreciseSelect.open({
      title: "Cartilla",
      placeholder: "Buscar cartilla…",
      value: state.create.cartillaId,
      getOptions: (q) => cartillaOptions_(q),
      onSelect: (opt) => {
        state.create.cartillaId = opt.id;
        state.create.cartillaLabel = opt.label;
        setSelectLabel($("#sel-cartilla"), opt.label);
      },
    });
  }

  function openModuloSelect() {
    QB.PreciseSelect.open({
      title: "Módulo",
      placeholder: "Buscar módulo…",
      value: state.create.modulo,
      getOptions: (q) => QB.Data.moduloOptions(q),
      onSelect: (opt) => {
        state.create.modulo = opt.id;
        state.create.turno = "";
        state.create.loteId = "";
        state.create.loteMeta = null;
        setSelectLabel($("#sel-modulo"), opt.label);
        setSelectLabel($("#sel-turno"), "");
        setSelectLabel($("#sel-lote"), "");
      },
    });
  }

  function openTurnoSelect() {
    if (!state.create.modulo) {
      toast("Elige módulo primero", "warn");
      return;
    }
    QB.PreciseSelect.open({
      title: "Turno",
      placeholder: "Buscar turno…",
      value: state.create.turno,
      getOptions: (q) => QB.Data.turnoOptions(state.create.modulo, q),
      onSelect: (opt) => {
        state.create.turno = opt.id;
        state.create.loteId = "";
        state.create.loteMeta = null;
        setSelectLabel($("#sel-turno"), opt.label);
        setSelectLabel($("#sel-lote"), "");
      },
    });
  }

  function openLoteSelect() {
    if (!state.create.modulo || !state.create.turno) {
      toast("Elige módulo y turno primero", "warn");
      return;
    }
    QB.PreciseSelect.open({
      title: "Lote",
      placeholder: "Buscar lote…",
      value: state.create.loteId,
      getOptions: (q) =>
        QB.Data.lotesForModuloTurno(state.create.modulo, state.create.turno, q),
      onSelect: (opt) => {
        state.create.loteId = opt.id;
        const meta = QB.Data.loteMeta(opt.id);
        state.create.loteMeta = meta;
        setSelectLabel($("#sel-lote"), QB.Data.loteLabel(meta.raw || meta) || opt.label);
      },
    });
  }

  function confirmCreate() {
    const c = state.create;
    if (!c.evaluadorNombre && !c.evaluadorId) {
      toast("Selecciona evaluador", "warn");
      return;
    }
    if (!c.cartillaId) {
      toast("Selecciona cartilla", "warn");
      return;
    }
    if (!c.modulo) {
      toast("Selecciona módulo", "warn");
        return;
      }
    if (!c.turno) {
      toast("Selecciona turno", "warn");
        return;
      }
    if (!c.loteId) {
      toast("Selecciona lote", "warn");
      return;
    }
    const meta = c.loteMeta || QB.Data.loteMeta(c.loteId);
    writePrefs_({
      evaluadorId: c.evaluadorId,
      evaluadorNombre: c.evaluadorNombre,
      cartillaId: c.cartillaId,
      cartillaLabel: c.cartillaLabel,
      modulo: c.modulo,
      turno: c.turno,
    });
    const cartilla = emptyCartilla_({
      clientId: QB.API.newClientId(),
      fecha: todayISO_(),
      evaluadorId: c.evaluadorId,
      evaluadorNombre: c.evaluadorNombre,
      cartillaId: c.cartillaId,
      cartillaLabel: c.cartillaLabel || "Proyecciones",
      modulo: QB.Data.normalizeModulo(meta.modulo || c.modulo),
      turno: String(meta.turno || c.turno),
      loteId: c.loteId,
      loteNum: String(meta.lote || ""),
      loteCode: QB.Data.formatLoteCode(meta) || String(meta.codLote || c.loteId),
      etapa: meta.etapa || "",
      variedad: meta.variedad || "",
      area: "",
      observacion: "",
    });
    closeCreateModal();
    openCartilla(cartilla, 0);
  }

  /* ——— Cartilla ——— */
  function openCartilla(cartilla, muestraIndex) {
    state.cartilla = cartilla;
    const total = sampleCount_(cartilla);
    state.muestraIndex = Math.max(0, Math.min(total - 1, Number(muestraIndex) || 0));
    showScreen("cartilla");
    renderCartilla();
    saveDraft_();
  }

  function renderCartilla() {
    const c = state.cartilla;
    if (!c) return;
    const samples = ensureSamples_(c);
    const total = samples.length;
    if (state.muestraIndex >= total) state.muestraIndex = total - 1;
    const codeEl = $("#cartilla-code");
    const codeSub = $("#cartilla-code-sub");
    const numEl = $("#muestra-num");
    const verEl = $("#cartilla-ver");
    const prevBtn = $("#btn-muestra-prev");
    const nextBtn = $("#btn-muestra-next");
    if (codeEl) codeEl.value = c.loteCode || "";
    if (codeSub) codeSub.textContent = c.loteCode || "Nueva cartilla";
    if (numEl) numEl.textContent = `${state.muestraIndex + 1} / ${total}`;
    if (verEl) verEl.textContent = (QB.CONFIG && QB.CONFIG.VERSION) || "1.0";
    if (prevBtn) prevBtn.disabled = state.muestraIndex <= 0;
    if (nextBtn) nextBtn.disabled = state.muestraIndex >= SAMPLE_MAX() - 1 && state.muestraIndex >= total - 1;

    const root = $("#cartilla-fields");
    if (!root) return;
    const sample = c.samples[state.muestraIndex] || emptySample_();
    const fieldsHtml = (QB.SAMPLE_FIELDS || [])
      .map((f) => {
        const val = sample[f.id] != null ? sample[f.id] : "";
        return `<label class="cartilla-row">
          <span class="cartilla-row-label">${escapeHtml(f.label)}</span>
          <input type="text" inputmode="decimal" enterkeyhint="next" data-field="${escapeAttr(f.id)}" value="${escapeAttr(val)}" autocomplete="off" />
        </label>`;
      })
      .join("");

    root.innerHTML =
      fieldsHtml +
      `<label class="cartilla-obs">
        <span>Observación</span>
        <textarea id="cartilla-obs" rows="3" placeholder="Opcional">${escapeHtml(c.observacion || "")}</textarea>
      </label>`;

    const fieldInputs = [...root.querySelectorAll("input[data-field]")];
    fieldInputs.forEach((inp, idx) => {
      inp.addEventListener("input", () => {
        const id = inp.dataset.field;
        if (!state.cartilla.samples[state.muestraIndex]) {
          state.cartilla.samples[state.muestraIndex] = emptySample_();
        }
        state.cartilla.samples[state.muestraIndex][id] = inp.value;
        saveDraft_();
      });
      // Enter / siguiente: saltar sin soltar el teclado
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const next = fieldInputs[idx + 1] || $("#cartilla-obs");
        if (next) next.focus({ preventScroll: true });
      });
    });
    const obs = $("#cartilla-obs");
    if (obs) {
      obs.addEventListener("input", () => {
        state.cartilla.observacion = obs.value;
        saveDraft_();
      });
    }
  }

  /**
   * Como Calidad: JS solo escribe --kb. La barra (en body) sube/baja por CSS.
   * Además hace scroll del campo activo para que E4/E5/Observación no queden bajo GUARDAR.
   */
  function bindKeyboardBar_() {
    if (bindKeyboardBar_._done) return;
    bindKeyboardBar_._done = true;

    const root = document.documentElement;
    let held = -1;
    let raf = 0;
    let dropTimer = 0;
    let revealTimer = 0;

    resetKeyboardBar_ = () => {
      if (dropTimer) {
        clearTimeout(dropTimer);
        dropTimer = 0;
      }
      held = 0;
      root.style.setProperty("--kb", "0px");
    };

    function formInputFocused_() {
      if (document.querySelector(".create-modal.open, .overlay.open")) return false;
      if (state.screen !== "cartilla") return false;
      const el = document.activeElement;
      if (!el || !el.matches) return false;
      if (el.closest("#precise-overlay, .overlay, .create-modal")) return false;
      if (!el.closest("#cartilla-fields")) return false;
      return el.matches(
        "input:not([type=hidden]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea"
      );
    }

    function liveInset_() {
      if (!formInputFocused_()) return 0;
      const vv = window.visualViewport;
      let gap = 0;
      if (vv) {
        gap = Math.round(window.innerHeight - (vv.offsetTop || 0) - vv.height);
        if (gap < 48) gap = 0;
      }
      const vk = navigator.virtualKeyboard;
      const vkH = vk && vk.boundingRect ? Math.round(vk.boundingRect.height) : 0;
      if (gap > 0) return gap;
      return vkH > 40 ? vkH : 0;
    }

    /** Sube el scroll para que el campo quede arriba de GUARDAR (+ teclado) */
    function revealFocusedField_() {
      if (!formInputFocused_()) return;
      const el = document.activeElement;
      const scroller = document.getElementById("cartilla-fields");
      if (!el || !scroller) return;
      const wrap = el.closest(".cartilla-row, .cartilla-obs") || el;
      const bar = document.querySelector("body > .form-actions.proy-cartilla");
      const barH = bar ? bar.getBoundingClientRect().height : 72;
      const kb = Math.max(0, held > 0 ? held : liveInset_());
      const limit = window.innerHeight - kb - barH - 14;
      const rect = wrap.getBoundingClientRect();
      if (rect.bottom > limit) {
        scroller.scrollTop += rect.bottom - limit;
      } else if (rect.top < 10) {
        scroller.scrollTop += rect.top - 10;
      }
    }

    function scheduleReveal_() {
      clearTimeout(revealTimer);
      revealTimer = setTimeout(revealFocusedField_, 60);
      // Segunda pasada cuando el teclado ya midió altura
      setTimeout(revealFocusedField_, 280);
    }

    function paint_() {
      raf = 0;
      const px = liveInset_();
      if (px > 0) {
        if (dropTimer) {
          clearTimeout(dropTimer);
          dropTimer = 0;
        }
        const changed = px !== held;
        held = px;
        if (changed) {
          root.style.setProperty("--kb", px + "px");
          scheduleReveal_();
        }
        return;
      }
      if (held <= 0 || dropTimer) return;
      dropTimer = setTimeout(() => {
        dropTimer = 0;
        if (liveInset_() > 0) return;
        held = 0;
        root.style.setProperty("--kb", "0px");
      }, 220);
    }

    const onPaint = () => {
      if (raf) return;
      raf = requestAnimationFrame(paint_);
    };

    try {
      if (navigator.virtualKeyboard) {
        navigator.virtualKeyboard.overlaysContent = true;
        navigator.virtualKeyboard.addEventListener("geometrychange", onPaint);
      }
    } catch (_) {}

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onPaint, { passive: true });
      window.visualViewport.addEventListener("scroll", onPaint, { passive: true });
    }
    window.addEventListener("resize", onPaint, { passive: true });
    document.addEventListener(
      "focusin",
      (e) => {
        const t = e.target;
        if (t && t.closest && t.closest("#cartilla-fields") && t.matches && t.matches("input, textarea")) {
          scheduleReveal_();
        }
        onPaint();
      },
      true
    );
    document.addEventListener("focusout", onPaint, true);
    paint_();
  }

  async function switchMuestra(dir) {
    if (!state.cartilla) return;
    const samples = ensureSamples_(state.cartilla);
    const next = state.muestraIndex + dir;
    if (next < 0) return;
    if (next >= samples.length) {
      if (samples.length >= SAMPLE_MAX()) return;
      const current = samples[state.muestraIndex];
      if (!sampleHasData_(current)) {
        await feedback({
          title: "Muestra vacía",
          text: "Completa al menos un campo antes de agregar otra muestra.",
          type: "warn",
          confirmText: "Entendido",
        });
        return;
      }
      samples.push(emptySample_());
    }
    state.muestraIndex = next;
    renderCartilla();
    saveDraft_();
  }

  function buildRowsForSave_(cartilla) {
    const semana = isoWeek_(cartilla.fecha);
    const evaluador =
      cartilla.evaluadorNombre ||
      (cartilla.evaluadorId
        ? QB.Data.formatStoredPerson(
            `${cartilla.evaluadorId} — ${cartilla.evaluadorNombre || ""}`
          )
        : "");
    const samples = ensureSamples_(cartilla).filter(sampleHasData_);
    const rows = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] || emptySample_();
      const row = {
        Lote: cartilla.loteCode || "",
        Fecha: cartilla.fecha || todayISO_(),
        Evaluador: evaluador,
        "N° Muestra": i + 1,
        Observación: cartilla.observacion || "",
        "Foto cabecera": "",
        Modulo: cartilla.modulo || "",
        Turno: cartilla.turno || "",
        Lotes: cartilla.loteNum || "",
        Semana: semana,
        Etapa: cartilla.etapa || "",
        Variedad: cartilla.variedad || "",
        Area: cartilla.area || "",
      };
      (QB.SAMPLE_FIELDS || []).forEach((f) => {
        const v = s[f.id];
        row[f.sheet] = v === "" || v == null ? "" : v;
      });
      rows.push(row);
    }
    return rows;
  }

  async function guardarCartilla() {
    if (state.saving || !state.cartilla) return;
    const c = state.cartilla;
    pruneEmptySamples_(c);
    const emptyIdx = emptySampleIndexes_(c);
    if (emptyIdx.length) {
      await feedback({
        title: "No se puede guardar vacío",
        text:
          emptyIdx.length === ensureSamples_(c).length
            ? "Completa al menos un campo en la muestra antes de guardar."
            : `Hay muestras sin datos: ${emptyIdx.map((n) => `Muestra ${n}`).join(", ")}.\nCompleta cada muestra o vuelve atrás y no las dejes vacías.`,
        type: "warn",
        confirmText: "Entendido",
      });
      renderCartilla();
      return;
    }

    const samples = ensureSamples_(c).filter(sampleHasData_);
    const n = samples.length;
    const ok = await feedback({
      title: `¿Guardar ${n} muestra${n === 1 ? "" : "s"}?`,
      text: `Se van a guardar ${n} muestra${n === 1 ? "" : "s"} con data.`,
      type: "info",
      confirmText: "Sí, guardar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    state.saving = true;
    setLoader(true, "Guardando…");
    try {
      const clientId = c.clientId || QB.API.newClientId();
      c.clientId = clientId;
      const rows = buildRowsForSave_(c);
      const payload = {
        type: "proyecciones",
        sheet: "Proyecciones",
        clientId,
        data: {
          fecha: c.fecha,
          evaluador: rows[0] && rows[0].Evaluador,
          evaluadorId: c.evaluadorId,
          modulo: c.modulo,
          turno: c.turno,
          lote: c.loteCode,
          loteNum: c.loteNum,
          etapa: c.etapa,
          variedad: c.variedad,
          observacion: c.observacion,
          sampleCount: rows.length,
        },
        rows,
        submittedAt: new Date().toISOString(),
      };

      const res = await QB.API.submit(payload);
      upsertLocalList_({
        clientId,
        fecha: c.fecha,
        loteCode: c.loteCode,
        modulo: c.modulo,
        turno: c.turno,
        loteNum: c.loteNum,
        cartillaLabel: c.cartillaLabel || "Proyecciones",
        evaluador: payload.data.evaluador,
        sampleCount: rows.length,
        samples: rows.map((r, i) => ({
          n: i + 1,
          yema: r["Yema Productiva"] ?? "",
          abierta: r["Yema Abierta"] ?? "",
          e1: r["E1 (Verde)"] ?? "",
          e5: r["E5 (Maduro)"] ?? "",
        })),
        status: res && res.queued && !res.synced ? "pending" : "saved",
        at: Date.now(),
      });
      clearDraft_();
      state.cartilla = null;
      renderHomeList();
      showScreen("home");
      const n = rows.length;
      await feedback({
        title: res && res.offline ? "Guardado offline" : "Cartilla guardada",
        text: res && res.offline
          ? "Se enviará cuando haya señal."
          : `${n} muestra${n === 1 ? "" : "s"} lista${n === 1 ? "" : "s"} para envío.`,
        type: "ok",
        confirmText: "Listo",
        autoClose: 1600,
      });
    } catch (err) {
      await feedback({
        title: "No se pudo guardar",
        text: String(err && err.message ? err.message : err),
        type: "error",
        confirmText: "Entendido",
      });
    } finally {
      state.saving = false;
      setLoader(false);
    }
  }

  async function leaveCartilla() {
    if (!state.cartilla) {
      showScreen("home");
      return;
    }
    const ok = await feedback({
      title: "¿Salir sin guardar?",
      text: "Se conserva un borrador en este dispositivo.",
      type: "warn",
      confirmText: "Salir",
      cancelText: "Seguir",
    });
    if (!ok) return;
    saveDraft_();
    state.cartilla = null;
    showScreen("home");
    renderHomeList();
  }

  /* ——— Home list ——— */
  function pendingIds_() {
    try {
      const q = QB.API.getQueue() || [];
      return new Set(q.filter((x) => x && x.status !== "sent").map((x) => x.clientId));
    } catch {
      return new Set();
    }
  }

  function renderHomeList() {
    renderDraftBanner_();
    renderLastSend_();
  }

  function renderDraftBanner_() {
    const section = $("#proy-drafts");
    const banner = $("#proy-draft-banner");
    const textEl = $("#proy-draft-text");
    if (!banner) return;
    const draft = loadDraft_();
    if (!draft || !draft.cartilla) {
      if (section) section.hidden = true;
      banner.onclick = null;
      return;
    }
    const c = draft.cartilla;
    const bits = [c.loteCode || c.modulo, c.fecha].filter(Boolean).join(" · ");
    if (textEl) textEl.textContent = bits || "Continuar cartilla";
    if (section) section.hidden = false;
    banner.onclick = () => openCartilla(c, draft.muestraIndex || 0);
  }

  function formatLastSendTime_(ts) {
    const n = Number(ts) || 0;
    if (!n) return "";
    try {
      return new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(n));
    } catch {
      return new Date(n).toLocaleString("es-PE");
    }
  }

  function renderLastSend_() {
    const titleEl = $("#last-send-title");
    const typeEl = $("#last-send-type");
    const textEl = $("#last-send-text");
    const badgeEl = $("#last-send-badge");
    const cardEl = $("#last-send-card");
    if (!titleEl || !textEl) return;

    const pending = pendingIds_();
    const list = readLocalList_();
    const latest = list.find((x) => x && x.clientId) || null;
    const syncAt = QB.API.getLastSyncAt ? QB.API.getLastSyncAt() : 0;

    if (latest) {
      const isPending = pending.has(latest.clientId) || latest.status === "pending";
      const when = formatLastSendTime_(latest.at || syncAt);
      const n = Number(latest.sampleCount) || (Array.isArray(latest.samples) ? latest.samples.length : 0);
      titleEl.textContent = latest.loteCode || latest.cartillaLabel || "Cartilla";
      if (typeEl) {
        typeEl.hidden = false;
        typeEl.textContent = latest.cartillaLabel || "Proyecciones";
      }
      textEl.textContent = [
        latest.fecha || "",
        when || "",
        n > 0 ? `${n} muestra${n === 1 ? "" : "s"}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (badgeEl) {
        badgeEl.hidden = false;
        badgeEl.textContent = isPending ? "Pendiente" : "Enviado";
        badgeEl.classList.toggle("is-pending", isPending);
      }
      if (cardEl) {
        cardEl.classList.add("has-data");
        cardEl.dataset.state = isPending ? "pending" : "sent";
      }
      return;
    }

    if (syncAt) {
      const when = formatLastSendTime_(syncAt);
      titleEl.textContent = "Sincronización reciente";
      if (typeEl) {
        typeEl.hidden = false;
        typeEl.textContent = "Proyecciones";
      }
      textEl.textContent = when ? `Último sync · ${when}` : "Cola sincronizada";
      if (badgeEl) {
        badgeEl.hidden = false;
        badgeEl.textContent = "Enviado";
        badgeEl.classList.remove("is-pending");
      }
      if (cardEl) {
        cardEl.classList.add("has-data");
        cardEl.dataset.state = "sent";
      }
      return;
    }

    titleEl.textContent = "Sin envíos aún";
    if (typeEl) {
      typeEl.hidden = true;
      typeEl.textContent = "";
    }
    textEl.textContent = "Cuando guardes una cartilla, verás aquí si quedó pendiente o enviada.";
    if (badgeEl) badgeEl.hidden = true;
    if (cardEl) {
      cardEl.classList.remove("has-data");
      cardEl.dataset.state = "empty";
    }
  }

  /* ——— Status / sync UI ——— */
  function updateOnlineUi() {
    const online = navigator.onLine;
    $$("[data-status-bar] .status-chip.online, #chip-online").forEach((chip) => {
      if (!chip || chip.id === "chip-pending" || chip.dataset.chipPending != null) return;
      if (chip.classList.contains("pending")) return;
      chip.classList.toggle("online", online);
      chip.classList.toggle("offline", !online);
      const text = chip.querySelector(".chip-text");
      if (text) text.textContent = online ? "En línea" : "Sin red";
    });
  }

  function updatePendingUi() {
    const n = QB.API.pendingCount ? QB.API.pendingCount() : 0;
    $$("#chip-pending, [data-chip-pending]").forEach((chip) => {
      if (!chip) return;
      chip.classList.toggle("has-items", n > 0);
      const text = chip.querySelector(".chip-text, [data-pending-text]") || $("#chip-pending-text");
      if (text) text.textContent = `${n} pend.`;
    });
    renderHomeList();
  }

  function openSyncModal() {
    const root = $("#qb-sync");
    const ver = $("#qb-sync-version");
    if (ver) ver.textContent = `v${(QB.CONFIG && QB.CONFIG.VERSION) || "1.0.0"}`;
    if (!root) return;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("open"));
  }

  function closeSyncModal() {
    const root = $("#qb-sync");
    if (!root) return;
    root.classList.remove("open");
    setTimeout(() => {
      root.hidden = true;
    }, 180);
  }

  async function clearAllLocal() {
    const ok = await feedback({
      title: "¿Eliminar caché local?",
      text: "Se borran pendientes, borradores e historial de este dispositivo.",
      type: "warn",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    try {
      await QB.API.wipeAllLocalData();
    } catch (_) {}
    clearDraft_();
    writeLocalList_([]);
    updatePendingUi();
    renderHomeList();
    toast("Caché eliminada", "ok");
    closeSyncModal();
  }

  async function updateApp() {
    try {
      if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    toast("Actualizando…", "ok");
    setTimeout(() => location.reload(), 500);
  }

  async function runTransferMode() {
    closeSyncModal();
    const root = $("#qb-transfer");
    const fill = $("#qb-transfer-fill");
    const count = $("#qb-transfer-count");
    const actions = $("#qb-transfer-actions");
    if (!root) return;
    root.hidden = false;
    if (actions) actions.hidden = true;
    try {
      const total = QB.API.pendingCount() || 0;
      if (count) count.textContent = `0 / ${total}`;
      if (fill) fill.style.width = "0%";
      const result = await QB.API.flushUntilEmpty({
        onProgress: (p) => {
          const sent = Number(p && p.sent) || 0;
          const total = Number(p && p.total) || 0;
          if (count) count.textContent = `${sent} / ${total}`;
          if (fill) fill.style.width = total ? `${Math.round((sent / total) * 100)}%` : "100%";
        },
      });
      if (fill) fill.style.width = "100%";
      if (count) {
        count.textContent = result && result.remain
          ? `Quedan ${result.remain}`
          : "Listo";
      }
    } catch (err) {
      toast(String(err && err.message ? err.message : err), "error");
    } finally {
      updatePendingUi();
      if (actions) actions.hidden = false;
    }
  }

  /* ——— Install banner ——— */
  let deferredPrompt = null;
  function setupInstall() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const banner = $("#install-banner");
      if (banner) banner.hidden = false;
    });
    $("#btn-install-app")?.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      const banner = $("#install-banner");
      if (banner) banner.hidden = true;
    });
    $("#btn-install-dismiss")?.addEventListener("click", () => {
      const banner = $("#install-banner");
      if (banner) banner.hidden = true;
    });
  }

  /* ——— Utils ——— */
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function formatHistTime_(iso) {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (!t || Number.isNaN(t)) return "—";
    try {
      return new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(t));
    } catch {
      return new Date(t).toLocaleString("es-PE");
    }
  }

  function openHistorial() {
    showScreen("historial");
    renderHistorial();
    updateOnlineUi();
    updatePendingUi();
  }

  function renderHistorial() {
    const listEl = $("#historial-list");
    const emptyEl = $("#historial-empty");
    const sumEl = $("#historial-summary");
    if (!listEl) return;

    const pendingN = QB.API.pendingCount ? QB.API.pendingCount() : 0;
    let history = [];
    try {
      history = QB.API.getUploadHistory ? QB.API.getUploadHistory() : [];
    } catch {
      history = [];
    }

    // Completar con lista local enviada (por si activity está vacío)
    const pendingIds = pendingIds_();
    const localSent = readLocalList_()
      .filter((x) => x && !pendingIds.has(x.clientId))
      .map((x) => ({
        id: x.clientId,
        clientId: x.clientId,
        status: "sent",
        at: x.at ? new Date(x.at).toISOString() : "",
        lote: x.loteCode || "",
        modulo: x.modulo || "",
        turno: x.turno || "",
        evaluador: x.evaluador || "",
        type: "proyecciones",
        cartillaLabel: x.cartillaLabel || "Proyecciones",
        sampleCount: x.sampleCount || (Array.isArray(x.samples) ? x.samples.length : 0) || 0,
        samples: Array.isArray(x.samples) ? x.samples : [],
      }));

    // Enriquecer pendientes de cola con samples locales
    const localById = {};
    readLocalList_().forEach((x) => {
      if (x && x.clientId) localById[x.clientId] = x;
    });
    history = history.map((h) => {
      const loc = localById[h.clientId];
      if (!loc) return h;
          return {
        ...h,
        sampleCount: h.sampleCount || loc.sampleCount || 0,
        samples: (h.samples && h.samples.length ? h.samples : loc.samples) || [],
        cartillaLabel: h.cartillaLabel || loc.cartillaLabel || "Proyecciones",
        lote: h.lote || loc.loteCode || "",
      };
    });

    const seen = new Set(history.map((h) => String(h.clientId || h.id || "")));
    localSent.forEach((s) => {
      const id = String(s.clientId || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        history.push(s);
      }
    });

    history.sort(
      (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
    );

    const sentN = history.filter((h) => h.status === "sent").length;
    if (sumEl) {
      sumEl.textContent = `${pendingN} pendiente${pendingN === 1 ? "" : "s"} · ${sentN} enviado${sentN === 1 ? "" : "s"}`;
    }

    if (!history.length) {
      listEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = history
      .map((h, idx) => {
        const st = h.status === "sent" ? "sent" : "pending";
        const stLabel = st === "sent" ? "Enviado" : "En cola";
        const lote = escapeHtml(h.lote || h.loteCode || "—");
        const when = escapeHtml(formatHistTime_(h.at));
        const evalName = escapeHtml(h.evaluador || "—");
        const cartilla = escapeHtml(h.cartillaLabel || "Proyecciones");
        const nSamples = Number(h.sampleCount) || (Array.isArray(h.samples) ? h.samples.length : 0) || 0;
        const samples = Array.isArray(h.samples) && h.samples.length
          ? h.samples
          : Array.from({ length: nSamples }, (_, i) => ({ n: i + 1 }));
        const samplesHtml = samples
          .map((s) => {
            const n = escapeHtml(s.n != null ? s.n : "");
            const bits = [
              s.yema !== "" && s.yema != null ? `YP ${escapeHtml(s.yema)}` : "",
              s.abierta !== "" && s.abierta != null ? `YA ${escapeHtml(s.abierta)}` : "",
              s.e1 !== "" && s.e1 != null ? `E1 ${escapeHtml(s.e1)}` : "",
              s.e5 !== "" && s.e5 != null ? `E5 ${escapeHtml(s.e5)}` : "",
    ].filter(Boolean);
            return `<div class="hist-sample">
              <span class="hist-sample-n">Muestra ${n}</span>
              <span class="hist-sample-meta">${bits.length ? bits.join(" · ") : "Sin detalle capturado"}</span>
            </div>`;
          })
      .join("");
        return `<details class="hist-card ${st}" data-idx="${idx}">
          <summary class="hist-summary">
            <div class="hist-card-top">
              <strong class="hist-lote">${lote}</strong>
              <span class="hist-badge">${stLabel}</span>
          </div>
            <p class="hist-line">${cartilla} · ${evalName}</p>
            <div class="hist-summary-foot">
              <span class="hist-muestras">${nSamples} muestra${nSamples === 1 ? "" : "s"}</span>
              <span class="hist-time">${when}</span>
        </div>
          </summary>
          <div class="hist-panel">
            <p class="hist-panel-title">Detalle de muestras</p>
            ${samplesHtml}
          </div>
        </details>`;
      })
      .join("");
  }

  /* ——— Bind ——— */
  function bind() {
    $("#btn-crear")?.addEventListener("click", openCreateModal);
    $("#btn-create-cancel")?.addEventListener("click", closeCreateModal);
    $("#create-modal-backdrop")?.addEventListener("click", closeCreateModal);
    $("#btn-create-ok")?.addEventListener("click", confirmCreate);
    $("#sel-evaluador")?.addEventListener("click", openEvaluadorSelect);
    $("#sel-cartilla")?.addEventListener("click", openCartillaSelect);
    $("#sel-modulo")?.addEventListener("click", openModuloSelect);
    $("#sel-turno")?.addEventListener("click", openTurnoSelect);
    $("#sel-lote")?.addEventListener("click", openLoteSelect);

    $("#btn-back-cartilla")?.addEventListener("click", leaveCartilla);
    $("#btn-muestra-prev")?.addEventListener("click", () => switchMuestra(-1));
    $("#btn-muestra-next")?.addEventListener("click", () => switchMuestra(1));
    $("#btn-guardar")?.addEventListener("click", guardarCartilla);

    $("#btn-historial")?.addEventListener("click", openHistorial);
    $("#btn-back-historial")?.addEventListener("click", () => {
      showScreen("home");
      renderHomeList();
    });
    $("#btn-sync-info")?.addEventListener("click", openSyncModal);
    $("#btn-cartilla-menu")?.addEventListener("click", openSyncModal);
    $("#qb-sync-close")?.addEventListener("click", closeSyncModal);
    $("#qb-sync-done")?.addEventListener("click", closeSyncModal);
    $("#qb-sync-clear")?.addEventListener("click", clearAllLocal);
    $("#qb-sync-update")?.addEventListener("click", updateApp);
    $("#qb-sync-transfer")?.addEventListener("click", runTransferMode);
    $("#qb-transfer-done")?.addEventListener("click", () => {
      const root = $("#qb-transfer");
      if (root) root.hidden = true;
    });

    $("#chip-pending")?.addEventListener("click", () => {
      if (QB.API.pendingCount() > 0) QB.API.flushQueue({ includeOld: true });
      else toast("No hay pendientes", "info");
    });

    window.addEventListener("online", () => {
      updateOnlineUi();
      try {
        QB.API.flushQueue({ includeOld: true });
      } catch (_) {}
      renderHomeList();
    });
    window.addEventListener("offline", () => {
      updateOnlineUi();
      saveDraft_();
      toast("Sin señal · sigues trabajando offline", "warn");
    });
    window.addEventListener("qb:queue", () => {
      updatePendingUi();
      if (state.screen === "historial") renderHistorial();
      if (state.screen === "home") renderHomeList();
    });
    window.addEventListener("qb:sync", () => {
      updatePendingUi();
      if (state.screen === "historial") renderHistorial();
      if (state.screen === "home") renderHomeList();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        saveDraft_();
      } else {
        updateOnlineUi();
        updatePendingUi();
        if (navigator.onLine && QB.API.flushQueue) {
          try { QB.API.flushQueue({ includeOld: true }); } catch (_) {}
        }
      }
    });

    window.addEventListener("pageshow", (ev) => {
      if (ev.persisted) {
        updateOnlineUi();
        updatePendingUi();
        renderHomeList();
      }
    });
  }

  async function init() {
    mountActionBars_();
    bind();
    bindKeyboardBar_();
    setupInstall();
    updateOnlineUi();
    showScreen("home");

    try {
      await QB.Data.ensureCatalogs();
        } catch (_) {}
      try {
      if (QB.API.whenReady) await QB.API.whenReady();
      } catch (_) {}

    updatePendingUi();
    renderHomeList();

    if (navigator.onLine && QB.API.shouldAutoSync && QB.API.shouldAutoSync()) {
      QB.API.flushQueue({ includeOld: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
    } else {
    init();
  }

  return {
    init,
    showScreen,
    openCreateModal,
    openCartilla,
  };
})();
