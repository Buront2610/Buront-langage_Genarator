"use strict";

function pick(random, values) {
  if (!values.length) return undefined;
  return values[Math.floor(random() * values.length) % values.length];
}

function shuffle(random, values) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

module.exports = { pick, shuffle };
