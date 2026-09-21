"""Train separate pairwise S/Q models from explicit human labels; export JSON only."""
import argparse
import json
import hashlib
from pathlib import Path
from collections import Counter
import numpy as np
from sklearn.linear_model import LogisticRegression

FEATURE_VERSION = 'output-text-dense-v2'
FEATURE_KEYS = {'length', 'sentences', 'clauses', 'longestClause', 'meanSentence',
                'repetition', 'kanaRatio', 'kanjiRatio', 'punctuationRatio',
                'comparison', 'conditional', 'explanation'} | {f'shape:{i}' for i in range(32)}


def train(data, dimension):
    pairs = {pair["comparisonId"]: pair for pair in data["comparisons"]}
    for pair in pairs.values():
        metadata = pair.get('private', {})
        if metadata.get('featureVersion') != FEATURE_VERSION or len(metadata.get('features', [])) != 2:
            raise ValueError('FEATURE_VERSION_MISMATCH: re-extract every output with the common extractor')
        if any(set(values) != FEATURE_KEYS or any(not isinstance(v, (int, float)) or not np.isfinite(v) for v in values.values()) for values in metadata['features']):
            raise ValueError('FEATURE_SCHEMA_MISMATCH')
    latest = {}
    for label in data["preferences"]:
        if label["dimension"] == dimension:
            latest[(label["comparisonId"], label["annotatorId"])] = label
    labels = list(latest.values())
    chosen = [label for label in labels if label["choice"] in ("left", "right")]
    if len(chosen) < 20:
        raise ValueError(f"{dimension}: HUMAN_LABELS_REQUIRED (minimum 20 directional labels for a pilot model)")
    groups = {}
    features = sorted({key for pair in pairs.values() for values in pair["private"]["features"] for key in values})
    rows = []
    for label in chosen:
        pair = pairs[label["comparisonId"]]
        metadata = pair["private"]
        split, group = metadata["split"], metadata["group"]
        if split not in ("train", "validation", "test"):
            raise ValueError("FROZEN_SPLIT_REQUIRED: pilot labels cannot become held-out evidence")
        if group in groups and groups[group] != split:
            raise ValueError("GROUP_LEAKAGE")
        groups[group] = split
        a, b = metadata["features"]
        difference = [a.get(key, 0) - b.get(key, 0) for key in features]
        rows.append((difference, int(label["choice"] == "left"), split))
    training = [(x, y) for x, y, split in rows if split == "train"]
    if len(training) < 10 or not any(split == "test" for _, _, split in rows):
        raise ValueError("TRAIN_AND_HELDOUT_LABELS_REQUIRED")
    x = np.array([x for x, _ in training]); y = np.array([y for _, y in training])
    # Symmetric pair differences. Scores are relative preferences, not sentence probabilities.
    model = LogisticRegression(fit_intercept=False, random_state=0, max_iter=1000).fit(np.concatenate([x, -x]), np.concatenate([y, 1-y]))
    metrics = {}
    for split in ("train", "validation", "test"):
        samples = [(x, y) for x, y, kind in rows if kind == split]
        metrics[split] = {"count": len(samples), "pairwiseAccuracy": float(model.score([x for x, _ in samples], [y for _, y in samples])) if samples else None}
    choices_by_pair = {}
    for label in labels:
        choices_by_pair.setdefault(label["comparisonId"], []).append(label["choice"])
    reviewed = [values for values in choices_by_pair.values() if len(values) > 1]
    return {"schemaVersion": 1, "featureVersion": FEATURE_VERSION, "dimension": dimension, "coefficients": dict(zip(features, model.coef_[0].tolist())), "intercept": 0,
            "personal": len({label["annotatorId"] for label in chosen}) == 1,
            "trainingManifest": {"labelsHash": hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest(), "metrics": metrics,
                                 "choices": dict(Counter(label["choice"] for label in labels)), "annotatorCount": len({label["annotatorId"] for label in labels}),
                                 "disagreementRate": sum(len(set(values)) > 1 for values in reviewed) / len(reviewed) if reviewed else None,
                                 "scoreMeaning": "uncalibrated-pairwise-preference", "releaseApproved": False}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("input"); parser.add_argument("output"); args = parser.parse_args()
    data = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
    result = {dimension: train(data, dimension) for dimension in ("S", "Q")}
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
