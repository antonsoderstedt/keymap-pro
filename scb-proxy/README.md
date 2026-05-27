# SCB mTLS Proxy

Minimal Node proxy for SCB mTLS calls. Use this when Supabase Edge runtime TLS handshake fails.

## 1) Deploy to a Node host

Any Node host works (Render, Railway, Fly.io, etc.).

Runtime command:

```bash
npm install && npm start
```

### Render one-click via blueprint

This folder includes [render.yaml](render.yaml). In Render:

1. Create `Blueprint` service from your repo.
2. Keep root as repository root (the blueprint sets `rootDir: scb-proxy`).
3. Fill secret env vars in Render dashboard after creation.

## 2) Required environment variables

- `PROXY_TOKEN`: shared bearer token used by Supabase function
- `SCB_CERT_PEM`: full certificate chain PEM (contents of `scb_fullchain.pem`)
- `SCB_KEY_PEM`: private key PEM (contents of `scb-client-key.pem`)
- `SCB_URL` (optional): defaults to `https://privateapi.scb.se/nv0101/v1/sokpavar/api/je/hamtaforetag`
- `SCB_AUTH_HEADER` (optional): if SCB requires extra auth header

## 3) Verify proxy

```bash
curl -i https://YOUR_PROXY_HOST/health

curl -i https://YOUR_PROXY_HOST/scb \
  -H "Authorization: Bearer YOUR_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_number":"2021000837"}'
```

## 4) Wire into Supabase function secrets

Set in Lovable/Supabase:

- `SCB_PROXY_URL=https://YOUR_PROXY_HOST/scb`
- `SCB_PROXY_AUTH_HEADER=Bearer YOUR_PROXY_TOKEN`

Then deploy `scb-company-profile` again.
