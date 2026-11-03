# IPFS bridge service

Express service that exposes a small HTTP interface to the configured Kubo endpoint. In root Compose it is `h-ipfs-service` on port `4006`; Nginx routes `/api/hospital/ipfs/` to it. `GET /health` is unauthenticated. Other routes use the service's API-key middleware.

## Current routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Service/Kubo reachability check. |
| `POST` | `/pin` | Pin JSON payload. |
| `GET` | `/fetch/:cid` | Retrieve content by CID. |
| `POST` | `/ehr/init`, `/visit/init` | Create and pin the module's starter payloads. |
| `POST` | `/upload` | Multipart file upload. |
| `POST` | `/unpin` | Request removal of a pin. |
| `GET` | `/pins` | List pins for this service. |

The current source does not perform client-side zero-knowledge encryption or guarantee patient-key encryption. Treat IPFS access control/encryption as a separate requirement; do not infer confidentiality from a CID or API key. Use synthetic files for local demonstrations.

## Run

Root workspace:

```bash
./start.sh
```

For isolated development, install dependencies in this folder, configure `IPFS_API_URL`, `IPFS_GATEWAY_URL`, and `IPFS_SERVICE_KEY` in a local ignored `.env`, then run `npm start`. Never commit `.env` or patient files. See `src/routes.js` and `src/app.js` for source-of-truth behavior.
