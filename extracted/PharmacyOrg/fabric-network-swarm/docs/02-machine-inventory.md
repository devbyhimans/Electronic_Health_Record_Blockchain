# Machine Inventory

Fill this file before starting the deployment.

## Team Inventory

| Machine | Owner | SSH User | Hostname | Tailscale IPv4 | Swarm Role | Label |
| --- | --- | --- | --- | --- | --- | --- |
| PC1 | You | `ankit` | `ankit-Aspire-A715-75G` | `100.124.176.94` | Manager | `manager` |
| PC2 | Friend 1 | `rajput_mt` | `rajput-mt750XGK` | `100.83.121.98` | Worker | `worker2` |
| PC3 | Friend 2 | `ronit` | `ronit-VivoBook-ASUSLaptop-X512FL-X512FL` | `100.117.138.55` | Worker | `worker3` |

## Required Paths

Use this common Swarm bind-mount path on all machines:

- `/srv/fabric-network-swarm`

Practical copy locations by user home can still differ:

- PC1 source copy: `/home/ankit/fabric-network/fabric-network-swarm`
- PC2 source copy: `/home/rajput_mt/fabric-network/fabric-network-swarm`
- PC3 source copy: `/home/ronit/fabric-network/fabric-network-swarm`

But Docker Swarm bind mounts should all resolve through the same symlink or real path:

- `/srv/fabric-network-swarm`

## Notes

- record current Tailscale IPs every time you reconnect
- record the output of `docker node ls`
- record node IDs after all nodes become `Ready`
