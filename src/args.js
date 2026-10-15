'use strict';

// Epochs are about a thousand in; this just keeps the slot maths in safe integer range.
const MAX_EPOCH = 1000000;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 3600;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function checkRpcUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError('--rpc must be a valid http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UsageError('--rpc must be a valid http(s) URL');
  }
  return value;
}

function checkEpoch(value) {
  const epoch = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(epoch) || epoch > MAX_EPOCH) {
    throw new UsageError(`--epoch must be a whole number from 0 to ${MAX_EPOCH}`);
  }
  return epoch;
}

function checkInterval(value) {
  const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(seconds) || seconds < MIN_INTERVAL || seconds > MAX_INTERVAL) {
    throw new UsageError(
      `--interval must be a whole number of seconds from ${MIN_INTERVAL} to ${MAX_INTERVAL}`
    );
  }
  return seconds;
}

const VALUE_OPTIONS = {
  '--rpc': { key: 'rpc', needs: 'a URL', parse: checkRpcUrl },
  '--epoch': { key: 'epoch', needs: 'an epoch number', parse: checkEpoch },
  '--interval': { key: 'interval', needs: 'a number of seconds', parse: checkInterval },
};

const FLAG_OPTIONS = {
  '--json': 'json',
  '--watch': 'watch',
};

function parseArgs(argv) {
  const opts = {
    rpc: null,
    epoch: null,
    watch: false,
    interval: null,
    json: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    let name = arg;
    let inline = null;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        name = arg.slice(0, eq);
        inline = arg.slice(eq + 1);
      }
    }

    if (name === '--help' || name === '-h') {
      opts.help = true;
    } else if (name === '--version' || name === '-v') {
      opts.version = true;
    } else if (FLAG_OPTIONS[name]) {
      if (inline !== null) throw new UsageError(`${name} does not take a value`);
      opts[FLAG_OPTIONS[name]] = true;
    } else if (VALUE_OPTIONS[name]) {
      const { key, needs, parse } = VALUE_OPTIONS[name];
      let value = inline;
      if (value === null) {
        value = argv[++i];
        if (value === undefined || value.startsWith('-')) {
          throw new UsageError(`${name} needs ${needs}`);
        }
      }
      if (value === '') {
        throw new UsageError(`${name} needs ${needs}`);
      }
      if (opts[key] !== null) throw new UsageError(`${name} can only be given once`);
      opts[key] = parse(value);
    } else if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${name}`);
    } else {
      throw new UsageError(`Unexpected argument: ${arg}`);
    }
  }

  if (!opts.help && !opts.version) {
    if (opts.interval !== null && !opts.watch) {
      throw new UsageError('--interval only applies together with --watch');
    }
    if (opts.watch && opts.epoch !== null) {
      throw new UsageError('--watch cannot be combined with --epoch');
    }
  }

  return opts;
}

module.exports = { parseArgs, UsageError, MAX_EPOCH, MIN_INTERVAL, MAX_INTERVAL };