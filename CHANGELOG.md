# Changelog

## [0.1.0] - 2026-10-15

First release.

### Added
- Show the current epoch: number, progress (rounded down to two decimals), slots done and left, current slot and block height
- Time left and end time in UTC, estimated from the average slot time over the last 30 performance samples (`getRecentPerformanceSamples`). If the samples cannot be read, the epoch still prints
- `--epoch <n>` looks up any other epoch from the epoch schedule: its slot range, how many slots ago it ended, or an estimated start time if it is still ahead. Warmup epochs on new clusters are handled
- `--watch` with `--interval <seconds>` (default 10, from 1 to 3600) keeps refreshing. It redraws in place on a terminal, prints one compact JSON line per refresh with `--json`, exits with `1` if the first refresh fails, warns and carries on if a later one fails, and stops quietly when a pipe closes
- `--json` output for the current epoch and for `--epoch` lookups
- RPC client with 429 retry and backoff, `--rpc` and `SOL_EPOCH_RPC`, hostname-only error messages
- Exit codes: `0` ok, `1` RPC failure, `2` usage error