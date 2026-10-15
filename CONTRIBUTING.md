# Contributing

Thanks for helping out. This is a small tool, so the rules are short.

## Setup

Node 18 or newer. There are no dependencies to install.

```bash
git clone https://github.com/switch-afk/sol-epoch.git
cd sol-epoch
npm test
```

## Ground rules

- Keep it zero-dependency
- Keep it read-only: no signing, no private keys, no wallet files
- Errors must never print the full RPC URL, only the hostname (URLs often hold API keys)
- Tests use the mock RPC in `tests/helpers/mock-rpc.js`. Do not hit a real RPC from tests
- Changes to the epoch maths (slot ranges, progress, the time estimate) need expected values checked against real `getEpochInfo`, `getEpochSchedule` and `getRecentPerformanceSamples` responses, not values produced by this tool itself

## Pull requests

1. Branch off `main`
2. Add or update tests for what you change
3. Run `npm test`
4. Open a PR. CI runs on Node 18, 20 and 22

## Reporting bugs

Open an issue with the command you ran, what you expected, and what happened. Remove any API keys from URLs first. If a time or an epoch range does not match what another tool gives you, include the epoch number and the RPC host.