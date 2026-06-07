'use strict';
// Check current formula + try alternative models.

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

const DATA = [
  { label:'W1', R1:7.1093,R2:7.5307,R3:8,R4:7.628, sets:[[6,0],[6,0]],        d:-0.1953 },
  { label:'W2', R1:7.1093,R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[6,0]],        d:-0.1744 },
  { label:'W3', R1:7.1093,R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[6,3]],        d:-0.112  },
  { label:'W4', R1:6.697, R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[6,3]],        d:-0.0904 },
  { label:'W5', R1:6.697, R2:7.5307,R3:8,R4:7.628, sets:[[6,1],[3,6],[7,5]],  d:-0.0904 },
  { label:'E1', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,4],[6,4]], d:-0.0183 },
  { label:'E2', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,2],[6,2]], d:-0.1016 },
  { label:'E6', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,0],[6,0]], d:-0.185  },
  { label:'E7', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,4],[6,2]], d:-0.06   },
  { label:'E8', R1:8.4901,R2:6.8206,R3:7.7091,R4:8.7853, sets:[[6,1],[6,3]], d:-0.1016 },
  { label:'X1', R1:7,R2:7,R3:7.5,R4:7.5, sets:[[6,0],[6,0]], d:-0.1947 },
  { label:'X2', R1:7,R2:7,R3:7.5,R4:7.5, sets:[[6,4],[6,4]], d:-0.028  },
  { label:'X3', R1:6,R2:8,R3:7.5,R4:7.5, sets:[[6,0],[6,0]], d:-0.1947 },
];

function test(a, b, c, label='') {
  let pass = 0;
  const fails = [];
  for (const row of DATA) {
    const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
    const t  = tEff(row.sets, true);
    const sr = a - b*wp - c*t;
    const pred = trunc4(K*(wp - sr));
    if (pred === row.d) pass++;
    else fails.push(`${row.label}:got${pred}≠${row.d}`);
  }
  console.log(`${label.padEnd(30)} ${pass}/${DATA.length}  ${fails.join(' ')}`);
  return pass;
}

console.log('Model: a - b*winProb - c*T_eff\n');
console.log(`${'Parameters'.padEnd(30)} Pass  Failures`);
test(1.4897, 0.0679, 0.0757, 'current (1.4897,0.0679,0.0757)');

// Try near-current values
for (const [a,b,c] of [
  [1.4897, 0.0, 0.0757],
  [1.4897, 0.03, 0.0757],
  [1.4897, 0.05, 0.0757],
  [1.4897, 0.10, 0.0757],
  [1.48,   0.0679, 0.0757],
  [1.50,   0.0679, 0.0757],
  [1.52,   0.0679, 0.0757],
]) {
  test(a, b, c, `(${a},${b},${c})`);
}

// Fine grid search over wider b range
console.log('\nFine grid search:');
let best = { score:0, params:[] };
for (let ai = 1440; ai <= 1560; ai += 2) {
  for (let bi = -20; bi <= 150; bi += 1) {
    for (let ci = 72; ci <= 82; ci += 1) {
      const a = ai/1000, b = bi/1000, c = ci/1000;
      let score = 0;
      for (const row of DATA) {
        const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
        const t  = tEff(row.sets, true);
        const sr = a - b*wp - c*t;
        if (trunc4(K*(wp-sr)) === row.d) score++;
      }
      if (score > best.score || (score === best.score && best.params.length < 5)) {
        if (score > best.score) { best.score = score; best.params = []; }
        if (best.params.length < 10) best.params.push([a,b,c]);
      }
    }
  }
}
console.log(`Max correct: ${best.score}/${DATA.length}`);
for (const [a,b,c] of best.params) test(a,b,c, `  (${a},${b},${c})`);

// Now try model with winProb²: sr = a - b*wp² - c*T
console.log('\nModel: a - b*winProb² - c*T_eff\n');
best = { score:0, params:[] };
for (let ai = 1440; ai <= 1600; ai += 2) {
  for (let bi = -20; bi <= 200; bi += 2) {
    for (let ci = 72; ci <= 82; ci += 1) {
      const a = ai/1000, b = bi/1000, c = ci/1000;
      let score = 0;
      for (const row of DATA) {
        const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
        const t  = tEff(row.sets, true);
        const sr = a - b*wp*wp - c*t;
        if (trunc4(K*(wp-sr)) === row.d) score++;
      }
      if (score > best.score) { best.score = score; best.params = [[a,b,c]]; }
      else if (score === best.score && best.params.length < 5) best.params.push([a,b,c]);
    }
  }
}
console.log(`Max correct with wp²: ${best.score}/${DATA.length}`);
for (const [a,b,c] of best.params) {
  const fn = (wp,t) => `${a} - ${b}*${wp}² - ${c}*${t}`;
  let pass=0, fails=[];
  for (const row of DATA) {
    const wp = winProbExact(row.R1,row.R2,row.R3,row.R4);
    const t  = tEff(row.sets, true);
    const sr = a - b*wp*wp - c*t;
    const pred = trunc4(K*(wp-sr));
    if (pred===row.d) pass++;
    else fails.push(`${row.label}:${pred}`);
  }
  console.log(`  (${a},${b},${c}) → ${pass}/${DATA.length}  ${fails.join(' ')}`);
}
