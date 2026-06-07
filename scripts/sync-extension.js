'use strict';

// Copy the order-significant scenarios.js and the static calculator into the
// extension so it can run self-contained. Run before loading/packaging the
// extension: `npm run sync:ext`. Keeps extension/scenarios.js from drifting
// from the root file (the delta lists depend on its ordering).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const CALC = path.join(EXT, 'calculator');

const CALC_FILES = ['index.html', 'app.js', 'style.css', 'config.js', 'scenarios.js', 'calculator.js'];

fs.mkdirSync(CALC, { recursive: true });

// shared scenarios for content/background
fs.copyFileSync(path.join(ROOT, 'scenarios.js'), path.join(EXT, 'scenarios.js'));

// bundled calculator
for (const f of CALC_FILES) {
  fs.copyFileSync(path.join(ROOT, f), path.join(CALC, f));
}

console.log(`Synced scenarios.js + ${CALC_FILES.length} calculator files into extension/`);
