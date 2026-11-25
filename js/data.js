/** Catálogos de campo: lotes + evaluadores (DNI) */
window.QB = window.QB || {};

QB.Data = (() => {
  let ready = false;
  let loading = null;
  let lotes = [];
  let lotesById = {};
  /** Catálogo fijo embebido — siempre disponible (no depende de fetch) */
  let evaluadores = {
    "18078464": { nombre: "LOYOLA DOMINGUEZ OSWALDO ELMER" },
    "40354659": { nombre: "REYES JAVE LOURDES LIZETH" },
    "44262821": { nombre: "CHAVEZ CABRERA MARIBEL VICENTA" },
    "45123552": { nombre: "LINARES CERNA OSCAR PAUL" },
    "45305359": { nombre: "URTEAGA SHIMIZU YEHAN EVELYN" },
    "45608103": { nombre: "GAVIDIA RAMIREZ LUIGI ANDERSON" },
    "46819781": { nombre: "PEREZ LEON SALLY ELIZABETH" },
    "47188311": { nombre: "PEREIRA VASQUEZ LUCELIA LEONORA" },
    "47407697": { nombre: "ROLDAN PEREZ JULIO ANTONIO" },
    "48489693": { nombre: "HUACCHA TERRONES ESTHEFANI LIZBETH" },
    "48962428": { nombre: "CALVANAPON LOPEZ CARLOS MAGNO" },
    "60036529": { nombre: "CHUAN MIRANDA DANIELA MILAGRITOS" },
    "60208178": { nombre: "GUARNIZ BRIONES EVELYN MARDELI" },
    "60293807": { nombre: "QUIROZ MEDINA QUELUBIA" },
    "60412486": { nombre: "LEON CARRANZA YHULEISY ALEXANDRA" },
    "60412552": { nombre: "TAMARIZ LOPEZ VICTOR JANPIER" },
    "60412805": { nombre: "DIAZ SOTO SANDRA GRABIELA" },
    "60461272": { nombre: "NOE LEZAMA DANNER JANO" },
    "60461291": { nombre: "PAISIG ALFARO WILMER MANUEL" },
    "60461308": { nombre: "ALCANTARA VIGO DANIEL ELIAS" },
    "60532091": { nombre: "CARRANZA MAMANI LUIS ANDERSON" },
    "60554649": { nombre: "CARRANZA DIAZ ARIANA JESUSANITA" },
    "60600072": { nombre: "VIGO PAREDES GABRIELA ANAIS" },
    "60633034": { nombre: "SANGAY CABANILLAS RICARDO FRANCO" },
    "60740851": { nombre: "HORNA JUAREZ ROSALINA NOEMI" },
    "61256413": { nombre: "SALDAÑA POEMAPE JULEISY ALEXANDRA" },
    "61256446": { nombre: "RUMAY DIAZ KEVIN ELISEO" },
    "61256447": { nombre: "RUMAY DIAZ LAZARO RENE" },
    "61669930": { nombre: "SEGURA NEYRA YENNY LISET" },
    "62162097": { nombre: "LLANOS SANCHEZ DAYANA NICOLE" },
    "62585049": { nombre: "RODRIGUEZ DAGA ERICKA ELIZABETH" },
    "62749305": { nombre: "ARANDA SOLIS VALERIA YAMILET" },
    "62894779": { nombre: "VILLALOBOS CARRANZA YURICO NATALY" },
    "70132627": { nombre: "MIRANDA PALACIOS ERNESTINA EVELYN" },
    "70134863": { nombre: "RIMACHE RAVINES GERSON ELIEZER" },
    "70142292": { nombre: "YRRIBARREN MERCEDES PEDRO JESUS" },
    "70550707": { nombre: "REYES SANGAY JUAN SAMUEL" },
    "70650830": { nombre: "LIMA PALOMINO MAURICIO RENATO" },
    "70658198": { nombre: "FLORES MARIÑOS ELIZA GIANELLA" },
    "70667311": { nombre: "ALCANTARA VIGO BELCY GABRIELITA" },
    "70735997": { nombre: "DIAZ SOTO MARIA FERNANDA" },
    "70901533": { nombre: "GALLARDO CHUQUIPOMA KENIA STEPHANY" },
    "71099835": { nombre: "MERINO ISLA JEFFERSON ALEXIS" },
    "71149417": { nombre: "CABRERA PEREZ CARLOS SAÚL" },
    "71327899": { nombre: "MURGA CASTILLO KEVIN WILLIAMS" },
    "71327907": { nombre: "HUACCHA TERRONES FRANCO EMANUEL" },
    "71367059": { nombre: "MELON VILLANUEVA KARINA ELIZABETH" },
    "71509838": { nombre: "CANO OLIVARES FATIMA DANIELA" },
    "71729579": { nombre: "VISITACION PEÑA ANDERSON DANY" },
    "72096348": { nombre: "DIOSES MENDOZA FLOR MARIA" },
    "72743323": { nombre: "VILLANUEVA CAYPO ELIZABETH NOEMI" },
    "72795195": { nombre: "QUISPE ZERPA MARIA ELENA" },
    "72799496": { nombre: "VASQUEZ CARDENAS CRISTIAN OLIVER" },
    "72967660": { nombre: "LLANOS SANCHEZ NAYELI DE LOS ANGELES" },
    "74292255": { nombre: "ESTACIO HUAMAN CLAUDIA LUCIA" },
    "74571779": { nombre: "BRICEÑO SEVILLANO ALBERTO MAURO" },
    "74662085": { nombre: "OLGUIN OVALLE BRAYAN GIOVANI" },
    "74969230": { nombre: "MONTALVO PEREZ SAIDY PATRICIA" },
    "75023790": { nombre: "BUENO VELEZMORO DEYSI ELIZABETH" },
    "75023887": { nombre: "SIPIRAN BAUTISTA OSCAR RUBEN" },
    "75078526": { nombre: "LOZADA PAJARES JOSE JULIAN" },
    "75138175": { nombre: "RUGEL AVILA CYNTHIA ELIZABETH" },
    "75278098": { nombre: "MACHUCA ALVAREZ LUIGUI JANPIER" },
    "75501379": { nombre: "SALVADOR FLOREANO LUZ DEL ROCIO" },
    "75901806": { nombre: "PLASENCIA GASTOPE ESMERALDA ALEXANDRA" },
    "76173220": { nombre: "GUTIERREZ VALQUI ETHEL YAMELI" },
    "76313065": { nombre: "RODRIGUEZ AGUILAR ARIANA MILAGROS" },
    "76371313": { nombre: "CORTEZ PAJARES PERLA MABEL" },
    "76418254": { nombre: "BALERIO CARRANZA ERICK IVAN" },
    "76977945": { nombre: "CASTRO SANCHEZ MARIA VALENTINA" },
    "77418497": { nombre: "DIAZ SOTO ROXANA" },
    "77505282": { nombre: "LANDAURO GUTIERREZ SARALEE SOFIA" },
    "77679860": { nombre: "COTRINA ABANTO ESMELA LIZBETH" },
    "77799828": { nombre: "ZAVALETA IGLESIAS KAHORY MARIANELA" },
  };

  /** Árbol oficial: Etapa → Módulo → Turno → [lotes] (no mezclar etapas) */
  let lotesTree = null;
  let lotesTreeAllow_ = new Set();

  /** Semilla embebida (lotes / evaluadores) si falla fetch */
  function applySeed_() {
    const seed = (window.QB && window.QB.SEED) || {};
    if (seed.evaluadores && Object.keys(evaluadores).length === 0) {
      evaluadores = Object.assign({}, seed.evaluadores);
    }
    if (seed.lotesTree && !lotesTree) {
      setLotesTree_(seed.lotesTree);
    }
    // Lotes siempre desde semilla si el catálogo aún está vacío (offline / SW)
    if (Array.isArray(seed.lotes) && seed.lotes.length && lotes.length === 0) {
      buildLoteCatalog(seed.lotes, lotesTree);
    }
  }
  applySeed_();

  function dataUrl_(rel) {
    try {
      return new URL(rel, document.baseURI || location.href).href;
    } catch {
      return rel;
    }
  }

  /** Corrige UTF-8 leído como Latin-1 (ej. MÃ¡gica → Mágica) */
  function fixMojibake_(s) {
    const t = String(s || "");
    if (!t || !/[\u00C3\u00C2]/.test(t)) return t;
    try {
      const bytes = Uint8Array.from(t, (ch) => ch.charCodeAt(0) & 0xff);
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return t;
    }
  }

  const VARIEDAD_MAP = {
    "SEKOYA POP": "S. Pop",
    "S. POP": "S. Pop",
    "S. Pop": "S. Pop",
    "Sekoya Pop": "S. Pop",
    MAGICA: "Mágica",
    "MAGICA": "Mágica",
    "MÁGICA": "Mágica",
    "Mágica": "Mágica",
    Magica: "Mágica",
    "MÃ¡gica": "Mágica",
  };

  /** I / II / III / IV — orden de más largo a más corto (III ≠ II) */
  function etapaKind(etapa) {
    const e = String(etapa || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
    if (!e) return "";
    if (e.includes("I/II") || e.includes("I / II")) return "I/II";
    if (/\bIV\b/.test(e) || e.includes("LICAPA IV")) return "IV";
    if (/\bIII\b/.test(e) || e.includes("LICAPA III")) return "III";
    if (/\bII\b/.test(e) || e.includes("LICAPA II")) return "II";
    if (/\bI\b/.test(e) || e.includes("LICAPA I")) return "I";
    return "";
  }

  function fundoLabel_(id) {
    const k = String(id || "").trim().toUpperCase();
    if (k === "I") return "Licapa I";
    if (k === "II") return "Licapa II";
    if (k === "III") return "Licapa III";
    if (k === "IV") return "Licapa IV";
    if (k === "I/II") return "Licapa I/II";
    return "";
  }

  /** ¿El lote pertenece al fundo seleccionado (I–IV)? Exacto: no mezcla I con II. */
  function matchesFundo_(loteEtapa, fundoId) {
    const want = String(fundoId || "").trim().toUpperCase();
    if (!want) return true;
    const kind = etapaKind(loteEtapa);
    if (!kind) return false;
    // Legado I/II solo si aún existiera en caché vieja
    if (kind === "I/II") return want === "I" || want === "II";
    return kind === want;
  }

  function normalizeLoteToken_(v) {
    return String(v ?? "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function treeSlotKey_(etapa, modulo, turno, lote) {
    const kind = etapaKind(etapa) || String(etapa || "").trim().toUpperCase();
    const mod = normalizeModulo_(modulo);
    const tur = String(turno ?? "").trim();
    const lot = normalizeLoteToken_(lote).toUpperCase();
    return `${kind}|${mod}|${tur}|${lot}`;
  }

  function setLotesTree_(tree) {
    lotesTree = tree && typeof tree === "object" ? tree : null;
    lotesTreeAllow_ = new Set();
    if (!lotesTree) return;
    Object.keys(lotesTree).forEach((etapa) => {
      const mods = lotesTree[etapa] || {};
      Object.keys(mods).forEach((mod) => {
        const turns = mods[mod] || {};
        Object.keys(turns).forEach((tur) => {
          (turns[tur] || []).forEach((lote) => {
            lotesTreeAllow_.add(treeSlotKey_(etapa, mod, tur, lote));
          });
        });
      });
    });
  }

  function allowedByTree_(etapa, modulo, turno, lote) {
    if (!lotesTreeAllow_ || !lotesTreeAllow_.size) return true;
    return lotesTreeAllow_.has(treeSlotKey_(etapa, modulo, turno, lote));
  }

  /**
   * Catálogo de lotes: una fila por Etapa+Módulo+Turno+Lote.
   * Filtra con el árbol oficial (no mezcla Licapa I/II/III).
   */
  function buildLoteCatalog(raw, tree) {
    if (tree) setLotesTree_(tree);
    const all = Array.isArray(raw) ? raw : [];
    lotesById = {};
    lotes = [];
    const seen = new Set();

    const pushEntry_ = (l, etapaLabel) => {
      const lote = normalizeLoteToken_(l.lote);
      if (!lote) return;
      const modulo = normalizeModulo_(l.modulo);
      const turno = String(l.turno ?? "").trim();
      const etapa = etapaLabel || String(l.etapa || "").trim();
      if (!allowedByTree_(etapa, modulo, turno, lote)) return;
      const slot = treeSlotKey_(etapa, modulo, turno, lote);
      if (seen.has(slot)) return;
      seen.add(slot);
      const kind = etapaKind(etapa);
      const entry = {
        ...l,
        lote,
        modulo,
        turno,
        etapa: fundoLabel_(kind) || etapa,
        codLote:
          String(l.codLote || "").trim() ||
          `${modulo}T${turno}L${lote}`.replace(/\s+/g, ""),
      };
      lotes.push(entry);
      if (entry.codLote) lotesById[String(entry.codLote)] = entry;
      // Índices compuestos (evita pisar el mismo n° entre etapas)
      lotesById[slot] = entry;
      if (kind) lotesById[`${kind}|${lote.toUpperCase()}`] = entry;
    };

    all.forEach((l) => {
      const kind = etapaKind(l.etapa);
      pushEntry_(l, fundoLabel_(kind) || String(l.etapa || "").trim());
    });

    // Completa huecos del árbol con filas sintéticas (si faltan en el JSON plano)
    if (lotesTree) {
      Object.keys(lotesTree).forEach((etapa) => {
        const mods = lotesTree[etapa] || {};
        Object.keys(mods).forEach((mod) => {
          const turns = mods[mod] || {};
          Object.keys(turns).forEach((tur) => {
            (turns[tur] || []).forEach((lote) => {
              const slot = treeSlotKey_(etapa, mod, tur, lote);
              if (seen.has(slot)) return;
              pushEntry_(
                {
                  lote,
                  modulo: mod,
                  turno: tur,
                  etapa,
                  codLote: `${normalizeModulo_(mod)}T${tur}L${normalizeLoteToken_(lote)}`.replace(
                    /\s+/g,
                    ""
                  ),
                  variedad: "",
                  area: "",
                },
                etapa
              );
            });
          });
        });
      });
    }

    lotes.sort((a, b) => {
      const ea = String(a.etapa || "");
      const eb = String(b.etapa || "");
      if (ea !== eb) return ea.localeCompare(eb);
      const ma = Number(String(a.modulo).replace(/\D/g, "")) || 0;
      const mb = Number(String(b.modulo).replace(/\D/g, "")) || 0;
      if (ma !== mb) return ma - mb;
      const ta = Number(a.turno) || 0;
      const tb = Number(b.turno) || 0;
      if (ta !== tb) return ta - tb;
      const na = Number(String(a.lote).replace(/\D/g, "")) || 0;
      const nb = Number(String(b.lote).replace(/\D/g, "")) || 0;
      if (na !== nb) return na - nb;
      return String(a.lote).localeCompare(String(b.lote), undefined, { numeric: true });
    });
  }

  async function load() {
    if (ready) return true;
    if (loading) return loading;

    applySeed_();

    const fetchJson = (url, fallback) =>
      fetch(dataUrl_(url), { cache: "no-cache" })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .catch(() => fallback);

    loading = Promise.all([
      fetchJson("./data/lotes-licapa.json", null),
      fetchJson("./data/lotes-tree-licapa.json", null),
      fetchJson("./data/evaluadores.json", null),
    ])
      .then(([lotesJson, treeJson, evalJson]) => {
        if (treeJson && typeof treeJson === "object") {
          setLotesTree_(treeJson);
        }
        if (Array.isArray(lotesJson) && lotesJson.length) {
          buildLoteCatalog(lotesJson, lotesTree);
        } else if (lotesTree) {
          buildLoteCatalog([], lotesTree);
        }
        // JSON embebido solo si aún no hay sync de la hoja Evaluadores
        const hasSheetCache = restoreEvaluadoresSheetCache_();
        if (!hasSheetCache && evalJson?.byDni && Object.keys(evalJson.byDni).length) {
          evaluadores = Object.assign({}, evalJson.byDni);
        }
        applySeed_();
        ready = true;
        loading = null;
        return Object.keys(evaluadores).length > 0 || lotes.length > 0;
      })
      .catch(() => {
        applySeed_();
        ready = true;
        loading = null;
        return Object.keys(evaluadores).length > 0 || lotes.length > 0;
      });
    return loading;
  }

  function mapVariedad(raw) {
    if (!raw) return "";
    const key = fixMojibake_(String(raw).trim());
    return VARIEDAD_MAP[key] || VARIEDAD_MAP[key.toUpperCase()] || key;
  }

  /**
   * Solo primer apellido + primer nombre.
   * "AGUIRRE NORIEGA MARCO ANTONIO" → "AGUIRRE MARCO"
   */
  function shortName(nombre) {
    const parts = String(nombre || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length <= 1) return parts[0] || "";
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
    // APELLIDO1 APELLIDO2 NOMBRE1 [NOMBRE2...]
    return `${parts[0]} ${parts[2]}`;
  }

  function personLabel(dni, nombre) {
    const short = shortName(nombre) || String(nombre || "").trim() || dni;
    return dni ? `${dni} — ${short}` : short;
  }

  function loteLabel(l) {
    if (!l) return "";
    const n = String(l.lote ?? "").trim();
    return n ? `Lote ${n}` : "";
  }

  function loteShortLabel(l) {
    if (!l) return "";
    const n = String(l.lote ?? "").trim();
    return n ? `Lote ${n}` : "";
  }

  function loteOptions(query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    const list = lotes.map((l) => ({
      id: String(l.codLote || l.lote),
      label: loteLabel(l),
      meta: `${l.modulo || "—"} · Turno ${l.turno ?? "—"}`,
      raw: l,
    }));
    if (!q) {
      // Previsualización: primeros lotes (el resto se busca)
      return list.slice(0, 80);
    }
    return list
      .filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.label.toLowerCase().includes(q) ||
          String(o.raw.lote || "")
            .toLowerCase()
            .includes(q) ||
          String(o.raw.etapa || "")
            .toLowerCase()
            .includes(q) ||
          String(o.raw.modulo || "")
            .toLowerCase()
            .includes(q) ||
          o.meta.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }

  function findLote(id) {
    const raw = String(id ?? "").trim();
    if (!raw) return null;
    if (lotesById[raw]) return lotesById[raw];

    // "Lote 138 - Licapa I" | "Lote 138" | "Q138" | "138"
    const fromLabel = raw.match(/^lote\s*([^\s\-–—]+)/i);
    if (fromLabel && lotesById[fromLabel[1]]) return lotesById[fromLabel[1]];

    const noPrefix = raw.replace(/^lote\s*/i, "").trim();
    if (noPrefix && lotesById[noPrefix]) return lotesById[noPrefix];

    const qForm = noPrefix.replace(/^q/i, "").trim();
    if (qForm && lotesById[qForm]) return lotesById[qForm];
    if (qForm && lotesById[`Q${qForm}`]) return lotesById[`Q${qForm}`];

    // codLote parcial: ...LT138
    const lt = raw.match(/LT\s*(\d+)/i) || raw.match(/(?:^|[^\d])(\d{1,4})$/);
    if (lt && lotesById[lt[1]]) return lotesById[lt[1]];

    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly && lotesById[digitsOnly]) return lotesById[digitsOnly];

    const lower = raw.toLowerCase();
    return (
      lotes.find(
        (l) =>
          String(l.codLote || "") === raw ||
          String(l.lote) === raw ||
          String(l.lote) === digitsOnly ||
          loteLabel(l).toLowerCase() === lower ||
          loteShortLabel(l).toLowerCase() === lower
      ) || null
    );
  }

  /** Módulo + turno (+ etapa) siempre desde catálogo de lotes */
  function loteMeta(loteId) {
    const L = findLote(loteId);
    if (!L) return { modulo: "", turno: "", lote: String(loteId || ""), etapa: "", area: "" };
    return {
      lote: String(L.lote),
      modulo: L.modulo || "",
      turno: L.turno != null && L.turno !== "" ? String(L.turno) : "",
      etapa: L.etapa || "",
      variedad: L.variedad || "",
      area: L.area != null && L.area !== "" ? Number(L.area) : "",
      codLote: L.codLote || "",
      raw: L,
    };
  }

  /** Lista fija de evaluadores (código + nombre). Solo catálogo oficial. */
  function evaluadorOptions(query) {
    applySeed_();
    const q = String(query || "").trim().toLowerCase();
    const digits = String(query || "").replace(/\D/g, "");
    const out = [];
    const map = evaluadores || {};

    const dnis = Object.keys(map).sort(function (a, b) {
      const na = ((map[a] && map[a].nombre) || "").localeCompare((map[b] && map[b].nombre) || "", "es");
      return na || a.localeCompare(b);
    });
    for (let i = 0; i < dnis.length; i++) {
      const dni = dnis[i];
      const p = map[dni] || {};
      const full = String(p.nombre || "").trim();
      if (!full || full === dni) continue;
      const nombre = full.toLowerCase();
      const short = shortName(full).toLowerCase();
      if (
        q &&
        nombre.indexOf(q) === -1 &&
        short.indexOf(q) === -1 &&
        !(digits.length >= 2 && dni.indexOf(digits) !== -1)
      ) {
        continue;
      }
      out.push({
        id: personLabel(dni, full),
        label: full || dni,
        meta: "DNI - " + dni,
        nombre: full,
        nombreCorto: shortName(full),
        dni: String(dni),
      });
    }
    return out;
  }

  /** "18851808 — AGUIRRE NORIEGA MARCO ANTONIO" → "18851808 — AGUIRRE MARCO" */
  function formatStoredPerson(val) {
    if (!val) return "";
    const m = String(val).match(/^(\d+)\s*[—\-]\s*(.+)$/);
    if (m) return personLabel(m[1], m[2]);
    return shortName(val) || String(val).trim();
  }

  function personByDni(kind, dni) {
    if (kind === "evaluador") return evaluadores[String(dni)] || null;
    return null;
  }

  function isReady() {
    return ready;
  }

  /** Reintenta cargar catálogos si quedaron vacíos */
  async function ensureEvaluadores() {
    applySeed_();
    if (Object.keys(evaluadores).length > 0) return true;
    ready = false;
    loading = null;
    const ok = await load();
    return ok && Object.keys(evaluadores).length > 0;
  }

  /** Reemplaza el catálogo local con la hoja Evaluadores (solo activos). */
  function setEvaluadoresFromSheet_(list) {
    const map = {};
    (list || []).forEach((e) => {
      if (!e) return;
      if (e.activo === false || e.activo === 0 || e.activo === "0") return;
      let dni = String(e.dni || e.DNI || "").trim();
      if (/^\d+\.0+$/.test(dni)) dni = dni.replace(/\.0+$/, "");
      dni = dni.replace(/\D/g, "");
      if (!/^\d{8}$/.test(dni)) return;
      const nombre = String(e.nombre || e.Nombre || "").trim();
      if (!nombre) return;
      map[dni] = {
        nombre,
        rol: String(e.rol || "Evaluador").trim(),
        modulo: String(e.modulo || "").trim(),
      };
    });
    // Solo reemplaza si la hoja trajo gente (evita vaciar offline por error)
    if (Object.keys(map).length) {
      evaluadores = map;
      try {
        localStorage.setItem(
          "qb_proy_eval_sheet",
          JSON.stringify({ at: Date.now(), byDni: map })
        );
      } catch (_) {}
      return true;
    }
    return false;
  }

  function restoreEvaluadoresSheetCache_() {
    try {
      const raw = JSON.parse(localStorage.getItem("qb_proy_eval_sheet") || "null");
      if (!raw || !raw.byDni || typeof raw.byDni !== "object") return false;
      // Caché de hoja ≤ 7 días
      if (raw.at && Date.now() - Number(raw.at) > 7 * 24 * 60 * 60 * 1000) return false;
      const keys = Object.keys(raw.byDni);
      if (!keys.length) return false;
      evaluadores = Object.assign({}, raw.byDni);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Trae evaluadores activos desde Apps Script y sustituye el JSON embebido.
   * Así el filtro Historial no muestra gente borrada/inactiva de la hoja.
   */
  async function refreshEvaluadoresFromSheet(force) {
    restoreEvaluadoresSheetCache_();
    if (!navigator.onLine) return Object.keys(evaluadores).length > 0;
    if (!QB.API || typeof QB.API.fetchEvaluadores !== "function") {
      return Object.keys(evaluadores).length > 0;
    }
    if (!force) {
      try {
        const raw = JSON.parse(localStorage.getItem("qb_proy_eval_sheet") || "null");
        if (raw && raw.at && Date.now() - Number(raw.at) < 5 * 60 * 1000) {
          return true;
        }
      } catch (_) {}
    }
    try {
      const data = await QB.API.fetchEvaluadores({ soloActivos: true, timeoutMs: 20000 });
      if (!data || !data.ok) return Object.keys(evaluadores).length > 0;
      setEvaluadoresFromSheet_(data.evaluadores || []);
      return Object.keys(evaluadores).length > 0;
    } catch (_) {
      return Object.keys(evaluadores).length > 0;
    }
  }

  async function ensureCatalogs() {
    applySeed_();
    if (lotes.length > 0 && Object.keys(evaluadores).length > 0) return true;
    if (lotes.length === 0 || Object.keys(evaluadores).length === 0) {
      ready = false;
      loading = null;
      await load();
      applySeed_();
    }
    return lotes.length > 0 || Object.keys(evaluadores).length > 0;
  }

  function loteCount() {
    return lotes.length;
  }

  function normalizeModulo_(m) {
    const s = String(m || "").trim().toUpperCase();
    if (!s) return "";
    const mMatch = s.match(/^M?0*(\d+)$/i);
    if (mMatch) return `M${mMatch[1]}`;
    return s;
  }

  function moduloOptions(query, fundoId) {
    const q = String(query || "").trim().toLowerCase();
    const fundo = String(fundoId || "").trim();
    const seen = new Set();
    const out = [];
    for (let i = 0; i < lotes.length; i++) {
      const L = lotes[i];
      if (!matchesFundo_(L.etapa, fundo)) continue;
      const raw = normalizeModulo_(L.modulo);
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      out.push({
        id: raw,
        label: raw,
        meta: fundo ? fundoLabel_(fundo) || "Módulo" : "Módulo",
      });
    }
    out.sort((a, b) => {
      const na = Number(String(a.id).replace(/\D/g, "")) || 0;
      const nb = Number(String(b.id).replace(/\D/g, "")) || 0;
      return na - nb || a.id.localeCompare(b.id);
    });
    if (!q) return out;
    return out.filter(
      (o) => o.id.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
    );
  }

  function turnoOptions(modulo, query, fundoId) {
    const mod = normalizeModulo_(modulo);
    const q = String(query || "").trim().toLowerCase();
    const fundo = String(fundoId || "").trim();
    const seen = new Set();
    const out = [];
    for (let i = 0; i < lotes.length; i++) {
      const L = lotes[i];
      if (!matchesFundo_(L.etapa, fundo)) continue;
      if (mod && normalizeModulo_(L.modulo) !== mod) continue;
      const t = String(L.turno ?? "").trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push({
        id: t,
        label: `Turno ${t}`,
        meta: mod || "Turno",
      });
    }
    out.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
    if (!q) return out;
    return out.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q)
    );
  }

  function lotesForModuloTurno(modulo, turno, query, fundoId) {
    const mod = normalizeModulo_(modulo);
    const tur = String(turno ?? "").trim();
    const q = String(query || "").trim().toLowerCase();
    const fundo = String(fundoId || "").trim();
    const out = [];
    for (let i = 0; i < lotes.length; i++) {
      const L = lotes[i];
      if (!matchesFundo_(L.etapa, fundo)) continue;
      if (mod && normalizeModulo_(L.modulo) !== mod) continue;
      if (tur && String(L.turno ?? "").trim() !== tur) continue;
      out.push({
        id: String(L.codLote || L.lote),
        label: loteLabel(L),
        meta: `${normalizeModulo_(L.modulo)} · T${L.turno ?? "—"}`,
        raw: L,
      });
    }
    if (!q) return out.slice(0, 120);
    return out
      .filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.label.toLowerCase().includes(q) ||
          String(o.raw.lote || "").toLowerCase().includes(q)
      )
      .slice(0, 120);
  }

  /** Código compacto tipo M01T07L29 (pad módulo a 2 dígitos si es número) */
  function formatLoteCode(meta) {
    if (!meta) return "";
    const modRaw = String(meta.modulo || "").trim().toUpperCase();
    const mNum = modRaw.replace(/^M/i, "").replace(/^0+/, "") || "";
    const mod = mNum ? `M${String(mNum).padStart(2, "0")}` : modRaw;
    const tur = String(meta.turno ?? "").trim();
    const lote = String(meta.lote ?? "").trim();
    if (!mod || !tur || !lote) return String(meta.codLote || "");
    return `${mod}T${String(tur).padStart(2, "0")}L${lote}`;
  }

  // Prefiere última sincronización de hoja antes que el JSON embebido viejo
  restoreEvaluadoresSheetCache_();

  return {
    load,
    isReady,
    ensureEvaluadores,
    ensureCatalogs,
    refreshEvaluadoresFromSheet,
    loteOptions,
    findLote,
    loteMeta,
    loteLabel,
    loteShortLabel,
    loteCount,
    mapVariedad,
    shortName,
    personLabel,
    formatStoredPerson,
    evaluadorOptions,
    personByDni,
    moduloOptions,
    turnoOptions,
    lotesForModuloTurno,
    formatLoteCode,
    normalizeModulo: normalizeModulo_,
  };
})();
