// Cloudflare Worker: anonymous, stateless CORS/SameSite relay for the nlpadel
// rekentool. POST /deltas { ratings:[R1..R4], genders:[g1..g4] } → { winDeltas,
// lossDeltas }. No login, no secrets, nothing stored.

import { fetchAllDeltas } from './nlpadel-core.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (pathname !== '/deltas') return json({ error: 'Not found' }, 404);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Ongeldige JSON' }, 400);
    }

    const ratings = (body.ratings || []).map(Number);
    if (ratings.length !== 4 || ratings.some(r => !Number.isFinite(r) || r < 1 || r > 12)) {
      return json({ error: 'Geef 4 ratings tussen 1 en 12.' }, 400);
    }
    const genders = Array.isArray(body.genders) && body.genders.length === 4
      ? body.genders
      : ['male', 'male', 'male', 'male'];

    try {
      const { winDeltas, lossDeltas } = await fetchAllDeltas({ ratings, genders });
      return json({ winDeltas, lossDeltas });
    } catch (err) {
      return json({ error: `nlpadel-fout: ${err && err.message || err}` }, 502);
    }
  },
};
