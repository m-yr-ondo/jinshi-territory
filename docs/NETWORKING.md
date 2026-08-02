# Networking

The Colyseus server is authoritative for movement, territory, trail collisions, cuts, deaths, respawns and bots. Clients send only sequenced steering angles; they cannot submit positions or ownership.

The simulation runs at 30 Hz and sends player snapshots at 20 Hz. Remote players interpolate between snapshots, while the local client predicts its own forward movement and gently reconciles with server positions.

Territory is stored in a 128×128 circular ownership grid. The complete grid is sent on join, then only when its revision changes. It is encoded as base64 `Uint16` data; `0` means unclaimed and `65535` means outside the arena.

Closing a trail performs a flood-fill from the arena edge. Cells separated from the edge by the player's existing territory and trail are captured. This avoids fragile floating-point polygon operations and keeps server and clients consistent.
