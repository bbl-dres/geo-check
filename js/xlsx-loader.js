// ========================================
// SheetJS (XLSX) On-Demand Loader
// Loads the library only when an export is triggered
// ========================================

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let loadPromise = null;

export async function ensureXLSX() {
  if (typeof XLSX !== 'undefined') return;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.onload = resolve;
    script.onerror = () => reject(new Error('SheetJS konnte nicht geladen werden'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
