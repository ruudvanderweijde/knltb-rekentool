'use strict';
// Test: sr = a - b*wp - c*T - d*wp*T  (interaction model)
// Also test: sr = a - b*wp - c*(T^alpha) for various alpha

const { DSS_CONFIG } = require('../config.js');
global.DSS_CONFIG = DSS_CONFIG;
const { q, K } = DSS_CONFIG;

function round4(v) { return Math.round(v * 10000) / 10000; }
function trunc4(v) { return Math.trunc(v * 10000) / 10000 || 0; }

function wp(R1,R2,R3,R4) {
  const R12=0.5*R1+0.5*R2, R34=0.5*R3+0.5*R4;
  return round4(1 - 1/(1+Math.exp(-q*(R12-R34))));
}
function T(sets) {
  const won=sets.filter(([a,b])=>a>b);
  return won.reduce((s,[a,b])=>s+b,0)*(won.length/sets.length);
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

function score4(a,b,c,d) {
  let pass=0; const fails=[];
  for (const row of DATA) {
    const w=wp(row.R1,row.R2,row.R3,row.R4), t=T(row.sets);
    const sr = a - b*w - c*t - d*w*t;
    const pred = trunc4(K*(w-sr));
    if(pred===row.d) pass++; else fails.push(`${row.label}:${pred}`);
  }
  return {pass,fails};
}

console.log('=== Model: a - b*wp - c*T - d*wp*T ===\n');
let best={score:0,params:[]};
for(let ai=1430;ai<=1530;ai+=2) {
  for(let bi=-10;bi<=100;bi+=2) {
    for(let ci=70;ci<=82;ci++) {
      for(let di=-50;di<=100;di+=2) {
        const a=ai/1000,b=bi/1000,c=ci/1000,d=di/1000;
        let pass=0;
        for(const row of DATA) {
          const w=wp(row.R1,row.R2,row.R3,row.R4),t=T(row.sets);
          if(trunc4(K*(w-(a-b*w-c*t-d*w*t)))===row.d) pass++;
        }
        if(pass>best.score){best={score:pass,params:[[a,b,c,d]]};}
        else if(pass===best.score&&best.params.length<8)best.params.push([a,b,c,d]);
      }
    }
  }
}
console.log(`Best: ${best.score}/${DATA.length}`);
for(const [a,b,c,d] of best.params){
  const {pass,fails}=score4(a,b,c,d);
  console.log(`  a=${a} b=${b} c=${c} d=${d}  fails: ${fails.join(' ')}`);
}

// Now look at what the interaction model needs
// From analysis:
// At T=0: b_eff = b (very small ~0.012)
// At T=4: b_eff = b + 4d (larger ~0.066)
// → d ≈ (0.066-0.012)/4 = 0.0135
// b ≈ 0.012
console.log('\n=== Manual test based on analytical estimates ===');
for(const [a,b,c,d] of [
  [1.4408, 0.012, 0.0758, 0.0135],
  [1.4410, 0.012, 0.0758, 0.0135],
  [1.4405, 0.015, 0.0758, 0.013],
  [1.4405, 0.010, 0.0758, 0.014],
  [1.4402, 0.005, 0.0760, 0.015],
  [1.4400, 0.000, 0.0760, 0.017],
]) {
  const {pass,fails}=score4(a,b,c,d);
  console.log(`  a=${a} b=${b} c=${c} d=${d} → ${pass}/${DATA.length}  ${fails.join(' ')}`);
}
