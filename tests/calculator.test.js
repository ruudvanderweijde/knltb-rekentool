/**
 * Unit tests voor de DSS calculator (padel dubbelspel).
 *
 * Uitvoeren:  npm test
 *             node --test tests/calculator.test.js
 *
 * Vereist Node >= 18 (ingebouwde testrunner).
 *
 * Score-afhankelijke ratingwijzigingen worden niet lokaal berekend —
 * die haalt scripts/knltb-fetch-ratings.js op uit de nlpadel.nl rekentool.
 * De tests hier dekken alleen DSS-config, gecombineerde ratings en de
 * winstverwachting-sigmoid (logistische functie op R12−R34).
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { DSS_CONFIG } = require('../config.js');
// calculator.js leest DSS_CONFIG als global; zet het klaar vóór de import.
global.DSS_CONFIG = DSS_CONFIG;
const { calcPadel } = require('../calculator.js');

// ── DSS configuratie ──────────────────────────────────────────────────────────

test('DSS_CONFIG bevat de juiste waarden', () => {
  assert.equal(DSS_CONFIG.q,     2.012);
  assert.equal(DSS_CONFIG.K,     0.275);
  assert.equal(DSS_CONFIG.theta, 0.5);
});

// ── Gecombineerde ratings ─────────────────────────────────────────────────────

test('gecombineerde rating is het gemiddelde van de twee spelers', () => {
  const res = calcPadel(6.0, 8.0, 7.0, 7.0);
  assert.equal(res.teamRating1, 7.0);
  assert.equal(res.teamRating2, 7.0);
});

test('gecombineerde rating bij gelijke spelers', () => {
  const res = calcPadel(5.0, 5.0, 5.0, 5.0);
  assert.equal(res.teamRating1, 5.0);
  assert.equal(res.teamRating2, 5.0);
});

// ── Winstverwachting ──────────────────────────────────────────────────────────

test('gelijke koppels → winstverwachting ≈ 50%', () => {
  const res = calcPadel(5.0, 5.0, 5.0, 5.0);
  assert.equal(res.winProbTeam1, 0.5);
  assert.equal(res.winProbTeam2, 0.5);
});

test('winProbTeam1 + winProbTeam2 = 1', () => {
  const res = calcPadel(6.0, 7.0, 7.5, 8.0);
  assert.equal(res.winProbTeam1 + res.winProbTeam2, 1);
});

test('zwakker team (hogere rating) heeft lagere winstverwachting', () => {
  const res = calcPadel(6.0, 6.0, 8.0, 8.0);
  assert.ok(res.winProbTeam1 > 0.9, `verwacht >0.9, kreeg ${res.winProbTeam1}`);
  assert.ok(res.winProbTeam2 < 0.1, `verwacht <0.1, kreeg ${res.winProbTeam2}`);
});

test('winstverwachting team 1 ≈ 80.36% (testteams W4-W7)', () => {
  const res = calcPadel(6.6970, 7.5307, 8.0000, 7.6280);
  assert.equal(res.winProbTeam1, 0.8036);
});

test('winstverwachting team 1 ≈ 72.99% (testteams W1-W3)', () => {
  const res = calcPadel(7.1093, 7.5307, 8.0000, 7.6280);
  assert.equal(res.winProbTeam1, 0.7299);
});
