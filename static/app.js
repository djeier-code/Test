const analyzeBtn = document.getElementById('analyzeBtn');
const companyInput = document.getElementById('companyInput');
const statusEl = document.getElementById('status');

const cards = document.getElementById('cards');
const details = document.getElementById('details');
const imagesSection = document.getElementById('imagesSection');

const googleRating = document.getElementById('googleRating');
const igFollowers = document.getElementById('igFollowers');
const fbFollowers = document.getElementById('fbFollowers');
const backlinks = document.getElementById('backlinks');
const domains = document.getElementById('domains');
const competitors = document.getElementById('competitors');
const images = document.getElementById('images');

function formatNumber(v) {
  if (v === null || v === undefined) return 'Nicht gefunden';
  return new Intl.NumberFormat('de-DE').format(v);
}

function renderList(el, items, emptyText = 'Keine Daten gefunden') {
  el.innerHTML = '';
  if (!items?.length) {
    const li = document.createElement('li');
    li.textContent = emptyText;
    el.appendChild(li);
    return;
  }
  items.forEach(i => {
    const li = document.createElement('li');
    li.textContent = i;
    el.appendChild(li);
  });
}

analyzeBtn.addEventListener('click', async () => {
  const company = companyInput.value.trim();
  if (!company) {
    statusEl.textContent = 'Bitte zuerst einen Firmennamen eingeben.';
    return;
  }

  cards.classList.add('hidden');
  details.classList.add('hidden');
  imagesSection.classList.add('hidden');
  statusEl.textContent = 'Analyse läuft im Hintergrund …';

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analyse fehlgeschlagen');

    googleRating.textContent = data.google_rating ? `${data.google_rating} / 5` : 'Nicht gefunden';
    igFollowers.textContent = formatNumber(data.instagram_followers);
    fbFollowers.textContent = formatNumber(data.facebook_followers);
    backlinks.textContent = formatNumber(data.backlinks_count);

    renderList(domains, data.backlink_domains);
    renderList(competitors, data.competitors);

    images.innerHTML = '';
    if (data.images?.length) {
      data.images.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Bildtreffer für ${company}`;
        img.loading = 'lazy';
        images.appendChild(img);
      });
    } else {
      images.innerHTML = '<p>Keine Bildtreffer gefunden.</p>';
    }

    cards.classList.remove('hidden');
    details.classList.remove('hidden');
    imagesSection.classList.remove('hidden');
    statusEl.textContent = `Analyse für „${company}“ abgeschlossen.`;
  } catch (err) {
    statusEl.textContent = `Fehler: ${err.message}`;
  }
});
