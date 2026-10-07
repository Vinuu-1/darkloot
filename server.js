const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const Busboy = require('busboy');
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_COOKIE = 'vinu_admin_session';
const USER_COOKIE = 'vinu_user_session';
const ADMIN_COOKIE_MAX_AGE = 8 * 60 * 60;
const USER_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_SIDE = 12000;
const MAX_IMAGE_PIXELS = 60000000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS_PER_IP = 8;
const LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = 24;
const GOOGLE_MAX_ATTEMPTS_PER_IP = 30;
const CATEGORIES = new Set(['Gaming', 'Cyberpunk', 'Anime', 'Cars', 'Nature', 'Dark']);
const MIME_EXTENSIONS = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STARTER_WALLPAPERS = [
  { slug: 'neon-frontier', title: 'Neon District', game: 'Cyberpunk Demo', category: 'Cyberpunk', legacyCategory: 'Cyberpunk', description: 'Unofficial demo wallpaper · Original futuristic-city vector scene.', keywords: 'demo cyberpunk neon courier skyline futuristic rain city', tags: ['cyberpunk', 'neon', 'skyline'], imagePath: '/manus-storage/neon-district_000241bb.svg', fileName: 'vinu-neon-district.svg', width: 2560, height: 1440, previousImagePaths: ['/manus-storage/async-images/1BTlmfYyS7o3hClFaQXTlB/image-1.webp', '/manus-storage/async-images/piRSLSBS96F3pLOSWjyQuE/image-1.webp', '/manus-storage/async-images/78r9g8IhocSluCzgF5Yr8m/image-1.webp'] },
  { slug: 'void-protocol', title: 'Downtown Drift', game: 'Open-World Driving Demo', category: 'Cars', legacyCategory: 'Racing', description: 'Unofficial demo wallpaper · Fictional open-world night-drive vector scene.', keywords: 'demo open world driving racing city car neon boulevard palms', tags: ['cars', 'driving', 'city'], imagePath: '/manus-storage/downtown-drift_fb7b88ec.svg', fileName: 'vinu-downtown-drift.svg', width: 2560, height: 1440, previousImagePaths: ['/manus-storage/async-images/1BTlmfYyS7o3hClFaQXTlB/image-2.webp', '/manus-storage/async-images/piRSLSBS96F3pLOSWjyQuE/image-2.webp', '/manus-storage/async-images/78r9g8IhocSluCzgF5Yr8m/image-2.webp'] },
  { slug: 'ember-arena', title: 'Starblade', game: 'Anime-Inspired Demo', category: 'Anime', legacyCategory: 'Anime', description: 'Unofficial demo wallpaper · Original anime-inspired vector hero art.', keywords: 'demo anime swordswoman rooftop neon city blade original', tags: ['anime', 'hero', 'neon'], imagePath: '/manus-storage/starblade_325fee1f.svg', fileName: 'vinu-starblade.svg', width: 2560, height: 1440, previousImagePaths: ['/manus-storage/async-images/1BTlmfYyS7o3hClFaQXTlB/image-3.webp', '/manus-storage/async-images/piRSLSBS96F3pLOSWjyQuE/image-3.webp', '/manus-storage/async-images/78r9g8IhocSluCzgF5Yr8m/image-3.webp'] },
  { slug: 'ghost-circuit', title: 'Abyss Arena', game: 'Dark-Fantasy Action Demo', category: 'Dark', legacyCategory: 'Dark Fantasy', description: 'Unofficial demo wallpaper · Original dark-fantasy arena vector scene.', keywords: 'demo dark fantasy dragon guardian arena ruins ember action', tags: ['dark', 'fantasy', 'arena'], imagePath: '/manus-storage/abyss-arena_4e52ab87.svg', fileName: 'vinu-abyss-arena.svg', width: 2560, height: 1440, previousImagePaths: ['/manus-storage/async-images/1BTlmfYyS7o3hClFaQXTlB/image-4.webp', '/manus-storage/async-images/piRSLSBS96F3pLOSWjyQuE/image-4.webp', '/manus-storage/async-images/78r9g8IhocSluCzgF5Yr8m/image-4.webp'] }
];

let pool;
let signingSecret;
let adminPasswordHash;
let adminSessionVersion;
let googleClient;
let lastRateLimitCleanupAt = 0;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function derivePassword(value) {
  return crypto.pbkdf2Sync(value, `${signingSecret}:vinu-admin-v2`, 180000, 32, 'sha256');
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', signingSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySession(token, role) {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', signingSecret).update(parts[0]).digest();
  let given;
  try { given = Buffer.from(parts[1], 'base64url'); } catch (_) { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (data.role !== role || !Number.isFinite(data.exp) || data.exp <= Date.now()) return null;
    if (role === 'admin' && (data.sub !== 'admin' || data.credentialVersion !== adminSessionVersion)) return null;
    if (role === 'user' && !UUID_RE.test(String(data.sub || ''))) return null;
    return data;
  } catch (_) { return null; }
}

function cookiesFromHeader(value = '') {
  const result = {};
  for (const pair of value.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    const content = pair.slice(separator + 1).trim();
    if (key) result[key] = content;
  }
  return result;
}

function appendCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', value);
  else res.setHeader('Set-Cookie', Array.isArray(current) ? [...current, value] : [current, value]);
}

function setCookie(res, name, value, maxAge) {
  appendCookie(res, `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`);
}

function clearCookie(res, name) {
  appendCookie(res, `${name}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`);
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(text);
}

function adminSession(req) {
  return verifySession(cookiesFromHeader(req.headers.cookie)[ADMIN_COOKIE], 'admin');
}

function userSession(req) {
  return verifySession(cookiesFromHeader(req.headers.cookie)[USER_COOKIE], 'user');
}

function isAdmin(req) { return Boolean(adminSession(req)); }

function mutationIsSameOrigin(req) {
  if (req.headers['x-vinu-request'] !== '1' || req.headers['sec-fetch-site'] !== 'same-origin' || typeof req.headers.origin !== 'string') return false;
  try {
    const origin = new URL(req.headers.origin).origin;
    if (typeof req.headers.referer === 'string') return new URL(req.headers.referer).origin === origin;
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return Boolean(forwardedHost && ['http', 'https'].includes(forwardedProto) && origin === `${forwardedProto}://${forwardedHost}`);
  } catch (_) { return false; }
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'The request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, maxBytes = 20000) {
  let body;
  try { body = JSON.parse((await readBody(req, maxBytes)).toString('utf8')); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Please submit valid form data.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Please submit valid form data.');
  return body;
}

function cleanField(value, maxLength, label, required = true) {
  const output = typeof value === 'string' ? value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ') : '';
  if (required && !output) throw new HttpError(400, `${label} is required.`);
  if (output.length > maxLength) throw new HttpError(400, `${label} must be ${maxLength} characters or fewer.`);
  return output;
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  const tags = [...new Set(raw.split(',').map((tag) => tag.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 32)).filter(Boolean))];
  if (tags.length > 20) throw new HttpError(400, 'Use no more than 20 tags per wallpaper.');
  return tags;
}

