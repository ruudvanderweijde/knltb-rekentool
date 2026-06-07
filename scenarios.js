// 18 score scenarios shown in the calculator's delta tables.
// Shared between the browser UI and the Node fetcher — order is significant
// (URL-encoded delta lists assume this ordering).

const WIN_SCENARIOS = [
  // 2-0
  { label: '6-0, 6-0',      sets: [[6,0],[6,0]], superTiebreak: null },
  { label: '6-2, 6-1',      sets: [[6,2],[6,1]], superTiebreak: null },
  { label: '6-3, 6-2',      sets: [[6,3],[6,2]], superTiebreak: null },
  { label: '6-4, 6-3',      sets: [[6,4],[6,3]], superTiebreak: null },
  { label: '7-5, 6-4',      sets: [[7,5],[6,4]], superTiebreak: null },
  { label: '7-6, 6-4',      sets: [[7,6],[6,4]], superTiebreak: null },
  // 2-1
  { label: '6-3, 3-6, 7-5', sets: [[6,3],[3,6],[7,5]], superTiebreak: null },
  { label: '6-1, 3-6, 7-6', sets: [[6,1],[3,6],[7,6]], superTiebreak: null },
  { label: '6-4, 4-6, 7-6', sets: [[6,4],[4,6],[7,6]], superTiebreak: null },
];

const LOSS_SCENARIOS = [
  // 0-2
  { label: '0-6, 0-6',      sets: [[0,6],[0,6]], superTiebreak: null },
  { label: '1-6, 2-6',      sets: [[1,6],[2,6]], superTiebreak: null },
  { label: '2-6, 3-6',      sets: [[2,6],[3,6]], superTiebreak: null },
  { label: '3-6, 4-6',      sets: [[3,6],[4,6]], superTiebreak: null },
  { label: '4-6, 5-7',      sets: [[4,6],[5,7]], superTiebreak: null },
  { label: '5-7, 6-7',      sets: [[5,7],[6,7]], superTiebreak: null },
  // 1-2
  { label: '3-6, 6-3, 5-7', sets: [[3,6],[6,3],[5,7]], superTiebreak: null },
  { label: '6-1, 3-6, 6-7', sets: [[6,1],[3,6],[6,7]], superTiebreak: null },
  { label: '4-6, 6-4, 6-7', sets: [[4,6],[6,4],[6,7]], superTiebreak: null },
];

if (typeof module !== 'undefined') {
  module.exports = { WIN_SCENARIOS, LOSS_SCENARIOS };
}
