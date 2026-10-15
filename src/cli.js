'use strict';

const { parseArgs, UsageError } = require('./args');
const { createRpcClient, resolveRpcUrl, RpcError } = require('./rpc');
const { fetchEpochInfo } = require('./epoch');
const { fetchSlotTime, buildEstimate } = require('./estimate');
const { fetchEpochSchedule, epochBounds, describeEpoch } = require('./schedule');
const { abortableSleep, DEFAULT_INTERVAL_SECS, CLEAR_SCREEN } = require('./watch');
const { formatHuman, formatJson, formatLookupHuman, formatLookupJson } = require('./format');
const { version } = require('../package.json');

const HELP = `sol-epoch v${version}

See where Solana is in its current epoch: epoch number, progress and time left.
Read-only: never signs anything.

Usage:
  sol-epoch [options]

Options:
  --epoch <n>          Look up another epoch: its slot range, how many slots ago it
                       ended, or when it starts if it is still ahead
  --watch              Keep refreshing the current epoch (Ctrl+C to stop)
  --interval <secs>    Seconds between refreshes with --watch (default ${DEFAULT_INTERVAL_SECS})
  --rpc <url>          RPC endpoint (or set SOL_EPOCH_RPC)
  --json               Print machine-readable JSON (one line per refresh with --watch)
  -h, --help           Show this help
  -v, --version        Show the version

The time left is an estimate from the average slot time over roughly the last
30 minutes, so it drifts a little if the network speeds up or slows down.

Examples:
  sol-epoch
  sol-epoch --watch --interval 30
  sol-epoch --epoch 1060
  sol-epoch --rpc https://api.devnet.solana.com --json
`;

// The epoch is the answer; the time is a bonus, so a failure here only costs the estimate.
async function tryEstimate(client, slots, ctx, what) {
  try {
    return buildEstimate(slots, await fetchSlotTime(client), ctx.now());
  } catch (err) {
    if (!(err instanceof RpcError)) throw err;
    ctx.stderr.write(`Warning: could not estimate ${what} (${err.message})\n`);
    return null;
  }
}

// preloaded: an epoch reading we already have, so it is not fetched twice
async function readCurrent(client, ctx, preloaded = null) {
  const base = preloaded || (await fetchEpochInfo(client));
  const info = { ...base, host: client.host };
  info.estimate = await tryEstimate(client, info.slotsRemaining, ctx, 'the time left');
  return info;
}

async function readLookup(client, epoch, current, ctx) {
  const bounds = epochBounds(await fetchEpochSchedule(client), epoch);
  const result = { ...describeEpoch(bounds, current), host: client.host, estimate: null };
  if (result.status === 'upcoming') {
    result.estimate = await tryEstimate(client, result.slotsUntilStart, ctx, 'when it starts');
  }
  return result;
}

async function runWatch(opts, client, ctx, io) {
  const { stdout, stderr } = ctx;
  const signal = io.signal || new AbortController().signal;
  const pause = io.sleep || abortableSleep;
  const intervalMs = (opts.interval ?? DEFAULT_INTERVAL_SECS) * 1000;

  for (let frame = 0; !signal.aborted; frame++) {
    let info = null;
    try {
      info = await readCurrent(client, ctx);
    } catch (err) {
      if (!(err instanceof RpcError)) throw err;
      // A wrong endpoint should fail straight away; a hiccup later on should not stop the watch.
      if (frame === 0) {
        stderr.write(`Error: ${err.message}\n`);
        return 1;
      }
      stderr.write(`Warning: ${err.message}, trying again\n`);
    }

    if (info) {
      if (opts.json) {
        stdout.write(formatJson(info, { compact: true }));
      } else if (stdout.isTTY) {
        stdout.write(CLEAR_SCREEN + formatHuman(info));
        stdout.write(`\nRefreshing every ${intervalMs / 1000}s, Ctrl+C to stop\n`);
      } else {
        stdout.write((frame > 0 ? '\n' : '') + formatHuman(info));
      }
    }

    if (signal.aborted) break;
    await pause(intervalMs, signal);
  }
  return 0;
}

async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const env = io.env || process.env;
  const ctx = { stdout, stderr, now: io.now || Date.now };

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      stderr.write(`Error: ${err.message}\n\n${HELP}`);
      return 2;
    }
    throw err;
  }

  if (opts.help) {
    stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    stdout.write(`${version}\n`);
    return 0;
  }

  const client = createRpcClient({
    url: resolveRpcUrl(opts.rpc, env),
    fetch: io.fetch,
    sleep: io.sleep,
  });

  try {
    if (opts.watch) return await runWatch(opts, client, ctx, io);

    const current = await fetchEpochInfo(client);
    if (opts.epoch !== null && opts.epoch !== current.epoch) {
      const result = await readLookup(client, opts.epoch, current, ctx);
      stdout.write(opts.json ? formatLookupJson(result) : formatLookupHuman(result));
      return 0;
    }

    const info = await readCurrent(client, ctx, current);
    stdout.write(opts.json ? formatJson(info) : formatHuman(info));
    return 0;
  } catch (err) {
    if (!(err instanceof RpcError)) throw err;
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }
}

module.exports = { run, HELP };