function normalizeCategory(value) {
  const category = cleanField(value, 60, 'Category');
  if (!CATEGORIES.has(category)) throw new HttpError(400, 'Choose Gaming, Cyberpunk, Anime, Cars, Nature, or Dark.');
  return category;
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) break;
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += segmentLength;
  }
  throw new HttpError(415, 'The JPEG image is incomplete or malformed.');
}

function readUInt24LE(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }

function webpDimensions(bytes) {
  const riffSize = bytes.readUInt32LE(4) + 8;
  if (riffSize > bytes.length) throw new HttpError(415, 'The WebP image is incomplete or malformed.');
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + chunkSize > bytes.length) break;
    if (type === 'VP8X' && chunkSize >= 10) return { width: readUInt24LE(bytes, start + 4) + 1, height: readUInt24LE(bytes, start + 7) + 1 };
    if (type === 'VP8L' && chunkSize >= 5 && bytes[start] === 0x2f) {
      const b1 = bytes[start + 1], b2 = bytes[start + 2], b3 = bytes[start + 3], b4 = bytes[start + 4];
      return { width: 1 + ((b2 & 0x3f) << 8) + b1, height: 1 + ((b4 & 0x0f) << 10) + (b3 << 2) + ((b2 & 0xc0) >> 6) };
    }
    if (type === 'VP8 ' && chunkSize >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) return { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
    offset = start + chunkSize + (chunkSize & 1);
  }
  throw new HttpError(415, 'The WebP image is incomplete or malformed.');
}

function getImageMetadata(mimeType, bytes) {
  const extension = MIME_EXTENSIONS.get(mimeType);
  if (!extension) throw new HttpError(415, 'Upload a PNG, JPEG, or WebP image.');
  let dimensions;
  if (mimeType === 'image/png') {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new HttpError(415, 'The PNG image is incomplete or malformed.');
    dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (mimeType === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new HttpError(415, 'The selected file does not match its image type.');
    dimensions = jpegDimensions(bytes);
  } else {
    if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new HttpError(415, 'The selected file does not match its image type.');
    dimensions = webpDimensions(bytes);
  }
  const { width, height } = dimensions;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) throw new HttpError(400, 'The image dimensions are invalid or exceed the 60-megapixel upload limit.');
  return { extension, width, height };
}

function parseWallpaperUpload(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try { parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 12, fileSize: MAX_FILE_BYTES, fieldSize: 1200, parts: 13 } }); }
    catch (_) { reject(new HttpError(400, 'Choose a PNG, JPEG, or WebP file and complete the required fields.')); return; }
    const fields = {};
    let file = null;
    let failure = null;
    let settled = false;
    const fail = (error) => { if (!settled) { settled = true; reject(error); } };
    parser.on('field', (name, value, info) => {
      if (info.valueTruncated) failure = new HttpError(400, 'One of the form fields is too long.');
      if (Object.hasOwn(fields, name)) failure = new HttpError(400, 'Duplicate form fields are not allowed.');
      fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || file) { failure = new HttpError(400, 'Upload one image file at a time.'); stream.resume(); return; }
      const chunks = [];
      file = { mimeType: info.mimeType, buffer: null };
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => { failure = new HttpError(413, 'Image files must be 12 MB or smaller.'); });
      stream.on('end', () => { file.buffer = Buffer.concat(chunks); });
    });
    parser.on('filesLimit', () => { failure = new HttpError(400, 'Upload one image file at a time.'); });
    parser.on('fieldsLimit', () => { failure = new HttpError(400, 'The form contains too many fields.'); });
    parser.on('error', () => fail(new HttpError(400, 'The image upload could not be read.')));
    parser.on('close', () => {
      if (failure) { fail(failure); return; }
      if (!file || !file.buffer) { fail(new HttpError(400, 'Choose an image file to upload.')); return; }
      settled = true; resolve({ fields, file });
    });
    req.pipe(parser);
  });
}

function publicImagePath(imagePath) {
  const value = String(imagePath || '');
  return value.startsWith('/manus-storage/') ? value : `/manus-storage/${value.replace(/^\/+/, '')}`;
}

