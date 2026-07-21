"use strict";

function countTerms(terms) {
  const counts = new Map();
  for (const term of terms) {
    if (!term) continue;
    counts.set(term, (counts.get(term) || 0) + 1);
  }
  return counts;
}

function normalizeVector(vector) {
  let squared = 0;
  for (const weight of vector.values()) squared += weight * weight;
  const norm = Math.sqrt(squared);
  if (!norm) return new Map();
  return new Map(Array.from(vector, ([term, weight]) => [term, weight / norm]));
}

function cosine(left, right) {
  if (!left.size || !right.size) return 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let score = 0;
  for (const [term, weight] of small) score += weight * (large.get(term) || 0);
  return score;
}

class SparseTfidfVectorizer {
  constructor(documents, extractTerms, options = {}) {
    this.extractTerms = extractTerms;
    const minimumDocumentFrequency = Math.max(1, options.minimumDocumentFrequency || 2);
    const maximumDocumentFrequencyRatio = Math.min(1, options.maximumDocumentFrequencyRatio || 0.96);
    const maximumVocabulary = Math.max(100, options.maximumVocabulary || 30000);
    const rows = documents.map((document) => countTerms(extractTerms(document)));
    const documentFrequency = new Map();
    const totalFrequency = new Map();

    for (const row of rows) {
      for (const [term, frequency] of row) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        totalFrequency.set(term, (totalFrequency.get(term) || 0) + frequency);
      }
    }

    const documentCount = Math.max(1, documents.length);
    const vocabulary = Array.from(documentFrequency)
      .filter(([, frequency]) => (
        frequency >= minimumDocumentFrequency
        && frequency / documentCount <= maximumDocumentFrequencyRatio
      ))
      .map(([term, frequency]) => {
        const idf = Math.log((documentCount + 1) / (frequency + 1)) + 1;
        const importance = idf * Math.log1p(totalFrequency.get(term) || 0);
        return { term, idf, importance };
      })
      .sort((left, right) => right.importance - left.importance)
      .slice(0, maximumVocabulary);

    this.idf = new Map(vocabulary.map(({ term, idf }) => [term, idf]));
    this.vectors = rows.map((row) => this.vectorizeCounts(row));
  }

  vectorizeCounts(counts) {
    const weighted = new Map();
    for (const [term, frequency] of counts) {
      const idf = this.idf.get(term);
      if (!idf) continue;
      weighted.set(term, (1 + Math.log(frequency)) * idf);
    }
    return normalizeVector(weighted);
  }

  vectorize(document) {
    return this.vectorizeCounts(countTerms(this.extractTerms(document)));
  }
}

class TfidfSearchIndex {
  constructor(documents, extractTerms, options = {}) {
    this.vectorizer = new SparseTfidfVectorizer(documents, extractTerms, options);
    this.vectors = this.vectorizer.vectors;
    this.inverted = new Map();
    for (let index = 0; index < this.vectors.length; index += 1) {
      for (const [term, weight] of this.vectors[index]) {
        if (!this.inverted.has(term)) this.inverted.set(term, []);
        this.inverted.get(term).push([index, weight]);
      }
    }
  }

  search(document, predicate = null, limit = 1200) {
    const query = this.vectorizer.vectorize(document);
    const scores = new Map();
    for (const [term, queryWeight] of query) {
      for (const [index, documentWeight] of this.inverted.get(term) || []) {
        if (predicate && !predicate(index)) continue;
        scores.set(index, (scores.get(index) || 0) + queryWeight * documentWeight);
      }
    }
    return Array.from(scores, ([index, score]) => ({ index, score }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  similarity(leftIndex, rightIndex) {
    return cosine(this.vectors[leftIndex] || new Map(), this.vectors[rightIndex] || new Map());
  }
}

class TfidfCentroidClassifier {
  constructor(documents, labels, extractTerms, options = {}) {
    this.vectorizer = new SparseTfidfVectorizer(documents, extractTerms, options);
    const totals = new Map();
    const counts = new Map();
    for (let index = 0; index < documents.length; index += 1) {
      const label = labels[index];
      if (!label) continue;
      if (!totals.has(label)) totals.set(label, new Map());
      const total = totals.get(label);
      for (const [term, weight] of this.vectorizer.vectors[index]) {
        total.set(term, (total.get(term) || 0) + weight);
      }
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    this.centroids = new Map(Array.from(totals, ([label, total]) => {
      const count = counts.get(label) || 1;
      return [label, normalizeVector(new Map(Array.from(total, ([term, weight]) => [term, weight / count])))];
    }));
  }

  scores(document) {
    const vector = this.vectorizer.vectorize(document);
    return new Map(Array.from(this.centroids, ([label, centroid]) => [label, cosine(vector, centroid)]));
  }

  score(document, label) {
    return this.scores(document).get(label) || 0;
  }
}

class TfidfKnnClassifier {
  constructor(documents, labels, extractTerms, options = {}) {
    this.labels = labels;
    this.labelSet = new Set(labels.filter(Boolean));
    this.vectorizer = new SparseTfidfVectorizer(documents, extractTerms, options);
    this.inverted = new Map();
    for (let index = 0; index < this.vectorizer.vectors.length; index += 1) {
      for (const [term, weight] of this.vectorizer.vectors[index]) {
        if (!this.inverted.has(term)) this.inverted.set(term, []);
        this.inverted.get(term).push([index, weight]);
      }
    }
  }

  scores(document, neighborsPerLabel = 3) {
    const query = this.vectorizer.vectorize(document);
    const documentScores = new Map();
    for (const [term, queryWeight] of query) {
      for (const [index, documentWeight] of this.inverted.get(term) || []) {
        documentScores.set(index, (documentScores.get(index) || 0) + queryWeight * documentWeight);
      }
    }
    const byLabel = new Map(Array.from(this.labelSet, (label) => [label, []]));
    for (const [index, score] of documentScores) {
      const label = this.labels[index];
      if (!label) continue;
      byLabel.get(label).push(score);
    }
    return new Map(Array.from(byLabel, ([label, values]) => {
      const nearest = values.sort((left, right) => right - left).slice(0, neighborsPerLabel);
      if (!nearest.length) return [label, 0];
      const average = nearest.reduce((sum, value) => sum + value, 0) / nearest.length;
      // 一つの定型句だけで決めず、最接近文と上位近傍の平均を併用する。
      return [label, nearest[0] * 0.65 + average * 0.35];
    }));
  }
}

module.exports = {
  SparseTfidfVectorizer,
  TfidfCentroidClassifier,
  TfidfKnnClassifier,
  TfidfSearchIndex,
  cosine,
  normalizeVector,
};
