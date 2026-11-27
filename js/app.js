/** App principal — Proyecciones (lista + modal + cartilla de muestras) */
window.QB = window.QB || {};

QB.App = (() => {
  const SAMPLE_START = () => Math.max(1, Number((QB.CONFIG && QB.CONFIG.SAMPLE_START) || 1) || 1);
  const SAMPLE_MAX = () => Math.max(1, Number((QB.CONFIG && QB.CONFIG.SAMPLE_MAX) || 40) || 40);
  const DRAFT_KEY = "qb_proy_draft";
  const LOCAL_LIST_KEY = "qb_proy_local_list";
  const PREFS_KEY = "qb_proy_prefs";
  const SESSION_KEY = "qb_proy_session";

  const state = {
    screen: "home",
    create: {
      evaluadorId: "",
      evaluadorNombre: "",
      campana: "",
      fundoId: "",
      fundoLabel: "",
      modulo: "",
      turno: "",
      loteId: "",
      loteMeta: null,
    },
    cartilla: null,
    muestraIndex: 0,
    saving: false,
  };
  let cameraGuardUntil_ = 0;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function newSampleId_() {
    try {
      if (crypto?.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function emptySample_(locus) {
    const o = {
      sampleId: newSampleId_(),
      observacion: "",
      photoDataUrl: "",
      photoTakenAt: "",
      turno: "",
      loteId: "",
      loteNum: "",
      loteCode: "",
      variedad: "",
      area: "",
      etapa: "",
    };
    (QB.SAMPLE_FIELDS || []).forEach((f) => {
      o[f.id] = "";
    });
    if (locus) stampSampleLocus_(o, locus);
    return o;
  }

  /** Fundo I–IV de la cartilla (para filtrar turnos/lotes del mismo módulo). */
  function cartillaFundoId_(c) {
    if (!c) return "";
    const id = String(c.fundoId || "").trim().toUpperCase();
    if (id === "I" || id === "II" || id === "III" || id === "IV") return id;
    const e = String(c.fundo || c.etapa || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    if (!e) return "";
    if (/\bIV\b/.test(e) || e.includes("LICAPA IV")) return "IV";
    if (/\bIII\b/.test(e) || e.includes("LICAPA III")) return "III";
    if (e.includes("I/II") || e.includes("I / II")) return "I";
    if (/\bII\b/.test(e) || e.includes("LICAPA II")) return "II";
    if (/\bI\b/.test(e) || e.includes("LICAPA I")) return "I";
    return "";
  }

  function locusFromCartilla_(c) {
    if (!c) return null;
    return {
      turno: String(c.turno || ""),
      loteId: String(c.loteId || ""),
      loteNum: String(c.loteNum || ""),
      loteCode: String(c.loteCode || ""),
      variedad: String(c.variedad || ""),
      area: c.area != null && c.area !== "" ? c.area : "",
      etapa: String(c.etapa || c.fundo || ""),
    };
  }

  function stampSampleLocus_(sample, locus) {
    if (!sample || !locus) return sample;
    sample.turno = String(locus.turno || "");
    sample.loteId = String(locus.loteId || "");
    sample.loteNum = String(locus.loteNum || "");
    sample.loteCode = String(locus.loteCode || "");
    sample.variedad = String(locus.variedad || "");
    sample.area = locus.area != null && locus.area !== "" ? locus.area : "";
    sample.etapa = String(locus.etapa || "");
    return sample;
  }

  function sampleLocusOrCartilla_(sample, cartilla) {
    // Si la muestra ya tiene ubicación sellada, NO mezclar con la cartilla activa
    if (sample && String(sample.loteCode || "").trim()) {
      return {
        turno: String(sample.turno || ""),
        loteId: String(sample.loteId || ""),
        loteNum: String(sample.loteNum || ""),
        loteCode: String(sample.loteCode || ""),
        variedad: String(sample.variedad || ""),
        area: sample.area != null && sample.area !== "" ? sample.area : "",
        etapa: String(sample.etapa || ""),
      };
    }
    if (sample && String(sample.turno || sample.loteNum || "").trim()) {
      return {
        turno: String(sample.turno || ""),
        loteId: String(sample.loteId || ""),
        loteNum: String(sample.loteNum || ""),
        loteCode: String(sample.loteCode || ""),
        variedad: String(sample.variedad || ""),
        area: sample.area != null && sample.area !== "" ? sample.area : "",
        etapa: String(sample.etapa || ""),
      };
    }
    return locusFromCartilla_(cartilla);
  }

  /** Clave estable turno+lote (reinicio de conteo por ubicación). */
  function locusKeyFrom_(loc) {
    if (!loc) return "";
    const code = String(loc.loteCode || "").trim().toUpperCase();
    if (code) return code;
    const t = String(loc.turno || "").trim();
    const l = String(loc.loteNum || "").trim();
    if (!t && !l) return "";
    return `T${t}|L${l}`;
  }

  function sampleLocusKey_(sample, cartilla) {
    return locusKeyFrom_(sampleLocusOrCartilla_(sample, cartilla));
  }

  function cartillaLocusKey_(cartilla) {
    return locusKeyFrom_(locusFromCartilla_(cartilla));
  }

  function indicesForLocusKey_(samples, cartilla, key) {
    const want = String(key || "");
    const out = [];
    if (!want) return out;
    for (let i = 0; i < samples.length; i++) {
      if (sampleLocusKey_(samples[i], cartilla) === want) out.push(i);
    }
    return out;
  }

  function cartillaHasLocus_(c) {
    return !!(
      c &&
      String(c.turno || "").trim() &&
      String(c.loteNum || c.loteId || "").trim() &&
      String(c.loteCode || "").trim()
    );
  }

  function requireCartillaLocus_(opts) {
    const c = state.cartilla;
    if (cartillaHasLocus_(c)) return true;
    toast("Selecciona turno y lote para continuar", "warn");
    if (!(opts && opts.silent)) {
      setTimeout(() => openCartillaTurnoSelect_(), 120);
    }
    return false;
  }

  /** Congela ubicación en muestras con contenido antes de cambiar turno/lote. */
  function freezeUnstampedSamples_(cartilla, locus) {
    const loc = locus || locusFromCartilla_(cartilla);
    if (!locusKeyFrom_(loc)) return;
    ensureSamples_(cartilla).forEach((s) => {
      if (!s || !sampleHasContent_(s)) return;
      if (!String(s.loteCode || s.turno || "").trim()) {
        stampSampleLocus_(s, loc);
      }
    });
  }

  /**
   * Al cambiar turno/lote: nueva muestra 1 en blanco (sin inputs, detalle ni foto).
   * Las muestras anteriores se conservan selladas; no se reutiliza el objeto actual.
   */
  function startNewLocusSeries_(cartilla) {
    const samples = ensureSamples_(cartilla);
    // Quita solo vacías del final (sin campos/foto/obs)
    while (samples.length > 0 && !sampleHasContent_(samples[samples.length - 1])) {
      samples.pop();
    }
    if (samples.length >= SAMPLE_MAX()) {
      toast("Límite de muestras alcanzado", "warn");
      if (samples.length) state.muestraIndex = samples.length - 1;
      return false;
    }
    const blank = freshBlankSample_(locusFromCartilla_(cartilla));
    samples.push(blank);
    state.muestraIndex = samples.length - 1;
    return true;
  }

  function applyLocusToCartilla_(c, meta) {
    if (!c || !meta) return;
    const turno = String(meta.turno ?? c.turno ?? "").trim();
    const loteNum = String(meta.lote ?? meta.loteNum ?? c.loteNum ?? "").trim();
    const loteId = String(meta.id || meta.codLote || meta.loteId || c.loteId || "").trim();
    const code =
      QB.Data.formatLoteCode({
        modulo: c.modulo,
        turno,
        lote: loteNum,
        codLote: loteId,
      }) || String(meta.codLote || loteId || c.loteCode || "");
    c.turno = turno;
    c.loteId = loteId;
    c.loteNum = loteNum;
    c.loteCode = code;
    if (meta.variedad != null) c.variedad = meta.variedad || "";
    if (meta.area != null && meta.area !== "") c.area = meta.area;
    if (meta.etapa) {
      c.etapa = String(meta.etapa);
      if (!c.fundo) c.fundo = String(meta.etapa);
    }
  }

  const PESO_PREF_KEY = "qb_proy_peso_baya";

  function ensureSamples_(cartilla) {
    if (!cartilla) return [];
    if (!Array.isArray(cartilla.samples) || !cartilla.samples.length) {
      cartilla.samples = [emptySample_()];
    }
    // Migrar observación vieja (de cartilla) a cada muestra si aún no tiene
    const legacy = String(cartilla.observacion || "").trim();
    const locus = locusFromCartilla_(cartilla);
    cartilla.samples.forEach((s, i) => {
      if (!s || typeof s !== "object") {
        cartilla.samples[i] = emptySample_(locus);
        return;
      }
      if (!s.sampleId) s.sampleId = newSampleId_();
      if (s.observacion == null) s.observacion = "";
      if (s.photoDataUrl == null) s.photoDataUrl = "";
      if (s.photoTakenAt == null) s.photoTakenAt = "";
      // Nunca reasigna muestras con contenido; solo sella vacías sin ubicación
      if (
        !String(s.loteCode || s.turno || "").trim() &&
        locusKeyFrom_(locus) &&
        !sampleHasContent_(s)
      ) {
        stampSampleLocus_(s, locus);
      }
      if (!String(s.observacion).trim() && legacy && i === 0) {
        s.observacion = legacy;
      }
    });
    return cartilla.samples;
  }

  function sampleCount_(cartilla) {
    return ensureSamples_(cartilla).length;
  }

  function sampleHasData_(sample) {
    return (QB.SAMPLE_FIELDS || []).some((f) => String(sample?.[f.id] ?? "").trim() !== "");
  }

  /** Campos, foto u observación: no se puede reasignar a otro turno/lote. */
  function sampleHasContent_(sample) {
    if (!sample) return false;
    if (sampleHasData_(sample)) return true;
    if (String(sample.observacion || "").trim()) return true;
    if (String(sample.photoDataUrl || "").trim()) return true;
    return false;
  }

  /** Muestra 100% limpia para un turno/lote (nunca hereda inputs/foto). */
  function freshBlankSample_(locus) {
    const s = emptySample_(locus);
    (QB.SAMPLE_FIELDS || []).forEach((f) => {
      s[f.id] = "";
    });
    s.observacion = "";
    s.photoDataUrl = "";
    s.photoTakenAt = "";
    s.sampleId = newSampleId_();
    if (locus) stampSampleLocus_(s, locus);
    return s;
  }

  function pruneEmptySamples_(cartilla) {
    const samples = ensureSamples_(cartilla);
    while (samples.length > 1 && !sampleHasContent_(samples[samples.length - 1])) {
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
    const base = {
      clientId: null,
      fecha: todayISO_(),
      evaluadorId: "",
      evaluadorNombre: "",
      cartillaId: "proyecciones",
      cartillaLabel: "Fenología",
      fundoId: "",
      modulo: "",
      turno: "",
      loteId: "",
      loteNum: "",
      loteCode: "",
      etapa: "",
      fundo: "",
      variedad: "",
      area: "",
      campana: "",
      observacion: "",
      ...(partial || {}),
    };
    const n = SAMPLE_START();
    const locus = locusFromCartilla_(base);
    const samples = [];
    for (let i = 0; i < n; i++) samples.push(emptySample_(locus));
    base.samples = samples;
    return base;
  }

  /** Campaña = año calendario Lima. Al pasar a 2027 cambia sola. */
  function defaultCampana_() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
      }).format(new Date());
    } catch {
      return String(new Date().getFullYear());
    }
  }

  function normalizeCampana_(v) {
    // Siempre el año en curso (sin selector)
    return defaultCampana_();
  }

  function setCampanaLabel_(value) {
    const el = $("#sel-campana-label");
    if (el) el.textContent = defaultCampana_();
    const btn = $("#sel-campana");
    if (btn) {
      btn.setAttribute("aria-disabled", "true");
      btn.tabIndex = -1;
    }
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

  /** yyyy-MM-dd HH:mm:ss en America/Lima (columna Hora subida) */
  function limaNowStamp_() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
      return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
    } catch {
      return new Date().toISOString().slice(0, 19).replace("T", " ");
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

  async function ensureNotifyPermission_() {
    try {
      if (!("Notification" in window)) return false;
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") return false;
      const p = await Notification.requestPermission();
      return p === "granted";
    } catch {
      return false;
    }
  }

  async function notifyPhone_(title, body, tag) {
    try {
      const ok = await ensureNotifyPermission_();
      if (!ok) return;
      const payload = {
        type: "NOTIFY",
        title: String(title || "Q Berries"),
        body: String(body || ""),
        tag: String(tag || "qb-proy-sync"),
      };
      if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.active) {
          reg.active.postMessage(payload);
          return;
        }
        if (reg && reg.showNotification) {
          await reg.showNotification(payload.title, {
            body: payload.body,
            icon: "assets/icon-192.png",
            badge: "assets/icon-192.png",
            tag: payload.tag,
            renotify: true,
            vibrate: [90, 40, 90],
          });
          return;
        }
      }
      new Notification(payload.title, {
        body: payload.body,
        icon: "assets/icon-192.png",
        tag: payload.tag,
      });
    } catch (_) {}
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
  /** CREAR del home: siempre montado y visible en home (nunca se pierde tras guardar) */
  function ensureHomeCreateBar_() {
    mountActionBars_();
    const modal = $("#create-modal");
    if (modal) {
      modal.classList.remove("open");
      modal.hidden = true;
    }
    document.body.classList.remove("create-modal-open");
    let bar =
      document.querySelector("body > .form-actions.proy-home") ||
      $("#screen-home .form-actions.proy-home") ||
      $("#btn-crear")?.closest(".form-actions");
    if (bar && bar.parentElement !== document.body) {
      document.body.appendChild(bar);
    }
    if (!bar) return null;
    bar.hidden = false;
    bar.removeAttribute("hidden");
    bar.style.removeProperty("display");
    bar.style.removeProperty("visibility");
    bar.style.pointerEvents = "auto";
    bar.querySelectorAll(".btn").forEach((btn) => {
      btn.hidden = false;
      btn.removeAttribute("hidden");
      btn.style.pointerEvents = "auto";
      btn.style.removeProperty("visibility");
      btn.style.removeProperty("display");
    });
    return bar;
  }

  function showScreen(id) {
    if (!readSession_()) {
      setAuthUi_(false);
      const gate = $("#qb-login");
      if (gate) gate.hidden = false;
      id = "home";
    }
    // Tras foto/cámara: no saltar a resumen/historial por ghost-click
    if ((id === "resumen" || id === "historial") && Date.now() < cameraGuardUntil_) {
      id = "cartilla";
    }
    state.screen = id;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${id}`));
    document.body.dataset.qbScreen = id;
    // Salir de cartilla: bajar barra (como Calidad)
    if (id !== "cartilla") resetKeyboardBar_();
    if (id === "home") {
      ensureHomeCreateBar_();
    }
    // Asegura que las barras visibles reciban toques
    const unlocked = !!readSession_();
    const guardOn = Date.now() < cameraGuardUntil_;
    const createOpen = document.body.classList.contains("create-modal-open");
    $$("body > .form-actions").forEach((bar) => {
      const on =
        unlocked &&
        !guardOn &&
        !createOpen &&
        ((id === "home" && bar.classList.contains("proy-home")) ||
          (id === "cartilla" && bar.classList.contains("proy-cartilla")) ||
          (id === "resumen" && bar.classList.contains("proy-resumen")));
      bar.style.pointerEvents = on ? "auto" : "none";
      bar.querySelectorAll(".btn").forEach((btn) => {
        btn.style.pointerEvents = on ? "auto" : "none";
      });
    });
  }

  /** Saca las barras a body: si viven dentro del screen (overflow:hidden), Android las recorta/repinta */
  function mountActionBars_() {
    document
      .querySelectorAll(
        "#screen-home > .form-actions, #screen-cartilla > .form-actions, #screen-resumen > .form-actions"
      )
      .forEach((bar) => {
        document.body.appendChild(bar);
      });
    // Si ya estaban en body (re-mount), no hace falta; deja data-qb-screen
    if (!document.body.dataset.qbScreen) {
      document.body.dataset.qbScreen = state.screen || "home";
    }
  }

  /* ——— Local list (historial de cartillas guardadas) ——— */
  /** Historial local en celular: máximo 18 h */
  const LOCAL_LIST_TTL_MS_ = 18 * 60 * 60 * 1000;

  function localEntryAtMs_(x) {
    if (!x) return 0;
    const n = Number(x.at);
    if (Number.isFinite(n) && n > 0) return n;
    const t = Date.parse(x.at || "");
    return Number.isFinite(t) ? t : 0;
  }

  function pruneLocalList18h_(list) {
    const cut = Date.now() - LOCAL_LIST_TTL_MS_;
    return (list || []).filter((x) => {
      if (!x || !x.clientId) return false;
      const at = localEntryAtMs_(x);
      return at >= cut;
    });
  }

  function readLocalList_() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_LIST_KEY) || "[]");
      const list = Array.isArray(raw) ? raw : [];
      const fresh = pruneLocalList18h_(list);
      if (fresh.length !== list.length) {
        try {
          localStorage.setItem(LOCAL_LIST_KEY, JSON.stringify(fresh.slice(0, 200)));
        } catch (_) {}
      }
      return fresh;
    } catch {
      return [];
    }
  }

  function writeLocalList_(list) {
    try {
      const fresh = pruneLocalList18h_(list);
      localStorage.setItem(LOCAL_LIST_KEY, JSON.stringify(fresh.slice(0, 200)));
    } catch (_) {}
  }

  function upsertLocalList_(entry) {
    const list = readLocalList_().filter((x) => x.clientId !== entry.clientId);
    list.unshift(entry);
    writeLocalList_(list);
  }

  /** Si ya salió de la cola, deja de marcar "pending" en el historial local. */
  function reconcileLocalListStatus_() {
    const pending = pendingIds_();
    const list = readLocalList_();
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      if (!x || !x.clientId) continue;
      const stillPending = pending.has(x.clientId);
      const next = stillPending ? "pending" : "sent";
      if (x.status !== next) {
        x.status = next;
        changed = true;
      }
    }
    if (changed) writeLocalList_(list);
    return list;
  }

  /** Envíos locales frescos (≤18 h), más reciente primero */
  function localSendsLast18h_() {
    return reconcileLocalListStatus_()
      .filter((x) => x && x.clientId)
      .sort((a, b) => localEntryAtMs_(b) - localEntryAtMs_(a));
  }

  function saveDraft_() {
    try {
      // Guardar en cartilla O resumen (no perder datos al minimizar / cortar app)
      if (!state.cartilla) return;
      if (state.screen !== "cartilla" && state.screen !== "resumen") return;
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          cartilla: state.cartilla,
          muestraIndex: state.muestraIndex,
          screen: state.screen,
          at: Date.now(),
        })
      );
    } catch (_) {}
  }

  /** Persistencia inmediata (SW update / pagehide / background) */
  function persistNow_() {
    try {
      saveDraft_();
    } catch (_) {}
  }

  function hasWorkInProgress_() {
    if (state.cartilla) return true;
    try {
      if (loadDraft_()) return true;
    } catch (_) {}
    try {
      if (QB.API && QB.API.pendingCount && QB.API.pendingCount() > 0) return true;
    } catch (_) {}
    return false;
  }

  function toastSoft_(msg, type) {
    try {
      toast(msg, type || "info");
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

  function readSession_() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      const dni = String(s && s.dni || "").replace(/\D/g, "");
      if (!/^\d{8}$/.test(dni)) return null;
      return { dni, nombre: String(s.nombre || "").trim() };
    } catch {
      return null;
    }
  }

  function writeSession_(session) {
    try {
      if (!session) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (_) {}
  }

  function setAuthUi_(authed) {
    const on = !!authed;
    document.documentElement.classList.toggle("qb-authed", on);
    document.documentElement.classList.toggle("qb-locked", !on);
    document.body.classList.toggle("qb-authed", on);
    document.body.classList.toggle("qb-locked", !on);
  }

  function setLoginStep_(step) {
    const form = $("#qb-login-form");
    const dniField = $("#login-field-dni");
    const passField = $("#login-field-pass");
    const nextBtn = $("#btn-login-next");
    const loginBtn = $("#btn-login");
    const backBtn = $("#btn-login-back");
    const lead = $("#login-lead");
    const n = step === 2 ? 2 : 1;
    if (form) form.dataset.loginStep = String(n);
    if (dniField) dniField.hidden = n !== 1;
    if (passField) passField.hidden = n !== 2;
    if (nextBtn) nextBtn.hidden = n !== 1;
    if (loginBtn) loginBtn.hidden = n !== 2;
    if (backBtn) backBtn.hidden = n !== 2;
    if (lead) {
      lead.textContent =
        n === 1 ? "Paso 1 de 2 · Ingresa tu DNI" : "Paso 2 de 2 · Ingresa tu contraseña";
    }
    $$("[data-step-dot]").forEach((dot) => {
      dot.classList.toggle("is-on", Number(dot.getAttribute("data-step-dot")) <= n);
    });
  }

  function setLoginLoading_(on) {
    const form = $("#qb-login-form");
    const loading = $("#login-loading");
    if (form) form.classList.toggle("is-loading", !!on);
    if (loading) loading.hidden = !on;
  }

  function showLogin_(message) {
    setAuthUi_(false);
    const gate = $("#qb-login");
    const err = $("#login-error");
    if (gate) gate.hidden = false;
    setLoginLoading_(false);
    setLoginStep_(1);
    if (err) {
      err.hidden = !message;
      err.textContent = message || "";
    }
  }

  function hideLogin_() {
    setAuthUi_(true);
    const gate = $("#qb-login");
    if (gate) gate.hidden = true;
  }

  function requireSession_(opts) {
    const session = readSession_();
    if (session) return session;
    if (!opts || opts.show !== false) showLogin_((opts && opts.message) || "");
    return null;
  }

  function applySession_(session) {
    if (!session) return;
    writePrefs_({ evaluadorId: session.dni, evaluadorNombre: session.nombre || "" });
    const sub = $("#home-session");
    if (sub) {
      const corto = QB.Data && QB.Data.shortName ? QB.Data.shortName(session.nombre) : "";
      sub.textContent = corto || session.nombre || session.dni;
    }
  }

  function logout_(message) {
    writeSession_(null);
    writePrefs_({ evaluadorId: "", evaluadorNombre: "" });
    state.create.evaluadorId = "";
    state.create.evaluadorNombre = "";
    state.cartilla = null;
    try {
      clearDraft_();
    } catch (_) {}
    try {
      closeCreateModal({ force: true });
    } catch (_) {}
    try {
      closeSyncModal();
    } catch (_) {}
    try {
      showScreen("home");
    } catch (_) {}
    showLogin_(message || "");
  }

  function loginNextStep_() {
    const dniEl = $("#login-dni");
    const err = $("#login-error");
    const dni = String((dniEl && dniEl.value) || "").replace(/\D/g, "");
    const say = (msg) => {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || "";
    };
    if (!/^\d{8}$/.test(dni)) {
      say("El DNI debe tener 8 dígitos.");
      dniEl && dniEl.focus();
      return;
    }
    if (dniEl) dniEl.value = dni;
    say("");
    setLoginStep_(2);
    setTimeout(() => $("#login-pass")?.focus(), 60);
  }

  async function entrar_() {
    const form = $("#qb-login-form");
    const step = Number(form && form.dataset.loginStep) || 1;
    if (step < 2) {
      loginNextStep_();
      return;
    }
    const dniEl = $("#login-dni");
    const passEl = $("#login-pass");
    const dni = String((dniEl && dniEl.value) || "").replace(/\D/g, "");
    const pass = String((passEl && passEl.value) || "").replace(/\D/g, "");
    const err = $("#login-error");
    const say = (msg) => {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || "";
    };
    if (!/^\d{8}$/.test(dni)) {
      setLoginStep_(1);
      say("El DNI debe tener 8 dígitos.");
      return;
    }
    if (pass !== dni) {
      say("Contraseña incorrecta.");
      return;
    }
    const btn = $("#btn-login");
    if (btn) btn.disabled = true;
    say("");
    setLoginLoading_(true);
    let res = null;
    try {
      res = await QB.API.checkAcceso(dni);
    } catch (_) {
      res = null;
    }
    if (btn) btn.disabled = false;
    if (!res || res.offline || res.activo == null) {
      setLoginLoading_(false);
      say("Sin señal. Entra cuando tengas internet.");
      return;
    }
    if (res.activo !== true) {
      setLoginLoading_(false);
      say("Sin acceso. Este DNI está desactivado.");
      return;
    }
    const session = { dni, nombre: res.nombre || "" };
    writeSession_(session);
    applySession_(session);
    if (passEl) passEl.value = "";
    setLoginLoading_(false);
    hideLogin_();
    showScreen("home");
    updateOnlineUi();
    updatePendingUi();
    renderHomeList();
    ensureNotifyPermission_().catch(() => {});
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
      disabled: !!c.disabled,
    }));
    if (!q) return list;
    return list.filter(
      (o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
  }

  function fundoOptions_(query) {
    const q = String(query || "").trim().toLowerCase();
    const list = (QB.FUNDOS || []).map((f) => ({
      id: f.id,
      label: f.label,
      meta: f.meta || "Fundo",
    }));
    if (!q) return list;
    return list.filter(
      (o) => o.label.toLowerCase().includes(q) || String(o.id).toLowerCase().includes(q)
    );
  }

  function fundoLabelFromId_(id) {
    const hit = (QB.FUNDOS || []).find((f) => f.id === id);
    return hit ? hit.label : "";
  }

  function resetCreateForm_() {
    const prefs = readPrefs_();
    const defaultCartilla = (QB.CARTILLAS && QB.CARTILLAS[0]) || {
      id: "proyecciones",
      label: "Fenología",
    };
    const session = readSession_();
    const campana = defaultCampana_();
    const fundoId = String((prefs && prefs.fundoId) || "").trim();
    const fundoLabel =
      String((prefs && prefs.fundoLabel) || "").trim() || fundoLabelFromId_(fundoId);
    // Tras guardar, módulo/turno/lote quedan vacíos para elegir de nuevo
    state.create = {
      evaluadorId: (session && session.dni) || "",
      evaluadorNombre: (session && session.nombre) || "",
      cartillaId: defaultCartilla.id,
      cartillaLabel: defaultCartilla.label,
      campana,
      fundoId,
      fundoLabel,
      modulo: "",
      turno: "",
      loteId: "",
      loteMeta: null,
    };
    setSelectLabel($("#sel-cartilla"), defaultCartilla.label || "");
    setCampanaLabel_(campana);
    setSelectLabel($("#sel-fundo"), fundoLabel || "");
    setSelectLabel($("#sel-modulo"), "");
  }

  function clearSelectsAfterSave_() {
    writePrefs_({
      modulo: "",
      turno: "",
      fundoId: "",
      fundoLabel: "",
      cartillaId: "proyecciones",
      cartillaLabel: "Fenología",
    });
    state.create.modulo = "";
    state.create.turno = "";
    state.create.loteId = "";
    state.create.loteMeta = null;
    state.create.fundoId = "";
    state.create.fundoLabel = "";
    state.create.cartillaId = "proyecciones";
    state.create.cartillaLabel = "Fenología";
    setSelectLabel($("#sel-cartilla"), "Fenología");
    setSelectLabel($("#sel-fundo"), "");
    setSelectLabel($("#sel-modulo"), "");
  }

  async function openCreateModal() {
    if (!requireSession_()) return;
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
    createOpenedAt_ = Date.now();
    modal.hidden = false;
    modal.classList.add("open");
    document.body.classList.add("create-modal-open");
  }

  let createOpenedAt_ = 0;

  function closeCreateModal(opts) {
    const modal = $("#create-modal");
    if (!modal) return;
    // Evita que el mismo toque de CREAR cierre el modal al instante
    if (!(opts && opts.force) && Date.now() - createOpenedAt_ < 450) return;
    modal.classList.remove("open");
    document.body.classList.remove("create-modal-open");
    setTimeout(() => {
      modal.hidden = true;
      // Tras cerrar modal: si estamos en home, CREAR debe verse
      if (state.screen === "home") ensureHomeCreateBar_();
    }, 180);
  }

  function openCartillaSelect() {
    QB.PreciseSelect.open({
      title: "Cartilla",
      hideSearch: true,
      value: state.create.cartillaId,
      getOptions: (q) => cartillaOptions_(q),
      onSelect: (opt) => {
        if (!opt || opt.disabled) {
          toast("Biometría aún no está disponible", "warn");
          return;
        }
        state.create.cartillaId = opt.id;
        state.create.cartillaLabel = opt.label;
        setSelectLabel($("#sel-cartilla"), opt.label);
        writePrefs_({ cartillaId: opt.id, cartillaLabel: opt.label });
      },
    });
  }

  function openFundoSelect() {
    QB.PreciseSelect.open({
      title: "Fundo",
      hideSearch: true,
      value: state.create.fundoId,
      getOptions: (q) => fundoOptions_(q),
      onSelect: (opt) => {
        if (!opt) return;
        const changed = String(state.create.fundoId || "") !== String(opt.id || "");
        state.create.fundoId = opt.id;
        state.create.fundoLabel = opt.label;
        setSelectLabel($("#sel-fundo"), opt.label);
        writePrefs_({ fundoId: opt.id, fundoLabel: opt.label });
        // Al cambiar fundo, limpia módulo (turno/lote se eligen en la cartilla)
        if (changed) {
          state.create.modulo = "";
          state.create.turno = "";
          state.create.loteId = "";
          state.create.loteMeta = null;
          setSelectLabel($("#sel-modulo"), "");
        }
      },
    });
  }

  function openModuloSelect() {
    if (!state.create.fundoId) {
      toast("Elige fundo primero", "warn");
      return;
    }
    QB.PreciseSelect.open({
      title: "Módulo",
      hideSearch: true,
      value: state.create.modulo,
      getOptions: (q) => QB.Data.moduloOptions(q, state.create.fundoId),
      onSelect: (opt) => {
        state.create.modulo = opt.id;
        state.create.turno = "";
        state.create.loteId = "";
        state.create.loteMeta = null;
        setSelectLabel($("#sel-modulo"), opt.label);
      },
    });
  }

  /** Pregunta a la nube. Solo bloquea si responde activo:false. Sin señal no cierra la sesión. */
  async function revisarAccesoDni_(dni, opts) {
    const id = String(dni || "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(id) || !QB.API.checkAcceso) return true;
    let res;
    try {
      res = await QB.API.checkAcceso(id);
    } catch (_) {
      return true; // fallo de red/JS: no tumbar sesión
    }
    if (!res || res.offline || res.activo == null) return true;
    if (res.activo === true) return true;
    toast("Sin acceso. Este DNI está desactivado.", "warn");
    if (opts && opts.clear) {
      // No expulsar a mitad de cartilla/borrador: primero que guarde
      if (state.cartilla || loadDraft_()) {
        toast("Termina y guarda tu cartilla. Luego se cerrará el acceso.", "warn");
        return false;
      }
      logout_("Sin acceso. Este DNI está desactivado.");
    }
    return false;
  }

  function confirmCreate() {
    const c = state.create;
    const session = readSession_();
    if (!session || !session.dni) {
      toast("Inicia sesión para crear", "warn");
      showLogin_("");
      return;
    }
    c.evaluadorId = session.dni;
    c.evaluadorNombre = session.nombre || c.evaluadorNombre || "";
    if (!c.cartillaId) {
      toast("Selecciona cartilla", "warn");
      return;
    }
    const cartillaDef = (QB.CARTILLAS || []).find((x) => x.id === c.cartillaId);
    if (cartillaDef && cartillaDef.disabled) {
      toast("Esa cartilla aún no está disponible", "warn");
      return;
    }
    if (!c.fundoId) {
      toast("Selecciona fundo", "warn");
      return;
    }
    if (!c.modulo) {
      toast("Selecciona módulo", "warn");
      return;
    }
    const campana = normalizeCampana_(c.campana || defaultCampana_());
    writePrefs_({
      evaluadorId: c.evaluadorId,
      evaluadorNombre: c.evaluadorNombre,
      cartillaId: c.cartillaId,
      cartillaLabel: c.cartillaLabel,
      fundoId: c.fundoId,
      fundoLabel: c.fundoLabel,
      campana,
      modulo: c.modulo,
      turno: "",
    });
    const fundoLabel = c.fundoLabel || fundoLabelFromId_(c.fundoId) || "";
    const cartilla = emptyCartilla_({
      clientId: QB.API.newClientId(),
      fecha: todayISO_(),
      evaluadorId: c.evaluadorId,
      evaluadorNombre: c.evaluadorNombre,
      cartillaId: c.cartillaId,
      cartillaLabel: c.cartillaLabel || "Fenología",
      campana,
      fundoId: String(c.fundoId || ""),
      modulo: QB.Data.normalizeModulo(c.modulo),
      turno: "",
      loteId: "",
      loteNum: "",
      loteCode: "",
      etapa: fundoLabel,
      fundo: fundoLabel,
      variedad: "",
      area: "",
      observacion: "",
    });
    // Abrir ya: el GET de acceso a Google puede tardar varios segundos
    closeCreateModal({ force: true });
    openCartilla(cartilla, 0);
    // Turno/lote formales al iniciar (no en el modal CREAR)
    setTimeout(() => {
      if (state.cartilla === cartilla && !cartillaHasLocus_(cartilla)) {
        openCartillaTurnoSelect_();
      }
    }, 280);
    revisarAccesoDni_(c.evaluadorId, { clear: true });
  }

  /* ——— Cartilla ——— */
  let cartillaReadyAt_ = 0;

  function openCartilla(cartilla, muestraIndex) {
    if (!requireSession_()) return;
    state.cartilla = cartilla;
    const total = sampleCount_(cartilla);
    state.muestraIndex = Math.max(0, Math.min(total - 1, Number(muestraIndex) || 0));
    // Bloquea RESUMEN un momento: el toque de CREAR no debe disparar el paso siguiente
    cartillaReadyAt_ = Date.now() + 700;
    const resumenBtn = $("#btn-ir-resumen");
    if (resumenBtn) resumenBtn.style.pointerEvents = "none";
    showScreen("cartilla");
    renderCartilla();
    saveDraft_();
          setTimeout(() => {
      const btn = $("#btn-ir-resumen");
      if (btn) btn.style.pointerEvents = "";
    }, 700);
  }

  function renderResumen_() {
    const c = state.cartilla;
    if (!c) return;
    const samples = ensureSamples_(c).filter(sampleHasData_);
    const sub = $("#resumen-code-sub");
    const metaEl = $("#resumen-meta");
    const listEl = $("#resumen-samples");
    const obsEl = $("#resumen-obs");
    if (sub) sub.textContent = c.loteCode || "Resumen";
    if (metaEl) {
      metaEl.innerHTML = `
        <div class="resumen-meta-main">
          <p class="resumen-meta-kicker">Ubicación · módulo fijo</p>
          <strong class="resumen-meta-lote">${escapeHtml(c.modulo || "—")}</strong>
          <div class="resumen-meta-row">
            <span><em>Módulo</em><b>${escapeHtml(c.modulo || "—")}</b></span>
            <span><em>Activo</em><b>${escapeHtml(c.loteCode || "—")}</b></span>
          </div>
        </div>
        <div class="resumen-meta-side">
          <span><em>Campaña</em><b>${escapeHtml(c.campana || defaultCampana_())}</b></span>
          <span><em>Muestras</em><b>${samples.length}</b></span>
        </div>`;
    }
    const fields = QB.SAMPLE_FIELDS || [];
    if (listEl) {
      const locusCounters = Object.create(null);
      listEl.innerHTML = samples
        .map((s) => {
          const loc = sampleLocusOrCartilla_(s, c);
          const key = locusKeyFrom_(loc) || "_";
          locusCounters[key] = (locusCounters[key] || 0) + 1;
          const n = locusCounters[key];
          const cells = fields
            .map((f) => {
              const v = s[f.id];
              const show = escapeHtml(displayFieldVal_(v));
              const full = f.id === "e5" ? " is-full" : "";
              return `<div class="resumen-cell${full}"><em>${escapeHtml(f.label)}</em><b>${show}</b></div>`;
            })
            .join("");
          const sampleObs = String(s.observacion || "").trim();
          return `<article class="resumen-sample">
            <header>
              <span>Muestra ${n}</span>
              <strong>${escapeHtml(loc.loteCode || "—")}</strong>
            </header>
            <div class="resumen-meta-row" style="margin:6px 0 10px">
              <span><em>Turno</em><b>${escapeHtml(loc.turno || "—")}</b></span>
              <span><em>Lote</em><b>${escapeHtml(loc.loteNum || "—")}</b></span>
            </div>
            <div class="resumen-grid">${cells}</div>
            <div class="resumen-sample-obs"><em>Observación</em><b>${
              sampleObs ? escapeHtml(sampleObs) : "—"
            }</b></div>
          </article>`;
        })
        .join("");
    }
    if (obsEl) obsEl.hidden = true;
  }

  let resumenReadyAt_ = 0;

  async function irResumen_() {
    if (!requireSession_()) return;
    if (!state.cartilla) return;
    if (Date.now() < cartillaReadyAt_) return;
    // Ghost-click tras cerrar cámara / tomar foto
    if (Date.now() < cameraGuardUntil_) return;
    if (!requireCartillaLocus_()) return;
    const c = state.cartilla;
    pruneEmptySamples_(c);
    renderCartilla();
    const samples = ensureSamples_(c).filter(sampleHasData_);
    if (!samples.length) {
      await feedback({
        title: "No hay data",
        text: "No se puede continuar. Completa al menos un campo en la muestra antes de ver el resumen.",
        type: "warn",
        confirmText: "Entendido",
      });
      return;
    }
    const emptyIdx = emptySampleIndexes_(c);
    if (emptyIdx.length) {
      await feedback({
        title: "Hay muestras vacías",
        text: `Completa o quita estas muestras antes del resumen: ${emptyIdx
          .map((n) => `Muestra ${n}`)
          .join(", ")}.`,
        type: "warn",
        confirmText: "Entendido",
      });
      return;
    }
    saveDraft_();
    renderResumen_();
    // Evita que el mismo toque de RESUMEN dispare GUARDAR
    resumenReadyAt_ = Date.now() + 900;
    showScreen("resumen");
  }

  function volverEditarResumen_() {
    if (!state.cartilla) {
      showScreen("home");
      return;
    }
    showScreen("cartilla");
    renderCartilla();
  }

  function renderCartillaLocusBar_(c, sample) {
    const loc = sampleLocusOrCartilla_(sample, c) || locusFromCartilla_(c);
    const codeEl = $("#cartilla-locus-code");
    const turnoBtn = $("#btn-cartilla-turno");
    const loteBtn = $("#btn-cartilla-lote");
    if (codeEl) codeEl.textContent = loc.loteCode || c.loteCode || "—";
    if (turnoBtn) {
      const t = String(loc.turno || c.turno || "").trim();
      turnoBtn.textContent = t ? `Turno ${t}` : "Turno";
      turnoBtn.classList.toggle("is-empty", !t);
    }
    if (loteBtn) {
      const l = String(loc.loteNum || c.loteNum || "").trim();
      loteBtn.textContent = l ? `Lote ${l}` : "Lote";
      loteBtn.classList.toggle("is-empty", !l);
    }
  }

  function openCartillaTurnoSelect_() {
    const c = state.cartilla;
    if (!c || !QB.PreciseSelect) return;
    if (!c.modulo) {
      toast("Sin módulo en la cartilla", "warn");
      return;
    }
    const fundoId = cartillaFundoId_(c);
    QB.PreciseSelect.open({
      title: "Seleccionar turno",
      hideSearch: true,
      value: String(c.turno || ""),
      getOptions: (q) => QB.Data.turnoOptions(c.modulo, q, fundoId),
      onSelect: (opt) => {
        if (!opt) return;
        const nextTurno = String(opt.id || "").trim();
        if (!nextTurno) return;
        const changed = String(c.turno || "") !== nextTurno;
        c.turno = nextTurno;
        if (changed) {
          c.loteId = "";
          c.loteNum = "";
          c.loteCode = "";
          c.variedad = "";
          c.area = "";
        }
        renderCartilla();
        saveDraft_();
        if (changed) {
          toast("Elige el lote para este turno", "warn");
          setTimeout(() => openCartillaLoteSelect_(), 180);
        }
      },
    });
  }

  function openCartillaLoteSelect_() {
    const c = state.cartilla;
    if (!c || !QB.PreciseSelect) return;
    if (!c.modulo) {
      toast("Sin módulo en la cartilla", "warn");
      return;
    }
    if (!c.turno) {
      toast("Selecciona turno primero", "warn");
      return;
    }
    const fundoId = cartillaFundoId_(c);
    const prevLocus = locusFromCartilla_(c);
    const prevKey = locusKeyFrom_(prevLocus);
    QB.PreciseSelect.open({
      title: "Seleccionar lote",
      hideSearch: true,
      value: String(c.loteId || ""),
      getOptions: (q) => QB.Data.lotesForModuloTurno(c.modulo, c.turno, q, fundoId),
      onSelect: (opt) => {
        if (!opt) return;
        const meta = opt.raw || QB.Data.loteMeta(opt.id) || {
          id: opt.id,
          turno: c.turno,
          lote: String(opt.label || "").replace(/^Lote\s+/i, ""),
          modulo: c.modulo,
          codLote: opt.id,
        };
        // Antes de cambiar: fija turno/lote en muestras ya llenadas (no mezclar)
        if (prevKey) freezeUnstampedSamples_(c, prevLocus);

        applyLocusToCartilla_(c, {
          ...meta,
          id: opt.id,
          loteId: opt.id,
          loteNum: meta.lote,
        });
        const newKey = cartillaLocusKey_(c);
        if (!newKey) {
          toast("No se pudo enlazar el lote", "error");
          return;
        }
        if (newKey !== prevKey) {
          // Siempre muestra nueva en blanco: no hereda inputs/foto del lote anterior
          startNewLocusSeries_(c);
          toast(`Enlazado · ${c.loteCode} · muestra 1`, "ok");
        } else {
          const sample = ensureSampleObj_();
          if (sample && !sampleHasContent_(sample)) {
            // Misma ubicación: limpia por si quedó basura visual y sella
            const clean = freshBlankSample_(locusFromCartilla_(c));
            c.samples[state.muestraIndex] = clean;
          }
          toast(`Enlazado · ${c.loteCode}`, "ok");
        }
        // Fuerza UI limpia (inputs + foto) de la muestra activa
        renderCartilla();
        saveDraft_();
      },
    });
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
    const sample = c.samples[state.muestraIndex] || emptySample_(locusFromCartilla_(c));
    const loc = sampleLocusOrCartilla_(sample, c);
    const groupKey = sampleLocusKey_(sample, c) || cartillaLocusKey_(c);
    const groupIdxs = indicesForLocusKey_(samples, c, groupKey);
    const localPos = Math.max(0, groupIdxs.indexOf(state.muestraIndex));
    const localTotal = Math.max(1, groupIdxs.length || 1);
    if (codeEl) codeEl.value = loc.loteCode || c.loteCode || "";
    if (codeSub) codeSub.textContent = loc.loteCode || c.loteCode || "Nueva cartilla";
    if (numEl) numEl.textContent = `${localPos + 1} / ${localTotal}`;
    if (verEl) verEl.textContent = (QB.CONFIG && QB.CONFIG.VERSION) || "1.0";
    if (prevBtn) prevBtn.disabled = localPos <= 0 && state.muestraIndex <= 0;
    if (nextBtn) {
      const canGoLaterSample = state.muestraIndex < total - 1;
      const canAddInGroup = localPos < SAMPLE_MAX() - 1;
      nextBtn.disabled = !canGoLaterSample && !canAddInGroup && localPos >= localTotal - 1;
    }
    renderCartillaLocusBar_(c, sample);

    const root = $("#cartilla-fields");
    if (!root) return;
    const fieldsHtml = (QB.SAMPLE_FIELDS || [])
      .map((f) => {
        const val = sample[f.id] != null ? sample[f.id] : "";
        return `<label class="cartilla-row">
          <span class="cartilla-row-label">${escapeHtml(f.label)}</span>
          <input type="text" inputmode="decimal" enterkeyhint="next" data-field="${escapeAttr(f.id)}" value="${escapeAttr(val)}" autocomplete="off" />
        </label>`;
      })
      .join("");

    const hasPhoto = !!sample.photoDataUrl;
    root.innerHTML =
      fieldsHtml +
      `<div class="cartilla-photo" id="cartilla-photo">
        <span class="cartilla-photo-label">Foto de referencia · 1 por muestra</span>
        <img class="cartilla-photo-preview${hasPhoto ? " has-photo" : ""}" id="cartilla-photo-preview" alt="Vista previa" ${
          hasPhoto ? `src="${sample.photoDataUrl}"` : ""
        } />
        <p class="cartilla-photo-meta" id="cartilla-photo-meta">${
          hasPhoto
            ? `Lista · ${escapeHtml(sample.photoTakenAt || "con fecha/hora")}`
            : "Abre la cámara · se marca fecha y hora en la imagen"
        }</p>
        <div class="cartilla-photo-actions">
          <button type="button" class="cartilla-photo-btn primary" id="btn-photo-take">${
            hasPhoto ? "Reemplazar foto" : "Tomar foto"
          }</button>
          <button type="button" class="cartilla-photo-btn" id="btn-photo-clear" ${
            hasPhoto ? "" : "hidden"
          }>Quitar</button>
        </div>
      </div>
      <label class="cartilla-obs">
        <span>Observación</span>
        <textarea id="cartilla-obs" rows="3" placeholder="Opcional · solo esta muestra">${escapeHtml(
          sample.observacion || ""
        )}</textarea>
      </label>`;

    const fieldInputs = [...root.querySelectorAll("input[data-field]")];
    fieldInputs.forEach((inp, idx) => {
      inp.addEventListener("input", () => {
        const id = inp.dataset.field;
        ensureSampleObj_();
        state.cartilla.samples[state.muestraIndex][id] = inp.value;
        saveDraft_();
      });
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
        ensureSampleObj_();
        state.cartilla.samples[state.muestraIndex].observacion = obs.value;
        saveDraft_();
      });
    }
    bindPhotoUi_();
  }

  function ensureSampleObj_() {
    if (!state.cartilla) return null;
    if (!state.cartilla.samples[state.muestraIndex]) {
      state.cartilla.samples[state.muestraIndex] = emptySample_(
        locusFromCartilla_(state.cartilla)
      );
    }
    return state.cartilla.samples[state.muestraIndex];
  }

  function limaStampText_() {
    try {
      return new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
    } catch {
      return new Date().toLocaleString("es-PE");
    }
  }

  function stampAndCompressCanvas_(srcCanvas) {
    const maxEdge = Number(QB.CONFIG && QB.CONFIG.PHOTO_MAX_EDGE) || 1280;
    const quality0 = Number(QB.CONFIG && QB.CONFIG.PHOTO_QUALITY) || 0.72;
    const targetKb = Number(QB.CONFIG && QB.CONFIG.PHOTO_TARGET_KB) || 320;
    let w = srcCanvas.width;
    let h = srcCanvas.height;
    const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas");
    ctx.drawImage(srcCanvas, 0, 0, w, h);
    const stamp = limaStampText_();
    const pad = Math.max(10, Math.round(w * 0.02));
    const fontSize = Math.max(16, Math.round(w * 0.035));
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = "bottom";
    const tw = ctx.measureText(stamp).width;
    const boxH = fontSize + pad;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(pad - 6, h - boxH - pad + 6, tw + 16, boxH);
    ctx.fillStyle = "#fff";
    ctx.fillText(stamp, pad, h - pad);
    let q = quality0;
    let dataUrl = canvas.toDataURL("image/jpeg", q);
    while (dataUrl.length * 0.75 > targetKb * 1024 && q > 0.45) {
      q -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", q);
    }
    return { dataUrl, stamp };
  }

  function compressPhotoWithStamp_(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        try {
          resolve(stampAndCompressCanvas_(canvas));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo leer la foto"));
      };
      img.src = url;
    });
  }

  let cameraStream_ = null;

  function armCameraGuard_(ms) {
    cameraGuardUntil_ = Date.now() + (ms || 900);
    cartillaReadyAt_ = Math.max(cartillaReadyAt_, cameraGuardUntil_);
    const resumenBtn = $("#btn-ir-resumen");
    const bar = document.querySelector("body > .form-actions.proy-cartilla");
    if (resumenBtn) {
      resumenBtn.style.pointerEvents = "none";
    setTimeout(() => {
        if (resumenBtn) resumenBtn.style.pointerEvents = "";
      }, ms || 900);
    }
    if (bar) {
      bar.style.pointerEvents = "none";
    setTimeout(() => {
        if (bar && state.screen === "cartilla") bar.style.pointerEvents = "auto";
      }, ms || 900);
    }
  }

  function stopCamera_() {
    armCameraGuard_(950);
    if (cameraStream_) {
      try {
        cameraStream_.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      cameraStream_ = null;
    }
    const video = $("#qb-camera-video");
    if (video) {
      try {
        video.srcObject = null;
      } catch (_) {}
    }
    const root = $("#qb-camera");
    if (root) {
      root.classList.remove("open");
      root.hidden = true;
    }
  }

  async function openCamera_() {
    const root = $("#qb-camera");
    const video = $("#qb-camera-video");
    if (!root || !video) {
      toast("Cámara no disponible", "error");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Este celular no permite cámara en la app", "warn");
      return;
    }
    stopCamera_();
    setLoader(true, "Abriendo cámara…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      cameraStream_ = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      root.hidden = false;
      requestAnimationFrame(() => root.classList.add("open"));
    } catch (err) {
      toast("Permite el acceso a la cámara para tomar la foto", "warn");
    } finally {
      setLoader(false);
    }
  }

  async function captureCameraShot_() {
    const video = $("#qb-camera-video");
    const canvas = $("#qb-camera-canvas");
    if (!video || !canvas || !cameraStream_) {
      toast("Cámara no lista", "warn");
      return;
    }
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    if (!w || !h) {
      toast("Espera un segundo y vuelve a disparar", "warn");
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    setLoader(true, "Procesando foto…");
    try {
      const { dataUrl, stamp } = stampAndCompressCanvas_(canvas);
      const s = ensureSampleObj_();
      if (!s) return;
      // Solo esta muestra (índice actual). No se copia a otras.
      s.photoDataUrl = dataUrl;
      s.photoTakenAt = stamp;
      if (!s.sampleId) s.sampleId = newSampleId_();
      saveDraft_();
      stopCamera_();
      // Quedarse en cartilla llenando (no saltar a resumen por ghost-click)
      if (state.cartilla) {
        state.screen = "cartilla";
        showScreen("cartilla");
        renderCartilla();
      }
      // Después de showScreen (que re-habilita la barra): rearmar el bloqueo
      armCameraGuard_(1100);
      {
        const c = state.cartilla;
        const samples = c ? ensureSamples_(c) : [];
        const cur = samples[state.muestraIndex];
        const key = c ? sampleLocusKey_(cur, c) || cartillaLocusKey_(c) : "";
        const idxs = c ? indicesForLocusKey_(samples, c, key) : [];
        const local = Math.max(0, idxs.indexOf(state.muestraIndex)) + 1;
        toast(`Foto en muestra ${local} · con fecha y hora`, "ok");
      }
    } catch (_) {
      toast("No se pudo guardar la foto", "error");
      armCameraGuard_(700);
    } finally {
      setLoader(false);
    }
  }

  function bindPhotoUi_() {
    const takeBtn = $("#btn-photo-take");
    const clearBtn = $("#btn-photo-clear");
    if (takeBtn) {
      takeBtn.onclick = (e) => {
        e.preventDefault();
        openCamera_();
      };
    }
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.preventDefault();
        const s = ensureSampleObj_();
        if (!s) return;
        s.photoDataUrl = "";
        s.photoTakenAt = "";
        saveDraft_();
        renderCartilla();
      };
    }
  }

  function bindCameraSheet_() {
    if (bindCameraSheet_._done) return;
    bindCameraSheet_._done = true;
    const shot = $("#qb-camera-shot");
    const closeBtn = $("#qb-camera-close");
    // click nativo + stopPropagation: evita que el toque caiga en RESUMEN
    if (shot) {
      shot.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          captureCameraShot_();
        },
        true
      );
    }
    if (closeBtn) {
      closeBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          stopCamera_();
        },
        true
      );
    }
    $("#qb-camera")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "qb-camera") {
        e.preventDefault();
        e.stopPropagation();
        stopCamera_();
      }
    });
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
    if (dir > 0 && !requireCartillaLocus_()) return;
    const c = state.cartilla;
    const samples = ensureSamples_(c);
    const cur = samples[state.muestraIndex] || emptySample_(locusFromCartilla_(c));
    const groupKey = sampleLocusKey_(cur, c) || cartillaLocusKey_(c);
    let idxs = indicesForLocusKey_(samples, c, groupKey);
    if (!idxs.length) {
      idxs = [state.muestraIndex];
    }
    let pos = idxs.indexOf(state.muestraIndex);
    if (pos < 0) pos = 0;

    if (dir < 0) {
      if (pos > 0) {
        state.muestraIndex = idxs[pos - 1];
      } else if (state.muestraIndex > 0) {
        // Del 114 ← vuelve al 113 con su data sellada (sin mezclar)
        state.muestraIndex = state.muestraIndex - 1;
      } else {
        return;
      }
    } else {
      if (pos < idxs.length - 1) {
        state.muestraIndex = idxs[pos + 1];
      } else if (state.muestraIndex < samples.length - 1) {
        // Si más adelante hay otro lote (ej. 114), avanza ahí
        state.muestraIndex = state.muestraIndex + 1;
      } else {
        if (!sampleHasData_(samples[state.muestraIndex])) {
          await feedback({
            title: "Muestra vacía",
            text: "Completa al menos un campo antes de agregar otra muestra.",
            type: "warn",
            confirmText: "Entendido",
          });
          return;
        }
        if (idxs.length >= SAMPLE_MAX() || samples.length >= SAMPLE_MAX()) return;
        const locus = sampleLocusOrCartilla_(samples[state.muestraIndex], c);
        samples.push(freshBlankSample_(locus || locusFromCartilla_(c)));
        state.muestraIndex = samples.length - 1;
      }
    }
    // Siempre alinea barra Turno/Lote a LA muestra visible (data fija)
    syncCartillaToSampleLocus_(c, samples[state.muestraIndex]);
    renderCartilla();
    saveDraft_();
  }

  function syncCartillaToSampleLocus_(c, sample) {
    if (!c || !sample) return;
    const locus = sampleLocusOrCartilla_(sample, c);
    if (!locus) return;
    c.turno = locus.turno || c.turno;
    c.loteId = locus.loteId || c.loteId;
    c.loteNum = locus.loteNum || c.loteNum;
    c.loteCode = locus.loteCode || c.loteCode;
    if (locus.variedad) c.variedad = locus.variedad;
    if (locus.area !== "" && locus.area != null) c.area = locus.area;
    if (locus.etapa) c.etapa = locus.etapa;
  }

  /** Foto solo de ESA muestra (mismo orden / N° que rows). Nunca se comparte entre muestras. */
  function buildRowsAndPhotosForSave_(cartilla) {
    const semana = isoWeek_(cartilla.fecha);
    const nombre = String(cartilla.evaluadorNombre || "").trim();
    const dni = String(cartilla.evaluadorId || "").replace(/\D/g, "");
    const samples = ensureSamples_(cartilla).filter(sampleHasData_);
    const rows = [];
    const photos = [];
    const horaSubida = limaNowStamp_();
    const locusCounters = Object.create(null);
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] || emptySample_(locusFromCartilla_(cartilla));
      const loc = sampleLocusOrCartilla_(s, cartilla);
      const key = locusKeyFrom_(loc) || "_";
      locusCounters[key] = (locusCounters[key] || 0) + 1;
      const n = locusCounters[key];
      const row = {
        Lote: loc.loteCode || cartilla.loteCode || "",
        Fecha: cartilla.fecha || todayISO_(),
        DNI: dni,
        Nombre: nombre,
        "N° Muestra": n,
        Observación: s.observacion || "",
        Modulo: cartilla.modulo || "",
        Turno: loc.turno || cartilla.turno || "",
        Lotes: loc.loteNum || cartilla.loteNum || "",
        Semana: semana,
        Etapa: loc.etapa || cartilla.etapa || "",
        Variedad: loc.variedad || cartilla.variedad || "",
        Area: loc.area !== "" && loc.area != null ? loc.area : cartilla.area || "",
        Campaña: normalizeCampana_(cartilla.campana || defaultCampana_()),
        Anexo: "",
        // Siempre: con o sin foto
        "Hora subida": horaSubida,
      };
      (QB.SAMPLE_FIELDS || []).forEach((f) => {
        const v = s[f.id];
        row[f.sheet] = v === "" || v == null ? "" : v;
      });
      rows.push(row);

      const raw = String(s.photoDataUrl || "");
      if (raw) {
        const data = raw.replace(/^data:image\/\w+;base64,/, "");
        if (data) {
          photos.push({
            n,
            sampleId: s.sampleId || "",
            mime: "image/jpeg",
            data,
            takenAt: s.photoTakenAt || "",
          });
        }
      }
    }
    return { rows, photos, samples };
  }

  async function guardarCartilla() {
    if (!requireSession_()) return;
    if (state.saving || !state.cartilla) return;
    if (state.screen !== "resumen") {
      await irResumen_();
      return;
    }
    if (Date.now() < resumenReadyAt_) return;
    const c = state.cartilla;
    if (!requireCartillaLocus_()) return;
    // Seguridad: cada muestra con data debe tener su propio turno/lote sellado
    freezeUnstampedSamples_(c, locusFromCartilla_(c));
    pruneEmptySamples_(c);
    const samples = ensureSamples_(c).filter(sampleHasData_);
    const mixed = samples.filter((s) => !sampleLocusKey_(s, c));
    if (mixed.length) {
      await feedback({
        title: "Ubicación incompleta",
        text: "Hay muestras sin turno/lote. Vuelve a la cartilla y selecciónalos antes de guardar.",
        type: "warn",
        confirmText: "Entendido",
      });
      return;
    }
    if (!samples.length) {
      await feedback({
        title: "No hay data",
        text: "No se puede guardar. No hay muestras con datos. Vuelve a editar y completa al menos un campo.",
        type: "warn",
        confirmText: "Entendido",
      });
      return;
    }
    const emptyIdx = emptySampleIndexes_(c);
    if (emptyIdx.length) {
      await feedback({
        title: "No se puede guardar vacío",
        text: `Hay muestras sin datos: ${emptyIdx.map((n) => `Muestra ${n}`).join(", ")}. Vuelve a editar y completa cada muestra.`,
        type: "warn",
        confirmText: "Entendido",
      });
      return;
    }

    state.saving = true;
    setLoader(true, "Guardando…");
    try {
      const clientId = c.clientId || QB.API.newClientId();
      c.clientId = clientId;
      const packed = buildRowsAndPhotosForSave_(c);
      const rows = packed.rows;
      const photos = packed.photos;
      const samplesForSave = packed.samples;
      const nombre = String(c.evaluadorNombre || "").trim();
      const dni = String(c.evaluadorId || "").replace(/\D/g, "");
      const payload = {
        type: "proyecciones",
        sheet: "Proyecciones",
        clientId,
        data: {
          fecha: c.fecha,
          evaluador: dni && nombre ? `${dni} — ${nombre}` : nombre,
          evaluadorId: dni,
          nombre,
          modulo: c.modulo,
          turno: c.turno,
          lote: c.loteCode,
          loteNum: c.loteNum,
          etapa: c.etapa,
          variedad: c.variedad,
          area: c.area,
          campana: normalizeCampana_(c.campana || defaultCampana_()),
          observacion: "",
          sampleCount: rows.length,
        },
        rows,
        photos,
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
        variedad: c.variedad || "",
        area: c.area != null && c.area !== "" ? c.area : "",
        etapa: c.etapa || "",
        campana: normalizeCampana_(c.campana || defaultCampana_()),
        cartillaLabel: c.cartillaLabel || "Fenología",
        evaluador: payload.data.evaluador,
        evaluadorId: dni,
        sampleCount: rows.length,
        samples: samplesForSave.map((s, i) => {
          const o = {
            n: i + 1,
            observacion: s.observacion || "",
            hasPhoto: !!s.photoDataUrl,
            photoTakenAt: s.photoTakenAt || "",
          };
          (QB.SAMPLE_FIELDS || []).forEach((f) => {
            o[f.id] = s[f.id] ?? "";
          });
          return o;
        }),
        status: res && res.queued && !res.synced ? "pending" : "saved",
        at: Date.now(),
      });
      clearDraft_();
      state.cartilla = null;
      clearSelectsAfterSave_();
      renderHomeList();
      showScreen("home");
      ensureHomeCreateBar_();
      // Empuja la cola ya (3G/H+): no esperar al soft timer
      try {
        if (navigator.onLine && QB.API && QB.API.flushQueue) {
          QB.API.flushQueue({ soft: true, includeOld: true, revive: true }).catch(() => {});
        }
      } catch (_) {}
      const n = rows.length;
      const stillPending = res && res.queued && !res.synced;
      await feedback({
        title: res && res.offline ? "Guardado offline" : "Cartilla guardada",
        text: res && res.offline
          ? "Se enviará cuando haya señal."
          : stillPending
            ? `${n} muestra${n === 1 ? "" : "s"} en cola · enviando ahora…`
            : `${n} muestra${n === 1 ? "" : "s"} lista${n === 1 ? "" : "s"} para envío.`,
        type: "ok",
        confirmText: "Listo",
        autoClose: 1600,
      });
      // Tras el feedback: reafirma CREAR (algunos WebViews dejan :has/visibility pegado)
      showScreen("home");
      ensureHomeCreateBar_();
      try {
        if (navigator.onLine && QB.API && QB.API.flushQueue) {
          QB.API.flushQueue({ soft: true, includeOld: true, revive: true }).catch(() => {});
        }
      } catch (_) {}
    } catch (err) {
      await feedback({
        title: "No se pudo guardar",
        text: String(err && err.message ? err.message : err),
        type: "error",
        confirmText: "Entendido",
      });
      if (state.screen === "home") ensureHomeCreateBar_();
    } finally {
      state.saving = false;
      setLoader(false);
      if (state.screen === "home") ensureHomeCreateBar_();
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
    if (state.screen === "home") ensureHomeCreateBar_();
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
    banner.onclick = null;
    fastTap_(banner, () => openCartilla(c, draft.muestraIndex || 0));
  }

  function formatLastSendParts_(ts) {
    const n = Number(ts) || 0;
    if (!n) return { date: "", time: "" };
    try {
      const d = new Date(n);
      const date = new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "short",
      }).format(d);
      const time = new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
      return { date, time };
    } catch {
      const s = new Date(n).toLocaleString("es-PE");
      return { date: s, time: "" };
    }
  }

  function formatLastSendTime_(ts) {
    const p = formatLastSendParts_(ts);
    if (!p.date && !p.time) return "";
    return [p.date, p.time].filter(Boolean).join(", ");
  }

  const LAST_SEND_PAGE_SIZE_ = 4;
  let lastSendDetail_ = {
    sends: [],
    sendIndex: 0,
    samplePage: 0,
  };

  function closeLastSendDetail_() {
    const root = $("#qb-last-detail");
    if (!root) return;
    root.classList.remove("open");
    setTimeout(() => {
      root.hidden = true;
    }, 160);
  }

  function lastSendFieldRows_() {
    // Todos los items EXCEPTO E1–E5 (y sin foto)
    const skip = new Set(["e1", "e2", "e3", "e4", "e5"]);
    return (QB.SAMPLE_FIELDS || []).filter((f) => f && f.id && !skip.has(f.id));
  }

  function currentLastSendEntry_() {
    const sends = lastSendDetail_.sends || [];
    const i = Math.max(0, Math.min(sends.length - 1, Number(lastSendDetail_.sendIndex) || 0));
    lastSendDetail_.sendIndex = i;
    return sends[i] || null;
  }

  function paintLastSendHeader_(entry) {
    const title = $("#qb-last-detail-title");
    const sub = $("#qb-last-detail-sub");
    if (!entry) {
      if (title) title.textContent = "—";
      if (sub) sub.textContent = "";
      return;
    }
    const pending = pendingIds_();
    const isPending = pending.has(entry.clientId) || entry.status === "pending";
    const samples = Array.isArray(entry.samples) ? entry.samples : [];
    const n = Number(entry.sampleCount) || samples.length || 0;
    const parts = formatLastSendParts_(entry.at);
    if (title) title.textContent = entry.loteCode || entry.cartillaLabel || "Cartilla";
    if (sub) {
      sub.textContent = [
        entry.modulo ? `Mod ${entry.modulo}` : "",
        entry.turno != null && entry.turno !== "" ? `T${entry.turno}` : "",
        entry.fecha || parts.date || "",
        parts.time || "",
        isPending ? "Pendiente" : "Enviado",
        n ? `${n} muestra${n === 1 ? "" : "s"}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }

  function updateLastSendNav_() {
    const nav = $("#qb-last-nav");
    const info = $("#qb-last-send-info");
    const prev = $("#qb-last-send-prev");
    const next = $("#qb-last-send-next");
    const total = (lastSendDetail_.sends || []).length;
    const idx = Math.max(0, Number(lastSendDetail_.sendIndex) || 0);
    if (nav) nav.hidden = total <= 1;
    if (info) info.textContent = total ? `${idx + 1} / ${total}` : "0 / 0";
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx >= total - 1;
  }

  function renderLastSendDetailPage_() {
    const body = $("#qb-last-detail-body");
    if (!body) return;
    const entry = currentLastSendEntry_();
    paintLastSendHeader_(entry);
    updateLastSendNav_();
    const samples = entry && Array.isArray(entry.samples) ? entry.samples : [];
    lastSendDetail_.samples = samples;
    const page = Math.max(0, Number(lastSendDetail_.samplePage) || 0);
    const totalPages = Math.max(1, Math.ceil(samples.length / LAST_SEND_PAGE_SIZE_) || 1);
    const safePage = Math.min(page, totalPages - 1);
    lastSendDetail_.samplePage = safePage;
    const start = safePage * LAST_SEND_PAGE_SIZE_;
    const slice = samples.slice(start, start + LAST_SEND_PAGE_SIZE_);
    const fields = lastSendFieldRows_();

    if (!entry) {
      body.innerHTML = `<p class="qb-last-empty">Sin envíos locales de las últimas 18 h.</p>`;
      return;
    }
    if (!samples.length) {
      body.innerHTML = `<p class="qb-last-empty">Sin muestras guardadas en este envío.</p>`;
      return;
    }

    const articles = slice
      .map((s, i) => {
        const num = s && s.n != null ? s.n : start + i + 1;
        const rows = fields
          .map((f) => {
            const raw = displayFieldVal_(s ? s[f.id] : "");
            return `<li><span>${escapeHtml(f.label || f.id)}</span><strong>${escapeHtml(
              String(raw)
            )}</strong></li>`;
          })
          .join("");
        const obs = String((s && s.observacion) || "").trim();
        return `<article class="qb-last-sample">
          <header><strong>Muestra ${escapeHtml(String(num))}</strong></header>
          <ul class="qb-last-list">${rows}</ul>
          ${obs ? `<p class="qb-last-obs">${escapeHtml(obs)}</p>` : ""}
        </article>`;
      })
      .join("");

    const samplePager =
      samples.length > LAST_SEND_PAGE_SIZE_
        ? `<div class="qb-last-pager">
            <button type="button" class="qb-last-page-btn" id="qb-last-sample-prev" ${
              safePage <= 0 ? "disabled" : ""
            }>Ant. muestras</button>
            <span class="qb-last-page-info">${safePage + 1} / ${totalPages}</span>
            <button type="button" class="qb-last-page-btn" id="qb-last-sample-next" ${
              safePage >= totalPages - 1 ? "disabled" : ""
            }>Sig. muestras</button>
          </div>`
        : "";

    body.innerHTML = `${articles}${samplePager}`;
    const sp = $("#qb-last-sample-prev");
    const sn = $("#qb-last-sample-next");
    if (sp) {
      sp.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (lastSendDetail_.samplePage <= 0) return;
        lastSendDetail_.samplePage -= 1;
        renderLastSendDetailPage_();
      };
    }
    if (sn) {
      sn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const maxP = Math.max(1, Math.ceil(samples.length / LAST_SEND_PAGE_SIZE_)) - 1;
        if (lastSendDetail_.samplePage >= maxP) return;
        lastSendDetail_.samplePage += 1;
        renderLastSendDetailPage_();
      };
    }
  }

  function shiftLastSend_(delta) {
    const total = (lastSendDetail_.sends || []).length;
    if (total <= 1) return;
    const next = Math.max(0, Math.min(total - 1, (Number(lastSendDetail_.sendIndex) || 0) + delta));
    if (next === lastSendDetail_.sendIndex) return;
    lastSendDetail_.sendIndex = next;
    lastSendDetail_.samplePage = 0;
    renderLastSendDetailPage_();
  }

  function openLastSendDetail_() {
    if (!requireSession_()) return;
    const cardEl = $("#last-send-card");
    if (!cardEl) return;
    if (cardEl.dataset.state === "empty" || !cardEl.dataset.clientId) {
      toast("Aún no hay envíos · 00", "warn");
      return;
    }
    const sends = localSendsLast18h_();
    if (!sends.length) {
      toast("Sin envíos locales de las últimas 18 h", "warn");
      return;
    }
    const clientId = String(cardEl.dataset.clientId || "").trim();
    let sendIndex = 0;
    if (clientId) {
      const found = sends.findIndex((x) => String(x.clientId) === clientId);
      if (found >= 0) sendIndex = found;
    }
    const root = $("#qb-last-detail");
    if (!root) return;

    lastSendDetail_ = { sends, sendIndex, samplePage: 0 };
    renderLastSendDetailPage_();
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("open"));
  }

  function paintLastSendEmpty_() {
    const titleEl = $("#last-send-title");
    const typeEl = $("#last-send-type");
    const textEl = $("#last-send-text");
    const badgeEl = $("#last-send-badge");
    const cardEl = $("#last-send-card");
    if (titleEl) titleEl.textContent = "00";
    if (typeEl) {
      typeEl.hidden = false;
      typeEl.textContent = "Fenología";
    }
    if (textEl) {
      textEl.innerHTML = "";
      const a = document.createElement("span");
      a.className = "last-send-line";
      a.textContent = "00 · sin envíos";
      textEl.appendChild(a);
      const b = document.createElement("span");
      b.className = "last-send-line";
      b.textContent = "00 · 0 muestras";
      textEl.appendChild(b);
    }
    if (badgeEl) {
      badgeEl.hidden = false;
      badgeEl.textContent = "00";
      badgeEl.classList.remove("is-pending");
    }
    if (cardEl) {
      // Siempre visible con el mismo look (has-data); vacío = 00
      cardEl.classList.add("has-data");
      cardEl.dataset.state = "empty";
      cardEl.dataset.clientId = "";
      cardEl.setAttribute("role", "button");
      cardEl.tabIndex = 0;
      cardEl.setAttribute("aria-label", "Último envío · 00 sin datos");
    }
  }

  function renderLastSend_() {
    const titleEl = $("#last-send-title");
    const typeEl = $("#last-send-type");
    const textEl = $("#last-send-text");
    const badgeEl = $("#last-send-badge");
    const cardEl = $("#last-send-card");
    if (!titleEl || !textEl) return;

    const list = reconcileLocalListStatus_();
    const pending = pendingIds_();
    const latest = list.find((x) => x && x.clientId) || null;

    if (!latest) {
      paintLastSendEmpty_();
      return;
    }

    const isPending = pending.has(latest.clientId);
    const parts = formatLastSendParts_(latest.at || 0);
    const n =
      Number(latest.sampleCount) ||
      (Array.isArray(latest.samples) ? latest.samples.length : 0) ||
      0;
    const samplesTxt = `${n} muestra${n === 1 ? "" : "s"}`;
    titleEl.textContent = latest.loteCode || latest.cartillaLabel || "Cartilla";
    if (typeEl) {
      typeEl.hidden = false;
      typeEl.textContent = latest.cartillaLabel || "Fenología";
    }
    const line1 = [latest.fecha || "", parts.date].filter(Boolean).join(" · ") || "00";
    const line2 = [parts.time || "00", samplesTxt].filter(Boolean).join(" · ");
    textEl.innerHTML = "";
    const a = document.createElement("span");
    a.className = "last-send-line";
    a.textContent = line1;
    textEl.appendChild(a);
    const b = document.createElement("span");
    b.className = "last-send-line";
    b.textContent = line2;
    textEl.appendChild(b);
    if (badgeEl) {
      badgeEl.hidden = false;
      badgeEl.textContent = isPending ? "Pendiente" : "Enviado";
      badgeEl.classList.toggle("is-pending", isPending);
    }
    if (cardEl) {
      cardEl.classList.add("has-data");
      cardEl.dataset.state = isPending ? "pending" : "sent";
      cardEl.dataset.clientId = latest.clientId || "";
      cardEl.setAttribute("role", "button");
      cardEl.tabIndex = 0;
      cardEl.setAttribute("aria-label", "Ver resumen de muestras enviadas");
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
    reconcileLocalListStatus_();
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

  let historialReadyAt_ = 0;

  function openHistorial() {
    if (!requireSession_()) return;
    if (Date.now() < cameraGuardUntil_) return;
    closeKgDetail_();
    historialReadyAt_ = Date.now() + 750;
    showScreen("historial");
    const go = () => {
      initHistFiltersDefault_();
      renderHistorial();
      updateOnlineUi();
      updatePendingUi();
    };
    const afterLocal = () => {
      go();
      // Actualiza evaluadores desde hoja (filtro Hist)
      if (QB.Data && QB.Data.refreshEvaluadoresFromSheet) {
        QB.Data.refreshEvaluadoresFromSheet(false)
          .then(() => {
            if (state.screen === "historial") syncHistFilterLabels_();
          })
          .catch(() => {});
      }
      // GET hoja según filtros (fuerza si caché vacía)
      const forceGet = !remoteHistCache_ || !remoteHistCache_.length;
      refreshRemoteHistorial_(forceGet).then((ok) => {
        if (ok && state.screen === "historial") renderHistorial();
      });
    };
    if (QB.Data && QB.Data.ensureCatalogs) {
      Promise.resolve(QB.Data.ensureCatalogs()).then(afterLocal).catch(afterLocal);
    } else {
      afterLocal();
    }
  }

  function readPesoPref_() {
    try {
      const v = Number(String(localStorage.getItem(PESO_PREF_KEY) || "").replace(",", "."));
      if (Number.isFinite(v) && v > 0) return v;
    } catch (_) {}
    const n = Number(QB.CONFIG && QB.CONFIG.PESO_BAYA_G);
    return Number.isFinite(n) && n > 0 ? n : 2.6;
  }

  function writePesoPref_(v) {
    const n = Number(String(v || "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return readPesoPref_();
    try {
      localStorage.setItem(PESO_PREF_KEY, String(n));
    } catch (_) {}
    return n;
  }

  function histPeso_() {
    return readPesoPref_();
  }

  function stageFieldKeys_(fieldId) {
    const id = String(fieldId || "");
    const keys = [id];
    const stages = QB.HIST_KG_STAGES || [];
    const fields = QB.SAMPLE_FIELDS || [];
    stages.forEach((st) => {
      if (st.id === id || st.sheet === id) {
        keys.push(st.id, st.sheet);
      }
    });
    fields.forEach((f) => {
      if (f.id === id || f.sheet === id) {
        keys.push(f.id, f.sheet);
      }
    });
    return [...new Set(keys.filter(Boolean))];
  }

  /**
   * Valor que entra al promedio (regla /escaneadas):
   * vacío / 0 / "-" → no cuentan (no diluyen).
   */
  function stageValueForAvg_(sample, fieldId) {
    if (!sample || typeof sample !== "object") return null;
    const keys = stageFieldKeys_(fieldId);
    let raw = "";
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (sample[k] == null) continue;
      const t = String(sample[k]).trim();
      if (!t || t === "-" || t === "—") continue;
      raw = t;
      break;
    }
    if (!raw) return null;
    const v = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(v) || v === 0) return null;
    return v;
  }

  function meanOfNums_(vals) {
    const nums = (vals || []).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function avgStage_(samples, fieldId) {
    if (!Array.isArray(samples) || !samples.length) return null;
    const vals = [];
    samples.forEach((s) => {
      const v = stageValueForAvg_(s, fieldId);
      if (v != null) vals.push(v);
    });
    return meanOfNums_(vals);
  }

  function stageKg_(avgCount, area) {
    if (avgCount == null) return 0;
    // Sin área real no inventamos 1 ha: kg debe reflejar dato verdadero
    const a = area != null && area > 0 ? area : null;
    if (a == null) return 0;
    const peso = histPeso_();
    const dens = histDensidad_();
    return (avgCount * peso * dens) / 1000 * a;
  }

  function histDensidad_() {
    const n = Number(QB.CONFIG && QB.CONFIG.DENSIDAD_PLANTAS_HA);
    return Number.isFinite(n) && n > 0 ? n : 6500;
  }

  function avgE5_(samples) {
    return avgStage_(samples, "e5");
  }

  function positiveArea_(v) {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Vacío / guión / _ → no cuenta como módulo/turno real */
  function isBlankHistToken_(v) {
    const s = String(v ?? "").trim();
    return (
      !s ||
      s === "—" ||
      s === "–" ||
      s === "-" ||
      s === "_" ||
      s === "." ||
      s.toLowerCase() === "null" ||
      s.toLowerCase() === "undefined"
    );
  }

  /** Parsea código M1T2L5 / M01T02L05 → { modulo, turno, lote } */
  function parseLoteCodeParts_(code) {
    const s = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!s) return null;
    const m = s.match(/^M0*(\d+)T0*(\d+)L([0-9]+[A-Z]?)$/i);
    if (!m) return null;
    return {
      modulo: `M${m[1]}`,
      turno: String(Number(m[2]) || m[2]),
      lote: String(m[3]).replace(/^0+(?=\d)/, "") || m[3],
    };
  }

  function looksLikeModuloToken_(v) {
    return /^M0*\d+$/i.test(String(v || "").trim());
  }

  /**
   * Canoniza módulo + turno para historial.
   * Corrige: Modulo vacío/"_" y Turno con "M1" (módulo mal guardado).
   */
  function canonHistModTur_(raw) {
    raw = raw || {};
    const loteCode = String(raw.loteCode || raw.lote || "").trim();
    const loteNum = String(raw.loteNum || "").trim();
    const parsed = parseLoteCodeParts_(loteCode);
    const loteKey = loteNum || loteCode;
    const meta =
      (QB.Data && QB.Data.loteMeta && loteKey ? QB.Data.loteMeta(loteKey) : null) || {};
    const metaAlt =
      loteCode && loteCode !== loteKey && QB.Data && QB.Data.loteMeta
        ? QB.Data.loteMeta(loteCode)
        : null;

    let mod = String(raw.modulo || "").trim();
    let tur = raw.turno != null && raw.turno !== "" ? String(raw.turno).trim() : "";

    if (isBlankHistToken_(mod)) mod = "";
    if (isBlankHistToken_(tur)) tur = "";

    // Turno trae código de módulo (M1/M7) y módulo vacío → intercambiar
    if (!mod && looksLikeModuloToken_(tur)) {
      mod = (QB.Data && QB.Data.normalizeModulo
        ? QB.Data.normalizeModulo(tur)
        : String(tur).toUpperCase()) || tur.toUpperCase();
      tur = "";
    }

    if (!mod && parsed && parsed.modulo) mod = parsed.modulo;
    if (!mod && meta.modulo) mod = String(meta.modulo);
    if (!mod && metaAlt && metaAlt.modulo) mod = String(metaAlt.modulo);
    if (mod && QB.Data && QB.Data.normalizeModulo) {
      mod = QB.Data.normalizeModulo(mod) || mod;
    }

    if (!tur && parsed && parsed.turno) tur = parsed.turno;
    if (!tur && meta.turno) tur = String(meta.turno);
    if (!tur && metaAlt && metaAlt.turno) tur = String(metaAlt.turno);

    // Si turno sigue pareciendo módulo y ya tenemos módulo distinto, descarta
    if (tur && looksLikeModuloToken_(tur) && mod && normalizeModCmp_(tur) === normalizeModCmp_(mod)) {
      tur = parsed && parsed.turno ? parsed.turno : "";
    }

    // Licapa I–IV: Etapa hoja → meta → árbol (M5 → Licapa I)
    let etapa = String(raw.etapa || raw.fundo || raw.fundoLabel || "").trim();
    if (isBlankHistToken_(etapa)) etapa = "";
    if (QB.Data && QB.Data.resolveEtapaLabel) {
      etapa =
        QB.Data.resolveEtapaLabel(
          etapa || (meta && meta.etapa) || (metaAlt && metaAlt.etapa) || "",
          mod,
          loteCode || loteNum || (parsed && parsed.lote) || ""
        ) || etapa;
    } else if (!etapa) {
      etapa = String((meta && meta.etapa) || (metaAlt && metaAlt.etapa) || "").trim();
    }

    return {
      modulo: mod || "—",
      turno: tur || "—",
      etapa: etapa || "—",
      meta,
      metaAlt,
      loteCode,
      parsed,
    };
  }

  function normalizeModCmp_(v) {
    const s = String(v || "")
      .trim()
      .toUpperCase();
    const m = s.match(/^M?0*(\d+)$/i);
    return m ? `M${m[1]}` : s;
  }

  function enrichHistRow_(raw, statusHint) {
    const canon = canonHistModTur_(raw);
    const meta = canon.meta || {};
    const metaAlt = canon.metaAlt || null;
    const rowArea =
      Array.isArray(raw.samples) && raw.samples[0]
        ? raw.samples[0].Area ?? raw.samples[0].area
        : null;
    const area =
      positiveArea_(raw.area) ||
      positiveArea_(meta.area) ||
      positiveArea_(metaAlt && metaAlt.area) ||
      positiveArea_(rowArea) ||
      null;
    const bayas = avgE5_(raw.samples);
    const peso = histPeso_();
    const kgHa =
      bayas != null ? Math.round((bayas * peso * histDensidad_()) / 1000) : null;
    const kgTot = kgHa != null && area != null ? Math.round(kgHa * area) : null;
    const pending =
      statusHint != null ? statusHint === "pending" : raw.status === "pending";
    return {
      clientId: raw.clientId || raw.id || "",
      fecha: raw.fecha || (raw.at ? String(raw.at).slice(0, 10) : todayISO_()),
      at: raw.at || "",
      status: pending ? "pending" : "sent",
      modulo: canon.modulo,
      turno: canon.turno,
      etapa: canon.etapa,
      variedad: raw.variedad || meta.variedad || (metaAlt && metaAlt.variedad) || "—",
      area,
      bayas,
      peso,
      kgHa,
      kgTot,
      loteCode: canon.loteCode || raw.lote || raw.loteCode || "",
    };
  }

  /** 0 / 0.0 / "0,0" → true (para UI; el promedio igual usa el 0). */
  function isNumericZero_(v) {
    if (v == null || v === "") return false;
    const n = Number(String(v).trim().replace(",", "."));
    return Number.isFinite(n) && n === 0;
  }

  /** Vacío o cero → "—"; el valor real se conserva para cálculos. */
  function displayFieldVal_(v) {
    if (v == null || String(v).trim() === "") return "—";
    if (isNumericZero_(v)) return "—";
    return String(v);
  }

  function fmtNum_(n, dec) {
    if (n == null || !Number.isFinite(n)) return "—";
    // En historial: promedio 0.0 se ve como —; el cálculo ya usó el 0
    if (n === 0) return "—";
    return Number(n).toLocaleString("es-PE", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }

  function fmtFechaHist_(fecha) {
    const s = String(fecha || "");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    try {
      return new Date(fecha).toLocaleDateString("es-PE");
    } catch {
      return s || "—";
    }
  }

  let remoteHistCache_ = null;
  let remoteHistFetchAt_ = 0;
  let remoteHistBusy_ = false;

  function samplesRichness_(samples) {
    if (!Array.isArray(samples) || !samples.length) return 0;
    const keys = [
      "e3",
      "e4",
      "e5",
      "e1",
      "e2",
      "boton_floral",
      "flor",
      "cuaja",
      "n_ramas",
    ];
    let score = samples.length * 20;
    samples.forEach((s) => {
      if (!s) return;
      keys.forEach((k) => {
        if (s[k] != null && String(s[k]).trim() !== "") score += 2;
      });
    });
    return score;
  }

  function pickRicherSamples_(a, b) {
    const sa = samplesRichness_(a);
    const sb = samplesRichness_(b);
    if (sb > sa) return Array.isArray(b) ? b : [];
    if (sa > 0) return Array.isArray(a) ? a : [];
    return Array.isArray(b) && b.length ? b : Array.isArray(a) ? a : [];
  }

  function loteKeyHist_(h) {
    const canon = canonHistModTur_(h || {});
    const mod = canon.modulo || "—";
    const tur = canon.turno || "—";
    const lote = String((h && (h.loteCode || h.lote)) || "—");
    const fecha = String((h && h.fecha) || "").slice(0, 10);
    return `${fecha}|${mod}|${tur}|${lote}`;
  }

  function histEntryDni_(h) {
    if (!h) return "";
    let d = String(h.evaluadorId || h.dni || "").replace(/\D/g, "");
    if (/^\d{8}$/.test(d)) return d;
    const ev = String(h.evaluador || "");
    const m = ev.match(/(\d{8})/);
    if (m) return m[1];
    const cid = String(h.clientId || "");
    const m2 = cid.match(/\|(\d{8})$/);
    if (m2) return m2[1];
    return "";
  }

  function histEntryDay_(h) {
    if (!h) return "";
    const f = String(h.fecha || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0, 10);
    try {
      if (QB.API && QB.API.localDayKey) return QB.API.localDayKey(h.at) || "";
    } catch (_) {}
    const at = String(h.at || "");
    if (/^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10);
    return "";
  }

  const histFilters_ = {
    modulo: "",
    dni: "",
    desde: "",
    hasta: "",
  };
  /** Si el usuario eligió "Todos" en evaluador, no volver a forzar su DNI */
  let histEvalUserCleared_ = false;

  function readHistFiltersFromUi_() {
    // módulo / evaluador / fechas viven en histFilters_ (botones formales)
    return { ...histFilters_ };
  }

  function fmtFechaUi_(iso) {
    const s = String(iso || "").slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function syncHistFilterLabels_() {
    const modBtn = $("#hist-filtro-modulo");
    const evalBtn = $("#hist-filtro-eval");
    const desdeBtn = $("#hist-filtro-desde");
    const hastaBtn = $("#hist-filtro-hasta");
    setSelectLabel(modBtn, histFilters_.modulo || "Todos", !histFilters_.modulo);
    if (histFilters_.dni) {
      const p =
        QB.Data && QB.Data.personByDni
          ? QB.Data.personByDni("evaluador", histFilters_.dni)
          : null;
      const nom =
        (p && (QB.Data.shortName ? QB.Data.shortName(p.nombre) : p.nombre)) ||
        histFilters_.dni;
      setSelectLabel(evalBtn, nom, false);
    } else {
      // Borró evaluador → select queda en Todos (limpio)
      setSelectLabel(evalBtn, "Todos", true);
    }
    setSelectLabel(desdeBtn, fmtFechaUi_(histFilters_.desde), !histFilters_.desde);
    setSelectLabel(hastaBtn, fmtFechaUi_(histFilters_.hasta), !histFilters_.hasta);
  }

  /* ——— Calendario formal (reemplaza input type=date nativo) ——— */
  let histDateField_ = "desde";
  let histDateView_ = { y: 2026, m: 0 };
  let histDateOpenedAt_ = 0;

  function closeHistDatePicker_() {
    const root = $("#hist-date-overlay");
    if (!root) return;
    root.classList.remove("open", "is-open");
    setTimeout(() => {
      root.hidden = true;
    }, 180);
  }

  function renderHistDateGrid_() {
    const grid = $("#hist-date-grid");
    const monthEl = $("#hist-date-month");
    if (!grid) return;
    const y = histDateView_.y;
    const m = histDateView_.m;
    const monthNames = [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ];
    if (monthEl) monthEl.textContent = `${monthNames[m]} de ${y}`;
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const selected = String(
      histDateField_ === "hasta" ? histFilters_.hasta : histFilters_.desde || ""
    ).slice(0, 10);
    const today = todayISO_();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      let day;
      let cellY = y;
      let cellM = m;
      let muted = false;
      if (i < startDow) {
        day = prevDays - startDow + i + 1;
        cellM = m - 1;
        if (cellM < 0) {
          cellM = 11;
          cellY = y - 1;
        }
        muted = true;
      } else if (i >= startDow + daysInMonth) {
        day = i - (startDow + daysInMonth) + 1;
        cellM = m + 1;
        if (cellM > 11) {
          cellM = 0;
          cellY = y + 1;
        }
        muted = true;
      } else {
        day = i - startDow + 1;
      }
      const iso = `${cellY}-${String(cellM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cls = [
        "hist-date-day",
        muted ? "is-muted" : "",
        iso === today ? "is-today" : "",
        iso === selected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(
        `<button type="button" class="${cls}" data-iso="${escapeAttr(iso)}">${day}</button>`
      );
    }
    grid.innerHTML = cells.join("");
    grid.querySelectorAll("[data-iso]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const iso = btn.getAttribute("data-iso") || "";
        if (histDateField_ === "hasta") histFilters_.hasta = iso;
        else histFilters_.desde = iso;
        syncHistFilterLabels_();
        closeHistDatePicker_();
      });
    });
  }

  function openHistDatePicker_(field) {
    histDateField_ = field === "hasta" ? "hasta" : "desde";
    const cur =
      histDateField_ === "hasta" ? histFilters_.hasta : histFilters_.desde;
    const base = cur && /^\d{4}-\d{2}-\d{2}/.test(cur) ? cur : todayISO_();
    const parts = base.split("-");
    histDateView_ = {
      y: Number(parts[0]) || new Date().getFullYear(),
      m: Math.max(0, (Number(parts[1]) || 1) - 1),
    };
    const root = $("#hist-date-overlay");
    const title = $("#hist-date-title");
    if (!root) return;
    // Fuera del panel-scroll: fixed a pantalla completa
    if (root.parentElement !== document.body) {
      document.body.appendChild(root);
    }
    if (title) title.textContent = histDateField_ === "hasta" ? "Hasta" : "Desde";
    histDateOpenedAt_ = Date.now();
    renderHistDateGrid_();
    root.hidden = false;
    // .overlay exige .open (opacity/pointer-events); .is-open anima el sheet
    requestAnimationFrame(() => {
      root.classList.add("open", "is-open");
    });
  }

  function bindHistDatePicker_() {
    if (bindHistDatePicker_._done) return;
    bindHistDatePicker_._done = true;
    fastTap_($("#hist-date-close"), closeHistDatePicker_);
    fastTap_($("#hist-date-prev"), () => {
      histDateView_.m -= 1;
      if (histDateView_.m < 0) {
        histDateView_.m = 11;
        histDateView_.y -= 1;
      }
      renderHistDateGrid_();
    });
    fastTap_($("#hist-date-next"), () => {
      histDateView_.m += 1;
      if (histDateView_.m > 11) {
        histDateView_.m = 0;
        histDateView_.y += 1;
      }
      renderHistDateGrid_();
    });
    fastTap_($("#hist-date-today"), () => {
      const t = todayISO_();
      if (histDateField_ === "hasta") histFilters_.hasta = t;
      else histFilters_.desde = t;
      syncHistFilterLabels_();
      closeHistDatePicker_();
    });
    fastTap_($("#hist-date-clear"), () => {
      if (histDateField_ === "hasta") histFilters_.hasta = "";
      else histFilters_.desde = "";
      syncHistFilterLabels_();
      closeHistDatePicker_();
    });
    $("#hist-date-overlay")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "hist-date-overlay") {
        if (Date.now() - histDateOpenedAt_ < 450) return;
        closeHistDatePicker_();
      }
    });
  }

  function openHistModuloFilter_() {
    if (!QB.PreciseSelect) return;
    const opts = () => {
      const base =
        QB.Data && QB.Data.moduloOptions ? QB.Data.moduloOptions("") : [];
      return [{ id: "", label: "Todos", meta: "Sin filtro" }, ...base];
    };
    QB.PreciseSelect.open({
      title: "Módulo",
      hideSearch: true,
      value: histFilters_.modulo || "",
      getOptions: opts,
      onSelect: (opt) => {
        histFilters_.modulo = String((opt && opt.id) || "").trim();
        syncHistFilterLabels_();
        if (state.screen === "historial") renderHistorial();
      },
    });
  }

  function openHistEvalFilter_() {
    if (!QB.PreciseSelect) return;
    // Abrir YA con caché local (no esperar GET a Apps Script → lentitud)
    const opts = (q) => {
      const base =
        QB.Data && QB.Data.evaluadorOptions ? QB.Data.evaluadorOptions(q) : [];
      const mapped = base.map((o) => ({
        id: String(o.dni || "").replace(/\D/g, ""),
        label: o.nombreCorto || o.nombre || o.label || o.dni,
        meta: o.meta || (o.dni ? `DNI · ${o.dni}` : ""),
        dni: String(o.dni || "").replace(/\D/g, ""),
      }));
      return [{ id: "", label: "Todos", meta: "Sin filtro" }, ...mapped];
    };
    if (
      histFilters_.dni &&
      QB.Data &&
      QB.Data.personByDni &&
      !QB.Data.personByDni("evaluador", histFilters_.dni)
    ) {
      histFilters_.dni = "";
      histEvalUserCleared_ = true;
      syncHistFilterLabels_();
    }
    QB.PreciseSelect.open({
      title: "Evaluador",
      value: histFilters_.dni || "",
      getOptions: opts,
      onSelect: (opt) => {
        const dni = String((opt && (opt.dni || opt.id)) || "").replace(/\D/g, "");
        histFilters_.dni = dni;
        histEvalUserCleared_ = !dni;
        syncHistFilterLabels_();
        if (state.screen === "historial") renderHistorial();
      },
    });
    // Refresh en background (sin force: respeta TTL 5 min)
    if (QB.Data && QB.Data.refreshEvaluadoresFromSheet && navigator.onLine) {
      QB.Data.refreshEvaluadoresFromSheet(false).catch(() => {});
    }
  }

  function filterHistorialByFilters_(list) {
    const f = histFilters_;
    const mod = String(f.modulo || "").trim().toUpperCase();
    const dni = String(f.dni || "").replace(/\D/g, "");
    const desde = String(f.desde || "").slice(0, 10);
    const hasta = String(f.hasta || "").slice(0, 10);
    return (list || []).filter((h) => {
      const day = histEntryDay_(h);
      if (desde && day && day < desde) return false;
      if (hasta && day && day > hasta) return false;
      if (desde && !day) return false;
      if (mod) {
        const hm = String(h.modulo || "")
          .trim()
          .toUpperCase();
        if (!hm || hm.indexOf(mod) === -1) return false;
      }
      if (dni) {
        if (histEntryDni_(h) !== dni) return false;
      }
      return true;
    });
  }

  function populateHistFilterOptions_() {
    syncHistFilterLabels_();
  }

  function initHistFiltersDefault_() {
    const session = readSession_();
    const today = todayISO_();
    if (!histFilters_.desde) histFilters_.desde = today;
    if (!histFilters_.hasta) histFilters_.hasta = today;
    if (!histEvalUserCleared_ && !histFilters_.dni && session && session.dni) {
      histFilters_.dni = String(session.dni).replace(/\D/g, "");
    }
    populateHistFilterOptions_();
  }

  async function refreshRemoteHistorial_(force) {
    if (!QB.API || !QB.API.fetchProyeccionesList) return false;
    if (!navigator.onLine) return false;
    if (remoteHistBusy_) return false;
    readHistFiltersFromUi_();
    if (
      !force &&
      remoteHistFetchAt_ &&
      Date.now() - remoteHistFetchAt_ < 45000 &&
      Array.isArray(remoteHistCache_)
    ) {
      return true;
    }
    remoteHistBusy_ = true;
    try {
      const f = histFilters_;
      // No filtrar por campaña en el GET: muchas filas viejas la tienen vacía y el resumen salía en 0
      const data = await QB.API.fetchProyeccionesList({
        limit: 2000,
        dni: f.dni || undefined,
        modulo: f.modulo || undefined,
        desde: f.desde || undefined,
        hasta: f.hasta || undefined,
        timeoutMs: 45000,
      });
      if (!data || !data.ok) return false;
      const mapped = QB.API.sheetRegistrosToHistory
        ? QB.API.sheetRegistrosToHistory(data.registros || [])
        : [];
      remoteHistCache_ = filterHistorialByFilters_(mapped);
      remoteHistFetchAt_ = Date.now();
      return true;
    } catch (_) {
      return false;
    } finally {
      remoteHistBusy_ = false;
    }
  }

  async function applyHistFilters_() {
    readHistFiltersFromUi_();
    const f = histFilters_;
    const today = todayISO_();
    const needsNet =
      (f.desde && f.desde !== today) ||
      (f.hasta && f.hasta !== today) ||
      (f.desde && f.hasta && f.desde !== f.hasta) ||
      !!f.dni ||
      !!f.modulo;
    if (needsNet && !navigator.onLine) {
      toast("Los filtros requieren internet para traer datos", "warn");
      return;
    }
    setLoader(true, navigator.onLine ? "Trayendo datos…" : "Filtrando…");
    try {
      if (navigator.onLine) {
        const ok = await refreshRemoteHistorial_(true);
        if (!ok) {
          toast("No se pudo traer datos. Revisa la conexión", "warn");
        }
      }
      if (state.screen === "historial") renderHistorial();
    } finally {
      setLoader(false);
    }
  }

  function collectHistorialRaw_() {
    let history = [];
    try {
      history = QB.API.getUploadHistory ? QB.API.getUploadHistory() : [];
    } catch {
      history = [];
    }
    reconcileLocalListStatus_();
    const pendingIds = pendingIds_();
    const localById = {};
    readLocalList_().forEach((x) => {
      if (x && x.clientId) localById[x.clientId] = x;
    });
      const localSent = readLocalList_()
      .filter((x) => x && !pendingIds.has(x.clientId))
      .map((x) => {
        const dni =
          String(x.evaluadorId || "").replace(/\D/g, "") ||
          (String(x.evaluador || "").match(/(\d{8})/) || [])[1] ||
          "";
        return {
          clientId: x.clientId,
          status: "sent",
          source: "local",
          at: x.at ? new Date(x.at).toISOString() : "",
          fecha: x.fecha || "",
          lote: x.loteCode || "",
          loteCode: x.loteCode || "",
          loteNum: x.loteNum || "",
          modulo: x.modulo || "",
          turno: x.turno || "",
          etapa: x.etapa || x.fundo || "",
          fundo: x.fundo || x.etapa || "",
          variedad: x.variedad || "",
          area: x.area,
          evaluador: x.evaluador || "",
          evaluadorId: dni,
          dni,
          samples: Array.isArray(x.samples) ? x.samples : [],
          sampleCount: x.sampleCount || 0,
        };
      });
    history = history.map((h) => {
      const loc = localById[h.clientId];
      if (!loc) return h;
      return {
        ...h,
        samples: pickRicherSamples_(h.samples, loc.samples),
        lote: h.lote || loc.loteCode || "",
        loteCode: h.loteCode || h.lote || loc.loteCode || "",
        loteNum: h.loteNum || loc.loteNum || "",
        modulo: h.modulo || loc.modulo || "",
        turno: h.turno || loc.turno || "",
        etapa: h.etapa || h.fundo || loc.etapa || loc.fundo || "",
        fundo: h.fundo || h.etapa || loc.fundo || loc.etapa || "",
        area: h.area != null && h.area !== "" ? h.area : loc.area,
      };
    });
    const seen = new Set(history.map((h) => String(h.clientId || h.id || "")));
    localSent.forEach((s) => {
      const id = String(s.clientId || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        history.push(s);
      } else if (id) {
        const idx = history.findIndex((h) => String(h.clientId || "") === id);
        if (idx >= 0) {
          history[idx] = {
            ...history[idx],
            samples: pickRicherSamples_(history[idx].samples, s.samples),
            area:
              history[idx].area != null && history[idx].area !== ""
                ? history[idx].area
                : s.area,
          };
        }
      }
    });
    readLocalList_().forEach((x) => {
      if (!x || !x.clientId || !pendingIds.has(x.clientId)) return;
      const id = String(x.clientId);
      if (seen.has(id)) return;
      seen.add(id);
      const dni =
        String(x.evaluadorId || "").replace(/\D/g, "") ||
        (String(x.evaluador || "").match(/(\d{8})/) || [])[1] ||
        "";
      history.push({
        ...x,
        status: "pending",
        source: "local-pending",
        lote: x.loteCode || "",
        loteCode: x.loteCode || x.lote || "",
        at: x.at ? new Date(x.at).toISOString() : "",
        evaluadorId: dni,
        dni,
      });
    });

    // GET hoja = fuente de verdad para enviados (E3/E4/E5 reales)
    if (Array.isArray(remoteHistCache_) && remoteHistCache_.length) {
      const pendingKeys = new Set();
      history.forEach((h) => {
        if (h && (h.status === "pending" || pendingIds.has(h.clientId))) {
          pendingKeys.add(loteKeyHist_(h));
        }
      });
      const byKey = new Map();
      history.forEach((h, i) => {
        byKey.set(loteKeyHist_(h), i);
      });
      remoteHistCache_.forEach((remote) => {
        const key = loteKeyHist_(remote);
        if (pendingKeys.has(key)) return; // no pisar pendiente local
        const idx = byKey.get(key);
        if (idx == null) {
          history.push(remote);
          byKey.set(key, history.length - 1);
      return;
    }
        const cur = history[idx];
        // Preferir GET de hoja si trae muestras más completas o es source sheet
        const preferRemote =
          remote.source === "sheet" &&
          samplesRichness_(remote.samples) >= samplesRichness_(cur.samples);
        if (preferRemote || samplesRichness_(remote.samples) > samplesRichness_(cur.samples)) {
          history[idx] = {
            ...cur,
            ...remote,
            clientId: cur.clientId && !String(cur.clientId).startsWith("sheet_")
              ? cur.clientId
              : remote.clientId,
            status: cur.status === "pending" ? "pending" : "sent",
            samples: pickRicherSamples_(remote.samples, cur.samples),
            area:
              remote.area != null && remote.area !== ""
                ? remote.area
                : cur.area,
          };
        }
      });
    }
    // Filtros activos: módulo · evaluador · desde/hasta
    return filterHistorialByFilters_(history);
  }

  function histLoteNum_(h, enriched) {
    const n = String(
      (enriched && enriched.loteNum) ||
        (h && h.loteNum) ||
        ""
    ).trim();
    if (n) return n;
    const code = String(
      (enriched && enriched.loteCode) || (h && (h.loteCode || h.lote)) || ""
    ).trim();
    const m =
      code.match(/L(?:T)?\s*([0-9]+[A-Za-z]?)\s*$/i) ||
      code.match(/(?:^|[^\d])([0-9]+[A-Za-z]?)$/);
    return m ? m[1] : code || "—";
  }

  function fundoSortKey_(label) {
    const k =
      (QB.Data && QB.Data.etapaKind && QB.Data.etapaKind(label)) ||
      String(label || "");
    const order = { I: 1, II: 2, III: 3, IV: 4, "I/II": 5 };
    return order[k] || 99;
  }

  /**
   * Filas por Licapa+módulo+turno+lote (regla /escaneadas):
   * - Solo última cartilla del lote
   * - Promedio de muestras: solo valores con dato (vacío/0/- no diluyen)
   */
  function buildKgRows_(history) {
    const stages = QB.HIST_KG_STAGES || [];
    const byKey = new Map();
    (history || []).forEach((h) => {
      const enriched = enrichHistRow_(h, h.status === "pending" ? "pending" : "sent");
      const fundo = enriched.etapa || "—";
      const mod = enriched.modulo || "—";
      const tur = String(enriched.turno || "—");
      const loteNum = histLoteNum_(h, enriched);
      const loteCode = enriched.loteCode || h.lote || h.loteCode || "";
      const key = `${fundo}|${mod}|${tur}|${loteNum}`;
      const at = new Date(h.at || 0).getTime() || 0;
      const prev = byKey.get(key);
      // Solo la última cartilla de ese lote
      if (prev && at < prev.at) {
        prev.regCount = (Number(prev.regCount) || 1) + 1;
        return;
      }
      const samples = Array.isArray(h.samples) ? h.samples : [];
      let nMuestras = samples.length;
      const declared = Number(h.sampleCount);
      if (Number.isFinite(declared) && declared > nMuestras) nMuestras = declared;
      if (!nMuestras) nMuestras = samples.length || 0;

      const stageAvgPack_ = (id) => {
        const vals = [];
        samples.forEach((s) => {
          const v = stageValueForAvg_(s, id);
          if (v != null) vals.push(v);
        });
        const avg = meanOfNums_(vals);
        const sum = vals.reduce((a, b) => a + b, 0);
        return { avg, n: vals.length, sum };
      };
      const aFc = stageAvgPack_("boton_floral"); // 1) Flor cerrada
      const aFa = stageAvgPack_("flor"); // 2) Flor abierta
      const aCu = stageAvgPack_("cuaja"); // 3) Cuajo
      const a1 = stageAvgPack_("e1");
      const a2 = stageAvgPack_("e2");
      const a3 = stageAvgPack_("e3");
      const a4 = stageAvgPack_("e4");
      const a5 = stageAvgPack_("e5");
      // Columna Total = suma E1…E5 de ESTA fila (como /escaneadas)
      const totalE =
        (Number(a1.avg) || 0) +
        (Number(a2.avg) || 0) +
        (Number(a3.avg) || 0) +
        (Number(a4.avg) || 0) +
        (Number(a5.avg) || 0);
      const kgs = stages.map((st) => {
        const avg = avgStage_(samples, st.id);
        const avg2 = avg != null ? avg : avgStage_(samples, st.sheet);
        return stageKg_(avg2, enriched.area);
      });
      const regCount = prev ? (Number(prev.regCount) || 1) + 1 : 1;
      byKey.set(key, {
        id: key,
        clientId: h.clientId || "",
        fundo,
        mod,
        tur,
        lote: loteCode || loteNum,
        loteNum,
        loteLabel: `Lote ${loteNum}`,
        area: enriched.area,
        status: enriched.status,
        at,
        fecha: enriched.fecha || h.fecha || "",
        sampleCount: nMuestras,
        regCount,
        kgs,
        totalKg: kgs.reduce((a, b) => a + b, 0),
        total: totalE,
        fcAvg: aFc.avg,
        faAvg: aFa.avg,
        cuAvg: aCu.avg,
        e1Avg: a1.avg,
        e1N: a1.n,
        e1Sum: a1.sum,
        e2Avg: a2.avg,
        e2N: a2.n,
        e2Sum: a2.sum,
        e3Avg: a3.avg,
        e3N: a3.n,
        e3Sum: a3.sum,
        e4Avg: a4.avg,
        e4N: a4.n,
        e4Sum: a4.sum,
        e5Avg: a5.avg,
        e5N: a5.n,
        e5Sum: a5.sum,
        stages: stages.map((st, i) => ({
          label: st.label,
          kg: kgs[i],
        })),
        peso: histPeso_(),
      });
    });
    return [...byKey.values()].sort((a, b) => {
      const cf = fundoSortKey_(a.fundo) - fundoSortKey_(b.fundo);
      if (cf) return cf;
      const lf = String(a.fundo).localeCompare(String(b.fundo), "es");
      if (lf) return lf;
      const cm = String(a.mod).localeCompare(String(b.mod), "es");
      if (cm) return cm;
      const na = Number(a.tur) || 0;
      const nb = Number(b.tur) || 0;
      if (na !== nb) return na - nb;
      const la = Number(String(a.loteNum).replace(/\D/g, "")) || 0;
      const lb = Number(String(b.loteNum).replace(/\D/g, "")) || 0;
      if (la !== lb) return la - lb;
      return String(a.loteNum).localeCompare(String(b.loteNum), "es");
    });
  }

  let histKgById_ = {};

  function closeKgDetail_() {
    const root = $("#qb-kg-detail");
    if (!root) return;
    root.classList.remove("open");
    setTimeout(() => {
      root.hidden = true;
    }, 160);
  }

  function openKgDetail_(id) {
    // Evita ghost-click al entrar a Historial desde Home
    if (Date.now() < historialReadyAt_) return;
    if (state.screen !== "historial") return;
    if (!id) return;
    const row = histKgById_[id];
    if (!row) return;
    const root = $("#qb-kg-detail");
    const title = $("#qb-kg-detail-title");
    const sub = $("#qb-kg-detail-sub");
    const body = $("#qb-kg-detail-body");
    if (!root || !title || !body) return;
    title.textContent = row.loteLabel || (row.loteNum ? `Lote ${row.loteNum}` : row.lote) || "Lote";
    if (sub) {
      sub.textContent = `${row.mod} · Turno ${row.tur} · Peso ${fmtNum_(row.peso, 2)} g${
        row.area != null ? ` · Área ${fmtNum_(row.area, 2)} ha` : ""
      }${row.sampleCount ? ` · ${row.sampleCount} muestra${row.sampleCount === 1 ? "" : "s"}` : ""}${
        row.regCount > 1 ? ` · última de ${row.regCount} cartillas` : ""
      }`;
    }
    body.innerHTML = `
      <ul class="qb-kg-detail-list">
        ${(row.stages || [])
          .map(
            (st) =>
              `<li><span>${escapeHtml(st.label)}</span><strong>${fmtNum_(st.kg, 2)} kg</strong></li>`
          )
          .join("")}
      </ul>
      <div class="qb-kg-detail-total">
        <span>Total E1–E5</span>
        <strong>${fmtNum_(row.total, 1)}</strong>
        </div>`;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("open"));
  }

  function renderHistorial() {
    const listEl = $("#historial-list");
    const emptyEl = $("#historial-empty");
    const sumEl = $("#historial-summary");
    const pesoInp = $("#hist-peso-input");
    if (!listEl) return;

    if (pesoInp && document.activeElement !== pesoInp) {
      pesoInp.value = String(histPeso_());
    }

    readHistFiltersFromUi_();
    const history = collectHistorialRaw_();
    const rows = buildKgRows_(history);
    histKgById_ = {};
    rows.forEach((r) => {
      histKgById_[r.id] = r;
    });

    const promCell_ = (n) =>
      `<td class="hist-kg-stage-cell"><strong>${fmtNum_(n, 1)}</strong></td>`;
    const totalCell_ = (n) =>
      `<td class="hist-kg-total-cell"><strong>${fmtNum_(n, 1)}</strong></td>`;
    // 1) Flor cerrada … 8) E5
    const stageCells_ = (o) =>
      `${promCell_(o.fc)}${promCell_(o.fa)}${promCell_(o.cu)}${promCell_(o.e1)}${promCell_(
        o.e2
      )}${promCell_(o.e3)}${promCell_(o.e4)}${promCell_(o.e5)}`;
    // Columna Total = suma E1…E5 de esa misma fila (no incluye flor/cuajo)
    const sumE1aE5_ = (p1, p2, p3, p4, p5) =>
      (Number(p1) || 0) +
      (Number(p2) || 0) +
      (Number(p3) || 0) +
      (Number(p4) || 0) +
      (Number(p5) || 0);

    let gN = 0;
    const byFundo = new Map();
    rows.forEach((r) => {
      gN += Number(r.sampleCount) || 0;
      const f = String(r.fundo || "—");
      if (!byFundo.has(f)) byFundo.set(f, []);
      byFundo.get(f).push(r);
    });
    // Total (fila abajo) = promedio de promedios de lote (solo lotes con dato)
    const grandFc = meanOfNums_(rows.map((r) => r.fcAvg));
    const grandFa = meanOfNums_(rows.map((r) => r.faAvg));
    const grandCu = meanOfNums_(rows.map((r) => r.cuAvg));
    const grandP1 = meanOfNums_(rows.map((r) => r.e1Avg));
    const grandP2 = meanOfNums_(rows.map((r) => r.e2Avg));
    const grandP3 = meanOfNums_(rows.map((r) => r.e3Avg));
    const grandP4 = meanOfNums_(rows.map((r) => r.e4Avg));
    const grandP5 = meanOfNums_(rows.map((r) => r.e5Avg));
    const grandTotal = sumE1aE5_(grandP1, grandP2, grandP3, grandP4, grandP5);

    const avgPackFrom_ = (list, pick) => {
      const vals = (list || []).map(pick);
      return {
        fc: meanOfNums_(vals.map((x) => x.fc)),
        fa: meanOfNums_(vals.map((x) => x.fa)),
        cu: meanOfNums_(vals.map((x) => x.cu)),
        e1: meanOfNums_(vals.map((x) => x.e1)),
        e2: meanOfNums_(vals.map((x) => x.e2)),
        e3: meanOfNums_(vals.map((x) => x.e3)),
        e4: meanOfNums_(vals.map((x) => x.e4)),
        e5: meanOfNums_(vals.map((x) => x.e5)),
      };
    };

    const bodyRows = [];
    const fundos = [...byFundo.keys()].sort((a, b) => {
      const c = fundoSortKey_(a) - fundoSortKey_(b);
      return c || String(a).localeCompare(String(b), "es");
    });

    fundos.forEach((fundo) => {
      const fundoLotes = byFundo.get(fundo) || [];
      let fN = 0;
      const fundoId = String(fundo);
      const byMod = new Map();
      fundoLotes.forEach((L) => {
        fN += Number(L.sampleCount) || 0;
        const mod = String(L.mod || "—");
        if (!byMod.has(mod)) byMod.set(mod, []);
        byMod.get(mod).push(L);
      });
      const mods = [...byMod.keys()].sort((a, b) => {
        const na = Number(String(a).replace(/\D/g, "")) || 0;
        const nb = Number(String(b).replace(/\D/g, "")) || 0;
        return na - nb || String(a).localeCompare(String(b), "es");
      });
      const modProms = [];
      const modBlocks = mods
        .map((mod) => {
          const lotes = byMod.get(mod) || [];
          let mN = 0;
          const modId = `${fundoId}|${mod}`;
          const byTur = new Map();
          lotes.forEach((L) => {
            mN += Number(L.sampleCount) || 0;
            const tur = String(L.tur || "—");
            if (!byTur.has(tur)) byTur.set(tur, []);
            byTur.get(tur).push(L);
          });
          const turKeys = [...byTur.keys()].sort(
            (a, b) => (Number(a) || 0) - (Number(b) || 0)
          );
          const turProms = [];
          const turBlocks = turKeys
            .map((tur) => {
              const turLotes = (byTur.get(tur) || []).slice().sort((a, b) => {
                const la = Number(String(a.loteNum).replace(/\D/g, "")) || 0;
                const lb = Number(String(b.loteNum).replace(/\D/g, "")) || 0;
                return la - lb || String(a.loteNum).localeCompare(String(b.loteNum), "es");
              });
              let tN = 0;
              const turId = `${modId}|${tur}`;
              const loteRows = turLotes
                .map((L) => {
                  tN += Number(L.sampleCount) || 0;
                  const label = L.loteLabel || `Lote ${L.loteNum || L.lote || "—"}`;
                  return `<tr class="lote-row is-collapsed" data-fundo-group="${escapeAttr(
                    fundoId
                  )}" data-mod-group="${escapeAttr(modId)}" data-tur-group="${escapeAttr(
                    turId
                  )}" hidden>
            <td>${escapeHtml(label)}</td>
            ${stageCells_({
              fc: L.fcAvg,
              fa: L.faAvg,
              cu: L.cuAvg,
              e1: L.e1Avg,
              e2: L.e2Avg,
              e3: L.e3Avg,
              e4: L.e4Avg,
              e5: L.e5Avg,
            })}
            ${totalCell_(L.total)}
          </tr>`;
                })
                .join("");
              const turFc = meanOfNums_(turLotes.map((L) => L.fcAvg));
              const turFa = meanOfNums_(turLotes.map((L) => L.faAvg));
              const turCu = meanOfNums_(turLotes.map((L) => L.cuAvg));
              const turP1 = meanOfNums_(turLotes.map((L) => L.e1Avg));
              const turP2 = meanOfNums_(turLotes.map((L) => L.e2Avg));
              const turP3 = meanOfNums_(turLotes.map((L) => L.e3Avg));
              const turP4 = meanOfNums_(turLotes.map((L) => L.e4Avg));
              const turP5 = meanOfNums_(turLotes.map((L) => L.e5Avg));
              const turTot = sumE1aE5_(turP1, turP2, turP3, turP4, turP5);
              turProms.push({
                fc: turFc,
                fa: turFa,
                cu: turCu,
                e1: turP1,
                e2: turP2,
                e3: turP3,
                e4: turP4,
                e5: turP5,
              });
              const turLabel = (() => {
                const t = String(tur || "").trim();
                if (isBlankHistToken_(t)) return "T—";
                if (/^T\d+/i.test(t)) return t.toUpperCase();
                return `T${t}`;
              })();
              return `<tr class="tur-row is-accordion is-collapsed" data-fundo-group="${escapeAttr(
                fundoId
              )}" data-mod-group="${escapeAttr(modId)}" data-tur-toggle="${escapeAttr(
                turId
              )}" aria-expanded="false" hidden>
          <td><span class="mod-caret" aria-hidden="true">▸</span> ${escapeHtml(
            turLabel
          )} <em class="mod-count">${turLotes.length} lote${
                turLotes.length === 1 ? "" : "s"
              } · ${tN} mues.</em></td>
          ${stageCells_({
            fc: turFc,
            fa: turFa,
            cu: turCu,
            e1: turP1,
            e2: turP2,
            e3: turP3,
            e4: turP4,
            e5: turP5,
          })}
          ${totalCell_(turTot)}
        </tr>${loteRows}`;
            })
            .join("");

          const modAvg = avgPackFrom_(turProms, (t) => t);
          const modTot = sumE1aE5_(
            modAvg.e1,
            modAvg.e2,
            modAvg.e3,
            modAvg.e4,
            modAvg.e5
          );
          modProms.push(modAvg);
          return `<tr class="mod-row is-accordion is-collapsed" data-fundo-group="${escapeAttr(
            fundoId
          )}" data-mod-toggle="${escapeAttr(modId)}" aria-expanded="false" hidden>
          <td><span class="mod-caret" aria-hidden="true">▸</span> ${escapeHtml(
            mod
          )} <em class="mod-count">${lotes.length} lote${
            lotes.length === 1 ? "" : "s"
          } · ${turKeys.length} turno${
            turKeys.length === 1 ? "" : "s"
          } · ${mN} mues.</em></td>
          ${stageCells_(modAvg)}
          ${totalCell_(modTot)}
        </tr>${turBlocks}`;
        })
        .join("");

      const fundoAvg = avgPackFrom_(modProms, (t) => t);
      const fundoTot = sumE1aE5_(
        fundoAvg.e1,
        fundoAvg.e2,
        fundoAvg.e3,
        fundoAvg.e4,
        fundoAvg.e5
      );
      bodyRows.push(
        `<tr class="fundo-row is-accordion is-collapsed" data-fundo-toggle="${escapeAttr(
          fundoId
        )}" aria-expanded="false">
          <td><span class="mod-caret" aria-hidden="true">▸</span> ${escapeHtml(
            fundo
          )} <em class="mod-count">${fundoLotes.length} lote${
          fundoLotes.length === 1 ? "" : "s"
        } · ${mods.length} mód. · ${fN} mues.</em></td>
          ${stageCells_(fundoAvg)}
          ${totalCell_(fundoTot)}
        </tr>${modBlocks}`
      );
    });

    if (sumEl) {
      sumEl.textContent = `${rows.length} lote${rows.length === 1 ? "" : "s"} · ${gN} muestra${
        gN === 1 ? "" : "s"
      } · Total ${fmtNum_(grandTotal, 1)}`;
    }

    if (!rows.length) {
      listEl.innerHTML = "";
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "Sin registros para estos filtros.";
      }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = `<table class="hist-kg-table hist-kg-compact">
      <thead><tr>
        <th>Campo</th>
        <th>1) Flor cerrada</th>
        <th>2) Flor abierta</th>
        <th>3) Cuajo</th>
        <th>4) E1</th>
        <th>5) E2</th>
        <th>6) E3</th>
        <th>7) E4</th>
        <th>8) E5</th>
        <th>Total</th>
      </tr></thead>
      <tbody>
        ${bodyRows.join("")}
        <tr class="total-row"><td>Total</td>${stageCells_({
          fc: grandFc,
          fa: grandFa,
          cu: grandCu,
          e1: grandP1,
          e2: grandP2,
          e3: grandP3,
          e4: grandP4,
          e5: grandP5,
        })}${totalCell_(grandTotal)}</tr>
      </tbody>
    </table>
    <p class="hist-kg-foot">${rows.length} lote${rows.length === 1 ? "" : "s"} · ${gN} muestra${
      gN === 1 ? "" : "s"
    } · toca Licapa → módulo → turno → lote</p>`;

    // Arranque: solo Licapa visible
    listEl.querySelectorAll("tr.mod-row, tr.tur-row, tr.lote-row").forEach((row) => {
      row.hidden = true;
      row.classList.add("is-collapsed");
      row.classList.remove("is-open");
      if (row.hasAttribute("aria-expanded")) row.setAttribute("aria-expanded", "false");
    });
    listEl.querySelectorAll("tr.fundo-row[data-fundo-toggle]").forEach((row) => {
      row.setAttribute("aria-expanded", "false");
      row.classList.add("is-collapsed");
      row.classList.remove("is-open");
    });

    listEl.querySelectorAll("[data-fundo-toggle]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() < historialReadyAt_) return;
        const fid = tr.getAttribute("data-fundo-toggle");
        const open = tr.getAttribute("aria-expanded") === "true";
        const next = !open;
        tr.setAttribute("aria-expanded", next ? "true" : "false");
        tr.classList.toggle("is-open", next);
        tr.classList.toggle("is-collapsed", !next);
        // Abrir Licapa → solo módulos (cerrados)
        listEl.querySelectorAll("tr.mod-row[data-fundo-group]").forEach((row) => {
          if (row.getAttribute("data-fundo-group") !== fid) return;
          row.hidden = !next;
          row.classList.add("is-collapsed");
          row.classList.remove("is-open");
          row.setAttribute("aria-expanded", "false");
        });
        listEl.querySelectorAll("tr.tur-row[data-fundo-group], tr.lote-row[data-fundo-group]").forEach((row) => {
          if (row.getAttribute("data-fundo-group") !== fid) return;
          row.hidden = true;
          row.classList.add("is-collapsed");
          row.classList.remove("is-open");
          if (row.hasAttribute("aria-expanded")) row.setAttribute("aria-expanded", "false");
        });
      });
    });

    listEl.querySelectorAll("[data-mod-toggle]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() < historialReadyAt_) return;
        const gid = tr.getAttribute("data-mod-toggle");
        const open = tr.getAttribute("aria-expanded") === "true";
        const next = !open;
        tr.setAttribute("aria-expanded", next ? "true" : "false");
        tr.classList.toggle("is-open", next);
        tr.classList.toggle("is-collapsed", !next);
        listEl.querySelectorAll("tr.tur-row[data-mod-group]").forEach((row) => {
          if (row.getAttribute("data-mod-group") !== gid) return;
          row.hidden = !next;
          row.classList.add("is-collapsed");
          row.classList.remove("is-open");
          row.setAttribute("aria-expanded", "false");
        });
        listEl.querySelectorAll("tr.lote-row[data-mod-group]").forEach((row) => {
          if (row.getAttribute("data-mod-group") !== gid) return;
          row.hidden = true;
          row.classList.add("is-collapsed");
        });
      });
    });

    listEl.querySelectorAll("[data-tur-toggle]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() < historialReadyAt_) return;
        const tid = tr.getAttribute("data-tur-toggle");
        const open = tr.getAttribute("aria-expanded") === "true";
        const next = !open;
        tr.setAttribute("aria-expanded", next ? "true" : "false");
        tr.classList.toggle("is-open", next);
        tr.classList.toggle("is-collapsed", !next);
        listEl.querySelectorAll("tr.lote-row[data-tur-group]").forEach((row) => {
          if (row.getAttribute("data-tur-group") !== tid) return;
          row.hidden = !next;
          row.classList.toggle("is-collapsed", !next);
        });
      });
    });
  }

  /** Responde al soltar el dedo/mouse, sin esperar el click lento del navegador. */
  function fastTap_(el, handler) {
    if (!el) return;
    el.__fastHandler = handler;
    if (el.dataset.fastTap === "1") return;
    el.dataset.fastTap = "1";
    let armed = false;
    let last = 0;
    const clear = () => {
      armed = false;
      el.classList.remove("is-pressed");
    };
    const run = (e) => {
      const now = Date.now();
      if (now - last < 280) return;
      last = now;
      clear();
      try {
        if (typeof el.__fastHandler === "function") el.__fastHandler(e);
      } catch (_) {}
    };
    el.addEventListener(
      "pointerdown",
      (e) => {
        if (e.isPrimary === false) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") return;
        armed = true;
        el.classList.add("is-pressed");
      },
      { passive: true }
    );
    el.addEventListener(
      "pointerup",
      (e) => {
        if (!armed) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        run(e);
      },
      { passive: false }
    );
    el.addEventListener("pointercancel", clear, { passive: true });
    el.addEventListener("lostpointercapture", clear, { passive: true });
    el.addEventListener("click", (e) => {
      if (Date.now() - last < 400) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      run(e);
    });
  }

  /* ——— Bind ——— */
  function bind() {
    bindCameraSheet_();
    fastTap_($("#btn-crear"), openCreateModal);
    fastTap_($("#btn-create-cancel"), closeCreateModal);
    $("#create-modal-backdrop")?.addEventListener("click", (e) => {
      if (Date.now() - createOpenedAt_ < 450) return;
      closeCreateModal();
    });
    fastTap_($("#btn-create-ok"), confirmCreate);
    // Campaña: solo lectura (año Lima actual)
    setCampanaLabel_(defaultCampana_());
    fastTap_($("#fab-options-btn"), (e) => {
      e.stopPropagation();
      const menu = $("#fab-menu");
      const btn = $("#fab-options-btn");
      if (!menu || !btn) return;
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    fastTap_($("#fab-logout"), () => {
      const menu = $("#fab-menu");
      const btn = $("#fab-options-btn");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
      logout_();
    });
    fastTap_($("#fab-update"), () => {
      const menu = $("#fab-menu");
      const btn = $("#fab-options-btn");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
      updateApp();
    });
    fastTap_($("#fab-cache"), () => {
      const menu = $("#fab-menu");
      const btn = $("#fab-options-btn");
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
      clearAllLocal();
    });
    document.addEventListener("pointerup", (e) => {
      const wrap = $("#fab-wrap");
      const menu = $("#fab-menu");
      const btn = $("#fab-options-btn");
      if (!wrap || !menu || menu.hidden) return;
      if (wrap.contains(e.target)) return;
      menu.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
    $("#qb-login-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      entrar_();
    });
    fastTap_($("#btn-login-next"), (e) => {
      e.preventDefault();
      loginNextStep_();
    });
    fastTap_($("#btn-login"), (e) => {
      e.preventDefault();
      entrar_();
    });
    fastTap_($("#btn-login-back"), (e) => {
      e.preventDefault();
      setLoginStep_(1);
      $("#login-error") && (($("#login-error").hidden = true), ($("#login-error").textContent = ""));
      setTimeout(() => $("#login-dni")?.focus(), 40);
    });
    $("#login-dni")?.addEventListener("input", (e) => {
      e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 8);
    });
    $("#login-dni")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loginNextStep_();
      }
    });
    $("#login-pass")?.addEventListener("input", (e) => {
      e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 8);
    });
    const pesoInp = $("#hist-peso-input");
    if (pesoInp) {
      pesoInp.value = String(histPeso_());
      let pesoTimer = 0;
      const applyPesoLive_ = () => {
        writePesoPref_(pesoInp.value);
        if (state.screen === "historial") renderHistorial();
      };
      pesoInp.addEventListener("input", () => {
        if (pesoTimer) clearTimeout(pesoTimer);
        pesoTimer = setTimeout(applyPesoLive_, 180);
      });
      pesoInp.addEventListener("change", applyPesoLive_);
      pesoInp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          pesoInp.blur();
          applyPesoLive_();
        }
      });
    }
    fastTap_($("#qb-kg-detail-close"), closeKgDetail_);
    fastTap_($("#qb-kg-detail-done"), closeKgDetail_);
    $("#qb-kg-detail")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "qb-kg-detail") closeKgDetail_();
    });
    fastTap_($("#last-send-card"), () => openLastSendDetail_());
    fastTap_($("#qb-last-detail-close"), closeLastSendDetail_);
    fastTap_($("#qb-last-detail-done"), closeLastSendDetail_);
    fastTap_($("#qb-last-send-prev"), () => shiftLastSend_(-1));
    fastTap_($("#qb-last-send-next"), () => shiftLastSend_(1));
    $("#qb-last-detail")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "qb-last-detail") closeLastSendDetail_();
    });
    fastTap_($("#sel-cartilla"), openCartillaSelect);
    fastTap_($("#sel-fundo"), openFundoSelect);
    fastTap_($("#sel-modulo"), openModuloSelect);

    fastTap_($("#btn-back-cartilla"), leaveCartilla);
    fastTap_($("#btn-muestra-prev"), () => switchMuestra(-1));
    fastTap_($("#btn-muestra-next"), () => switchMuestra(1));
    fastTap_($("#btn-cartilla-turno"), openCartillaTurnoSelect_);
    fastTap_($("#btn-cartilla-lote"), openCartillaLoteSelect_);
    fastTap_($("#btn-ir-resumen"), irResumen_);
    // Click directo: más fiable en la barra fija del resumen
    const bindResumenBtn_ = (el, fn) => {
      if (!el) return;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn(e);
      });
    };
    bindResumenBtn_($("#btn-back-resumen"), volverEditarResumen_);
    bindResumenBtn_($("#btn-editar-resumen"), volverEditarResumen_);
    bindResumenBtn_($("#btn-guardar"), () => {
      guardarCartilla();
    });

    fastTap_($("#btn-historial"), openHistorial);
    fastTap_($("#btn-back-historial"), () => {
      closeKgDetail_();
      showScreen("home");
      renderHomeList();
    });
    fastTap_($("#hist-filtro-aplicar"), () => applyHistFilters_());
    fastTap_($("#hist-filtro-modulo"), openHistModuloFilter_);
    fastTap_($("#hist-filtro-eval"), openHistEvalFilter_);
    fastTap_($("#hist-filtro-desde"), () => openHistDatePicker_("desde"));
    fastTap_($("#hist-filtro-hasta"), () => openHistDatePicker_("hasta"));
    bindHistDatePicker_();
    fastTap_($("#btn-sync-info"), openSyncModal);
    fastTap_($("#qb-sync-close"), closeSyncModal);
    fastTap_($("#qb-sync-done"), closeSyncModal);
    fastTap_($("#qb-sync-clear"), clearAllLocal);
    fastTap_($("#qb-sync-update"), updateApp);
    fastTap_($("#qb-sync-transfer"), runTransferMode);
    fastTap_($("#qb-transfer-done"), () => {
      const root = $("#qb-transfer");
      if (root) root.hidden = true;
    });

    const flushPending_ = () => {
      if (QB.API.pendingCount() > 0) QB.API.flushQueue({ includeOld: true });
      else toast("No hay pendientes", "info");
    };
    $$("#chip-pending, [data-chip-pending]").forEach((chip) => fastTap_(chip, flushPending_));

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
    window.addEventListener("qb:sync", (ev) => {
      updatePendingUi();
      const d = (ev && ev.detail) || {};
      // Recalcula tabla KG al avanzar sync / al terminar (pendientes que suben)
      if (state.screen === "historial" && (d.phase === "progress" || d.phase === "done" || d.phase === "start")) {
        renderHistorial();
      }
      if (state.screen === "home") renderHomeList();
      if (d.phase === "done" && Number(d.sent) > 0) {
        const n = Number(d.sent) || 0;
        const remain = Number(d.remain) || 0;
        const msg = remain
          ? `${n} subido${n === 1 ? "" : "s"} · ${remain} pendiente${remain === 1 ? "" : "s"}`
          : `${n} registro${n === 1 ? "" : "s"} subido${n === 1 ? "" : "s"} a la nube`;
        toast(msg, "ok");
        notifyPhone_("Fenología · Enviado", msg, "qb-proy-sent");
      } else if (d.phase === "done" && d.stale && Number(d.sent) > 0) {
        notifyPhone_(
          "Fenología · Parcial",
          `${d.sent} enviados · revisa pendientes`,
          "qb-proy-partial"
        );
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        persistNow_();
        return;
      }
      updateOnlineUi();
      updatePendingUi();
      // Sync suave al volver: no bloquear UI
      if (navigator.onLine && QB.API && QB.API.flushQueue) {
        try {
          QB.API.flushQueue({ soft: true, includeOld: true }).catch(() => {});
        } catch (_) {}
      }
    });

    // iOS/Android: al cortar la app o cambiar de pestaña
    window.addEventListener("pagehide", () => {
      persistNow_();
    });
    window.addEventListener("beforeunload", () => {
      persistNow_();
    });
    document.addEventListener("freeze", () => {
      persistNow_();
    });

    window.addEventListener("pageshow", (ev) => {
      const s = requireSession_({ show: true });
      if (!s) return;
      hideLogin_();
      updateOnlineUi();
      updatePendingUi();
      // No saltar a home si el usuario está en cartilla/resumen/historial
      if (!ev.persisted && state.screen === "home") renderHomeList();
      // Acceso: no cerrar si hay trabajo en curso
      revisarAccesoDni_(s.dni, { clear: true }).catch(() => {});
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      const s = requireSession_({ show: true });
      if (!s) return;
      hideLogin_();
      revisarAccesoDni_(s.dni, { clear: true }).catch(() => {});
    });
  }

  async function init() {
    mountActionBars_();
    bind();
    bindKeyboardBar_();
    setupInstall();
    updateOnlineUi();

    const session = requireSession_({ show: true });
    if (!session) {
      showScreen("home");
      return;
    }

    applySession_(session);
    hideLogin_();
    showScreen("home");
    ensureNotifyPermission_().catch(() => {});

    try {
      await QB.Data.ensureCatalogs();
    } catch (_) {}
    try {
      if (QB.API.whenReady) await QB.API.whenReady();
    } catch (_) {}

    if (!readSession_()) {
      showLogin_("");
          return;
        }

    updatePendingUi();
    renderHomeList();

    if (navigator.onLine && QB.API.shouldAutoSync && QB.API.shouldAutoSync()) {
      try {
        QB.API.flushQueue({ soft: true, includeOld: true }).catch(() => {});
      } catch (_) {}
    }
    revisarAccesoDni_(session.dni, { clear: true }).catch(() => {});
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
    persistNow: persistNow_,
    hasWorkInProgress: hasWorkInProgress_,
    toastSoft: toastSoft_,
  };
})();
