"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SparseTfidfVectorizer,
  TfidfCentroidClassifier,
  TfidfKnnClassifier,
  TfidfSearchIndex,
  cosine,
} = require("../lib/vector-space");

const words = (value) => String(value).toLowerCase().split(/\s+/).filter(Boolean);

test("TF-IDF疎ベクトルは同じ内容を近く、直交する内容を遠く測る", () => {
  const vectorizer = new SparseTfidfVectorizer([
    "red apple sweet",
    "red apple tart",
    "blue ocean deep",
  ], words, { minimumDocumentFrequency: 1 });
  const apple = vectorizer.vectorize("red apple");
  const fruit = vectorizer.vectorize("red apple tart");
  const ocean = vectorizer.vectorize("blue ocean");

  assert.ok(cosine(apple, fruit) > 0.7);
  assert.equal(cosine(apple, ocean), 0);
  assert.ok(Math.abs(cosine(apple, apple) - 1) < 1e-12);
});

test("転置索引のコサイン検索と系列重心分類が独立に働く", () => {
  const documents = [
    "cat kitten whisker",
    "cat purr whisker",
    "truck diesel wheel",
    "car engine wheel",
  ];
  const search = new TfidfSearchIndex(documents, words, { minimumDocumentFrequency: 1 });
  const hits = search.search("kitten cat", null, 2);
  assert.equal(hits[0].index, 0);
  assert.ok(hits[0].score > hits[1].score);

  const classifier = new TfidfCentroidClassifier(
    documents,
    ["animal", "animal", "vehicle", "vehicle"],
    words,
    { minimumDocumentFrequency: 1 },
  );
  const scores = classifier.scores("kitten cat purr");
  assert.ok(scores.get("animal") > scores.get("vehicle"));

  const neighbors = new TfidfKnnClassifier(
    documents,
    ["animal", "animal", "vehicle", "vehicle"],
    words,
    { minimumDocumentFrequency: 1 },
  );
  const neighborScores = neighbors.scores("diesel truck");
  assert.ok(neighborScores.get("vehicle") > neighborScores.get("animal"));
});
