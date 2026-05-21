# SanchoCMO — Server Operations & Hardening

This is the runtime/operational counterpart of [`DEPLOY.md`](./DEPLOY.md).
`DEPLOY.md` gets a fresh VPS provisioned and online. **This document keeps it
alive**: resource budgets, guardrails to apply on day 1, recurring system
crons, monitoring, and the recovery playbook for the failure modes that have
actually happened in prod.

Read this in full **once** when you set up a new VPS — most of the items
here are not optional, they're just not part of the initial bring-up.

---

## 1. Minimum resource budget

The numbers in `DEPLOY.md` (2 vCPU, 4 GB RAM, 20 GB disk) are the **floor
for an idle install**. They are **not** enough for a live instance running
the content-engine across multiple brands.

| Resource | Minimum (will hit limits) | Recommended (production) | Why |
|---|---|---|---|
| **vCPU** | 2 | **4+** | Cron sessions are CPU-bound during Claude calls. Concurrent agent turns + Next.js + Legacy MC + open-design + yalc push load avg > 10 with 2 vCPU. |
| **RAM** | 4 GB | **8 GB+** | OpenClaw gateway: ~700 MB RSS, peaks to 1.5 GB. Each concurrent cron LLM session: 200–500 MB transient. Next.js: 200–400 MB. Legacy MC: ~100 MB. Three other containers: ~500 MB combined. |
| **Disk (root)** | 20 GB | **80 GB+** | Docker images + build cache + `/var/log/journal` + `~/.openclaw` + `/mnt/data/snapshots`. Build cache alone grows ~5 GB/week if not pruned. |
| **Attached volume** | 10 GB at `/mnt/data` | 20 GB+ | For data snapshots. Sized for ~24 snapshots × 600 MB. |
| **Swap** | 0 GB ❌ | **4 GB swapfile** | See [§2.1](#21-swap). Without swap, any RAM spike kills the gateway via OOM. |

**Real-world data point** (2026-05-21): a Hetzner CX22 (2 vCPU / 3.7 GB / 75 GB
root + 10 GB volume) hit two OOM-kills of `openclaw gateway` in 2 hours under
normal content-engine cron load. Add swap **and** plan to upgrade to CX32
(4 vCPU / 8 GB) or larger.

---

## 2. Post-install hardening

Apply these **right after** the deploy in `DEPLOY.md` finishes. Each one
prevents a specific failure mode we've already seen in prod.

### 2.1 Swap

**Why**: the kernel OOM-kills processes when global memory pressure spikes
and there's no swap. The first victim is usually `openclaw gateway`
(largest RSS). With swap, the kernel can move cold pages to disk instead
of killing the process.

```bash
# 4 GB swapfile (sized for 4–8 GB RAM hosts; double the swap if RAM ≤ 4 GB)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Persist across reboots
grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Bias the kernel against using swap unless under real pressure.
# Default is 60 (swap eagerly). 10 keeps things in RAM and only spills
# under genuine memory pressure — better for a server workload.
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl -w vm.swappiness=10

# Verify
swapon --show
free -h
```

**Reversible**: `sudo swapoff /swapfile && sudo rm /swapfile`, remove the
fstab line and the `99-swappiness.conf` file.

### 2.2 Docker build cache pruning

**Why**: every `docker build` (deploys, local rebuilds) leaves intermediate
layers in `/var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/`.
Nothing expires them. After 8 weeks of staging deploys the staging VPS
accumulated **30 GB** of cold build cache. The disk hit 90% before anyone
noticed.

Add a weekly cron on the **host** (not in the container) that drops
build cache older than 7 days:

```bash
(sudo crontab -l 2>/dev/null; cat <<'EOF'

# Docker build cache cleanup — every Sunday 4am, removes cache >7 days old
0 4 * * 0 /usr/bin/docker builder prune -af --filter "until=168h" >> /var/log/docker-prune.log 2>&1
EOF
) | sudo crontab -
```

Verify:

```bash
sudo crontab -l | grep prune
```

One-off emergency cleanup (if disk is already full):

```bash
sudo docker builder prune -af               # build cache
sudo docker image prune -af                 # dangling + unused images
sudo journalctl --vacuum-size=500M          # systemd journal
```

These three commands recovered **32 GB** on staging in one shot. They're
safe to run any time — running containers don't touch any of it.

### 2.3 Docker log rotation

**Why**: by default, Docker writes container stdout/stderr to
`/var/lib/docker/containers/<id>/<id>-json.log` with **no rotation**. A
chatty container can fill the disk silently.

Add `/etc/docker/daemon.json` (create if missing):

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

sudo systemctl restart docker
```

Caps each container's logs at **30 MB** (3 × 10 MB rotated files).
Existing logs aren't truncated — only new writes are bounded. To shrink
an already-bloated log:

```bash
# Identify large container logs
sudo du -h /var/lib/docker/containers/*/*-json.log | sort -h | tail -5

# Truncate in-place (container keeps writing, file resets to 0)
sudo truncate -s 0 /var/lib/docker/containers/<id>/<id>-json.log
```

> **Warning**: changing the log driver requires recreating containers, not
> just restarting them, for it to take effect on existing containers.
> `docker compose down && docker compose up -d` after editing
> `daemon.json` is the safe path.

### 2.4 systemd journal size cap

**Why**: `/var/log/journal` is unbounded by default and on this VPS grew
to 1.6 GB before a manual vacuum.

```bash
# Cap the journal at 500 MB. systemd-journald rotates automatically once
# this is set.
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/size.conf >/dev/null <<'EOF'
[Journal]
SystemMaxUse=500M
SystemKeepFree=1G
EOF

sudo systemctl restart systemd-journald

# One-time vacuum to apply the cap to existing data
sudo journalctl --vacuum-size=500M
```

### 2.5 (Optional, post-upgrade) move heavy data to the attached volume

`DEPLOY.md` step 1 says "attach a 10 GB volume and mount it at `/mnt/data`",
but the container only binds `/mnt/data/snapshots` to the volume. The
**live** openclaw data (`/root/.openclaw`, ~4 GB and growing) sits on the
root disk.

This isn't urgent if root disk has > 30 GB free, but on a smaller VPS it's
better to put live data on a dedicated volume. Defer until you have a
planned 5-minute container downtime — see [§7](#7-decommissioning--data-migration).

---

## 3. System crons (host crontab)

These are **host** crons (not openclaw crons), run by `root` via the
system crontab. They have nothing to do with the content-engine crons
that live inside openclaw.

Install with:

```bash
sudo crontab -l
```

Expected entries:

| Schedule | Script | Purpose |
|---|---|---|
| `0 */3 * * *` | `~/.openclaw/workspace-cervantes/scripts/snapshot-data.sh` | Tarball of `~/.openclaw` to `/mnt/data/snapshots/`, last 24 kept |
| `15 * * * *` | `~/.openclaw/workspace-cervantes/scripts/snapshot-watchdog.sh` | Alert if no snapshot in > 6 h |
| `0 4 * * 0` | `docker builder prune -af --filter "until=168h"` | Weekly build cache GC (from §2.2) |

The first two are installed by `docker/setup-cervantes-cc.sh` (see
DEPLOY.md §9h). The third is the one added in §2.2 above.

Check the logs each lives in:

| Cron | Log |
|---|---|
| snapshot-data | `/var/log/snapshot-data.log` |
| snapshot-watchdog | `/var/log/snapshot-watchdog.log` |
| docker-prune | `/var/log/docker-prune.log` |

---

## 4. Monitoring

### 4.1 Quick health snapshot (one-liner)

Run this when you suspect trouble:

```bash
echo '=== containers ===' && docker ps --format 'table {{.Names}}\t{{.Status}}'
echo '=== ram ==='        && free -h
echo '=== swap ==='       && swapon --show
echo '=== disk ==='       && df -h /
echo '=== load ==='       && uptime
echo '=== oom history ===' && sudo dmesg -T 2>/dev/null | grep -i 'killed process' | tail -3
```

What "healthy" looks like:

- All containers `Up X (healthy)`.
- RAM `available` > 500 MB.
- Swap used < 1 GB (more is fine but indicates you're at the RAM ceiling).
- Disk `Use%` < 80 %.
- `load average` 1-min value < `2 × vCPU count`.
- No recent `Killed process` entries in dmesg.

### 4.2 What to watch over time

- `swapon --show` once a day. If swap usage stays > 1 GB consistently, the
  VPS needs a RAM upgrade — swap is a brake, not a destination.
- `df -h /` once a week. Should plateau around 50–60 % with the prune cron
  active.
- `/var/log/docker-prune.log` after each Sunday — confirm the cleanup ran
  and how much it recovered.

### 4.3 Container memory usage

Per-container live snapshot:

```bash
docker stats --no-stream
```

`MEM USAGE` near `LIMIT` (or near total host RAM if no limit set) is a
warning sign. The big consumers on a healthy install:

- `sanchocmo`: ~1–1.5 GB peak (gateway + Next.js MC + Legacy MC + cost-tracker)
- `open-design`: ~150–300 MB
- `yalc-gtm-os`: ~100–200 MB

---

## 5. Recovery playbook

Failure modes seen in prod and how to react.

### 5.1 `sanchocmo` container restarting

**Symptom**: `docker ps` shows `Up XX seconds (health: starting)` and
restarting in a loop, or `RestartCount` keeps climbing.

```bash
# 1. Is it OOM-killed at the host level?
docker inspect sanchocmo --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} RestartCount={{.RestartCount}}'
sudo dmesg -T 2>/dev/null | grep -i 'killed process' | tail -3

