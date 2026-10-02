'use strict';

/**
 * Satu eksekusi per nama. Tick cron berikutnya dilewati kalau yang lama
 * belum selesai — mencegah GenieACS/OLT/traffic menumpuk di heap.
 */
function createExclusiveRunner() {
  const inflight = new Set();
  return {
    run(name, fn) {
      if (inflight.has(name)) return Promise.resolve({ skipped: true });
      inflight.add(name);
      return Promise.resolve()
        .then(() => fn())
        .then((result) => ({ skipped: false, result }))
        .finally(() => inflight.delete(name));
    },
    busy(name) { return inflight.has(name); },
    size() { return inflight.size; },
  };
}

module.exports = { createExclusiveRunner };
