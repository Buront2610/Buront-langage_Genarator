'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compileSeriesProfiles, selectSurface, frameRhetoric } = require('../../dist/packages/core/series');

test('parentheses in source evidence do not license an invented parenthetical annotation', () => {
  const [profile] = compileSeriesProfiles([{ id: 'fixture', postId: 'fixture-post', text: '心配は要らない（リアル話）', series: ['fixture-series'], family: 'fixture', sourceType: 'original_post' }], ['fixture-series']);
  assert.equal(profile.constructions.some(item => item.id === 'parenthetical'), false);
  for (const intensity of [1, 2, 3]) for (const variant of [0, 1, 2]) {
    const surface = selectSurface(profile, '本文。', intensity, variant);
    assert.equal(surface.constructionId, 'plain');
    assert.equal(frameRhetoric(surface.coreText, surface.constructionId), '本文。');
  }
  // Old saved plans must not silently regenerate the withdrawn wording.
  assert.throws(() => frameRhetoric('本文。', 'parenthetical'), /UNKNOWN_CONSTRUCTION/);
});

test('source wording is preserved; removing an invented frame is not a blacklist', () => {
  assert.equal(frameRhetoric('「ここ大事」と書かれている。', 'plain'), '「ここ大事」と書かれている。');
});