function toWallpaper(row) {
  let tags = [];
  try { tags = Array.isArray(row.tags_json) ? row.tags_json : JSON.parse(row.tags_json || '[]'); } catch (_) { tags = []; }
  if (!Array.isArray(tags)) tags = [];
  return {
    id: row.slug, title: row.title, game: row.game, category: row.category,
    description: row.description || '', keywords: row.keywords || '', tags,
    imageUrl: publicImagePath(row.image_path), fileName: row.file_name,
    width: Number(row.width) || 0, height: Number(row.height) || 0,
    aspectRatio: row.aspect_ratio || '16:9',
    status: row.status || (Number(row.is_active) === 1 ? 'published' : 'pending'),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.execute('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1', [table, column]);
  if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

async function ensureWallpaperDraftStatus() {
  const [rows] = await pool.execute("SELECT COLUMN_TYPE AS column_type,COLUMN_DEFAULT AS column_default FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='wallpapers' AND column_name='status' LIMIT 1");
  if (!rows.length) return;
  const columnType = String(rows[0].column_type || '').toLowerCase();
  const columnDefault = String(rows[0].column_default || '').toLowerCase();
  if (!columnType.includes("'draft'") || columnDefault !== 'draft') {
    await pool.query("ALTER TABLE wallpapers MODIFY COLUMN status ENUM('pending','draft','published','deleted') NOT NULL DEFAULT 'draft'");
  }
}

function categoryMigration() {
  return [
    "UPDATE wallpapers SET category='Cars' WHERE category='Racing'",
    "UPDATE wallpapers SET category='Dark' WHERE category='Dark Fantasy'",
    "UPDATE wallpapers SET category='Gaming' WHERE category IN ('Sci-Fi','Fantasy','Shooter','Other')"
  ];
}

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('The managed database connection is not configured.');
  if (!process.env.DARKLOOT_SESSION_SECRET || Buffer.byteLength(process.env.DARKLOOT_SESSION_SECRET, 'utf8') < 64) throw new Error('The protected Vinu wallpaperZ session-signing secret must be configured with at least 64 characters.');
  if (!process.env.ADMIN_LOGIN_USERNAME || !process.env.ADMIN_LOGIN_PASSWORD) throw new Error('The protected Vinu wallpaperZ admin login must be configured.');
  signingSecret = process.env.DARKLOOT_SESSION_SECRET;
  adminPasswordHash = derivePassword(process.env.ADMIN_LOGIN_PASSWORD);
  adminSessionVersion = crypto.createHmac('sha256', signingSecret).update(`${process.env.ADMIN_LOGIN_USERNAME.trim().toLowerCase()}:${adminPasswordHash.toString('hex')}`).digest('hex');
  pool = mysql.createPool(process.env.DATABASE_URL);
  const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const statement of schema.split(';').map((item) => item.trim()).filter(Boolean)) await pool.query(statement);
  await pool.query(`CREATE TABLE IF NOT EXISTS google_login_nonces (
    nonce_hash CHAR(64) NOT NULL PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX google_nonce_expiry (expires_at, consumed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await ensureColumn('wallpapers', 'tags_json', 'tags_json TEXT NULL');
  await ensureColumn('wallpapers', 'status', "status ENUM('pending','draft','published','deleted') NOT NULL DEFAULT 'draft'");
  await ensureWallpaperDraftStatus();
  await pool.query("UPDATE wallpapers SET status='pending' WHERE is_active=0 AND status='published'");
  const [rateIndexes] = await pool.execute("SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='auth_rate_limits' AND index_name='auth_rate_limits_window_started' LIMIT 1");
  if (!rateIndexes.length) {
    try { await pool.query('ALTER TABLE auth_rate_limits ADD INDEX auth_rate_limits_window_started (window_started_at)'); }
    catch (error) { if (error.code !== 'ER_DUP_KEYNAME') throw error; }
  }
  for (const item of STARTER_WALLPAPERS) {
    await pool.execute(
      'INSERT IGNORE INTO wallpapers (slug,title,game,category,description,keywords,tags_json,image_path,file_name,width,height,aspect_ratio,status,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
      [item.slug, item.title, item.game, item.category, item.description, item.keywords, JSON.stringify(item.tags), item.imagePath, item.fileName, item.width, item.height, '16:9', 'published']
    );
  }
  for (const item of STARTER_WALLPAPERS) {
    await pool.execute(
      "UPDATE wallpapers SET image_path=?,file_name=?,width=?,height=?,aspect_ratio='16:9' WHERE slug=? AND image_path LIKE '/manus-storage/async-images/%'",
      [item.imagePath, item.fileName, item.width, item.height, item.slug]
    );
  }
  const [seedVersion] = await pool.execute('SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1', ['vinu-wallpaper-category-v2']);
  if (!seedVersion.length) {
    for (const item of STARTER_WALLPAPERS) {
      const placeholders = item.previousImagePaths.map(() => '?').join(',');
      await pool.execute(
        `UPDATE wallpapers SET category=?,description=?,keywords=?,tags_json=? WHERE slug=? AND title=? AND category=? AND image_path IN (${placeholders})`,
        [item.category, item.description, item.keywords, JSON.stringify(item.tags), item.slug, item.title, item.legacyCategory, ...item.previousImagePaths]
      );
    }
    for (const statement of categoryMigration()) await pool.query(statement);
    await pool.execute('INSERT IGNORE INTO app_settings (setting_key,setting_value) VALUES (?,?)', ['vinu-wallpaper-category-v2', 'complete']);
  }
  console.info('Managed database ready; Vinu wallpaperZ user, wallpaper and analytics schema is active.');
}

function adminReady() {
  return Boolean(process.env.ADMIN_LOGIN_USERNAME && process.env.ADMIN_LOGIN_PASSWORD && signingSecret && adminPasswordHash && adminSessionVersion);
}

function clientAddress(req) {
  const realIp = String(req.headers['x-real-ip'] || '').split(',')[0].trim();
  const forwardedIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const candidate = realIp || forwardedIp || req.socket.remoteAddress || '';
  return net.isIP(candidate) ? candidate.toLowerCase() : 'unknown';
}

function rateLimitKey(label, value) {
  return crypto.createHmac('sha256', signingSecret).update(`${label}:${value}`).digest('hex');
}

function loginRateLimitBuckets(req, usernameMatches) {
  const buckets = [{ key: rateLimitKey('client', clientAddress(req)), maximum: LOGIN_MAX_ATTEMPTS_PER_IP }];
  if (usernameMatches) buckets.push({ key: rateLimitKey('account', process.env.ADMIN_LOGIN_USERNAME.trim().toLowerCase()), maximum: LOGIN_MAX_ATTEMPTS_PER_ACCOUNT });
  return buckets;
}

async function pruneLoginRateLimits(now) {
  if (now - lastRateLimitCleanupAt < 60_000) return;
  lastRateLimitCleanupAt = now;
  await pool.execute('DELETE FROM auth_rate_limits WHERE window_started_at <= ? ORDER BY window_started_at LIMIT 250', [now - LOGIN_WINDOW_MS * 2]);
}

async function rateLimitBuckets(buckets) {
  const now = Date.now();
  const expiresAt = now - LOGIN_WINDOW_MS;
  for (const bucket of buckets) {
    await pool.execute(
      `INSERT INTO auth_rate_limits (bucket,window_started_at,attempts) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE attempts=IF(window_started_at<=?,1,LEAST(attempts+1,1000)), window_started_at=IF(window_started_at<=?,?,window_started_at)`,
      [bucket.key, now, expiresAt, expiresAt, now]
    );
  }
  const keys = buckets.map((bucket) => bucket.key);
  const [rows] = await pool.execute(`SELECT bucket,attempts FROM auth_rate_limits WHERE bucket IN (${keys.map(() => '?').join(',')})`, keys);
  await pruneLoginRateLimits(now);
  return buckets.every((bucket) => { const row = rows.find((entry) => entry.bucket === bucket.key); return Boolean(row) && Number(row.attempts) <= bucket.maximum; });
}

async function clearLoginLimit(req, usernameMatches) {
  const keys = loginRateLimitBuckets(req, usernameMatches).map((bucket) => bucket.key);
  await pool.execute(`UPDATE auth_rate_limits SET attempts=0,window_started_at=? WHERE bucket IN (${keys.map(() => '?').join(',')})`, [Date.now(), ...keys]);
}

async function requireUser(req, res) {
  const session = userSession(req);
  if (!session) throw new HttpError(401, 'Sign in with Google to access your library.');
  const [rows] = await pool.execute('SELECT user_id,email,display_name,picture_url,status FROM site_users WHERE user_id=? LIMIT 1', [session.sub]);
  const user = rows[0];
  if (!user || user.status !== 'active') {
    clearCookie(res, USER_COOKIE);
    throw new HttpError(401, 'Your user session is no longer active.');
  }
  await pool.execute('UPDATE site_users SET last_activity_at=CURRENT_TIMESTAMP WHERE user_id=?', [user.user_id]);
  return user;
}

async function fetchWithTimeout(url, options, timeoutMs, errorMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref();
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (_) { throw new HttpError(502, errorMessage); }
  finally { clearTimeout(timer); }
}

async function uploadToManagedStorage(key, mimeType, bytes) {
  if (!process.env.MANUS_API_URL || !process.env.MANUS_API_KEY) throw new HttpError(503, 'Secure image storage is not available right now.');
  const endpoint = `${process.env.MANUS_API_URL.replace(/\/+$/, '')}/v1/storage/presign/put?path=${encodeURIComponent(key)}`;
  const signedResponse = await fetchWithTimeout(endpoint, { headers: { Authorization: `Bearer ${process.env.MANUS_API_KEY}` } }, 15000, 'Secure image storage did not respond in time.');
  let signed;
  try { signed = await signedResponse.json(); } catch (_) { throw new HttpError(502, 'Secure image storage could not prepare this upload.'); }
  if (!signedResponse.ok || signed.error || typeof signed.url !== 'string') throw new HttpError(502, 'Secure image storage could not prepare this upload.');
  try { if (new URL(signed.url).protocol !== 'https:') throw new Error('invalid storage protocol'); }
  catch (_) { throw new HttpError(502, 'Secure image storage returned an invalid upload address.'); }
  const putResponse = await fetchWithTimeout(signed.url, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes }, 90000, 'The image transfer timed out. Please retry the upload.');
  if (!putResponse.ok) throw new HttpError(502, 'The image could not be saved to secure storage. Please try again.');
}

function normalizeHeroConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.heroSlug !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(value.heroSlug)) throw new HttpError(502, 'The hero settings file is invalid.');
  return { heroSlug: value.heroSlug };
}

async function readHeroStorageFile() {
  if (!process.env.MANUS_API_URL || !process.env.MANUS_API_KEY) return null;
  const endpoint = `${process.env.MANUS_API_URL.replace(/\/+$/, '')}/v1/storage/presign/get?path=${encodeURIComponent('hero.json')}`;
  const signedResponse = await fetchWithTimeout(endpoint, { headers: { Authorization: `Bearer ${process.env.MANUS_API_KEY}` } }, 15000, 'Hero settings storage did not respond in time.');
  let signed;
  try { signed = await signedResponse.json(); } catch (_) { throw new HttpError(502, 'Hero settings could not be opened.'); }
  if (signedResponse.status === 404 || (typeof signed.error === 'string' && /not found|does not exist/i.test(signed.error))) return null;
  if (!signedResponse.ok || signed.error || typeof signed.url !== 'string') throw new HttpError(502, 'Hero settings could not be opened.');
  try { if (new URL(signed.url).protocol !== 'https:') throw new Error('invalid storage protocol'); }
  catch (_) { throw new HttpError(502, 'Hero settings storage returned an invalid address.'); }
  const fileResponse = await fetchWithTimeout(signed.url, {}, 15000, 'Hero settings could not be retrieved.');
  if (fileResponse.status === 403 || fileResponse.status === 404) return null;
  if (!fileResponse.ok) throw new HttpError(502, 'Hero settings could not be retrieved.');
  const contentLength = Number(fileResponse.headers.get('content-length') || 0);
  if (contentLength > 4096) throw new HttpError(502, 'Hero settings file is too large.');
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  if (!bytes.length || bytes.length > 4096) throw new HttpError(502, 'Hero settings file is empty or too large.');
  try { return normalizeHeroConfig(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(502, 'Hero settings file is invalid.'); }
}

async function readHeroConfig() {
  const stored = await readHeroStorageFile();
  if (stored) return stored;
  try { return normalizeHeroConfig(JSON.parse(await fs.promises.readFile(path.join(ROOT, 'hero.json'), 'utf8'))); }
  catch (error) { if (error instanceof HttpError) throw error; return { heroSlug: 'neon-frontier' }; }
}

async function saveHeroConfig(heroSlug) {
  const config = normalizeHeroConfig({ heroSlug });
  await uploadToManagedStorage('hero.json', 'application/json; charset=utf-8', Buffer.from(`${JSON.stringify(config, null, 2)}\n`));
  return config;
}

async function downloadFromManagedStorage(imagePath) {
  if (!process.env.MANUS_API_URL || !process.env.MANUS_API_KEY) throw new HttpError(503, 'Secure image storage is not available right now.');
  const key = publicImagePath(imagePath).slice('/manus-storage/'.length);
  if (!key || key.split('/').includes('..')) throw new HttpError(404, 'Wallpaper file not found.');
  const endpoint = `${process.env.MANUS_API_URL.replace(/\/+$/, '')}/v1/storage/presign/get?path=${encodeURIComponent(key)}`;
  const signedResponse = await fetchWithTimeout(endpoint, { headers: { Authorization: `Bearer ${process.env.MANUS_API_KEY}` } }, 15000, 'Secure image storage did not respond in time.');
  let signed;
  try { signed = await signedResponse.json(); } catch (_) { throw new HttpError(502, 'Secure image storage could not prepare this download.'); }
  if (!signedResponse.ok || signed.error || typeof signed.url !== 'string') throw new HttpError(502, 'Secure image storage could not prepare this download.');
  try { if (new URL(signed.url).protocol !== 'https:') throw new Error('invalid storage protocol'); }
  catch (_) { throw new HttpError(502, 'Secure image storage returned an invalid download address.'); }
  const imageResponse = await fetchWithTimeout(signed.url, {}, 90000, 'The wallpaper transfer timed out. Please retry the download.');
  if (!imageResponse.ok) throw new HttpError(502, 'The wallpaper could not be retrieved from secure storage.');
  const contentType = String(imageResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) throw new HttpError(502, 'The stored wallpaper has an unsupported image format.');
  const contentLength = Number(imageResponse.headers.get('content-length') || 0);
  if (contentLength > MAX_FILE_BYTES) throw new HttpError(413, 'The wallpaper is too large to download safely.');
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new HttpError(502, 'The wallpaper file could not be read completely.');
  return { bytes, contentType };
}

function safeBaseName(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'wallpaper'; }
function wallpaperDownloadFilename(slug) { return `VinuWallpaperZ-${safeBaseName(String(slug || 'wallpaper'))}-4K.jpg`; }

async function getWallpapers(admin = false) {
  const where = admin ? '' : "WHERE is_active=1 AND status='published'";
  const [rows] = await pool.query(`SELECT slug,title,game,category,description,keywords,tags_json,image_path,file_name,width,height,aspect_ratio,status,is_active,created_at FROM wallpapers ${where} ORDER BY created_at DESC LIMIT 500`);
  return rows.map(toWallpaper);
}

async function getUserOrNull(req) {
  const session = userSession(req);
  if (!session) return null;
  const [rows] = await pool.execute("SELECT user_id,status FROM site_users WHERE user_id=? AND status='active' LIMIT 1", [session.sub]);
  return rows[0] || null;
}

async function recordWallpaperEvent(eventType, slug, userId = null) {
  if (!['view', 'download'].includes(eventType)) return;
  await pool.execute('INSERT INTO site_events (event_type,wallpaper_slug,user_id) VALUES (?,?,?)', [eventType, slug, userId]);
  if (userId) await pool.execute('UPDATE site_users SET last_activity_at=CURRENT_TIMESTAMP WHERE user_id=?', [userId]);
}

function safeGooglePicture(value) {
  if (typeof value !== 'string' || value.length > 700) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')) ? url.href : null;
  } catch (_) { return null; }
}

async function googleLogin(req, res) {
  if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please sign in from the Vinu wallpaperZ homepage.');
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) throw new HttpError(503, 'Google sign-in is not configured yet.');
  const rateBuckets = [{ key: rateLimitKey('google-client', clientAddress(req)), maximum: GOOGLE_MAX_ATTEMPTS_PER_IP }];
  if (!await rateLimitBuckets(rateBuckets)) throw new HttpError(429, 'Too many sign-in attempts. Please wait and try again.');
  const body = await readJson(req, 14000);
  const expectedNonce = cleanField(body.nonce, 128, 'Google sign-in nonce');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(expectedNonce)) throw new HttpError(401, 'Please refresh the page and try Google sign-in again.');
  const nonceHash = crypto.createHash('sha256').update(expectedNonce).digest('hex');
  const [nonceRows] = await pool.execute('SELECT nonce_hash FROM google_login_nonces WHERE nonce_hash=? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP LIMIT 1', [nonceHash]);
  if (!nonceRows.length) throw new HttpError(401, 'Please refresh the page and try Google sign-in again.');
  const credential = cleanField(body.credential, 12000, 'Google credential');
  try {
    googleClient ||= new OAuth2Client();
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || payload.email_verified !== true || !safeEqual(payload.nonce || '', expectedNonce)) throw new Error('Invalid Google identity token.');
    const [nonceUpdate] = await pool.execute('UPDATE google_login_nonces SET consumed_at=CURRENT_TIMESTAMP WHERE nonce_hash=? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP', [nonceHash]);
    if (nonceUpdate.affectedRows !== 1) throw new HttpError(401, 'Please refresh the page and try Google sign-in again.');
    const email = cleanField(String(payload.email || '').toLowerCase(), 254, 'Google email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Google email is invalid.');
    const displayName = cleanField(String(payload.name || email.split('@')[0]), 160, 'Display name');
    const pictureUrl = safeGooglePicture(payload.picture);
    const userId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO site_users (user_id,google_sub,email,display_name,picture_url,status,first_login_at,last_login_at,last_activity_at)
       VALUES (?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE email=VALUES(email),display_name=VALUES(display_name),picture_url=VALUES(picture_url),last_login_at=CURRENT_TIMESTAMP,last_activity_at=CURRENT_TIMESTAMP`,
      [userId, payload.sub, email, displayName, pictureUrl]
    );
    const [rows] = await pool.execute('SELECT user_id,email,display_name,picture_url,status FROM site_users WHERE google_sub=? LIMIT 1', [payload.sub]);
    const user = rows[0];
    if (!user || user.status !== 'active') throw new HttpError(403, 'This account has been suspended. Contact the site owner if you need help.');
    const token = signSession({ sub: user.user_id, role: 'user', exp: Date.now() + USER_COOKIE_MAX_AGE * 1000 });
    setCookie(res, USER_COOKIE, token, USER_COOKIE_MAX_AGE);
    sendJson(res, 200, { authenticated: true, user: { email: user.email, displayName: user.display_name, pictureUrl: user.picture_url || '' } });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.warn('Google sign-in verification failed.');
    throw new HttpError(401, 'Google could not verify this sign-in. Try again.');
  }
}

