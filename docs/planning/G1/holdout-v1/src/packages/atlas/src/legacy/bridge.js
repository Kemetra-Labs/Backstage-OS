'use strict';
const { roundCents } = require('../../../ledger/src/money');
const toCsv = require('./csv');
const debugPanel = process.env.ATLAS_DEBUG === '1' ? require('./debug-panel') : null;

function exportRows(rows, adapterName) {
  const adapter = require(adapterName);
  const cents = rows.map((r) => roundCents(r));
  return { adapter, csv: toCsv(cents), debug: Boolean(debugPanel) };
}

module.exports = { exportRows };
