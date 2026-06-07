// DSS-berekening — padel (dubbelspel)
//
// Stap 1: gecombineerde rating koppel  → R12 = θ·R1 + (1−θ)·R2
// Stap 2: winstverwachting             → prob_verlies = 1 / (1 + e^(−q·(R12−R34)))
//                                         winProb = 1 − prob_verlies
//
// Score-afhankelijke ratingwijzigingen worden niet meer lokaal berekend —
// die haalt de UI op uit de officiële nlpadel.nl rekentool via
// scripts/knltb-fetch-ratings.js.
//
// Noot: een LAGERE rating is beter (1 = prof, 9 = beginner).

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

/**
 * Bereken gecombineerde ratings en winstverwachting voor een padel-dubbel.
 *
 * @param {number} R1 - rating speler 1 (team 1)
 * @param {number} R2 - rating speler 2 (team 1)
 * @param {number} R3 - rating speler 3 (team 2)
 * @param {number} R4 - rating speler 4 (team 2)
 * @returns {{
 *   teamRating1: number, teamRating2: number,
 *   winProbTeam1: number, winProbTeam2: number
 * }}
 */
function calcPadel(R1, R2, R3, R4) {
  const { q, theta } = DSS_CONFIG;
  const teamRating1 = theta * R1 + (1 - theta) * R2;
  const teamRating2 = theta * R3 + (1 - theta) * R4;
  const lossProbTeam1 = 1 / (1 + Math.exp(-q * (teamRating1 - teamRating2)));
  return {
    teamRating1:  round4(teamRating1),
    teamRating2:  round4(teamRating2),
    winProbTeam1: round4(1 - lossProbTeam1),
    winProbTeam2: round4(lossProbTeam1),
  };
}

if (typeof module !== 'undefined') module.exports = { calcPadel };