async function handlePublicApi(req, res, url) {
  const pathname = url.pathname;
  const heroWallpaperMatch = pathname.match(/^\/api\/hero\/([a-z0-9-]{1,64})$/i);
  if (heroWallpaperMatch && req.method === 'GET') {
    const slug = heroWallpaperMatch[1].toLowerCase();
    const hero = await readHeroConfig();
    if (hero.heroSlug.toLowerCase() !== slug) throw new HttpError(404, 'Wallpaper not found.');
    const [rows] = await pool.execute("SELECT slug,title,game,category,description,keywords,tags_json,image_path,file_name,width,height,aspect_ratio,status,is_active,created_at FROM wallpapers WHERE slug=? AND ((status='published' AND is_active=1) OR (status='draft' AND is_active=0)) LIMIT 1", [slug]);
    if (!rows.length) throw new HttpError(404, 'Wallpaper not found.');
    sendJson(res, 200, { item: toWallpaper(rows[0]) }); return;
  }
  if (pathname === '/api/wallpapers' && req.method === 'GET') {
    sendJson(res, 200, { items: await getWallpapers(false) }); return;
  }
  if (pathname === '/api/auth/google/config' && req.method === 'GET') {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) { sendJson(res, 200, { configured: false, clientId: '' }); return; }
    const nonceLimit = [{ key: rateLimitKey('google-nonce', clientAddress(req)), maximum: 100 }];
    if (!await rateLimitBuckets(nonceLimit)) throw new HttpError(429, 'Too many sign-in requests. Please wait and try again.');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const nonceHash = crypto.createHash('sha256').update(nonce).digest('hex');
    await pool.execute('INSERT INTO google_login_nonces (nonce_hash,expires_at) VALUES (?,DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 5 MINUTE))', [nonceHash]);
    if (Math.random() < 0.1) await pool.query('DELETE FROM google_login_nonces WHERE expires_at<=CURRENT_TIMESTAMP LIMIT 200');
    sendJson(res, 200, { configured: true, clientId, nonce }); return;
  }
  if (pathname === '/api/auth/google' && req.method === 'POST') { await googleLogin(req, res); return; }
  if (pathname === '/api/user/me' && req.method === 'GET') {
    const session = userSession(req);
    if (!session) { sendJson(res, 200, { authenticated: false }); return; }
    const [rows] = await pool.execute("SELECT email,display_name,picture_url,status FROM site_users WHERE user_id=? AND status='active' LIMIT 1", [session.sub]);
    if (!rows.length) { clearCookie(res, USER_COOKIE); sendJson(res, 200, { authenticated: false }); return; }
    await pool.execute('UPDATE site_users SET last_activity_at=CURRENT_TIMESTAMP WHERE user_id=?', [session.sub]);
    const user = rows[0];
    sendJson(res, 200, { authenticated: true, user: { email: user.email, displayName: user.display_name, pictureUrl: user.picture_url || '' } }); return;
  }
  if (pathname === '/api/user/logout' && req.method === 'POST') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please sign out from the Vinu wallpaperZ homepage.');
    clearCookie(res, USER_COOKIE); sendJson(res, 200, { signedOut: true }); return;
  }
  if (pathname === '/api/user/favorites' && req.method === 'GET') {
    const user = await requireUser(req, res);
    const [rows] = await pool.execute("SELECT w.slug,w.title,w.game,w.category,w.description,w.keywords,w.tags_json,w.image_path,w.file_name,w.width,w.height,w.aspect_ratio,w.status,w.is_active,w.created_at FROM wallpaper_favorites f JOIN wallpapers w ON w.slug=f.wallpaper_slug WHERE f.user_id=? AND w.is_active=1 AND w.status='published' ORDER BY f.created_at DESC LIMIT 200", [user.user_id]);
    sendJson(res, 200, { items: rows.map(toWallpaper) }); return;
  }
  if (pathname === '/api/user/history' && req.method === 'GET') {
    const user = await requireUser(req, res);
    const [rows] = await pool.execute("SELECT e.created_at AS downloaded_at,w.slug,w.title,w.game,w.category,w.description,w.keywords,w.tags_json,w.image_path,w.file_name,w.width,w.height,w.aspect_ratio,w.status,w.is_active,w.created_at FROM site_events e JOIN wallpapers w ON w.slug=e.wallpaper_slug WHERE e.user_id=? AND e.event_type='download' ORDER BY e.created_at DESC LIMIT 100", [user.user_id]);
    sendJson(res, 200, { items: rows.map((row) => ({ ...toWallpaper(row), downloadedAt: row.downloaded_at ? new Date(row.downloaded_at).toISOString() : null })) }); return;
  }
  const favoriteMatch = pathname.match(/^\/api\/user\/favorites\/([a-z0-9-]{1,64})$/i);
  if (favoriteMatch && ['PUT', 'DELETE'].includes(req.method)) {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please update favorites from the Vinu wallpaperZ homepage.');
    const user = await requireUser(req, res);
    const slug = favoriteMatch[1];
    if (req.method === 'PUT') {
      const [wallpapers] = await pool.execute("SELECT slug FROM wallpapers WHERE slug=? AND is_active=1 AND status='published' LIMIT 1", [slug]);
      if (!wallpapers.length) throw new HttpError(404, 'Wallpaper not found.');
      await pool.execute('INSERT IGNORE INTO wallpaper_favorites (user_id,wallpaper_slug) VALUES (?,?)', [user.user_id, slug]);
      sendJson(res, 200, { favorite: true }); return;
    }
    await pool.execute('DELETE FROM wallpaper_favorites WHERE user_id=? AND wallpaper_slug=?', [user.user_id, slug]);
    await pool.execute('UPDATE site_users SET last_activity_at=CURRENT_TIMESTAMP WHERE user_id=?', [user.user_id]);
    sendJson(res, 200, { favorite: false }); return;
  }
  if (pathname === '/api/analytics/view' && req.method === 'POST') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please record a view from the Vinu wallpaperZ archive.');
    const body = await readJson(req, 2000);
    const slug = cleanField(body.wallpaperId, 64, 'Wallpaper');
    const [rows] = await pool.execute("SELECT slug FROM wallpapers WHERE slug=? AND is_active=1 AND status='published' LIMIT 1", [slug]);
    if (!rows.length) throw new HttpError(404, 'Wallpaper not found.');
    const user = await getUserOrNull(req);
    await recordWallpaperEvent('view', slug, user ? user.user_id : null);
    sendJson(res, 202, { recorded: true }); return;
  }
  const downloadMatch = pathname.match(/^\/api\/wallpapers\/([a-z0-9-]{1,64})\/download$/i);
  if (downloadMatch && req.method === 'GET') {
    await handleWallpaperDownload(req, res, downloadMatch[1]); return;
  }
  sendJson(res, 404, { error: 'Not found.' });
}