# 2. App-level failure?
docker logs sanchocmo --tail 100 | grep -iE 'error|fatal|panic|killed|gateway closed'
```

- `Killed process ... openclaw` in dmesg → host OOM. Confirm swap is on
  (`swapon --show`). If swap is full too, you need a RAM upgrade. If
  swap is on but openclaw consistently RSS > 1.5 GB, suspect a leak —
  scheduled restart as a workaround:
  ```bash
  (sudo crontab -l; echo '0 3 * * * docker restart sanchocmo') | sudo crontab -
  ```
- `gateway closed` with no OOM → app crash. Look upstream in the logs for
  the actual error (config parse, missing env var, port collision).

### 5.2 Disk fills up

**Symptom**: writes fail (`no space left on device`), Next.js builds 500,
container restart fails to write logs.

```bash
# 1. Where is the space going?
sudo du -sh /var/* 2>/dev/null | sort -h | tail -5
sudo du -sh /var/lib/* 2>/dev/null | sort -h | tail -5

# 2. Docker breakdown
sudo docker system df

# 3. Top consumers in openclaw data
sudo du -sh /root/.openclaw/* 2>/dev/null | sort -h | tail -10

# 4. Emergency cleanup (see §2.2 for full set)
sudo docker builder prune -af
sudo docker image prune -af
sudo journalctl --vacuum-size=500M
```

Common offenders ranked by size:

1. **Docker build cache** in `/var/lib/containerd/...overlayfs/`.
2. **`/var/log/journal`** if §2.4 wasn't applied.
3. **`/var/lib/docker/containers/*/*-json.log`** if §2.3 wasn't applied.
4. **`/root/.openclaw/backups`** — local backups, usually safe to truncate.
5. **`/root/.openclaw/node_modules`** if a stale rebuild left two copies.

### 5.3 High load average / unresponsive

**Symptom**: SSH slow, `uptime` shows load avg > 10, MC takes seconds to
respond.

```bash
# CPU-side view
top -bn1 | head -15
htop          # if installed

