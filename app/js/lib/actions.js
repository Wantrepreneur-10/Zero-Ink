// Event delegation: markup declares data-action / data-input / data-change / data-enter / data-keydown,
// screens register handlers by name. Keeps HTML free of inline JavaScript.
const handlers = {};

export function registerActions(map) { Object.assign(handlers, map); }

function run(name, el, e) {
  const fn = handlers[name];
  if (fn) fn(el, e);
  else console.warn('No handler for', name);
}

export function initActions(root = document) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el) run(el.dataset.action, el, e);
  });
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (el) run(el.dataset.input, el, e);
  });
  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el) run(el.dataset.change, el, e);
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-enter],[data-keydown]');
    if (!el) return;
    if (el.dataset.keydown) run(el.dataset.keydown, el, e);
    if (el.dataset.enter && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(el.dataset.enter, el, e); }
  });
}
