// localStorage that falls back to memory (private tabs, locked-down browsers).
const mem = {};
export const storage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
};
