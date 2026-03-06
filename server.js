const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8000);

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath, contentType = 'text/plain; charset=utf-8') {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 DashboardBot/1.0',
      },
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  }
}

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function duckduckgoSearch(company) {
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(company)}`);
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>)?/g;

  const results = [];
  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < 30) {
    const url = decodeHtmlEntities(match[1]);
    const title = stripTags(match[2]);
    const snippet = stripTags(match[3] || match[4] || '');
    results.push({ title, url, snippet });
  }
  return results;
}

function parseGoogleRating(results) {
  const text = results.map((x) => `${x.title} ${x.snippet}`).join(' ');
  const patterns = [
    /(?:Bewertung|Rating|rated|Sterne|stars?)\s*[:\-]?\s*(\d[\.,]\d)/i,
    /(\d[\.,]\d)\s*(?:von\s*5|\/5|stars?|Sterne)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(',', '.');
  }
  return null;
}

function normalizeNum(value) {
  if (!value) return null;
  const s = value.toLowerCase().replace(/\./g, '').replace(',', '.').trim();
  const m = s.match(/([\d.]+)\s*([kmb])?/);
  if (!m) return null;
  let n = Number(m[1]);
  if (Number.isNaN(n)) return null;
  if (m[2] === 'k') n *= 1_000;
  if (m[2] === 'm') n *= 1_000_000;
  if (m[2] === 'b') n *= 1_000_000_000;
  return Math.floor(n);
}

function findSocialLinks(results) {
  let instagram = null;
  let facebook = null;
  for (const r of results) {
    if (!instagram && r.url.includes('instagram.com')) instagram = r.url;
    if (!facebook && r.url.includes('facebook.com')) facebook = r.url;
  }
  return { instagram, facebook };
}

async function extractInstagramFollowers(url) {
  if (!url) return null;
  const html = await fetchText(url);
  let m = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
  if (m) return Number(m[1]);
  m = html.match(/([\d.,]+[kKmM]?)\s+Followers/);
  return m ? normalizeNum(m[1]) : null;
}

async function extractFacebookFollowers(url) {
  if (!url) return null;
  const html = await fetchText(url);
  const m = html.match(/([\d.,]+[kKmM]?)\s*(?:Follower|followers)/i);
  return m ? normalizeNum(m[1]) : null;
}

function backlinksFromResults(results) {
  const domains = [];
  for (const r of results) {
    try {
      const host = new URL(r.url).hostname;
      if (host && !host.includes('duckduckgo.com')) domains.push(host);
    } catch {
      // ignore
    }
  }
  const unique = [...new Set(domains)];
  return { count: unique.length, domains: unique.slice(0, 12) };
}

async function geocodeCompany(company) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(company)}&format=json&limit=1`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DashboardBot/1.0' } });
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: Number(data[0].lat),
        lon: Number(data[0].lon),
        display_name: data[0].display_name || null,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

async function nearbyCompetitors(lat, lon, radius = 50000) {
  const query = `
    [out:json][timeout:25];
    (
      node(around:${radius},${lat},${lon})[shop][name];
      node(around:${radius},${lat},${lon})[amenity][name];
      way(around:${radius},${lat},${lon})[shop][name];
      way(around:${radius},${lat},${lon})[amenity][name];
      relation(around:${radius},${lat},${lon})[shop][name];
      relation(around:${radius},${lat},${lon})[amenity][name];
    );
    out tags center 40;
  `;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
    });
    const data = await response.json();
    const names = [];
    for (const el of data.elements || []) {
      const name = el.tags?.name;
      if (name) names.push(name);
    }
    return [...new Set(names)].slice(0, 15);
  } catch {
    return [];
  }
}

async function duckduckgoImages(query) {
  const page = await fetchText(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`);
  const token = page.match(/vqd='([^']+)'/);
  if (!token) return [];

  try {
    const url = `https://duckduckgo.com/i.js?l=de-de&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token[1])}&f=,,,`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DashboardBot/1.0' } });
    const data = await response.json();
    return (data.results || []).map((x) => x.image).filter(Boolean).slice(0, 6);
  } catch {
    return [];
  }
}

async function analyzeCompany(company) {
  const results = await duckduckgoSearch(company);
  const social = findSocialLinks(results);
  const backlinks = backlinksFromResults(results);
  const geo = await geocodeCompany(company);

  const [instagramFollowers, facebookFollowers, images, competitors] = await Promise.all([
    extractInstagramFollowers(social.instagram),
    extractFacebookFollowers(social.facebook),
    duckduckgoImages(company),
    geo ? nearbyCompetitors(geo.lat, geo.lon, 50000) : Promise.resolve([]),
  ]);

  return {
    company,
    google_rating: parseGoogleRating(results),
    instagram_followers: instagramFollowers,
    facebook_followers: facebookFollowers,
    backlinks_count: backlinks.count,
    backlink_domains: backlinks.domains,
    location: geo,
    competitors,
    images,
    social_links: social,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    return serveFile(res, path.join(__dirname, 'templates', 'index.html'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && req.url === '/static/style.css') {
    return serveFile(res, path.join(__dirname, 'static', 'style.css'), 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && req.url === '/static/app.js') {
    return serveFile(res, path.join(__dirname, 'static', 'app.js'), 'application/javascript; charset=utf-8');
  }

  if (req.method === 'POST' && req.url === '/api/analyze') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const company = (payload.company || '').trim();
        if (!company) return sendJson(res, 400, { error: 'Bitte Firmennamen eingeben.' });
        const result = await analyzeCompany(company);
        return sendJson(res, 200, result);
      } catch {
        return sendJson(res, 500, { error: 'Analyse fehlgeschlagen.' });
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard läuft auf http://0.0.0.0:${PORT}`);
});
