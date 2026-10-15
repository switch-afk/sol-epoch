'use strict';

const { RpcError } = require('./rpc');

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// Floor to two decimals so an almost finished epoch never reads as 100.00%.
function percentDone(slotIndex, slotsInEpoch) {
  return Math.floor((slotIndex / slotsInEpoch) * 10000) / 100;
}

async function fetchEpochInfo(client) {
  const info = await client.call('getEpochInfo');

  const valid =
    info &&
    isCount(info.epoch) &&
    isCount(info.absoluteSlot) &&
    isCount(info.slotIndex) &&
    Number.isSafeInteger(info.slotsInEpoch) &&
    info.slotsInEpoch > 0 &&
    info.slotIndex < info.slotsInEpoch;
  if (!valid) {
    throw new RpcError(`${client.host} returned an unexpected epoch response`);
  }

  return {
    epoch: info.epoch,
    slot: info.absoluteSlot,
    slotIndex: info.slotIndex,
    slotsInEpoch: info.slotsInEpoch,
    slotsRemaining: info.slotsInEpoch - info.slotIndex,
    progress: percentDone(info.slotIndex, info.slotsInEpoch),
    blockHeight: isCount(info.blockHeight) ? info.blockHeight : null,
  };
}

module.exports = { fetchEpochInfo, percentDone };