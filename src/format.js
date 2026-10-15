'use strict';

// 432000 -> "432,000". Done by hand so the output does not depend on the locale.
function withCommas(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// info: { epoch, slot, slotIndex, slotsInEpoch, slotsRemaining, progress, blockHeight, host }
function formatHuman(info) {
  const lines = [
    `Epoch      ${info.epoch}`,
    `Progress   ${info.progress.toFixed(2)}% (${withCommas(info.slotIndex)} of ${withCommas(info.slotsInEpoch)} slots)`,
    `Remaining  ${withCommas(info.slotsRemaining)} slots`,
    `Slot       ${withCommas(info.slot)}`,
  ];
  if (info.blockHeight !== null) lines.push(`Block      ${withCommas(info.blockHeight)}`);
  lines.push(`RPC        ${info.host}`);
  return `${lines.join('\n')}\n`;
}

function formatJson(info) {
  const out = {
    epoch: info.epoch,
    slot: info.slot,
    slotIndex: info.slotIndex,
    slotsInEpoch: info.slotsInEpoch,
    slotsRemaining: info.slotsRemaining,
    progress: info.progress,
    blockHeight: info.blockHeight,
    rpc: info.host,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

module.exports = { formatHuman, formatJson, withCommas };