async function handleWallpaperDownload(req, res, slug) {
  const [rows] = await pool.execute("SELECT slug,image_path,status FROM wallpapers WHERE slug=? AND ((status='published' AND is_active=1) OR (status='draft' AND is_active=0 AND ?=1)) LIMIT 1", [slug, isAdmin(req) ? 1 : 0]);
  if (!rows.length) throw new HttpError(404, 'Wallpaper not found.');
  if (rows[0].status === 'published') {
    const user = await getUserOrNull(req);
    await recordWallpaperEvent('download', rows[0].slug, user ? user.user_id : null);
  }
  const image = await downloadFromManagedStorage(rows[0].image_path);
  res.writeHead(200, {
    'Content-Disposition': `attachment; filename="${wallpaperDownloadFilename(rows[0].slug)}"`,
    'Content-Type': 'image/jpeg',
    'Content-Length': image.bytes.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(image.bytes);
}

async function adminDashboard() {
  const [[wallpapers]] = await pool.query("SELECT COUNT(*) AS total FROM wallpapers WHERE is_active=1 AND status='published'");
  const [[views]] = await pool.query("SELECT COUNT(*) AS total FROM site_events WHERE event_type='view'");
  const [[downloads]] = await pool.query("SELECT COUNT(*) AS total FROM site_events WHERE event_type='download'");
  const [[daily]] = await pool.query("SELECT COUNT(*) AS total FROM site_users WHERE status='active' AND last_activity_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)");
  const [[weekly]] = await pool.query("SELECT COUNT(*) AS total FROM site_users WHERE status='active' AND last_activity_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)");
  const [rows] = await pool.query("SELECT DATE_FORMAT(created_at,'%Y-%m-%d') AS day,SUM(event_type='view') AS views,SUM(event_type='download') AS downloads FROM site_events WHERE created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 DAY) GROUP BY DATE_FORMAT(created_at,'%Y-%m-%d') ORDER BY day ASC");
  const byDay = new Map(rows.map((row) => [row.day, { views: Number(row.views) || 0, downloads: Number(row.downloads) || 0 }]));
  const days = [];
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() - offset);
    const day = date.toISOString().slice(0, 10);
    days.push({ day, ...(byDay.get(day) || { views: 0, downloads: 0 }) });
  }
  return { stats: { totalWallpapers: Number(wallpapers.total), totalViews: Number(views.total), totalDownloads: Number(downloads.total), dailyActiveUsers: Number(daily.total), weeklyUsers: Number(weekly.total) }, days };
}

