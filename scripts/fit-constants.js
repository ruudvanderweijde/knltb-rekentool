'use strict';
// Least-squares fit of scoreResult = a - b*winProb - c*T_eff
// Uses all confirmed nlpadel.nl data points (regular sets, no STB).

const { DSS_CONFIG } = require('../config.js');
global.DSS_CONFIG = DSS_CONFIG;

const { q, K } = DSS_CONFIG;

function winProb(R1, R2, R3, R4) {
  const R12 = 0.5 * R1 + 0.5 * R2;
  const R34 = 0.5 * R3 + 0.5 * R4;
  const lossProb = 1 / (1 + Math.exp(-q * (R12 - R34)));
  return Math.round((1 - lossProb) * 10000) / 10000;
}

function tEff(sets, isTeam1Wins) {
  const wonSets  = sets.filter(([a, b]) => isTeam1Wins ? a > b : b > a);
  const oppGames = wonSets.reduce((s, [a, b]) => s + (isTeam1Wins ? b : a), 0);
  return oppGames * (wonSets.length / sets.length);
}

// Each row: { label, R1, R2, R3, R4, sets, winner, observedDelta }
// winner: 'team1' means team1 (thuis) wins
const DATA = [
  // W-series: 7.1093/7.5307 vs 8.0000/7.6280
  { label: 'W1', R1:7.1093, R2:7.5307, R3:8.0000, R4:7.6280, sets:[[6,0],[6,0]],      winner:'team1', d:-0.1953 },
  { label: 'W2', R1:7.1093, R2:7.5307, R3:8.0000, R4:7.6280, sets:[[6,1],[6,0]],      winner:'team1', d:-0.1744 },
  { label: 'W3', R1:7.1093, R2:7.5307, R3:8.0000, R4:7.6280, sets:[[6,1],[6,3]],      winner:'team1', d:-0.112  },
  // W4-W5: 6.6970/7.5307 vs 8.0000/7.6280
  { label: 'W4', R1:6.6970, R2:7.5307, R3:8.0000, R4:7.6280, sets:[[6,1],[6,3]],      winner:'team1', d:-0.0904 },
  { label: 'W5', R1:6.6970, R2:7.5307, R3:8.0000, R4:7.6280, sets:[[6,1],[3,6],[7,5]], winner:'team1', d:-0.0904 },
  // E-series: 8.4901/6.8206 vs 7.7091/8.7853
  { label: 'E1', R1:8.4901, R2:6.8206, R3:7.7091, R4:8.7853, sets:[[6,4],[6,4]],      winner:'team1', d:-0.0183 },
  { label: 'E2', R1:8.4901, R2:6.8206, R3:7.7091, R4:8.7853, sets:[[6,2],[6,2]],      winner:'team1', d:-0.1016 },
  { label: 'E6', R1:8.4901, R2:6.8206, R3:7.7091, R4:8.7853, sets:[[6,0],[6,0]],      winner:'team1', d:-0.185  },
  { label: 'E7', R1:8.4901, R2:6.8206, R3:7.7091, R4:8.7853, sets:[[6,4],[6,2]],      winner:'team1', d:-0.06   },
  { label: 'E8', R1:8.4901, R2:6.8206, R3:7.7091, R4:8.7853, sets:[[6,1],[6,3]],      winner:'team1', d:-0.1016 },
  // X-series: 7.0/7.0 vs 7.5/7.5 (X3 same R12 as X1/X2)
  { label: 'X1', R1:7.0,    R2:7.0,    R3:7.5,    R4:7.5,    sets:[[6,0],[6,0]],      winner:'team1', d:-0.1947 },
  { label: 'X2', R1:7.0,    R2:7.0,    R3:7.5,    R4:7.5,    sets:[[6,4],[6,4]],      winner:'team1', d:-0.028  },
  { label: 'X3', R1:6.0,    R2:8.0,    R3:7.5,    R4:7.5,    sets:[[6,0],[6,0]],      winner:'team1', d:-0.1947 },
];

// Compute observed scoreResult for each point:
// delta = trunc4(K*(winProb - scoreResult))
// ≈ K*(winProb - scoreResult), so scoreResult ≈ winProb - delta/K
const points = DATA.map(row => {
  const wp   = winProb(row.R1, row.R2, row.R3, row.R4);
  const t    = tEff(row.sets, row.winner === 'team1');
  const srObs = wp - row.d / K;
  return { label: row.label, wp, t, srObs };
});

console.log('\nData points:');
console.log('Label  winProb  T_eff  srObs');
for (const p of points) {
  console.log(`${p.label.padEnd(6)} ${p.wp.toFixed(4)}   ${p.t.toFixed(4)}   ${p.srObs.toFixed(6)}`);
}

// Ordinary least squares: minimize Σ(a - b*wp - c*t - srObs)²
// Design matrix X cols: [1, wp, t], target y = srObs
// Normal equations: (X'X)(a,b,c)' = X'y
const n = points.length;
let S1=0, Swp=0, St=0, Swp2=0, Swpt=0, St2=0, Sy=0, Swpy=0, Sty=0;
for (const { wp, t, srObs } of points) {
  S1   += 1;
  Swp  += wp;
  St   += t;
  Swp2 += wp * wp;
  Swpt += wp * t;
  St2  += t * t;
  Sy   += srObs;
  Swpy += wp * srObs;
  Sty  += t * srObs;
}

// 3×3 system: [S1 Swp St; Swp Swp2 Swpt; St Swpt St2] * [a;-b;-c] = [Sy;Swpy;Sty]
// Solve via Cramer's rule (small system)
function det3(m) {
  return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
       - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
       + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
}

const M = [
  [S1,   Swp,  St  ],
  [Swp,  Swp2, Swpt],
  [St,   Swpt, St2 ],
];
const detM = det3(M);

const Ma = [[Sy,   Swp,  St  ], [Swpy, Swp2, Swpt], [Sty,  Swpt, St2 ]];
const Mb = [[S1,   Sy,   St  ], [Swp,  Swpy, Swpt], [St,   Sty,  St2 ]];
const Mc = [[S1,   Swp,  Sy  ], [Swp,  Swp2, Swpy], [St,   Swpt, Sty ]];

const a =  det3(Ma) / detM;
const b = -det3(Mb) / detM;  // negative because model is a - b*wp - c*t
const c = -det3(Mc) / detM;

console.log('\n═══ Fitted constants ═══');
console.log(`a = ${a.toFixed(6)}`);
console.log(`b = ${b.toFixed(6)}`);
console.log(`c = ${c.toFixed(6)}`);

// Residuals
console.log('\nResiduals (srObs - predicted):');
let sse = 0;
for (const { label, wp, t, srObs } of points) {
  const predicted = a - b * wp - c * t;
  const residual  = srObs - predicted;
  sse += residual * residual;
  console.log(`  ${label.padEnd(6)} residual=${residual.toFixed(6)}`);
}
console.log(`RMSE = ${Math.sqrt(sse / n).toFixed(6)}`);

// Show what delta each point predicts with new constants
console.log('\nPredicted delta vs observed (new constants):');
for (const row of DATA) {
  const wp = winProb(row.R1, row.R2, row.R3, row.R4);
  const t  = tEff(row.sets, row.winner === 'team1');
  const sr = a - b * wp - c * t;
  const rawDelta = K * (wp - sr);
  const predDelta = Math.trunc(rawDelta * 10000) / 10000 || 0;
  const ok = predDelta === row.d ? '✓' : `✗ (expected ${row.d})`;
  console.log(`  ${row.label.padEnd(6)} predicted=${predDelta}  ${ok}`);
}
