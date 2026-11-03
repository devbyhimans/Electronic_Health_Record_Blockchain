# Local setup guide

The supported local workspace flow is the root [`./start.sh`](../start.sh). It checks Docker access and existing Fabric identity/CA material, starts the existing Fabric CA and network Compose projects, then starts the root application services. It does not create identities, initialize/reset the channel, deploy chaincode, or delete volumes.

## Prerequisites

- Linux or WSL2 with Docker Engine and the Docker Compose plugin.
- Docker access for the current user (`docker ps` must work). Do not make `/var/run/docker.sock` world-writable.
- Existing Fabric identity and CA data under the configured network checkout. If absent, use the team's first-time Fabric setup workflow; the root start script intentionally stops instead of generating new identity material.
- The local dashboard API `.env` is optional. Copy its `.env.example` only if using the dashboard; set local values there and do not commit or share secrets.

## Start and stop

```bash
./start.sh
./stop.sh
```

The home page is [http://localhost/](http://localhost/). Direct development URLs and service limitations are in the root [README](../README.md#entry-points).

## Dashboard only

Dashboard API and portal services use the `dashboard` Compose profile. The root start script starts them only when `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/.env` exists. Login requires the dashboard's own JWT verification configuration. Lab/provider JWTs are accepted only if their signing key is configured by the local operator in `DASHBOARD_JWT_SECRETS`; never read or copy another service's `.env`.

To inspect status:

```bash
docker compose --profile dashboard ps
docker compose logs --tail=100 h-dashboard-api h-dashboard-portal
```

The dashboard API binds host port `4010` to loopback. The portal is served at `/dashboard/` through Nginx. `/internal/events` is not routed through Nginx.

## Standalone organization worktrees

The lab and pharmacy folders also contain standalone or historical network scripts. They may use different network profiles and are not started as independent Fabric networks by root `./start.sh`. Do not run their deployment scripts alongside the root network unless the owning team has confirmed the intended topology and data impact.