# Which process group?
ps aux --sort=-%cpu | head -10

# Are crons piling up?
docker exec sanchocmo openclaw cron list --json 2>/dev/null | jq '[.jobs[] | select(.state.lastRunStatus=="running")] | length'
```

Common cause: multiple content-engine crons firing in the same minute
(news-monitor + paa-monitor + thief-marketers all at `0 7 * * 1-5`).
**Mitigation**: stagger them via `openclaw cron edit <id> --stagger 5m` or
spread the schedule manually so they don't all wake at once. Use the
recurring tasks admin tab to see what's running concurrently.

### 5.4 Snapshot watchdog alert

**Symptom**: webhook fires "snapshot stale".

```bash
# Is the cron firing at all?
sudo grep -i error /var/log/snapshot-data.log | tail -10
sudo crontab -l | grep snapshot

# Is the destination writable?
ls -la /mnt/data/snapshots/ | tail -5
df -h /mnt/data
```

If `/mnt/data` is full, rotate manually (`ls -t | tail -n +25 | xargs rm`)
and lower retention in `snapshot-data.sh` if it keeps recurring.

---

## 6. Capacity planning signals

Indicators that you've outgrown the current VPS and should upgrade:

| Signal | Threshold | Action |
|---|---|---|
| Swap used consistently | > 1 GB | Upgrade RAM (CX22 → CX32, or equivalent) |
| Load average 5-min | > 2 × vCPU count, repeatedly | Upgrade CPU (more vCPUs) |
| Disk usage after prune | > 70 % | Upgrade disk or migrate `~/.openclaw` to attached volume (§2.5) |
| OOM kills | Any in 7 days, with swap on | Upgrade RAM **now** — swap is buffering a deficit, not a surplus |
| Cron concurrent running | > 5 at once, regularly | Stagger crons; also a signal for more CPU |

Pricing reference (Hetzner Cloud, EU, 2026-05):
- CX22 (2 vCPU / 4 GB / 40 GB): €4.51 /mo
- CX32 (4 vCPU / 8 GB / 80 GB): €7.85 /mo
- CX42 (8 vCPU / 16 GB / 160 GB): €15.59 /mo

CX32 is the realistic floor for one staging instance running 5+ brands.

---

## 7. Decommissioning / data migration

When you bump the VPS plan or move data to the attached volume:

```bash
# 1. Stop the app cleanly
cd ~/.openclaw
docker compose down

