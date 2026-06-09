// KNLTB Padel Rekentool — auto-fill bookmarklet.
//
// Loaded (via a tiny loader bookmarklet) ON a mijnknltb head-2-head page, where
// it runs in that page's context: it reads the 4 padel-dubbel ratings + names
// using the user's own login (same-origin fetch), guesses gender, and opens the
// calculator pre-filled. No extension, no server. The user confirms ♂/♀ and
// clicks "Bereken".
//
// Served as a static file from GitHub Pages; the saved bookmark just loads it:
//   javascript:(function(){var s=document.createElement('script');
//   s.src='https://ruudvanderweijde.github.io/knltb-rekentool/bookmarklet.js?'+Date.now();
//   document.body.appendChild(s);})();

(async () => {
  const CALC = 'https://ruudvanderweijde.github.io/knltb-rekentool/';
  try {
    const u = new URL(location.href);
    const org = u.searchParams.get('OrganizationCode');
    const ids = ['T1P1MemberID', 'T1P2MemberID', 'T2P1MemberID', 'T2P2MemberID']
      .map(k => u.searchParams.get(k));
    if (!org || ids.some(x => !x)) {
      alert('Open eerst een mijnknltb head-2-head pagina met 4 spelers, en klik dan op de knop.');
      return;
    }

    const slug = id => btoa('base64:' + id);

    // Gender is not on KNLTB — guess from first name (user confirms on the page).
    const FEMALE = new Set(('anna anne anouk astrid bianca carla chantal claudia daphne denise ' +
      'eline ellen els emma esther eva femke fleur ilse ingrid irene iris janneke jasmijn jolanda ' +
      'julia karin kim laura linda lisa lotte maaike manon marieke marjolein marlou maria mirjam ' +
      'monique nadia nienke noa petra renske rianne romy sandra sanne sara sarah saskia sophie ' +
      'suzanne tess tessa wilma yvonne').split(' '));
    const guess = name => {
      const f = (name || '').trim().split(/\s+/)[0].toLowerCase();
      if (FEMALE.has(f)) return 'v';
      if (/(a|ke|je)$/.test(f)) return 'v';
      return 'm';
    };

    const names = ids.map(id => {
      const a = document.querySelector("a[href$='/" + slug(id) + "']");
      return a ? (a.textContent || '').trim().replace(/\s+/g, ' ') : '';
    });

    const ratings = [];
    for (const id of ids) {
      const resp = await fetch('/player/' + org.toUpperCase() + '/' + slug(id), { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
      const el = doc.querySelector("span[title='Padel Dubbel'] .tag-duo__value");
      if (!el) {
        alert('Geen Padel-Dubbel rating gevonden. Ben je ingelogd op mijnknltb?');
        return;
      }
      ratings.push(el.textContent.trim().replace(',', '.'));
    }

    const q = 'R1=' + ratings[0] + '&R2=' + ratings[1] + '&R3=' + ratings[2] + '&R4=' + ratings[3] +
      '&n=' + names.map(encodeURIComponent).join(',') +
      '&g=' + names.map(guess).join(',');
    window.open(CALC + '?' + q, '_blank');
  } catch (e) {
    alert('Auto-fill mislukt: ' + (e && e.message || e));
  }
})();
