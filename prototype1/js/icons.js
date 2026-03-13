// ========================================
// Lucide Icon Refresh Scheduler
// Batches multiple createIcons() calls into a single rAF
// ========================================

let pending = false;

export function scheduleLucideRefresh() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}
