'use strict';

// 432000 -> "432,000". Done by hand so the output does not depend on the locale.
function withCommas(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 99686 -> "1d 3h 41m". Seconds are dropped, anything under a minute is "<1m".
function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return '<1m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  parts.push(`${minutes % 60}m`);
  return parts.join(' ');
}

// "2026-10-16T15:41:26.000Z" -> "2026-10-16 15:41 UTC"
function formatUtc(iso) {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

// info: { epoch, slot, slotIndex, slotsInEpoch, slotsRemaining, progress, blockHeight, host, estimate }
// estimate: { slotTimeMs, windowSecs, secondsRemaining, endsAt } or null
function formatHuman(info) {
  const lines = [
    `Epoch      ${info.epoch}`,
    `Progress   ${info.progress.toFixed(2)}% (${withCommas(info.slotIndex)} of ${withCommas(info.slotsInEpoch)} slots)`,
    `Remaining  ${withCommas(info.slotsRemaining)} slots`,
  ];

  const estimate = info.estimate;
  if (estimate) {
    lines.push(
      `Slot time  ${estimate.slotTimeMs} ms (avg over last ${formatDuration(estimate.windowSecs)})`
    );
    lines.push(`Time left  ~${formatDuration(estimate.secondsRemaining)}`);
    lines.push(`Ends       ${formatUtc(estimate.endsAt)}`);
  } else {
    lines.push('Time left  unknown (could not read recent slot times)');
  }

  lines.push(`Slot       ${withCommas(info.slot)}`);
  if (info.blockHeight !== null) lines.push(`Block      ${withCommas(info.blockHeight)}`);
  lines.push(`RPC        ${info.host}`);
  return `${lines.join('\n')}\n`;
}

function formatJson(info) {
  const estimate = info.estimate;
  const out = {
    epoch: info.epoch,
    slot: info.slot,
    slotIndex: info.slotIndex,
    slotsInEpoch: info.slotsInEpoch,
    slotsRemaining: info.slotsRemaining,
    progress: info.progress,
    slotTimeMs: estimate ? estimate.slotTimeMs : null,
    secondsRemaining: estimate ? estimate.secondsRemaining : null,
    endsAt: estimate ? estimate.endsAt : null,
    blockHeight: info.blockHeight,
    rpc: info.host,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

module.exports = { formatHuman, formatJson, formatDuration, formatUtc, withCommas };