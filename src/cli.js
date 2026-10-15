'use strict';

const { parseArgs, UsageError } = require('./args');
const { createRpcClient, resolveRpcUrl, RpcError } = require('./rpc');
const { fetchEpochInfo } = require('./epoch');
const { formatHuman, formatJson } = require('./format');
const { version } = require('../package.json');

const HELP = `sol-epoch v${version}

See where Solana is in its current epoch: epoch number, progress and slots left.
Read-only: never signs anything.

Usage:
  sol-epoch [options]

Options:
  --rpc <url>          RPC endpoint (or set SOL_EPOCH_RPC)
  --json               Print machine-readable JSON
  -h, --help           Show this help
  -v, --version        Show the version

Examples:
  sol-epoch
  sol-epoch --rpc https://api.devnet.solana.com --json
`;

async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const env = io.env || process.env;

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

  stdout.write(opts.json ? formatJson(info) : formatHuman(info));
  return 0;
}

module.exports = { run, HELP };