async function handleAdminApi(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/api/admin/me' && req.method === 'GET') { sendJson(res, 200, { authenticated: isAdmin(req) }); return; }
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please sign in from the Vinu wallpaperZ admin page.');
    const body = await readJson(req);
    const username = cleanField(body.username, 100, 'Username');
    const password = cleanField(body.password, 256, 'Password');
    if (!adminReady()) throw new HttpError(503, 'Admin sign-in is not configured yet.');
    const usernameMatches = safeEqual(username.toLowerCase(), process.env.ADMIN_LOGIN_USERNAME.trim().toLowerCase());
    if (!await rateLimitBuckets(loginRateLimitBuckets(req, usernameMatches))) throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    const candidateHash = derivePassword(password);
    const passwordMatches = crypto.timingSafeEqual(candidateHash, adminPasswordHash);
    if (!usernameMatches || !passwordMatches) throw new HttpError(401, 'The username or password is incorrect.');
    await clearLoginLimit(req, usernameMatches);
    setCookie(res, ADMIN_COOKIE, signSession({ sub: 'admin', role: 'admin', credentialVersion: adminSessionVersion, exp: Date.now() + ADMIN_COOKIE_MAX_AGE * 1000 }), ADMIN_COOKIE_MAX_AGE);
    sendJson(res, 200, { authenticated: true }); return;
  }
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please sign out from the Vinu wallpaperZ admin page.');
    clearCookie(res, ADMIN_COOKIE); sendJson(res, 200, { signedOut: true }); return;
  }
  if (!pathname.startsWith('/api/admin/')) { sendJson(res, 404, { error: 'Not found.' }); return; }
  if (!isAdmin(req)) throw new HttpError(401, 'Your admin session has expired. Sign in again.');
  if (pathname === '/api/admin/dashboard' && req.method === 'GET') { sendJson(res, 200, await adminDashboard()); return; }
  if (pathname === '/api/admin/wallpapers' && req.method === 'GET') {
    const [items, hero] = await Promise.all([getWallpapers(true), readHeroConfig().catch(() => ({ heroSlug: null }))]);
    sendJson(res, 200, { items, heroSlug: hero.heroSlug || null }); return;
  }
  if (pathname === '/api/admin/wallpapers' && req.method === 'POST') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please upload from the Vinu wallpaperZ admin page.');
    const { fields, file } = await parseWallpaperUpload(req);
    const title = cleanField(fields.title, 160, 'Title');
    const category = normalizeCategory(fields.category);
    const tags = normalizeTags(fields.tags);
    const game = cleanField(fields.game || '', 160, 'Game or series', false) || category;
    const description = cleanField(fields.description || '', 500, 'Description', false);
    if (file.buffer.length > MAX_FILE_BYTES) throw new HttpError(413, 'Image files must be 12 MB or smaller.');
    const dimensions = getImageMetadata(file.mimeType, file.buffer);
    if (fields.width && Number(fields.width) !== dimensions.width) throw new HttpError(400, 'Image dimensions changed. Please select the file again.');
    if (fields.height && Number(fields.height) !== dimensions.height) throw new HttpError(400, 'Image dimensions changed. Please select the file again.');
    const id = crypto.randomUUID();
    const objectKey = `wallpapers/${id}.${dimensions.extension}`;
    const fileName = `${safeBaseName(title)}.${dimensions.extension}`;
    const keywords = `${title} ${game} ${category} ${tags.join(' ')} ${description}`.slice(0, 1200);
    const aspectRatio = `${dimensions.width}:${dimensions.height}`;
    await pool.execute(
      'INSERT INTO wallpapers (slug,title,game,category,description,keywords,tags_json,image_path,file_name,width,height,aspect_ratio,status,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)',
      [id, title, game, category, description, keywords, JSON.stringify(tags), objectKey, fileName, dimensions.width, dimensions.height, aspectRatio, 'pending']
    );
    await uploadToManagedStorage(objectKey, file.mimeType, file.buffer);
    await pool.execute("UPDATE wallpapers SET status='draft',is_active=0 WHERE slug=? AND status='pending'", [id]);
    const [rows] = await pool.execute('SELECT slug,title,game,category,description,keywords,tags_json,image_path,file_name,width,height,aspect_ratio,status,is_active,created_at FROM wallpapers WHERE slug=? LIMIT 1', [id]);
    sendJson(res, 201, { item: toWallpaper(rows[0]) }); return;
  }
  if (pathname === '/api/admin/hero' && req.method === 'PUT') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please update the homepage hero from the admin control room.');
    const body = await readJson(req, 2000);
    const slug = cleanField(body.heroSlug, 64, 'Wallpaper');
    if (!/^[a-z0-9-]{1,64}$/i.test(slug)) throw new HttpError(400, 'Wallpaper slug is invalid.');
    const [rows] = await pool.execute("SELECT slug FROM wallpapers WHERE slug=? AND ((status='published' AND is_active=1) OR (status='draft' AND is_active=0)) LIMIT 1", [slug]);
    if (!rows.length) throw new HttpError(404, 'Choose a draft or live wallpaper for the hero.');
    const hero = await saveHeroConfig(rows[0].slug);
    sendJson(res, 200, { updated: true, heroSlug: hero.heroSlug }); return;
  }
  const wallpaperStatusMatch = pathname.match(/^\/api\/admin\/wallpapers\/([a-z0-9-]{1,64})\/status$/i);
  if (wallpaperStatusMatch && req.method === 'PUT') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please update the wallpaper from the admin control room.');
    const body = await readJson(req, 3000);
    const nextStatus = body.status;
    if (!['draft', 'published', 'deleted'].includes(nextStatus)) throw new HttpError(400, 'Choose a supported wallpaper status.');
    const [rows] = await pool.execute('SELECT status FROM wallpapers WHERE slug=? LIMIT 1', [wallpaperStatusMatch[1]]);
    if (!rows.length) throw new HttpError(404, 'Wallpaper not found.');
    if (rows[0].status === 'pending') throw new HttpError(409, 'This upload is still pending and cannot be published yet.');
    await pool.execute('UPDATE wallpapers SET status=?,is_active=? WHERE slug=?', [nextStatus, nextStatus === 'published' ? 1 : 0, wallpaperStatusMatch[1]]);
    sendJson(res, 200, { updated: true, status: nextStatus }); return;
  }
  const wallpaperEditMatch = pathname.match(/^\/api\/admin\/wallpapers\/([a-z0-9-]{1,64})$/i);
  if (wallpaperEditMatch && req.method === 'PUT') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please edit the wallpaper from the admin control room.');
    const body = await readJson(req, 12000);
    const title = cleanField(body.title, 160, 'Title');
    const category = normalizeCategory(body.category);
    const tags = normalizeTags(body.tags);
    const description = cleanField(body.description || '', 500, 'Description', false);
    const [rows] = await pool.execute('SELECT game FROM wallpapers WHERE slug=? LIMIT 1', [wallpaperEditMatch[1]]);
    if (!rows.length) throw new HttpError(404, 'Wallpaper not found.');
    const keywords = `${title} ${rows[0].game} ${category} ${tags.join(' ')} ${description}`.slice(0, 1200);
    const [result] = await pool.execute('UPDATE wallpapers SET title=?,category=?,description=?,keywords=?,tags_json=? WHERE slug=?', [title, category, description, keywords, JSON.stringify(tags), wallpaperEditMatch[1]]);
    if (!result.affectedRows) throw new HttpError(404, 'Wallpaper not found.');
    sendJson(res, 200, { updated: true }); return;
  }
  const usersStatusMatch = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/status$/i);
  if (usersStatusMatch && req.method === 'PUT') {
    if (!mutationIsSameOrigin(req)) throw new HttpError(403, 'Please manage users from the admin control room.');
    if (!UUID_RE.test(usersStatusMatch[1])) throw new HttpError(400, 'User ID is invalid.');
    const body = await readJson(req, 2000);
    if (!['active', 'suspended'].includes(body.status)) throw new HttpError(400, 'Choose active or suspended status.');
    const [result] = await pool.execute('UPDATE site_users SET status=? WHERE user_id=?', [body.status, usersStatusMatch[1]]);
    if (!result.affectedRows) throw new HttpError(404, 'User not found.');
    sendJson(res, 200, { updated: true, status: body.status }); return;
  }
  if (pathname === '/api/admin/users' && req.method === 'GET') {
    const [rows] = await pool.query('SELECT user_id,email,display_name,picture_url,status,first_login_at,last_login_at,last_activity_at FROM site_users ORDER BY last_activity_at DESC LIMIT 250');
    const items = rows.map((row) => ({ id: row.user_id, email: row.email, displayName: row.display_name, pictureUrl: safeGooglePicture(row.picture_url) || '', status: row.status, firstLoginAt: row.first_login_at ? new Date(row.first_login_at).toISOString() : null, lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null, lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null }));
    sendJson(res, 200, { items }); return;
  }
  sendJson(res, 404, { error: 'Not found.' });
}

