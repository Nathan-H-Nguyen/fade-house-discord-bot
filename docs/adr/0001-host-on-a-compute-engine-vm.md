# Host on a Compute Engine VM, not Cloud Run

The bot holds an outbound Discord Gateway connection, runs its scheduled jobs in process, and keeps all its state in one SQLite file, so it needs one always-on process with a durable local disk.
We run its Docker image on a single free-tier `e2-micro` VM in `us-west1` with Container-Optimized OS, supervised by a systemd unit, with the database on a separate persistent disk mounted at `/data`.
This costs about $4 a month, almost all of it the VM's external IPv4 address.

## Considered Options

- **Cloud Run**: needs an always-allocated instance outside the free tier, and its persistent volumes (Cloud Storage FUSE, Filestore NFS) are either unsafe for SQLite or expensive.
  Making it work means Litestream replication or moving to Cloud SQL, and rolling deploys can briefly run two copies of the bot against one token and one database.
- **GKE**: a cluster to run one process.
- **A VM without Docker**: same cost, but the server's state, Node version and native modules become ours to maintain, and rollback is no longer "run the previous image".

## Consequences

- There is one VM in one zone: an outage means recreating it from Terraform and attaching the data disk or its latest snapshot.
- Deploys restart the container, so the bot is offline for a few seconds; jobs due in that window run when it comes back.
- The data disk is marked `prevent_destroy`, so it outlives the VM.
