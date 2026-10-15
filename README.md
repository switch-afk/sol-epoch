# sol-epoch

[![CI](https://github.com/switch-afk/sol-epoch/actions/workflows/ci.yml/badge.svg)](https://github.com/switch-afk/sol-epoch/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sol-epoch)](https://www.npmjs.com/package/sol-epoch)
[![license](https://img.shields.io/npm/l/sol-epoch)](LICENSE)

See where Solana is in its current epoch from your terminal: the epoch number, how far through it is, and about how long until the next one starts.

An epoch is a fixed stretch of slots (432,000 on mainnet). Staking changes such as activating or deactivating stake take effect at epoch boundaries, so people keep an eye on when one ends. sol-epoch asks an RPC for the current slot and the recent slot times, does the maths, and prints the result. No SDK, no wallet, nothing to sign.

- Progress, slots left and an estimated end time in UTC
- `--epoch <n>` looks up any other epoch: its slot range, how long ago it ended, or when it starts
- `--watch` keeps refreshing, `--json` is there for scripts
- Read-only, zero dependencies, Node 18+

## Install

```bash
npx sol-epoch
```

Or install it globally:

```bash
npm install -g sol-epoch
```

## Usage

```bash
sol-epoch [options]
```

| Option | Description |
| --- | --- |
| `--epoch <n>` | Look up another epoch: its slot range, how many slots ago it ended, or when it starts if it is still ahead |
| `--watch` | Keep refreshing the current epoch. Press Ctrl+C to stop |
| `--interval <secs>` | Seconds between refreshes with `--watch`. Default 10, from 1 to 3600 |
| `--rpc <url>` | RPC endpoint (or set `SOL_EPOCH_RPC`) |
| `--json` | Print machine-readable JSON |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |

`--watch` cannot be combined with `--epoch`, and `--interval` only works together with `--watch`.

## Current epoch

```bash
sol-epoch
```

```
Epoch      1058
Progress   31.48% (136,028 of 432,000 slots)
Remaining  295,972 slots
Slot time  216 ms (avg over last 30m)
Time left  ~17h 44m
Ends       2026-10-16 03:29 UTC
Slot       457,192,028
Block      435,227,925
RPC        api.mainnet-beta.solana.com
```

`Time left` and `Ends` are an estimate, see [How the time left is worked out](#how-the-time-left-is-worked-out). `Block` is left out when the RPC node does not report a block height.

## Look up another epoch

`--epoch` works for any epoch, past or future. An epoch that has finished shows its slot range and how many slots ago it ended:

```bash
sol-epoch --epoch 1057
```

```
Epoch      1057 (finished)
Slots      432,000 (456,624,000 to 457,055,999)
Ended      136,029 slots ago
Current    epoch 1058 at slot 457,192,028
RPC        api.mainnet-beta.solana.com
```

An epoch that has not started yet shows when it is expected to:

```bash
sol-epoch --epoch 1060
```

```
Epoch      1060 (upcoming)
Slots      432,000 (457,920,000 to 458,351,999)
Starts in  ~1d 19h 37m (727,972 slots)
Starts at  2026-10-17 05:22 UTC
Current    epoch 1058 at slot 457,192,028
RPC        api.mainnet-beta.solana.com
```

Asking for the current epoch prints the normal output above.

## Watch

```bash
sol-epoch --watch --interval 30
```

On a terminal the screen is redrawn in place on every refresh. When the output is piped, the refreshes are printed one after the other, separated by a blank line. With `--json` every refresh is a single line of JSON.

If the first refresh fails, for example because of a wrong RPC URL, sol-epoch exits with `1`. If a later refresh fails, it prints a warning to stderr and tries again on the next round. It also stops quietly when whatever it is piped into closes, as in `sol-epoch --watch --json | head -n 5`.

## RPC endpoint

The endpoint is picked in this order: `--rpc`, then the `SOL_EPOCH_RPC` environment variable, then the public mainnet endpoint. Use `--rpc` to point at devnet or testnet, which have their own epochs. The public endpoint is rate limited, so use your own RPC for anything serious.

```bash
export SOL_EPOCH_RPC="https://your-rpc.example.com/?api-key=..."
```

```powershell
$env:SOL_EPOCH_RPC = "https://your-rpc.example.com/?api-key=..."
```

Errors only ever print the RPC hostname, so API keys in the URL are not leaked. Requests that get an HTTP 429 are retried with backoff.

## JSON output

`--json` prints the same information as JSON:

```bash
sol-epoch --json
```

```json
{
  "epoch": 1058,
  "slot": 457192097,
  "slotIndex": 136097,
  "slotsInEpoch": 432000,
  "slotsRemaining": 295903,
  "progress": 31.5,
  "slotTimeMs": 216,
  "secondsRemaining": 63833,
  "endsAt": "2026-10-16T03:29:07.651Z",
  "blockHeight": 435227994,
  "rpc": "api.mainnet-beta.solana.com"
}
```

`slotTimeMs`, `secondsRemaining` and `endsAt` are `null` when the slot times could not be read, and `blockHeight` is `null` when the node does not report it.

With `--epoch` the output is about the epoch you asked for:

```json
{
  "epoch": 1057,
  "status": "finished",
  "firstSlot": 456624000,
  "lastSlot": 457055999,
  "slotsInEpoch": 432000,
  "slotsSinceEnd": 136029,
  "slotsUntilStart": null,
  "secondsUntilStart": null,
  "startsAt": null,
  "currentEpoch": 1058,
  "currentSlot": 457192028,
  "rpc": "api.mainnet-beta.solana.com"
}
```

For an `upcoming` epoch `slotsSinceEnd` is `null` and `slotsUntilStart`, `secondsUntilStart` and `startsAt` are filled in (the last two are `null` when the slot times could not be read).

With `--watch --json` every refresh is one compact object on a single line:

```
{"epoch":1058,"slot":457192097,"slotIndex":136097,"slotsInEpoch":432000,"slotsRemaining":295903,"progress":31.5,"slotTimeMs":216,"secondsRemaining":63833,"endsAt":"2026-10-16T03:29:07.651Z","blockHeight":435227994,"rpc":"api.mainnet-beta.solana.com"}
```

## How the time left is worked out

sol-epoch asks the RPC for the 30 most recent performance samples (`getRecentPerformanceSamples`), each covering about a minute. The slot time is the total time divided by the total number of slots in them, so busy and quiet minutes count for what they covered. The time left is the number of slots left multiplied by that slot time, and `Ends` is that added to the current time.

If the samples cannot be read, you still get the epoch: `Time left` says `unknown`, a warning goes to stderr and the exit code stays `0`.

## Good to know

- The time left is an estimate. Slot time moves with network conditions, so it can drift while an epoch runs
- Progress is rounded down to two decimals, so it never shows 100.00% before the epoch is actually over
- A finished epoch shows how many slots ago it ended, not a date, because slot times have changed over the years and a date would be a guess
- The start time of an epoch far ahead is rough for the same reason, and gets rougher the further ahead it is
- Epoch numbers belong to the cluster your RPC points at. Use `--rpc` for devnet or testnet
- New clusters start with short epochs that double in length until they reach the normal size. `--epoch` handles that through the epoch schedule
- Each refresh makes two requests (epoch info and recent slot times). `--epoch` makes two or three. For `--watch` on the public endpoint, use a longer `--interval` or your own RPC

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. This includes the case where only the time estimate could not be read |
| `1` | The RPC call for the epoch failed (with `--watch`: the first refresh failed) |
| `2` | Usage error (bad or conflicting arguments) |

## Development

```bash
npm test
```

No dependencies to install. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT