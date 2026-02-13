const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.BLOSSOM_PORT ? Number(process.env.BLOSSOM_PORT) : 3001;
const DATA_DIR = process.env.BLOSSOM_DATA_DIR || '/data';

fs.mkdirSync(DATA_DIR, { recursive: true });

const blobs = new Map();

function sendJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': payload.length,
  });
  res.end(payload);
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}

function handleHead(res) {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
}

function handlePut(req, res) {
  const hash = crypto.createHash('sha256');
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const chunks = [];
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    hash.update(chunk);
    chunks.push(chunk);
  });

  req.on('end', () => {
    const digest = hash.digest('hex');
    const body = Buffer.concat(chunks);
    const filePath = path.join(DATA_DIR, digest);

    fs.writeFileSync(filePath, body);
    blobs.set(digest, { path: filePath, mime: contentType, size });

    const url = `http://blossom-server:${PORT}/blob/${digest}`;
    sendJson(res, 200, { url, sha256: digest, size, mime: contentType });
  });
}

function handleGet(res, hash) {
  let entry = blobs.get(hash);
  if (!entry) {
    const filePath = path.join(DATA_DIR, hash);
    if (!fs.existsSync(filePath)) return notFound(res);
    const stats = fs.statSync(filePath);
    entry = { path: filePath, mime: 'application/octet-stream', size: stats.size };
  }

  res.writeHead(200, {
    'content-type': entry.mime || 'application/octet-stream',
    'content-length': entry.size,
  });
  fs.createReadStream(entry.path).pipe(res);
}

const server = http.createServer((req, res) => {
  const { method, url } = req;
  if (method === 'HEAD') return handleHead(res);
  if (method === 'PUT') return handlePut(req, res);
  if (method === 'GET' && url.startsWith('/blob/')) {
    const hash = url.replace('/blob/', '');
    return handleGet(res, hash);
  }
  return notFound(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Blossom mock server listening on ${PORT}`);
});
