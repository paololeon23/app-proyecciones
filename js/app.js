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
    const o = { observacion: "" };
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
    // Migrar observación vieja (de cartilla) a cada muestra si aún no tiene
    const legacy = String(cartilla.observacion || "").trim();
    cartilla.samples.forEach((s, i) => {
      if (!s || typeof s !== "object") {
        cartilla.samples[i] = emptySample_();
        return;
      }
      if (s.observacion == null) s.observacion = "";
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
      campana: (QB.CONFIG && QB.CONFIG.CAMPANA_DEFAULT) || "2026 - II",
      observacion: "",
      samples,
      ...(partial || {}),
    };
  }

  function defaultCampana_() {
    return (QB.CONFIG && QB.CONFIG.CAMPANA_DEFAULT) || "2026 - II";
  }

  function campanaOptions_(query) {
    const q = String(query || "").trim().toLowerCase();
    const list = (QB.CAMPANAS || []).map((c) => ({
      id: c.id,
      label: c.label || c.id,
      meta: "Campaña",
    }));
    if (!list.length) {
      const d = defaultCampana_();
      return [{ id: d, label: d, meta: "Campaña" }];
    }
    if (!q) return list;
    return list.filter(
      (o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
  }

  function setCampanaLabel_(value) {
    const el = $("#sel-campana-label");
    if (el) el.textContent = value || defaultCampana_();
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
  function showScreen(id) {
    if (!readSession_()) {
      setAuthUi_(false);
      const gate = $("#qb-login");
      if (gate) gate.hidden = false;
      id = "home";
    }
    state.screen = id;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${id}`));
    document.body.dataset.qbScreen = id;
    // Salir de cartilla: bajar barra (como Calidad)
    if (id !== "cartilla") resetKeyboardBar_();
    // Asegura que las barras visibles reciban toques
    const unlocked = !!readSession_();
    $$("body > .form-actions").forEach((bar) => {
      const on =
        unlocked &&
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

  function showLogin_(message) {
    setAuthUi_(false);
    const gate = $("#qb-login");
    const err = $("#login-error");
    if (gate) gate.hidden = false;
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

  async function entrar_() {
    const dniEl = $("#login-dni");
    const passEl = $("#login-pass");
    const dni = String(dniEl && dniEl.value || "").replace(/\D/g, "");
    const pass = String(passEl && passEl.value || "").replace(/\D/g, "");
    const err = $("#login-error");
    const say = (msg) => {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || "";
    };
    if (!/^\d{8}$/.test(dni)) {
      say("El DNI debe tener 8 dígitos.");
      return;
    }
    if (pass !== dni) {
      say("La contraseña es tu mismo DNI.");
      return;
    }
    const btn = $("#btn-login");
    if (btn) btn.disabled = true;
    say("");
    const res = await QB.API.checkAcceso(dni);
    if (btn) btn.disabled = false;
    if (!res || res.offline || res.activo == null) {
      say("Sin señal. Entra cuando tengas internet.");
      return;
    }
    if (res.activo !== true) {
      say("Sin acceso. Este DNI está desactivado.");
      return;
    }
    const session = { dni, nombre: res.nombre || "" };
    writeSession_(session);
    applySession_(session);
    if (passEl) passEl.value = "";
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

  function resetCreateForm_() {
    const prefs = readPrefs_();
    const defaultCartilla = (QB.CARTILLAS && QB.CARTILLAS[0]) || {
      id: "proyecciones",
      label: "Proyecciones",
    };
    const session = readSession_();
    const campana = prefs.campana || defaultCampana_();
    // Tras guardar, módulo/turno/lote quedan vacíos para elegir de nuevo
    state.create = {
      evaluadorId: (session && session.dni) || "",
      evaluadorNombre: (session && session.nombre) || "",
      cartillaId: defaultCartilla.id,
      cartillaLabel: defaultCartilla.label,
      campana,
      modulo: "",
      turno: "",
      loteId: "",
      loteMeta: null,
    };
    setSelectLabel($("#sel-cartilla"), defaultCartilla.label || "");
    setCampanaLabel_(campana);
    setSelectLabel($("#sel-modulo"), "");
    setSelectLabel($("#sel-turno"), "");
    setSelectLabel($("#sel-lote"), "");
  }

  function clearSelectsAfterSave_() {
    writePrefs_({
      modulo: "",
      turno: "",
      cartillaId: "proyecciones",
      cartillaLabel: "Proyecciones",
    });
    state.create.modulo = "";
    state.create.turno = "";
    state.create.loteId = "";
    state.create.loteMeta = null;
    state.create.cartillaId = "proyecciones";
    state.create.cartillaLabel = "Proyecciones";
    setSelectLabel($("#sel-cartilla"), "Proyecciones");
    setSelectLabel($("#sel-modulo"), "");
    setSelectLabel($("#sel-turno"), "");
    setSelectLabel($("#sel-lote"), "");
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
  }

  let createOpenedAt_ = 0;

  function closeCreateModal(opts) {
    const modal = $("#create-modal");
    if (!modal) return;
    // Evita que el mismo toque de CREAR cierre el modal al instante
    if (!(opts && opts.force) && Date.now() - createOpenedAt_ < 450) return;
    modal.classList.remove("open");
    setTimeout(() => {
      modal.hidden = true;
    }, 180);
  }

  function openCampanaSelect() {
    QB.PreciseSelect.open({
      title: "Campaña",
      hideSearch: true,
      value: state.create.campana || defaultCampana_(),
      getOptions: (q) => campanaOptions_(q),
      onSelect: (opt) => {
        state.create.campana = opt.id || opt.label;
        setCampanaLabel_(state.create.campana);
      },
    });
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

  function openModuloSelect() {
    QB.PreciseSelect.open({
      title: "Módulo",
      hideSearch: true,
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
      hideSearch: true,
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
      hideSearch: true,
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

  /** Pregunta a la nube. Solo bloquea si responde activo:false. Sin señal no cierra la sesión. */
  async function revisarAccesoDni_(dni, opts) {
    const id = String(dni || "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(id) || !QB.API.checkAcceso) return true;
    const res = await QB.API.checkAcceso(id);
    if (!res || res.offline || res.activo == null) return true;
    if (res.activo === true) return true;
    toast("Sin acceso. Este DNI está desactivado.", "warn");
    if (opts && opts.clear) logout_("Sin acceso. Este DNI está desactivado.");
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
    const campana = c.campana || defaultCampana_();
    writePrefs_({
      evaluadorId: c.evaluadorId,
      evaluadorNombre: c.evaluadorNombre,
      cartillaId: c.cartillaId,
      cartillaLabel: c.cartillaLabel,
      campana,
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
      campana,
      modulo: QB.Data.normalizeModulo(meta.modulo || c.modulo),
      turno: String(meta.turno || c.turno),
      loteId: c.loteId,
      loteNum: String(meta.lote || ""),
      loteCode: QB.Data.formatLoteCode(meta) || String(meta.codLote || c.loteId),
      etapa: meta.etapa || "",
      variedad: meta.variedad || "",
      area: meta.area != null && meta.area !== "" ? meta.area : "",
      observacion: "",
    });
    // Abrir ya: el GET de acceso a Google puede tardar varios segundos
    closeCreateModal({ force: true });
    openCartilla(cartilla, 0);
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
          <p class="resumen-meta-kicker">Ubicación</p>
          <strong class="resumen-meta-lote">${escapeHtml(c.loteCode || "—")}</strong>
          <div class="resumen-meta-row">
            <span><em>Módulo</em><b>${escapeHtml(c.modulo || "—")}</b></span>
            <span><em>Turno</em><b>${escapeHtml(c.turno || "—")}</b></span>
            <span><em>Lote</em><b>${escapeHtml(c.loteNum || "—")}</b></span>
          </div>
        </div>
        <div class="resumen-meta-side">
          <span><em>Campaña</em><b>${escapeHtml(c.campana || defaultCampana_())}</b></span>
          <span><em>Muestras</em><b>${samples.length}</b></span>
        </div>`;
    }
    const fields = QB.SAMPLE_FIELDS || [];
    if (listEl) {
      listEl.innerHTML = samples
        .map((s, i) => {
          const cells = fields
            .map((f) => {
              const v = s[f.id];
              const show = v === "" || v == null ? "—" : escapeHtml(v);
              const full = f.id === "e5" ? " is-full" : "";
              return `<div class="resumen-cell${full}"><em>${escapeHtml(f.label)}</em><b>${show}</b></div>`;
            })
            .join("");
          const sampleObs = String(s.observacion || "").trim();
          return `<article class="resumen-sample">
            <header><span>Muestra</span><strong>${i + 1}</strong></header>
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
        <textarea id="cartilla-obs" rows="3" placeholder="Opcional · solo esta muestra">${escapeHtml(
          sample.observacion || ""
        )}</textarea>
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
        if (!state.cartilla.samples[state.muestraIndex]) {
          state.cartilla.samples[state.muestraIndex] = emptySample_();
        }
        state.cartilla.samples[state.muestraIndex].observacion = obs.value;
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
    const nombre = String(cartilla.evaluadorNombre || "").trim();
    const dni = String(cartilla.evaluadorId || "").replace(/\D/g, "");
    const samples = ensureSamples_(cartilla).filter(sampleHasData_);
    const rows = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] || emptySample_();
      const row = {
        Lote: cartilla.loteCode || "",
        Fecha: cartilla.fecha || todayISO_(),
        DNI: dni,
        Nombre: nombre,
        "N° Muestra": i + 1,
        Observación: s.observacion || "",
        "Foto cabecera": "",
        Modulo: cartilla.modulo || "",
        Turno: cartilla.turno || "",
        Lotes: cartilla.loteNum || "",
        Semana: semana,
        Etapa: cartilla.etapa || "",
        Variedad: cartilla.variedad || "",
        Area: cartilla.area || "",
        Campaña: cartilla.campana || defaultCampana_(),
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
    if (!requireSession_()) return;
    if (state.saving || !state.cartilla) return;
    if (state.screen !== "resumen") {
      await irResumen_();
      return;
    }
    if (Date.now() < resumenReadyAt_) return;
    const c = state.cartilla;
    pruneEmptySamples_(c);
    const samples = ensureSamples_(c).filter(sampleHasData_);
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
      const rows = buildRowsForSave_(c);
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
          campana: c.campana || defaultCampana_(),
          observacion: "",
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
        variedad: c.variedad || "",
        area: c.area != null && c.area !== "" ? c.area : "",
        etapa: c.etapa || "",
        campana: c.campana || defaultCampana_(),
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
      clearSelectsAfterSave_();
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
    const syncAt = QB.API.getLastSyncAt ? QB.API.getLastSyncAt() : 0;

    if (latest) {
      const isPending = pending.has(latest.clientId);
      const parts = formatLastSendParts_(latest.at || syncAt);
      const n = Number(latest.sampleCount) || (Array.isArray(latest.samples) ? latest.samples.length : 0);
      const samplesTxt = n > 0 ? `${n} muestra${n === 1 ? "" : "s"}` : "";
      titleEl.textContent = latest.loteCode || latest.cartillaLabel || "Cartilla";
      if (typeEl) {
        typeEl.hidden = false;
        typeEl.textContent = latest.cartillaLabel || "Proyecciones";
      }
      const line1 = [latest.fecha || "", parts.date].filter(Boolean).join(" · ");
      const line2 = [parts.time, samplesTxt].filter(Boolean).join(" · ");
      textEl.innerHTML = "";
      if (line1) {
        const a = document.createElement("span");
        a.className = "last-send-line";
        a.textContent = line1;
        textEl.appendChild(a);
      }
      if (line2) {
        const b = document.createElement("span");
        b.className = "last-send-line";
        b.textContent = line2;
        textEl.appendChild(b);
      }
      if (!line1 && !line2) textEl.textContent = "—";
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
      const parts = formatLastSendParts_(syncAt);
      titleEl.textContent = "Sincronización reciente";
      if (typeEl) {
        typeEl.hidden = false;
        typeEl.textContent = "Proyecciones";
      }
      textEl.innerHTML = "";
      const a = document.createElement("span");
      a.className = "last-send-line";
      a.textContent = "Último sync";
      textEl.appendChild(a);
      if (parts.date || parts.time) {
        const b = document.createElement("span");
        b.className = "last-send-line";
        b.textContent = [parts.date, parts.time].filter(Boolean).join(", ");
        textEl.appendChild(b);
      }
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

  function openHistorial() {
    if (!requireSession_()) return;
    showScreen("historial");
    const go = () => {
      renderHistorial();
      updateOnlineUi();
      updatePendingUi();
    };
    if (QB.Data && QB.Data.ensureCatalogs) {
      Promise.resolve(QB.Data.ensureCatalogs()).then(go).catch(go);
    } else {
      go();
    }
  }

  function histPeso_() {
    const n = Number(QB.CONFIG && QB.CONFIG.PESO_BAYA_G);
    return Number.isFinite(n) && n > 0 ? n : 2.6;
  }

  function histDensidad_() {
    const n = Number(QB.CONFIG && QB.CONFIG.DENSIDAD_PLANTAS_HA);
    return Number.isFinite(n) && n > 0 ? n : 6500;
  }

  function avgE5_(samples) {
    if (!Array.isArray(samples) || !samples.length) return null;
    let sum = 0;
    let n = 0;
    samples.forEach((s) => {
      const v = Number(String(s && s.e5 != null ? s.e5 : "").replace(",", "."));
      if (Number.isFinite(v)) {
        sum += v;
        n += 1;
      }
    });
    return n ? sum / n : null;
  }

  function positiveArea_(v) {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function enrichHistRow_(raw, statusHint) {
    const loteCode = raw.lote || raw.loteCode || "";
    const loteKey = raw.loteNum || loteCode;
    const meta =
      (QB.Data && QB.Data.loteMeta && loteKey ? QB.Data.loteMeta(loteKey) : null) || {};
    const metaAlt =
      loteCode && loteCode !== loteKey && QB.Data && QB.Data.loteMeta
        ? QB.Data.loteMeta(loteCode)
        : null;
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
      modulo: raw.modulo || meta.modulo || (metaAlt && metaAlt.modulo) || "—",
      turno:
        raw.turno != null && raw.turno !== ""
          ? String(raw.turno)
          : meta.turno || (metaAlt && metaAlt.turno) || "—",
      variedad: raw.variedad || meta.variedad || (metaAlt && metaAlt.variedad) || "—",
      area,
      bayas,
      peso,
      kgHa,
      kgTot,
      loteCode,
    };
  }

  function fmtNum_(n, dec) {
    if (n == null || !Number.isFinite(n)) return "—";
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

    reconcileLocalListStatus_();
    const pendingIds = pendingIds_();
    const localById = {};
    readLocalList_().forEach((x) => {
      if (x && x.clientId) localById[x.clientId] = x;
    });

    const localSent = readLocalList_()
      .filter((x) => x && !pendingIds.has(x.clientId))
      .map((x) => ({
        id: x.clientId,
        clientId: x.clientId,
        status: "sent",
        at: x.at ? new Date(x.at).toISOString() : "",
        fecha: x.fecha || "",
        lote: x.loteCode || "",
        loteCode: x.loteCode || "",
        loteNum: x.loteNum || "",
        modulo: x.modulo || "",
        turno: x.turno || "",
        variedad: x.variedad || "",
        area: x.area,
        evaluador: x.evaluador || "",
        cartillaLabel: x.cartillaLabel || "Proyecciones",
        sampleCount: x.sampleCount || (Array.isArray(x.samples) ? x.samples.length : 0) || 0,
        samples: Array.isArray(x.samples) ? x.samples : [],
      }));

    history = history.map((h) => {
      const loc = localById[h.clientId];
      if (!loc) return h;
      return {
        ...h,
        fecha: h.fecha || loc.fecha || "",
        sampleCount: h.sampleCount || loc.sampleCount || 0,
        samples: (h.samples && h.samples.length ? h.samples : loc.samples) || [],
        cartillaLabel: h.cartillaLabel || loc.cartillaLabel || "Proyecciones",
        lote: h.lote || loc.loteCode || "",
        loteCode: h.lote || loc.loteCode || "",
        loteNum: h.loteNum || loc.loteNum || "",
        modulo: h.modulo || loc.modulo || "",
        turno: h.turno || loc.turno || "",
        variedad: h.variedad || loc.variedad || "",
        area: h.area != null && h.area !== "" ? h.area : loc.area,
        evaluador: h.evaluador || loc.evaluador || "",
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

    readLocalList_().forEach((x) => {
      if (!x || !x.clientId || !pendingIds.has(x.clientId)) return;
      const id = String(x.clientId);
      if (seen.has(id)) return;
      seen.add(id);
      history.push({
        ...x,
        status: "pending",
        lote: x.loteCode || "",
        at: x.at ? new Date(x.at).toISOString() : "",
      });
    });

    history.sort(
      (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
    );

    const rows = history.map((h) =>
      enrichHistRow_(
        {
          ...h,
          evaluador: h.evaluador || "",
          cartillaLabel: h.cartillaLabel || "Proyecciones",
          sampleCount: h.sampleCount || (Array.isArray(h.samples) ? h.samples.length : 0) || 0,
        },
        pendingIds.has(h.clientId) ? "pending" : "sent"
      )
    );

    const sentN = rows.filter((r) => r.status === "sent").length;
    if (sumEl) {
      sumEl.textContent = `${pendingN} pendiente${pendingN === 1 ? "" : "s"} · ${sentN} enviado${sentN === 1 ? "" : "s"} · Peso ${fmtNum_(histPeso_(), 2)} g`;
    }

    if (!rows.length) {
      listEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = rows
      .map((r, idx) => {
        const st = r.status === "sent" ? "sent" : "pending";
        const stLabel = st === "sent" ? "Enviado" : "Llenar";
        const lote = escapeHtml(r.loteCode || "—");
        const when = escapeHtml(formatHistTime_(r.at));
        const nSamples = Number(history[idx] && history[idx].sampleCount) || 0;
        const evalName = escapeHtml((history[idx] && history[idx].evaluador) || "—");
        const cartilla = escapeHtml((history[idx] && history[idx].cartillaLabel) || "Proyecciones");
        return `<article class="hist-card ${st}">
          <div class="hist-summary">
            <div class="hist-card-top">
              <strong class="hist-lote">${lote}</strong>
              <span class="hist-badge">${stLabel}</span>
          </div>
            <p class="hist-line">${cartilla} · ${evalName}</p>
            <p class="hist-line hist-meta-line">${escapeHtml(r.modulo)} · Turno ${escapeHtml(r.turno)} · ${escapeHtml(r.variedad)}</p>
            <div class="hist-metrics">
              <div><span>Area</span><strong>${r.area == null ? "—" : fmtNum_(r.area, 2)}</strong></div>
              <div><span>Bayas E5</span><strong>${r.bayas == null ? "—" : fmtNum_(r.bayas, 0)}</strong></div>
              <div><span>Peso</span><strong>${fmtNum_(r.peso, 2)} g</strong></div>
              <div><span>kg/ha</span><strong>${r.kgHa == null ? "—" : fmtNum_(r.kgHa, 0)}</strong></div>
              <div class="hist-metric-total">
                <span>${r.kgTot != null ? "kg totales" : "kg/ha"}</span>
                <strong>${
                  r.kgTot != null
                    ? fmtNum_(r.kgTot, 0)
                    : r.kgHa == null
                      ? "—"
                      : fmtNum_(r.kgHa, 0)
                }</strong>
                ${
                  r.kgTot != null
                    ? `<em class="hist-metric-note">kg/ha ${fmtNum_(r.kgHa, 0)} · área ${fmtNum_(r.area, 2)}</em>`
                    : r.kgHa != null
                      ? `<em class="hist-metric-note">Sin área del lote · no hay kg totales</em>`
                      : ""
                }
              </div>
        </div>
            <div class="hist-summary-foot">
              <span class="hist-muestras">${nSamples} muestra${nSamples === 1 ? "" : "s"}</span>
              <span class="hist-time">${when}</span>
          </div>
          </div>
        </article>`;
      })
      .join("");
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
    fastTap_($("#btn-crear"), openCreateModal);
    fastTap_($("#btn-create-cancel"), closeCreateModal);
    $("#create-modal-backdrop")?.addEventListener("click", (e) => {
      if (Date.now() - createOpenedAt_ < 450) return;
      closeCreateModal();
    });
    fastTap_($("#btn-create-ok"), confirmCreate);
    fastTap_($("#sel-campana"), openCampanaSelect);
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
    fastTap_($("#btn-login"), (e) => {
      e.preventDefault();
      entrar_();
    });
    $("#login-dni")?.addEventListener("input", (e) => {
      e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 8);
    });
    $("#login-pass")?.addEventListener("input", (e) => {
      e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 8);
    });
    fastTap_($("#sel-cartilla"), openCartillaSelect);
    fastTap_($("#sel-modulo"), openModuloSelect);
    fastTap_($("#sel-turno"), openTurnoSelect);
    fastTap_($("#sel-lote"), openLoteSelect);

    fastTap_($("#btn-back-cartilla"), leaveCartilla);
    fastTap_($("#btn-muestra-prev"), () => switchMuestra(-1));
    fastTap_($("#btn-muestra-next"), () => switchMuestra(1));
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
      showScreen("home");
      renderHomeList();
    });
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
      if (state.screen === "historial") renderHistorial();
      if (state.screen === "home") renderHomeList();
      const d = (ev && ev.detail) || {};
      if (d.phase === "done" && Number(d.sent) > 0) {
        const n = Number(d.sent) || 0;
        const remain = Number(d.remain) || 0;
        const msg = remain
          ? `${n} subido${n === 1 ? "" : "s"} · ${remain} pendiente${remain === 1 ? "" : "s"}`
          : `${n} registro${n === 1 ? "" : "s"} subido${n === 1 ? "" : "s"} a la nube`;
        toast(msg, "ok");
        notifyPhone_("Proyecciones · Enviado", msg, "qb-proy-sent");
      } else if (d.phase === "done" && d.stale && Number(d.sent) > 0) {
        notifyPhone_(
          "Proyecciones · Parcial",
          `${d.sent} enviados · revisa pendientes`,
          "qb-proy-partial"
        );
      }
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

    window.addEventListener("pageshow", () => {
      const s = requireSession_({ show: true });
      if (!s) return;
      hideLogin_();
      updateOnlineUi();
      updatePendingUi();
      renderHomeList();
      revisarAccesoDni_(s.dni, { clear: true });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      const s = requireSession_({ show: true });
      if (!s) return;
      hideLogin_();
      revisarAccesoDni_(s.dni, { clear: true });
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
      QB.API.flushQueue({ includeOld: true });
    }
    revisarAccesoDni_(session.dni, { clear: true });
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
