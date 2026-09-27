// Supabase Storage helper (REST, no extra dependency) for the original
// worksheet PDFs. The bucket is PRIVATE: files are only reachable through
// short-lived signed URLs handed to staff by the API.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server-side only — never
// expose the service role key to the browser).
//
// Sheet.pdfUrl stores a reference like "storage://worksheets/<key>".

const BUCKET = 'worksheets';
const PREFIX = 'storage://';

function configured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

function base() {
  return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
}

// Object keys: keep folders, replace anything Storage dislikes
function objectKeyFor(relativePath) {
  return String(relativePath)
    .split('/')
    .map(part => part.normalize('NFKD').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_'))
    .join('/');
}

function toRef(key) { return `${PREFIX}${BUCKET}/${key}`; }

function parseRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith(PREFIX)) return null;
  const rest = ref.slice(PREFIX.length);
  const slash = rest.indexOf('/');
  return slash > 0 ? { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) } : null;
}

async function ensureBucket() {
  const res = await fetch(`${base()}/bucket/${BUCKET}`, { headers: headers() });
  if (res.ok) return false;
  const create = await fetch(`${base()}/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 52428800, allowed_mime_types: ['application/pdf'] }),
  });
  if (!create.ok) throw new Error(`Could not create bucket: ${create.status} ${await create.text()}`);
  return true;
}

async function upload(key, buffer, contentType = 'application/pdf') {
  const res = await fetch(`${base()}/object/${BUCKET}/${encodeKey(key)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }),
    body: buffer,
  });
  if (!res.ok) throw new Error(`Upload failed for ${key}: ${res.status} ${await res.text()}`);
  return toRef(key);
}

// Short-lived URL the browser can open directly
async function signedUrl(ref, expiresIn = 300) {
  const parsed = parseRef(ref);
  if (!parsed || !configured()) return null;
  const res = await fetch(`${base()}/object/sign/${parsed.bucket}/${encodeKey(parsed.key)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return signedURL ? `${base()}${signedURL}` : null;
}

// Server-side download of a stored object (service role)
async function download(ref) {
  const parsed = parseRef(ref);
  if (!parsed || !configured()) return null;
  const res = await fetch(`${base()}/object/authenticated/${parsed.bucket}/${encodeKey(parsed.key)}`, { headers: headers() });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// Delete objects under a prefix older than maxAgeMs (best effort)
async function removeOlderThan(prefix, maxAgeMs) {
  try {
    const res = await fetch(`${base()}/object/list/${BUCKET}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'created_at', order: 'asc' } }),
    });
    if (!res.ok) return 0;
    const cutoff = Date.now() - maxAgeMs;
    const old = (await res.json()).filter(o => o.id && new Date(o.created_at).getTime() < cutoff).map(o => `${prefix.replace(/\/$/, '')}/${o.name}`);
    if (!old.length) return 0;
    await fetch(`${base()}/object/${BUCKET}`, {
      method: 'DELETE',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: old }),
    });
    return old.length;
  } catch { return 0; }
}

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

module.exports = { BUCKET, configured, objectKeyFor, toRef, parseRef, ensureBucket, upload, signedUrl, download, removeOlderThan };