# 2. Confirm snapshots are fresh
ls -lt /mnt/data/snapshots/ | head -3

# 3. Move live data (only if migrating to attached volume)
sudo rsync -aHAX --delete /root/.openclaw/ /mnt/sanchocmo-data/.openclaw/
sudo mv /root/.openclaw /root/.openclaw.old
sudo ln -s /mnt/sanchocmo-data/.openclaw /root/.openclaw

# 4. Bring it back up
docker compose up -d

# 5. Verify, then delete the old copy after a day of stable operation
docker logs sanchocmo --tail 50
# … wait, then:
sudo rm -rf /root/.openclaw.old
```

If something looks off, restore by stopping the container, removing the
symlink, and renaming `.old` back. The snapshots in `/mnt/data/snapshots`
are also a fallback — see `DEPLOY.md` "Backups" for the restore procedure.

---

## 8. Cross-references

- [`DEPLOY.md`](./DEPLOY.md) — initial provisioning of a fresh VPS.
- [`infra/nginx/README.md`](../infra/nginx/README.md) — nginx vhost & TLS conventions.
- [`docker/setup-vps.sh`](../docker/setup-vps.sh) — script invoked by DEPLOY.md step 4.
- [`docker/setup-cervantes-cc.sh`](../docker/setup-cervantes-cc.sh) — installs Cervantes systemd + snapshot crons.

---

## 9. Changelog

- **2026-05-21**: doc created after a staging incident — OOM-kill of
  `openclaw gateway` (no swap on the host) + disk-full risk (30 GB of stale
  docker build cache, never pruned). Captured the fixes here so future
  VPS bring-ups don't repeat the same diagnosis.
