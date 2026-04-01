/**
 * i18n module for ÖREB Parcel Search
 * Supports DE (default), FR, IT via ?lang= URL parameter
 *
 * Terminology sourced from:
 * - cadastre.ch (official ÖREB/RDPPF/RDPP terms)
 * - geo.admin.ch API field labels (Grundstücksnummer, Grundstücksart, etc.)
 */

const SUPPORTED_LANGS = ["de", "fr", "it"];
const DEFAULT_LANG = "de";
let currentLang = DEFAULT_LANG;

/** Get current language */
export function getLang() {
  return currentLang;
}

/** Initialize language from URL parameter */
export function initLang() {
  const param = new URLSearchParams(window.location.search).get("lang");
  currentLang = SUPPORTED_LANGS.includes(param) ? param : DEFAULT_LANG;
  document.documentElement.lang = currentLang;
  const select = document.getElementById("lang-select");
  if (select) select.value = currentLang;
  translatePage();
  return currentLang;
}

/** Change language, update URL, re-translate page */
export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  document.documentElement.lang = lang;

  const params = new URLSearchParams(window.location.search);
  if (lang === DEFAULT_LANG) params.delete("lang");
  else params.set("lang", lang);
  const qs = params.toString();
  const url = window.location.pathname + (qs ? "?" + qs : "");
  window.history.replaceState(null, "", url);

  const select = document.getElementById("lang-select");
  if (select) select.value = lang;

  translatePage();
  window.dispatchEvent(new Event("langchange"));
}

/** Translate a key with optional interpolation: t("key", { n: 42 }) */
export function t(key, params) {
  const str = translations[currentLang]?.[key] ?? translations.de[key] ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
}

/** Update all elements with data-i18n attributes */
export function translatePage() {
  document.title = t("meta.title");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
}

/* ═══════════════════════════════════════════════════════════════
   Translations
   ═══════════════════════════════════════════════════════════════ */

