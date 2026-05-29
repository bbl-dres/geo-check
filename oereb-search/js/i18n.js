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
    "detail.extract_pdf": "ÖREB-Auszug (PDF)",
    "detail.extract_url": "ÖREB-Auszug (URL)",
    "detail.geoportal": "Kantonales Geoportal",
    "detail.webservice": "Webservice",
    "detail.map": "Karte",

    // Footer
    "footer.datasource": "Datenquelle:",
    "footer.cadastre": "ÖREB-Kataster",
    "footer.livemap": "Live-Karte",
    "footer.source": "Quellcode",
    "footer.legal": "Rechtliches",
    "footer.contact": "Kontakt",

    // Mode tabs
    "mode.aria": "Suchmodus",
    "mode.search": "Suche",
    "mode.batch": "Batch (CSV)",

    // Batch mode
    "batch.heading": "Batch-Abfrage (CSV)",
    "batch.clear": "Datei entfernen",
    "batch.drop": "CSV-Datei hierher ziehen",
    "batch.or": "oder",
    "batch.dropzone.aria": "Datei hier ablegen oder klicken zum Durchsuchen",
    "batch.browse": "oder klicken zum Durchsuchen",
    "batch.hint": "Nur das EGRID-Feld wird verwendet. Alle Spalten bleiben erhalten (Eingabe → IN_, Ergebnis → OUT_).",
    "batch.demo.download": "Beispiel-CSV herunterladen",
    "batch.demo.run": "Beispiel laden und ausführen",
    "batch.columns": "Erkannte Spalten:",
    "batch.egridcol": "EGRID-Spalte",
    "batch.mapping.info": "{rows} Zeilen · {cols} Spalten · Trennzeichen: {delim}",
    "batch.mapping.large": "Grosse Datei – die Abfrage kann einige Minuten dauern.",
    "batch.process": "{n} Parzellen abfragen",
    "batch.back": "Zurück",
    "batch.processing": "Abfrage läuft …",
    "batch.cancel": "Abbrechen",
    "batch.results": "Ergebnisse",
    "batch.summary": "{total} Ergebnisse ({found} gefunden, {notfound} nicht gefunden, {error} Fehler)",
    "batch.download.button": "Herunterladen",
    "batch.download.title": "Ergebnisse herunterladen",
    "batch.download.csv": "CSV herunterladen",
    "batch.download.geojson": "GeoJSON herunterladen",
    "batch.download.csv.desc": "Tabelle mit IN_/OUT_-Spalten",
    "batch.download.geojson.desc": "Geometrien (WGS84) + alle Eigenschaften",
    "batch.error.empty": "Die Datei enthält keine Datenzeilen.",
    "batch.error.read": "Die Datei konnte nicht gelesen werden.",
    "batch.error.demo": "Die Beispieldatei konnte nicht geladen werden.",
    "batch.error.nocol": "Bitte die EGRID-Spalte auswählen.",
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
    "detail.extract_pdf": "Extrait RDPPF (PDF)",
    "detail.extract_url": "Extrait RDPPF (URL)",
    "detail.geoportal": "Géoportail cantonal",
    "detail.webservice": "Service web",
    "detail.map": "Carte",

    // Footer
    "footer.datasource": "Source des données :",
    "footer.cadastre": "Cadastre RDPPF",
    "footer.livemap": "Carte en direct",
    "footer.source": "Code source",
    "footer.legal": "Informations juridiques",
    "footer.contact": "Contact",

    // Mode tabs
    "mode.aria": "Mode de recherche",
    "mode.search": "Recherche",
    "mode.batch": "Lot (CSV)",

    // Batch mode
    "batch.heading": "Requête par lot (CSV)",
    "batch.clear": "Retirer le fichier",
    "batch.drop": "Glisser le fichier CSV ici",
    "batch.or": "ou",
    "batch.dropzone.aria": "Déposer le fichier ici ou cliquer pour parcourir",
    "batch.browse": "ou cliquer pour parcourir",
    "batch.hint": "Seul le champ EGRID est utilisé. Toutes les colonnes sont conservées (entrée → IN_, résultat → OUT_).",
    "batch.demo.download": "Télécharger le CSV d'exemple",
    "batch.demo.run": "Charger l'exemple et lancer",
    "batch.columns": "Colonnes détectées :",
    "batch.egridcol": "Colonne EGRID",
    "batch.mapping.info": "{rows} lignes · {cols} colonnes · Séparateur : {delim}",
    "batch.mapping.large": "Fichier volumineux – la requête peut prendre quelques minutes.",
    "batch.process": "Interroger {n} parcelles",
    "batch.back": "Retour",
    "batch.processing": "Requête en cours …",
    "batch.cancel": "Annuler",
    "batch.results": "Résultats",
    "batch.summary": "{total} résultats ({found} trouvées, {notfound} introuvables, {error} erreurs)",
    "batch.download.button": "Télécharger",
    "batch.download.title": "Télécharger les résultats",
    "batch.download.csv": "Télécharger le CSV",
    "batch.download.geojson": "Télécharger le GeoJSON",
    "batch.download.csv.desc": "Tableau avec colonnes IN_/OUT_",
    "batch.download.geojson.desc": "Géométries (WGS84) + propriétés",
    "batch.error.empty": "Le fichier ne contient aucune ligne de données.",
    "batch.error.read": "Le fichier n'a pas pu être lu.",
    "batch.error.demo": "Le fichier d'exemple n'a pas pu être chargé.",
    "batch.error.nocol": "Veuillez sélectionner la colonne EGRID.",
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
    "detail.extract_pdf": "Estratto RDPP (PDF)",
    "detail.extract_url": "Estratto RDPP (URL)",
    "detail.geoportal": "Geoportale cantonale",
    "detail.webservice": "Servizio web",
    "detail.map": "Mappa",

    // Footer
    "footer.datasource": "Fonte dei dati:",
    "footer.cadastre": "Catasto RDPP",
    "footer.livemap": "Mappa dal vivo",
    "footer.source": "Codice sorgente",
    "footer.legal": "Basi legali",
    "footer.contact": "Contatto",

    // Mode tabs
    "mode.aria": "Modalità di ricerca",
    "mode.search": "Ricerca",
    "mode.batch": "Lotto (CSV)",

    // Batch mode
    "batch.heading": "Richiesta in lotto (CSV)",
    "batch.clear": "Rimuovere il file",
    "batch.drop": "Trascinare qui il file CSV",
    "batch.or": "oppure",
    "batch.dropzone.aria": "Trascinare qui il file oppure cliccare per sfogliare",
    "batch.browse": "oppure cliccare per sfogliare",
    "batch.hint": "Viene utilizzato solo il campo EGRID. Tutte le colonne vengono mantenute (entrata → IN_, risultato → OUT_).",
    "batch.demo.download": "Scaricare il CSV di esempio",
    "batch.demo.run": "Caricare l'esempio ed eseguire",
    "batch.columns": "Colonne rilevate:",
    "batch.egridcol": "Colonna EGRID",
    "batch.mapping.info": "{rows} righe · {cols} colonne · Separatore: {delim}",
    "batch.mapping.large": "File di grandi dimensioni – la richiesta può richiedere alcuni minuti.",
    "batch.process": "Interrogare {n} fondi",
    "batch.back": "Indietro",
    "batch.processing": "Richiesta in corso …",
    "batch.cancel": "Annullare",
    "batch.results": "Risultati",
    "batch.summary": "{total} risultati ({found} trovati, {notfound} non trovati, {error} errori)",
    "batch.download.button": "Scaricare",
    "batch.download.title": "Scaricare i risultati",
    "batch.download.csv": "Scaricare il CSV",
    "batch.download.geojson": "Scaricare il GeoJSON",
    "batch.download.csv.desc": "Tabella con colonne IN_/OUT_",
    "batch.download.geojson.desc": "Geometrie (WGS84) + proprietà",
    "batch.error.empty": "Il file non contiene righe di dati.",
    "batch.error.read": "Impossibile leggere il file.",
    "batch.error.demo": "Impossibile caricare il file di esempio.",
    "batch.error.nocol": "Selezionare la colonna EGRID.",
  },
};
