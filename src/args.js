'use strict';

const FLAG_OPTIONS = {
  '--json': 'json',
};

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv) {
  const opts = {
    json: false,
    help: false,
    version: false,
  };

  for (const arg of argv) {
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
    } else if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${name}`);
    } else {
      throw new UsageError(`Unexpected argument: ${arg}`);
    }
  }

  return opts;
}

module.exports = { parseArgs, UsageError };