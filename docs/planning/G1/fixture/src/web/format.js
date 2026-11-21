// FIXTURE CASE: CommonJS module that exports through module.exports.
function formatMoney(amount) {
  return '$' + amount.toFixed(2);
}

module.exports = { formatMoney };
