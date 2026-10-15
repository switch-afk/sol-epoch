'use strict';

const { RpcError } = require('./rpc');

// Early epochs after genesis were short and doubled in length until the normal size.
const MINIMUM_SLOTS_PER_EPOCH = 32;

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

async function fetchEpochSchedule(client) {
  const schedule = await client.call('getEpochSchedule');

  const valid =
    schedule &&
    Number.isSafeInteger(schedule.slotsPerEpoch) &&
    schedule.slotsPerEpoch > 0 &&
    isCount(schedule.firstNormalEpoch) &&
    isCount(schedule.firstNormalSlot);
  if (!valid) {
    throw new RpcError(`${client.host} returned an unexpected epoch schedule`);
  }

  return {
    slotsPerEpoch: schedule.slotsPerEpoch,
    firstNormalEpoch: schedule.firstNormalEpoch,
    firstNormalSlot: schedule.firstNormalSlot,
  };
}

// The slot range of any epoch, first and last slot both included.
function epochBounds(schedule, epoch) {
  if (epoch < schedule.firstNormalEpoch) {
    const slotsInEpoch = MINIMUM_SLOTS_PER_EPOCH * 2 ** epoch;
    const firstSlot = (2 ** epoch - 1) * MINIMUM_SLOTS_PER_EPOCH;
    return { epoch, firstSlot, lastSlot: firstSlot + slotsInEpoch - 1, slotsInEpoch };
  }

  const slotsInEpoch = schedule.slotsPerEpoch;
  const firstSlot =
    schedule.firstNormalSlot + (epoch - schedule.firstNormalEpoch) * schedule.slotsPerEpoch;
  return { epoch, firstSlot, lastSlot: firstSlot + slotsInEpoch - 1, slotsInEpoch };
}

// For an epoch that is not the current one. current: { epoch, slot }
function describeEpoch(bounds, current) {
  const finished = bounds.epoch < current.epoch;
  return {
    epoch: bounds.epoch,
    status: finished ? 'finished' : 'upcoming',
    firstSlot: bounds.firstSlot,
    lastSlot: bounds.lastSlot,
    slotsInEpoch: bounds.slotsInEpoch,
    slotsSinceEnd: finished ? current.slot - bounds.lastSlot : null,
    slotsUntilStart: finished ? null : bounds.firstSlot - current.slot,
    currentEpoch: current.epoch,
    currentSlot: current.slot,
  };
}

module.exports = { fetchEpochSchedule, epochBounds, describeEpoch, MINIMUM_SLOTS_PER_EPOCH };