/** Catálogos y definición de cartilla — Q Berries · Fenología */
window.QB = window.QB || {};

QB.CONFIG = {
  /** Endpoint codificado (uso interno). Pegar URL /exec de Apps Script aquí o en _ep base64. */
  _ep: "",
  API_URL: "https://script.google.com/macros/s/AKfycbxxLAKdchGStfg2IIkaeJKgDdsRgTf9-s-jg3cYz6k2dgZcaJj-54CFLgwPled2fr24/exec",
  APP_NAME: "Q Berries · Fenología",
  VERSION: "1.8.34",
  PUBLIC_URL: "https://app-proyecciones.netlify.app",
  /** Muestras iniciales al crear cartilla (se pueden agregar más en campo) */
  SAMPLE_START: 1,
  SAMPLE_MAX: 40,
  /** Campaña: año Lima actual (al terminar el año pasa sola, sin selector) */
  CAMPANA_DEFAULT: "",
  /** Historial / proyección: peso baya (g) y densidad plantas/ha */
  PESO_BAYA_G: 2.6,
  DENSIDAD_PLANTAS_HA: 6500,
  /** Foto referencia: JPEG objetivo ~280 KB */
  PHOTO_MAX_EDGE: 1280,
  PHOTO_QUALITY: 0.72,
  PHOTO_TARGET_KB: 320,
};

/** Ya no se elige campaña a mano · solo año en curso */
QB.CAMPANAS = [];


/** Cartillas disponibles en el modal CREAR */
QB.CARTILLAS = [
  { id: "proyecciones", label: "Fenología", meta: "Cartilla de campo" },
  { id: "biometria", label: "Biometría", meta: "Próximamente · bloqueada", disabled: true },
];

/** Fundos Licapa I–IV (modal CREAR, debajo de Cartilla) */
QB.FUNDOS = [
  { id: "I", label: "Licapa I", meta: "Fundo" },
  { id: "II", label: "Licapa II", meta: "Fundo" },
  { id: "III", label: "Licapa III", meta: "Fundo" },
  { id: "IV", label: "Licapa IV", meta: "Fundo" },
];

/** Campos numéricos por muestra (orden de la cartilla) */
QB.SAMPLE_FIELDS = [
  { id: "n_ramas", label: "N° Ramas", sheet: "N° Ramas" },
  { id: "yemas_cerradas", label: "Yema Cerrada", sheet: "Yemas Cerradas" },
  { id: "yema_abierta", label: "Yema Abierta", sheet: "Yema Abierta" },
  { id: "yemas_muertas", label: "Yemas Muertas", sheet: "Yemas Muertas" },
  { id: "boton_floral", label: "Botón Floral", sheet: "Botón Floral" },
  { id: "flor", label: "Flor", sheet: "Flor" },
  { id: "cuaja", label: "Cuaja", sheet: "Cuaja" },
  { id: "e1", label: "E1 (Verde)", sheet: "E1 (Verde)" },
  { id: "e2", label: "E2 (Rosado)", sheet: "E2 (Rosado)" },
  { id: "e3", label: "E3 (Guinda)", sheet: "E3 (Guinda)" },
  { id: "e4", label: "E4 (50%-70%)", sheet: "E4 (50%-70%)" },
  { id: "e5", label: "E5 (Maduro)", sheet: "E5 (Maduro)" },
];

/** Columnas de tabla resumen KG (historial) */
QB.HIST_KG_STAGES = [
  { id: "boton_floral", sheet: "Botón Floral", label: "1) Flor cerrada" },
  { id: "flor", sheet: "Flor", label: "2) Flor abierta" },
  { id: "cuaja", sheet: "Cuaja", label: "3) Cuajo" },
  { id: "e1", sheet: "E1 (Verde)", label: "4) E1" },
  { id: "e2", sheet: "E2 (Rosado)", label: "5) E2" },
  { id: "e3", sheet: "E3 (Guinda)", label: "6) E3" },
  { id: "e4", sheet: "E4 (50%-70%)", label: "7) E4" },
  { id: "e5", sheet: "E5 (Maduro)", label: "8) E5" },
];

QB.SHEET_HEADERS = [
  "Lote",
  "Fecha",
  "DNI",
  "Nombre",
  "N° Muestra",
  "N° Ramas",
  "Yemas Cerradas",
  "Yema Abierta",
  "Yemas Muertas",
  "Botón Floral",
  "Flor",
  "Cuaja",
  "E1 (Verde)",
  "E2 (Rosado)",
  "E3 (Guinda)",
  "E4 (50%-70%)",
  "E5 (Maduro)",
  "Observación",
  "Modulo",
  "Turno",
  "Lotes",
  "Semana",
  "Etapa",
  "Variedad",
  "Area",
  "Campaña",
  "Anexo",
  "Hora subida",
];