const translations = {

  /* ── German (default) ─────────────────────────────────────── */
  de: {
    // Meta
    "meta.title": "ÖREB-Kataster — Parzellensuche",

    // Header
    "header.agency": "swisstopo / Kataster",
    "header.app": "ÖREB-Parzellensuche",
    "header.langAria": "Sprache wählen",

    // Search form
    "search.heading": "Parzelle suchen",
    "search.kanton": "Kanton",
    "search.kanton.all": "— Alle —",
    "search.gemeinde": "Gemeinde",
    "search.gemeinde.placeholder": "z.B. Bern",
    "search.bfsnr": "BFS-Nr",
    "search.bfsnr.placeholder": "z.B. 351",
    "search.egrid": "EGRID",
    "search.egrid.placeholder": "z.B. CH938383288531",
    "search.nummer": "Grundstücksnummer",
    "search.nummer.placeholder": "z.B. 3577",
    "search.plz": "PLZ",
    "search.plz.placeholder": "z.B. 3013",
    "search.submit": "Suchen",
    "search.reset": "Zurücksetzen",
    "search.error.empty": "Bitte mindestens ein Suchfeld ausfüllen.",
    "search.loading": "Suche läuft…",
    "search.error.api": "Fehler bei der Suche. Bitte versuchen Sie es erneut.",

    // Results
    "results.heading": "Ergebnisse",
    "results.count": "{n} Ergebnisse",
    "results.none": "Keine Parzellen gefunden.",
    "results.col.egrid": "EGRID",
    "results.col.gemeinde": "Gemeinde",
    "results.col.nummer": "Nr",
    "results.col.typ": "Grundstücksart",
    "results.col.status": "Status",
    "results.page": "Seite {current} / {total}",
    "results.prev": "Zurück",
    "results.next": "Weiter",

    // Status values
    "status.active": "Eingeführt",
    "status.inactive": "Nicht eingeführt",

    // Detail panel
    "detail.heading": "Parzelle",
    "detail.close": "Schliessen",
    "detail.egrid": "EGRID",
    "detail.nummer": "Grundstücksnummer",
    "detail.gemeinde": "Gemeinde",
    "detail.kanton": "Kanton",
    "detail.bfsnr": "BFS-Nr",
    "detail.plzort": "PLZ / Ort",
    "detail.typ": "Grundstücksart",
    "detail.area": "Fläche",
    "detail.status": "Status",
    "detail.kontakt": "Kontakt",
    "detail.telefon": "Telefon",
    "detail.pdf": "ÖREB-Auszug (PDF)",
    "detail.portal": "ÖREB-Portal",
    "detail.webservice": "Webservice",

    // Footer
    "footer.datasource": "Datenquelle:",
    "footer.source": "Quellcode",
    "footer.legal": "Rechtliches",
    "footer.contact": "Kontakt",
  },

  /* ── French ───────────────────────────────────────────────── */
  fr: {
    // Meta
    "meta.title": "Cadastre RDPPF — Recherche de parcelles",

    // Header
    "header.agency": "swisstopo / Cadastre",
    "header.app": "Recherche de parcelles RDPPF",
    "header.langAria": "Choisir la langue",

    // Search form
    "search.heading": "Rechercher une parcelle",
    "search.kanton": "Canton",
    "search.kanton.all": "— Tous —",
    "search.gemeinde": "Commune",
    "search.gemeinde.placeholder": "p.ex. Berne",
    "search.bfsnr": "N° OFS",
    "search.bfsnr.placeholder": "p.ex. 351",
    "search.egrid": "EGRID",
    "search.egrid.placeholder": "p.ex. CH938383288531",
    "search.nummer": "N° d'immeuble",
    "search.nummer.placeholder": "p.ex. 3577",
    "search.plz": "NPA",
    "search.plz.placeholder": "p.ex. 3013",
    "search.submit": "Rechercher",
    "search.reset": "Réinitialiser",
    "search.error.empty": "Veuillez remplir au moins un champ de recherche.",
    "search.loading": "Recherche en cours…",
    "search.error.api": "Erreur lors de la recherche. Veuillez réessayer.",

    // Results
    "results.heading": "Résultats",
    "results.count": "{n} résultats",
    "results.none": "Aucune parcelle trouvée.",
    "results.col.egrid": "EGRID",
    "results.col.gemeinde": "Commune",
    "results.col.nummer": "N°",
    "results.col.typ": "Genre d'immeuble",
    "results.col.status": "Statut",
    "results.page": "Page {current} / {total}",
    "results.prev": "Précédent",
    "results.next": "Suivant",

    // Status values
    "status.active": "Introduit",
    "status.inactive": "Non introduit",

    // Detail panel
    "detail.heading": "Parcelle",
    "detail.close": "Fermer",
    "detail.egrid": "EGRID",
    "detail.nummer": "N° d'immeuble",
    "detail.gemeinde": "Commune",
    "detail.kanton": "Canton",
    "detail.bfsnr": "N° OFS",
    "detail.plzort": "NPA / Localité",
    "detail.typ": "Genre d'immeuble",
    "detail.area": "Surface",
    "detail.status": "Statut",
    "detail.kontakt": "Contact",
    "detail.telefon": "Téléphone",
    "detail.pdf": "Extrait RDPPF (PDF)",
    "detail.portal": "Portail RDPPF",
    "detail.webservice": "Service web",

    // Footer
    "footer.datasource": "Source des données :",
    "footer.source": "Code source",
    "footer.legal": "Informations juridiques",
    "footer.contact": "Contact",
  },

  /* ── Italian ──────────────────────────────────────────────── */
  it: {
    // Meta
    "meta.title": "Catasto RDPP — Ricerca di fondi",

    // Header
    "header.agency": "swisstopo / Catasto",
    "header.app": "Ricerca di fondi RDPP",
    "header.langAria": "Scegliere la lingua",

    // Search form
    "search.heading": "Cercare un fondo",
    "search.kanton": "Cantone",
    "search.kanton.all": "— Tutti —",
    "search.gemeinde": "Comune",
    "search.gemeinde.placeholder": "p.es. Berna",
    "search.bfsnr": "N. UST",
    "search.bfsnr.placeholder": "p.es. 351",
    "search.egrid": "EGRID",
    "search.egrid.placeholder": "p.es. CH938383288531",
    "search.nummer": "Numero del fondo",
    "search.nummer.placeholder": "p.es. 3577",
    "search.plz": "NPA",
    "search.plz.placeholder": "p.es. 3013",
    "search.submit": "Cercare",
    "search.reset": "Reimpostare",
    "search.error.empty": "Compilare almeno un campo di ricerca.",
    "search.loading": "Ricerca in corso…",
    "search.error.api": "Errore durante la ricerca. Riprovare.",

    // Results
    "results.heading": "Risultati",
    "results.count": "{n} risultati",
    "results.none": "Nessun fondo trovato.",
    "results.col.egrid": "EGRID",
    "results.col.gemeinde": "Comune",
    "results.col.nummer": "N.",
    "results.col.typ": "Genere di fondo",
    "results.col.status": "Stato",
    "results.page": "Pagina {current} / {total}",
    "results.prev": "Precedente",
    "results.next": "Seguente",

    // Status values
    "status.active": "Introdotto",
    "status.inactive": "Non introdotto",

    // Detail panel
    "detail.heading": "Fondo",
    "detail.close": "Chiudere",
    "detail.egrid": "EGRID",
    "detail.nummer": "Numero del fondo",
    "detail.gemeinde": "Comune",
    "detail.kanton": "Cantone",
    "detail.bfsnr": "N. UST",
    "detail.plzort": "NPA / Località",
    "detail.typ": "Genere di fondo",
    "detail.area": "Superficie",
    "detail.status": "Stato",
    "detail.kontakt": "Contatto",
    "detail.telefon": "Telefono",
    "detail.pdf": "Estratto RDPP (PDF)",
    "detail.portal": "Portale RDPP",
    "detail.webservice": "Servizio web",

    // Footer
    "footer.datasource": "Fonte dei dati:",
    "footer.source": "Codice sorgente",
    "footer.legal": "Basi legali",
    "footer.contact": "Contatto",
  },
};
