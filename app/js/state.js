// Single shared app state. Screens read and write this instead of globals.
export const state = {
  profile: null,      // signed-in user's profile row (+ email)
  receipts: [],       // customer's receipts
  menu: [],           // merchant's menu items
  cart: [],           // current order on the register: {name, price, qty}
  scan: [],           // items found by the last menu photo scan
  posOrders: [],      // orders pushed from the POS, waiting for a customer code
  posOrder: null,     // the POS order currently loaded on the register
  posKey: null,       // connection key, only held right after it is created
  tab: '',
  menuCat: 'All',
  dashRange: 'today',
  authMode: 'signin',
  signupRole: 'customer',
  AI: false,          // true when the AI edge function has a key configured
  channel: null,      // realtime subscription
};

export function resetState() {
  Object.assign(state, { profile: null, receipts: [], menu: [], cart: [], scan: [], posOrders: [], posOrder: null, posKey: null, tab: '', menuCat: 'All' });
}
