#!/usr/bin/env node
'use strict';

const { run } = require('../src/cli');

// Stop quietly when the reader goes away, e.g. `sol-epoch --watch | head -n 5`.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`Unexpected error: ${err.message}`);
    process.exitCode = 1;
  }
);