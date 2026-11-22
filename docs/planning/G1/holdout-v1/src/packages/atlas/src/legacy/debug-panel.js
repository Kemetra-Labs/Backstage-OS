'use strict';
// Loaded only when ATLAS_DEBUG=1 (a conditional require in bridge.js). That edge is still observed.
function show(count) {
  return 'debug rows: ' + count;
}

module.exports = { show };
