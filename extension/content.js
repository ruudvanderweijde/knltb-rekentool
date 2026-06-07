// Runs on mijnknltb head-2-head pages. Injects a button that scrapes the 4
// padel ratings + names (using the logged-in user's own session — same-origin
// fetches), confirms gender, asks the background worker for the 18 nlpadel
// deltas, then opens the calculator pre-filled.

(() => {
  const BTN_ID = 'knltb-rekentool-btn';
  const MODAL_ID = 'knltb-rekentool-modal';
  // Hosted calculator (GitHub Pages) — produces shareable result links and is
  // live once Pages is enabled for the repo. For a fully offline build, swap to
  // the bundled copy: chrome.runtime.getURL('calculator/index.html').
  const CALC_URL = 'https://ruudvanderweijde.github.io/knltb-rekentool/index.html';

  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.textContent = '🎾 Bereken rating-scenario’s';
  btn.addEventListener('click', run);
  document.body.appendChild(btn);

  // ── scraping ───────────────────────────────────────────────────────────────

  function namesFromPage(profileUrls) {
    return profileUrls.map((u) => {
      const slug = u.split('/').pop();
      const a = document.querySelector(`a[href$="/${slug}"]`);
      return a ? (a.textContent || '').trim().replace(/\s+/g, ' ') || null : null;
    });
  }

  async function fetchRating(url) {
    const resp = await fetch(url, { credentials: 'include' });
    if (resp.redirected && /\/user\/login/i.test(resp.url)) {
      throw new Error('LOGIN');
    }
    const html = await resp.text();
    if (/\/user\/login/i.test(resp.url) || /name="Loginnaam"|user\/login/i.test(html)) {
      throw new Error('LOGIN');
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el = doc.querySelector('span[title="Padel Dubbel"] .tag-duo__value');
    const rating = el ? dutchToNumber(el.textContent) : NaN;
    if (!Number.isFinite(rating)) throw new Error('Geen Padel Dubbel rating gevonden.');
    return rating;
  }

  // ── main flow ────────────────────────────────────────────────────────────

  async function run() {
    btn.disabled = true;
    const modal = openModal();
    try {
      const { org, ids } = parseHeadToHeadUrl(location.href);
      const profileUrls = ids.map(id => profileUrl(org, id));
      const names = namesFromPage(profileUrls);

      modal.setStatus('Ratings ophalen…');
      const ratings = [];
      for (let i = 0; i < profileUrls.length; i++) {
        ratings.push(await fetchRating(profileUrls[i]));
      }

      const guesses = names.map(guessGender);
      const genders = await modal.confirmGenders({ names, ratings, guesses });

      modal.setStatus('18 uitslagen berekenen via nlpadel…');
      const res = await chrome.runtime.sendMessage({ type: 'fetchDeltas', ratings, genders });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Onbekende fout bij nlpadel.');

      const query = buildCalcQuery({ ratings, names, genders, ...res.data });
      window.open(`${CALC_URL}?${query}`, '_blank');
      modal.close();
    } catch (err) {
      if (String(err.message) === 'LOGIN') {
        modal.setError('Log eerst in bij KNLTB (mijnknltb.toernooi.nl) en probeer opnieuw.');
      } else if (String(err.message) === 'CANCELLED') {
        modal.close();
      } else {
        modal.setError(`Er ging iets mis: ${err.message}`);
      }
    } finally {
      btn.disabled = false;
    }
  }

  // ── modal UI ─────────────────────────────────────────────────────────────

  function openModal() {
    document.getElementById(MODAL_ID)?.remove();
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'krt-overlay';
    overlay.innerHTML = `
      <div class="krt-card" role="dialog" aria-modal="true">
        <h2 class="krt-title">KNLTB Padel Rekentool</h2>
        <div class="krt-body"><p class="krt-status">Bezig…</p></div>
      </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    const body = overlay.querySelector('.krt-body');

    const api = {
      setStatus(text) { body.innerHTML = `<p class="krt-status">${esc(text)}</p>`; },
      setError(text) {
        body.innerHTML = `<p class="krt-error">${esc(text)}</p>
          <div class="krt-actions"><button class="krt-btn krt-close">Sluiten</button></div>`;
        body.querySelector('.krt-close').addEventListener('click', () => overlay.remove());
      },
      close() { overlay.remove(); },
      // Render the gender-confirm form and resolve with ['male'|'female', ...x4].
      confirmGenders({ names, ratings, guesses }) {
        return new Promise((resolve, reject) => {
          const rows = names.map((n, i) => {
            const g = guesses[i] === 'female' ? 'female' : 'male';
            return `<div class="krt-row">
              <span class="krt-name">${esc(n || `Speler ${i + 1}`)}</span>
              <span class="krt-rating">${esc(ratings[i])}</span>
              <select class="krt-select" data-i="${i}">
                <option value="m"${g === 'male' ? ' selected' : ''}>Man ♂</option>
                <option value="v"${g === 'female' ? ' selected' : ''}>Vrouw ♀</option>
              </select></div>`;
          }).join('');
          body.innerHTML = `
            <p class="krt-hint">Geslacht staat niet op KNLTB — gegokt op voornaam.
              Het beïnvloedt de uitkomst bij gemengde teams, dus controleer even.</p>
            ${rows}
            <div class="krt-actions">
              <button class="krt-btn krt-cancel">Annuleren</button>
              <button class="krt-btn krt-primary krt-go">Bereken →</button>
            </div>`;
          body.querySelector('.krt-cancel').addEventListener('click', () => reject(new Error('CANCELLED')));
          body.querySelector('.krt-go').addEventListener('click', () => {
            const genders = [...body.querySelectorAll('.krt-select')]
              .sort((a, b) => a.dataset.i - b.dataset.i)
              .map(sel => normalizeGender(sel.value) || 'male');
            resolve(genders);
          });
        });
      },
    };
    return api;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
