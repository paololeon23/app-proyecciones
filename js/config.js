/** Catálogos y definición de cartilla — Q Berries · Proyecciones */
window.QB = window.QB || {};

QB.CONFIG = {
  /** Endpoint codificado (uso interno). Pegar URL /exec de Apps Script aquí o en _ep base64. */
  _ep: "",
  API_URL: "",
  APP_NAME: "Q Berries · Proyecciones",
  VERSION: "1.2.5",
  PUBLIC_URL: "https://app-proyecciones.netlify.app",
  /** Muestras iniciales al crear cartilla (se pueden agregar más en campo) */
  SAMPLE_START: 1,
  SAMPLE_MAX: 40,
};

/** Cartillas disponibles en el modal CREAR */
QB.CARTILLAS = [
  { id: "proyecciones", label: "Proyecciones", meta: "Cartilla de campo" },
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
  "Evaluador",
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
];
