'use strict';

const { parseArgs, UsageError } = require('./args');
const { createRpcClient, resolveRpcUrl, RpcError } = require('./rpc');
const { fetchEpochInfo } = require('./epoch');
const { fetchSlotTime, buildEstimate } = require('./estimate');
const { formatHuman, formatJson } = require('./format');
const { version } = require('../package.json');

const HELP = `sol-epoch v${version}

See where Solana is in its current epoch: epoch number, progress and time left.
Read-only: never signs anything.

Usage:
  sol-epoch [options]

Options:
  --rpc <url>          RPC endpoint (or set SOL_EPOCH_RPC)
  --json               Print machine-readable JSON
  -h, --help           Show this help
  -v, --version        Show the version

The time left is an estimate from the average slot time over roughly the last
30 minutes, so it drifts a little if the network speeds up or slows down.

Examples:
  sol-epoch
  sol-epoch --rpc https://api.devnet.solana.com --json
`;

async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const env = io.env || process.env;
  const now = io.now || Date.now;

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

  let info;
  try {
    info = { ...(await fetchEpochInfo(client)), host: client.host };
  } catch (err) {
    if (!(err instanceof RpcError)) throw err;
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  // The epoch itself is the answer; the time left is a bonus, so a failure here
  // only costs the estimate.
  try {
    const slotTime = await fetchSlotTime(client);
    info.estimate = buildEstimate(info.slotsRemaining, slotTime, now());
  } catch (err) {
    if (!(err instanceof RpcError)) throw err;
    info.estimate = null;
    stderr.write(`Warning: could not estimate the time left (${err.message})\n`);
  }

  stdout.write(opts.json ? formatJson(info) : formatHuman(info));
  return 0;
}

module.exports = { run, HELP };