// Static file server + Couchbase Capella sync API. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = process.cwd();

const mime = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.txt':'text/plain'
};

// ---------------------------------------------------------------------------
// Couchbase Capella connection (optional – only active when env vars are set)
// ---------------------------------------------------------------------------
const ALLOWED_COLLECTIONS = new Set(['events', 'tasks', 'taskCategories']);

let cbCluster = null;
let cbBucket = null;
let cbScope = null;

async function connectCouchbase() {
  const connStr = process.env.CB_CONNECTION_STRING;
  const username = process.env.CB_USERNAME;
  const password = process.env.CB_PASSWORD;
  const bucketName = process.env.CB_BUCKET;

  if (!connStr || !username || !password || !bucketName) {
    console.log('Couchbase env vars not set – sync API disabled.');
    return;
  }

  try {
    const couchbase = require('couchbase');
    cbCluster = await couchbase.connect(connStr, {
      username,
      password,
      timeouts: { connectTimeout: 10000, kvTimeout: 5000 },
    });
    cbBucket = cbCluster.bucket(bucketName);
    cbScope = cbBucket.defaultScope();
    console.log(`Couchbase connected to bucket "${bucketName}"`);
  } catch (err) {
    console.error('Couchbase connection failed:', err.message);
    cbCluster = null; cbBucket = null; cbScope = null;
  }
}

connectCouchbase();

// ---------------------------------------------------------------------------
// Token-sync storage (in-memory, optionally persisted to data/token-sync.json)
// ---------------------------------------------------------------------------

const TOKEN_SYNC_COLLECTIONS = new Set(['events', 'tasks', 'taskCategories', 'reminders', 'inbox']);
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOKEN_SYNC_DATA_DIR = path.join(ROOT, 'data');
const TOKEN_SYNC_DATA_FILE = path.join(TOKEN_SYNC_DATA_DIR, 'token-sync.json');

// Map<token, { lastUsed: number, data: { [collection]: any } }>
const tokenSyncStore = new Map();

function loadTokenSyncData() {
  try {
    const raw = fs.readFileSync(TOKEN_SYNC_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [token, entry] of Object.entries(parsed)) {
        if (entry && typeof entry.lastUsed === 'number' && typeof entry.data === 'object') {
          tokenSyncStore.set(token, entry);
        }
      }
    }
    console.log(`Token-sync: loaded ${tokenSyncStore.size} token(s) from disk.`);
  } catch (_) {
    // File may not exist yet – that's fine.
  }
}

function saveTokenSyncData() {
  try {
    fs.mkdirSync(TOKEN_SYNC_DATA_DIR, { recursive: true });
    const out = {};
    for (const [token, entry] of tokenSyncStore.entries()) out[token] = entry;
    fs.writeFileSync(TOKEN_SYNC_DATA_FILE, JSON.stringify(out));
  } catch (e) {
    console.error('Token-sync: could not save data to disk:', e.message);
  }
}

function purgeExpiredTokens() {
  const cutoff = Date.now() - TOKEN_TTL_MS;
  let removed = 0;
  for (const [token, entry] of tokenSyncStore.entries()) {
    if (entry.lastUsed < cutoff) { tokenSyncStore.delete(token); removed++; }
  }
  if (removed) saveTokenSyncData();
}

function generateSyncToken() {
  // 12 lowercase hex chars (crypto.randomBytes(6) → 48 bits of entropy)
  return crypto.randomBytes(6).toString('hex');
}

