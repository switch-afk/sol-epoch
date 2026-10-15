'use strict';

const { RpcError } = require('./rpc');

// Each sample covers about a minute, so 30 samples is roughly the last half hour.
const SAMPLE_LIMIT = 30;

function isUsable(sample) {
  return (
    sample &&
    Number.isSafeInteger(sample.numSlots) &&
    sample.numSlots > 0 &&
    Number.isFinite(sample.samplePeriodSecs) &&
    sample.samplePeriodSecs > 0
  );
}

// Average time per slot over the recent samples, in milliseconds.
async function fetchSlotTime(client, limit = SAMPLE_LIMIT) {
  const samples = await client.call('getRecentPerformanceSamples', [limit]);
  const usable = Array.isArray(samples) ? samples.filter(isUsable) : [];
  if (usable.length === 0) {
    throw new RpcError(`${client.host} returned no usable slot time samples`);
  }

  let slots = 0;
  let seconds = 0;
  for (const sample of usable) {
    slots += sample.numSlots;
    seconds += sample.samplePeriodSecs;
  }
  return { msPerSlot: (seconds * 1000) / slots, windowSecs: Math.round(seconds) };
}

// now: milliseconds since the epoch (Date.now())
function buildEstimate(slotsRemaining, slotTime, now) {
  const msLeft = slotsRemaining * slotTime.msPerSlot;
  return {
    slotTimeMs: Math.round(slotTime.msPerSlot),
    windowSecs: slotTime.windowSecs,
    secondsRemaining: Math.round(msLeft / 1000),
    endsAt: new Date(now + msLeft).toISOString(),
  };
}

module.exports = { fetchSlotTime, buildEstimate, SAMPLE_LIMIT };