/** Catálogos y definición de cartilla — Q Berries · Proyecciones */
window.QB = window.QB || {};

QB.CONFIG = {
  /** Endpoint codificado (uso interno). Pegar URL /exec de Apps Script aquí o en _ep base64. */
  _ep: "",
  API_URL: "https://script.google.com/macros/s/AKfycbxxLAKdchGStfg2IIkaeJKgDdsRgTf9-s-jg3cYz6k2dgZcaJj-54CFLgwPled2fr24/exec",
  APP_NAME: "Q Berries · Proyecciones",
  VERSION: "1.5.9",
  PUBLIC_URL: "https://app-proyecciones.netlify.app",
  /** Muestras iniciales al crear cartilla (se pueden agregar más en campo) */
  SAMPLE_START: 1,
  SAMPLE_MAX: 40,
  /** Campaña activa por defecto en el modal CREAR */
  CAMPANA_DEFAULT: "2026 - II",
  /** Historial / proyección: peso baya (g) y densidad plantas/ha */
  PESO_BAYA_G: 2.6,
  DENSIDAD_PLANTAS_HA: 6500,
};

/** Campañas disponibles (selector arriba a la derecha del modal) */
QB.CAMPANAS = [
  { id: "2026 - II", label: "2026 - II" },
  { id: "2026 - I", label: "2026 - I" },
  { id: "2025 - II", label: "2025 - II" },
];

/** Cartillas disponibles en el modal CREAR */
QB.CARTILLAS = [
  { id: "proyecciones", label: "Proyecciones", meta: "Cartilla de campo" },
  { id: "biometria", label: "Biometría", meta: "Próximamente · bloqueada", disabled: true },
];

/** Campos numéricos por muestra (orden de la cartilla) */
QB.SAMPLE_FIELDS = [
  { id: "n_ramas", label: "N° Ramas", sheet: "N° Ramas" },
  { id: "yema_productiva", label: "Yema Productiva", sheet: "Yema Productiva" },
  { id: "yema_abierta", label: "Yema Abierta", sheet: "Yema Abierta" },
  { id: "yemas_cerradas", label: "Yemas Cerradas", sheet: "Yemas Cerradas" },
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

QB.SHEET_HEADERS = [
  "Lote",
  "Fecha",
  "DNI",
  "Nombre",
  "N° Muestra",
  "N° Ramas",
  "Yema Productiva",
  "Yema Abierta",
  "Yemas Cerradas",
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
  "Foto cabecera",
  "Modulo",
  "Turno",
  "Lotes",
  "Semana",
  "Etapa",
  "Variedad",
  "Area",
  "Campaña",
];