loadTokenSyncData();
// Purge stale tokens once an hour
setInterval(purgeExpiredTokens, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Token-sync API handlers
// ---------------------------------------------------------------------------

function handleTokenSyncRegister(res) {
  const token = generateSyncToken();
  tokenSyncStore.set(token, { lastUsed: Date.now(), data: {} });
  saveTokenSyncData();
  return jsonResponse(res, 200, { token });
}

function handleTokenSyncGet(res, token, collection) {
  const entry = tokenSyncStore.get(token);
  if (!entry) return jsonResponse(res, 404, { error: 'Token not found' });
  entry.lastUsed = Date.now();
  const value = Object.prototype.hasOwnProperty.call(entry.data, collection)
    ? entry.data[collection]
    : null;
  return jsonResponse(res, 200, { value });
}

async function handleTokenSyncPost(res, token, collection, body) {
  let payload;
  try {
    payload = JSON.parse(body);
    if (typeof payload !== 'object' || payload === null || !Object.prototype.hasOwnProperty.call(payload, 'value')) {
      throw new Error('Expected { value: ... }');
    }
  } catch (e) {
    return jsonResponse(res, 400, { error: 'Invalid JSON: expected { "value": ... }' });
  }

  if (!tokenSyncStore.has(token)) {
    tokenSyncStore.set(token, { lastUsed: Date.now(), data: {} });
  }
  const entry = tokenSyncStore.get(token);
  entry.lastUsed = Date.now();
  entry.data[collection] = payload.value;
  saveTokenSyncData();
  return jsonResponse(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Sync API helpers
// ---------------------------------------------------------------------------

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

async function handleSyncGet(res, collection) {
  if (!cbScope) {
    return jsonResponse(res, 503, { error: 'Sync not configured' });
  }
  try {
    const result = await cbScope.query(
      `SELECT META().id AS _id, d.* FROM \`${collection}\` AS d`
    );
    return jsonResponse(res, 200, { items: result.rows });
  } catch (err) {
    console.error('Sync GET error:', err.message);
    return jsonResponse(res, 500, { error: err.message });
  }
}

async function handleSyncPost(res, collection, body) {
  if (!cbScope) {
    return jsonResponse(res, 503, { error: 'Sync not configured' });
  }
  let items;
  try {
    items = JSON.parse(body);
    if (!Array.isArray(items)) throw new Error('Expected array');
  } catch (err) {
    return jsonResponse(res, 400, { error: 'Invalid JSON array' });
  }

  try {
    const col = cbScope.collection(collection);
    const upserts = items.filter(item => item && (item.id || item._id)).map(item => {
      const docId = String(item.id || item._id);
      return col.upsert(docId, item);
    });
    await Promise.all(upserts);
    return jsonResponse(res, 200, { ok: true, upserted: upserts.length });
  } catch (err) {
    console.error('Sync POST error:', err.message);
    return jsonResponse(res, 500, { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);

    // Handle CORS preflight for API routes
    if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      res.end();
      return;
    }

    // Token-sync API: POST /api/token-sync/new  GET/POST /api/token-sync/:token/:collection
    if (urlPath === '/api/token-sync/new' && req.method === 'POST') {
      handleTokenSyncRegister(res);
      return;
    }
    const tokenSyncMatch = urlPath.match(/^\/api\/token-sync\/([a-f0-9]{12})\/([a-zA-Z0-9_-]+)$/);
    if (tokenSyncMatch) {
      const token = tokenSyncMatch[1];
      const collection = tokenSyncMatch[2];
      if (!TOKEN_SYNC_COLLECTIONS.has(collection)) {
        jsonResponse(res, 404, { error: 'Unknown collection' });
        return;
      }
      if (req.method === 'GET') {
        handleTokenSyncGet(res, token, collection);
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          handleTokenSyncPost(res, token, collection, body).catch(e => jsonResponse(res, 500, { error: e.message }));
        });
        return;
      }
      jsonResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    // Sync API: GET /api/sync/:collection  POST /api/sync/:collection
    const syncMatch = urlPath.match(/^\/api\/sync\/([a-zA-Z0-9_-]+)$/);
    if (syncMatch) {
      const collection = syncMatch[1];
      if (!ALLOWED_COLLECTIONS.has(collection)) {
        jsonResponse(res, 404, { error: 'Unknown collection' });
        return;
      }
      if (req.method === 'GET') {
        handleSyncGet(res, collection).catch(e => jsonResponse(res, 500, { error: e.message }));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          handleSyncPost(res, collection, body).catch(e => jsonResponse(res, 500, { error: e.message }));
        });
        return;
      }
      jsonResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    // Static file serving
    let reqPath = urlPath;
    if (reqPath === '/') reqPath = '/index.html';
    // Resolve and validate path stays within ROOT to prevent traversal
    const filePath = path.resolve(ROOT, reqPath.replace(/^\/+/, ''));
    const rootNorm = path.resolve(ROOT);
    if (!filePath.startsWith(rootNorm + path.sep) && filePath !== rootNorm) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.stat(filePath, (err, st) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      if (st.isDirectory()) {
        // Build redirect solely from the validated relative portion of filePath
        const relDir = filePath.slice(rootNorm.length).replace(/\\/g, '/');
        const redirectTarget = relDir.endsWith('/') ? (relDir + 'index.html') : (relDir + '/index.html');
        res.writeHead(302, { Location: redirectTarget });
        res.end();
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = mime[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
}).listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
