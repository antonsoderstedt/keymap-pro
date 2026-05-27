import express from 'express';
import https from 'https';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 8080);
const PROXY_TOKEN = process.env.PROXY_TOKEN || '';

const SCB_URL = process.env.SCB_URL || 'https://privateapi.scb.se/nv0101/v1/sokpavar/api/je/hamtaforetag';
const SCB_CERT_PEM = process.env.SCB_CERT_PEM || '';
const SCB_KEY_PEM = process.env.SCB_KEY_PEM || '';
const SCB_AUTH_HEADER = process.env.SCB_AUTH_HEADER || '';

if (!SCB_CERT_PEM || !SCB_KEY_PEM) {
  // Fail fast when deployed without mTLS material.
  console.error('Missing SCB_CERT_PEM or SCB_KEY_PEM env vars');
}

function parseMaybeJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return { raw_text: body };
  }
}

function callScb(orgNumber) {
  const payload = JSON.stringify({
    ['Företagsstatus']: '1',
    Registreringsstatus: '1',
    AntalPoster: 1,
    StartPost: 1,
    Kategorier: [{ Kategori: 'OrgNr', Kod: [String(orgNumber)] }],
  });

  const agent = new https.Agent({
    cert: SCB_CERT_PEM,
    key: SCB_KEY_PEM,
  });

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json,text/plain,*/*',
    'Content-Length': Buffer.byteLength(payload),
  };

  if (SCB_AUTH_HEADER) {
    headers.Authorization = SCB_AUTH_HEADER;
  }

  return new Promise((resolve, reject) => {
    const req = https.request(SCB_URL, { method: 'POST', headers, agent }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const parsed = parseMaybeJson(body);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
          return;
        }
        reject(new Error(`SCB_PROXY_UPSTREAM_ERROR [${res.statusCode}]: ${body.slice(0, 400)}`));
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/scb', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    if (!PROXY_TOKEN || auth !== `Bearer ${PROXY_TOKEN}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const org = String(req.body?.org_number || '').replace(/[^0-9]/g, '');
    if (!org || (org.length !== 10 && org.length !== 12)) {
      res.status(400).json({ error: 'org_number required' });
      return;
    }

    const normalized = org.length === 12 ? org.slice(2) : org;
    const data = await callScb(normalized);
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`SCB mTLS proxy listening on :${PORT}`);
});
