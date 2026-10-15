'use strict';

const DEFAULT_INTERVAL_SECS = 10;

// Moves the cursor home and clears the screen, so each refresh replaces the last one.
const CLEAR_SCREEN = '\x1b[H\x1b[2J';

// Waits for ms, but wakes up straight away if the signal aborts.
function abortableSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal && signal.aborted) {
      resolve();
      return;
    }
    let timer;
    const done = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', done);
      resolve();
    };
    timer = setTimeout(done, ms);
    if (signal) signal.addEventListener('abort', done, { once: true });
  });
}

module.exports = { abortableSleep, DEFAULT_INTERVAL_SECS, CLEAR_SCREEN };