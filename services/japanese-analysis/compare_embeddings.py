"""Optional offline semantic retrieval comparison. Never used as a fact validator."""
import argparse
import json
import time
from pathlib import Path
import os

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--model-dir", required=True); parser.add_argument("--input", required=True); parser.add_argument("--output", required=True); args = parser.parse_args()
    model_dir = Path(args.model_dir)
    if not model_dir.is_dir():
        raise SystemExit("LOCAL_MODEL_REQUIRED: setup is a separate explicit step")
    os.environ["HF_HUB_OFFLINE"] = "1"; os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from sentence_transformers import SentenceTransformer
    from sentence_transformers.util import cos_sim
    data = json.loads(Path(args.input).read_text(encoding="utf-8")); started = time.perf_counter()
    model = SentenceTransformer(str(model_dir), local_files_only=True)
    passages = model.encode(["passage: " + item["text"] for item in data["documents"]], normalize_embeddings=True)
    queries = model.encode(["query: " + item["text"] for item in data["queries"]], normalize_embeddings=True)
    scores = cos_sim(queries, passages).tolist()
    rankings = [[data["documents"][index]["id"] for index in sorted(range(len(row)), key=lambda index: -row[index])[:10]] for row in scores]
    reciprocal = []
    for query, ranking in zip(data["queries"], rankings):
        if "relevantIds" in query: reciprocal.append(next((1 / (i + 1) for i, item in enumerate(ranking) if item in query["relevantIds"]), 0))
    Path(args.output).write_text(json.dumps({"rankings": rankings, "seconds": time.perf_counter() - started, "MRR": sum(reciprocal) / len(reciprocal) if reciprocal else None, "model": str(model_dir.name), "qualityVerified": bool(reciprocal), "factValidation": False}), encoding="utf-8")
