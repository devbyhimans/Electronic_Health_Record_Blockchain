# Connect Friends And Network

This phase restores the physical and VPN connectivity first. Do this before Swarm or Fabric.

## Step 1: Put All PCs On A Reachable Network

Use either:

- the same hotspot
- the same Wi-Fi
- any network where Tailscale can reconnect properly

## Step 2: Restart Tailscale On All Machines

Run on PC1, PC2, and PC3:

```bash
sudo tailscale up
tailscale ip -4
```

Record the IPv4 for each machine in `02-machine-inventory.md`.

## Step 3: Verify End-To-End Reachability

From PC1:

```bash
ping -c 3 <PC2_TAILSCALE_IP>
ping -c 3 <PC3_TAILSCALE_IP>
ssh <PC2_USER>@<PC2_TAILSCALE_IP>
ssh <PC3_USER>@<PC3_TAILSCALE_IP>
```

If SSH fails on a worker:

```bash
sudo apt install -y openssh-server
sudo systemctl start ssh
sudo systemctl enable ssh
```

## Exit Criteria

- PC1 can ping PC2 and PC3
- PC1 can SSH into PC2 and PC3
- current Tailscale IPs are written down
