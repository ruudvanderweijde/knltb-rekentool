'use strict';
// Probe what formula structure best explains the data.
// Key question: is it a - b*winProb - c*T_eff, or something else?

const { DSS_CONFIG } = require('../config.js');
global.DSS_CONFIG = DSS_CONFIG;
const { q, K } = DSS_CONFIG;

function round4(v) { return Math.round(v * 10000) / 10000; }
function trunc4(v) { return Math.trunc(v * 10000) / 10000 || 0; }

function winProbExact(R1, R2, R3, R4) {
  const R12 = 0.5*R1 + 0.5*R2;
  const R34 = 0.5*R3 + 0.5*R4;
  const lp = 1 / (1 + Math.exp(-q*(R12 - R34)));
  return round4(1 - lp);
}

function tEff(sets, isTeam1) {
  const won = sets.filter(([a,b]) => isTeam1 ? a>b : b>a);
  const opp = won.reduce((s,[a,b]) => s + (isTeam1 ? b : a), 0);
  return opp * (won.length / sets.length);
}

// All regular-set data (no STB), team1 always wins
const DATA = [
  // W-series A (R1=7.1093)
  { label:'W1', R1:7.1093,R2:7.5307,R3:8,R4:7.628, sets:[[6,0],[6,0]],        d:-0.1953 },
  { label:'W2', R1:7.1093,R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[6,0]],        d:-0.1744 },
  { label:'W3', R1:7.1093,R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[6,3]],        d:-0.112  },
  // W-series B (R1=6.6970)
  { label:'W4', R1:6.697, R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[6,3]],        d:-0.0904 },
  { label:'W5', R1:6.697, R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[3,6],[7,5]],  d:-0.0904 },
  // E-series
  { label:'E1', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,4],[6,4]], d:-0.0183 },
  { label:'E2', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,2],[6,2]], d:-0.1016 },
  { label:'E6', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,0],[6,0]], d:-0.185  },
  { label:'E7', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,4],[6,2]], d:-0.06   },
  { label:'E8', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,1],[6,3]], d:-0.1016 },
  // X-series
  { label:'X1', R1:7,R2:7,R3:7.5,R4:7.5, sets:[[6,0],[6,0]], d:-0.1947 },
  { label:'X2', R1:7,R2:7,R3:7.5,R4:7.5, sets:[[6,4],[6,4]], d:-0.028  },
  { label:'X3', R1:6,R2:8,R3:7.5,R4:7.5, sets:[[6,0],[6,0]], d:-0.1947 },
];

// Print raw data
console.log('\nRaw data (winProb, T_eff, implied_sr):');
console.log('Label  wp      T_eff  sr_implied(=wp-d/K)');
for (const row of DATA) {
  const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
  const t  = tEff(row.sets, true);
  const sr = wp - row.d / K;
  console.log(`${row.label.padEnd(6)} ${wp.toFixed(4)}  ${t.toFixed(4)}  ${sr.toFixed(6)}`);
}

// Check: does delta depend ONLY on K*winProb + something(T_eff)?
// i.e. is (delta - K*winProb) purely a function of T_eff?
// delta = K*(wp - sr) = K*wp - K*sr
// If sr = f(T_eff) only: delta - K*wp = -K*f(T_eff)
console.log('\n\n(delta - K*winProb) grouped by T_eff (should be same if b=0):');
const byT = {};
for (const row of DATA) {
  const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
  const t  = tEff(row.sets, true);
  const residual = row.d - K*wp;
  if (!byT[t]) byT[t] = [];
  byT[t].push({ label: row.label, wp, residual });
}
for (const t of Object.keys(byT).sort((a,b)=>+a-+b)) {
  console.log(`  T_eff=${t}:`);
  for (const {label,wp,residual} of byT[t]) {
    console.log(`    ${label.padEnd(6)} wp=${wp.toFixed(4)}  residual=${residual.toFixed(6)}`);
  }
}

// Grid search: find a,b,c that maximise correct predictions
// Model: sr = a - b*wp - c*T
console.log('\n\nGrid search (a-b*wp-c*T):');
let best = { score:0, a:0, b:0, c:0 };
for (let ai = 1400; ai <= 1600; ai++) {
  const a = ai / 1000;
  for (let bi = 0; bi <= 150; bi++) {
    const b = bi / 1000;
    for (let ci = 60; ci <= 90; ci++) {
      const c = ci / 1000;
      let score = 0;
      for (const row of DATA) {
        const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
        const t  = tEff(row.sets, true);
        const sr = a - b*wp - c*t;
        const pred = trunc4(K*(wp - sr));
        if (pred === row.d) score++;
      }
      if (score > best.score) {
        best = { score, a, b, c };
      }
    }
  }
}
console.log(`Best: a=${best.a} b=${best.b} c=${best.c} → ${best.score}/${DATA.length} correct`);

// Show best solution predictions
const {a,b,c} = best;
console.log('\nPredictions with best a,b,c:');
for (const row of DATA) {
  const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
  const t  = tEff(row.sets, true);
  const sr = a - b*wp - c*t;
  const pred = trunc4(K*(wp - sr));
  const ok = pred === row.d ? '✓' : `✗ got ${pred}`;
  console.log(`  ${row.label.padEnd(6)} ${ok}`);
}
