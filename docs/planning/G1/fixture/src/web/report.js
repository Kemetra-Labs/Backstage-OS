// FIXTURE CASE: CommonJS require of a sibling module and a call of the required function.
const { formatMoney } = require('./format');

function renderReport(total) {
  return 'Total: ' + formatMoney(total);
}

module.exports = { renderReport };
