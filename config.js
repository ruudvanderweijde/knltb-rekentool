// DSS parameters voor padel (altijd dubbelspel)
// Bron: KNLTB DSS uitgebreide uitleg
const DSS_CONFIG = {
  q: 2.012,    // winstverwachting factor (dubbelspel)
  K: 0.275,    // maximale stijging/daling per wedstrijd
  theta: 0.5,  // gewicht per speler in gecombineerde rating (gelijk verdeeld)
};

// Wat-als scenario's — pas gerust aan naar wens
// result: "win" = team 1 wint, "loss" = team 1 verliest
const SCENARIOS = [
  { label: "6-0, 6-0", result: "win"  },
  { label: "6-3, 6-3", result: "win"  },
  { label: "7-6, 7-6", result: "win"  },
  { label: "6-7, 6-7", result: "loss" },
  { label: "3-6, 3-6", result: "loss" },
  { label: "0-6, 0-6", result: "loss" },
];

if (typeof module !== 'undefined') module.exports = { DSS_CONFIG, SCENARIOS };
