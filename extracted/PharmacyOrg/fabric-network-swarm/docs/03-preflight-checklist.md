# Preflight Checklist

Complete this before any Fabric deployment.

## On All Three PCs

- Ubuntu is reachable and stable
- Docker is installed and running
- `docker --version` works
- `docker compose version` works
- Node.js 18.x is installed if needed for local helper tasks
- `tailscale ip -4` returns an IP
- SSH server is installed and running on worker machines
- the project folder exists or can be copied

## On PC1

- this isolated project exists at `/home/ankit/fabric-network/fabric-network-swarm`
- Fabric binaries are available on PATH or installed locally
- you can SSH to PC2 and PC3
- you can SCP files to PC2 and PC3

## Do Not Proceed If

- any worker machine shows disk or filesystem issues
- Tailscale connectivity is unstable
- Docker daemon is not healthy
- the worker machines do not have the required project files for mounted volumes
