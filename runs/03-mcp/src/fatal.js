// A thrown error in a render loop otherwise leaves a black screen with the
// stack buried in the console. Put it on the page instead.
const el = document.getElementById('fatal');

function show(label, err) {
  el.style.display = 'block';
  el.textContent += `${label}: ${err?.stack ?? err}\n\n`;
  console.error(label, err);
}

export function installFatalHandler() {
  addEventListener('error', (e) => show('Error', e.error ?? e.message));
  addEventListener('unhandledrejection', (e) => show('Unhandled rejection', e.reason));
}

// Wrap the per-frame callback so the first throw is reported once and the loop
// stops, rather than screaming identical errors 60 times a second.
export function guardFrame(fn) {
  let dead = false;
  return (...args) => {
    if (dead) return;
    try {
      fn(...args);
    } catch (err) {
      dead = true;
      show('Error in frame loop', err);
    }
  };
}