const CONTENT_TYPES = new Map([
  ['/src/app.js', 'text/javascript; charset=utf-8'],
  ['/src/api.js', 'text/javascript; charset=utf-8'],
  ['/src/metrics-chart.js', 'text/javascript; charset=utf-8'],
  ['/src/admin.js', 'text/javascript; charset=utf-8'],
  ['/src/google-auth.js', 'text/javascript; charset=utf-8'],
  ['/src/styles.css', 'text/css; charset=utf-8'],
  ['/manus-routes.json', 'application/json; charset=utf-8'],
  ['/logo.svg', 'image/svg+xml']
]);

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https://*.googleusercontent.com https://d36hbw14aib5lz.cloudfront.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' https://accounts.google.com/gsi/client; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; form-action 'self'; base-uri 'self'; object-src 'none'");
}

async function requestHandler(req, res) {
  setSecurityHeaders(res);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/_app/health' && req.method === 'GET') { sendJson(res, 200, { ok: true }); return; }
    if (url.pathname === '/hero.json' && req.method === 'GET') { sendJson(res, 200, await readHeroConfig()); return; }
    const downloadMatch = url.pathname.match(/^\/download\/([a-z0-9-]{1,64})$/i);
    if (downloadMatch && req.method === 'GET') { await handleWallpaperDownload(req, res, downloadMatch[1]); return; }
    const previewMatch = url.pathname.match(/^\/preview\/([a-z0-9-]{1,64})\/?$/i);
    if (previewMatch && req.method === 'GET') {
      if (!isAdmin(req)) throw new HttpError(401, 'Sign in at /admin/login to preview wallpapers.');
      const [rows] = await pool.execute("SELECT slug FROM wallpapers WHERE slug=? AND status IN ('draft','published') LIMIT 1", [previewMatch[1]]);
      if (!rows.length) throw new HttpError(404, 'Wallpaper is not available for preview.');
      const content = await fs.promises.readFile(path.join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
      res.end(content); return;
    }
    if (url.pathname.startsWith('/api/admin/')) { await handleAdminApi(req, res, url); return; }
    if (url.pathname.startsWith('/api/')) { await handlePublicApi(req, res, url); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { sendText(res, 405, 'Method not allowed.', { Allow: 'GET, HEAD' }); return; }
    if (url.pathname === '/admin' || url.pathname === '/admin/') { sendText(res, 404, 'Not found.'); return; }
    const adminLoginPage = url.pathname === '/admin/login' || url.pathname === '/admin/login/';
    const filePath = url.pathname === '/' || adminLoginPage ? path.join(ROOT, 'index.html') : (CONTENT_TYPES.has(url.pathname) ? path.join(ROOT, url.pathname.slice(1)) : null);
    if (!filePath) { sendText(res, 404, 'Not found.'); return; }
    const content = await fs.promises.readFile(filePath);
    const headers = { 'Content-Type': CONTENT_TYPES.get(url.pathname) || 'text/html; charset=utf-8', 'Cache-Control': url.pathname === '/' || adminLoginPage ? 'no-store' : 'public, max-age=60' };
    if (adminLoginPage) headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end(); else res.end(content);
  } catch (error) {
    if (error instanceof HttpError) { sendJson(res, error.status, { error: error.message }); return; }
    console.error('Request failed:', error && error.message ? error.message : 'unknown error');
    if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong. Please try again.' }); else res.destroy();
  }
}

async function main() {
  await initializeDatabase();
  const server = http.createServer(requestHandler);
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.listen(PORT, '0.0.0.0', () => console.info(`Vinu wallpaperZ server listening on port ${PORT}.`));
  const shutdown = async () => { server.close(async () => { if (pool) await pool.end(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  main().catch((error) => { console.error('Vinu wallpaperZ could not start:', error && error.message ? error.message : 'unknown startup error'); process.exit(1); });
}

module.exports = { getImageMetadata, publicImagePath };
