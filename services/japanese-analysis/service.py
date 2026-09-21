"""Versioned UTF-8 JSONL interface. Only protocol frames go to stdout."""
import sys
import json
import time
import importlib.metadata
import traceback

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
MAX_FRAME = 1_000_000


def emit(value):
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_FRAME:
        raise ValueError("FRAME_TOO_LARGE")
    print(encoded, flush=True)


def main():
    import spacy
    import ginza
    from rapidfuzz.fuzz import ratio
    nlp = spacy.load("ja_ginza")
    versions = {name: importlib.metadata.version(name) for name in ["spacy", "ginza", "ja-ginza", "SudachiPy", "SudachiDict-core", "rapidfuzz", "scikit-learn"]}
    parser_version = "/".join(f"{key}={value}" for key, value in versions.items() if key != "scikit-learn")
    emit({"protocolVersion": 1, "requestId": "ready", "ok": True, "result": {"versions": versions, "parserVersion": parser_version}})
    while True:
        raw = sys.stdin.buffer.readline(MAX_FRAME + 1)
        if not raw:
            break
        request_id = None
        try:
            if len(raw) > MAX_FRAME or not raw.endswith(b"\n"):
                raise ValueError("INVALID_FRAME")
            frame = json.loads(raw.decode("utf-8"))
            request_id = frame.get("requestId")
            if set(frame) != {"protocolVersion", "requestId", "operation", "payload", "deadline"} or frame["protocolVersion"] != 1 or not isinstance(request_id, str):
                raise ValueError("INVALID_PROTOCOL")
            if not isinstance(frame["deadline"], (int, float)) or time.time() * 1000 > frame["deadline"]:
                raise ValueError("DEADLINE_EXCEEDED")
            operation = frame["operation"]
            if operation == "analyze":
                text = frame["payload"]["source"]
                if not isinstance(text, str) or not text.strip() or len(text) > 12000 or any(0xD800 <= ord(c) <= 0xDFFF for c in text):
                    raise ValueError("INVALID_SOURCE")
                doc = nlp(text)
                tokens = [{"id": token.i, "text": token.text, "lemma": token.lemma_, "reading": ginza.reading_form(token, False) or "",
                           "pos": token.pos_, "tag": token.tag_, "dep": token.dep_, "head": token.head.i,
                           "span": {"start": token.idx, "end": token.idx + len(token.text)},
                           "morphology": list(token.morph)} for token in doc]
                result = {"parserVersion": parser_version, "tokens": tokens,
                          "sentences": [{"start": sent.start_char, "end": sent.end_char} for sent in doc.sents],
                          "warnings": ["READING_UNAVAILABLE"] if any(not token["reading"] and token["text"].strip() and token["pos"] not in ("SYM", "PUNCT", "NUM", "SPACE") for token in tokens) else []}
            elif operation == "similarity":
                payload = frame["payload"]
                if not isinstance(payload["comparisons"], list) or len(payload["comparisons"]) > 1000:
                    raise ValueError("INVALID_COMPARISONS")
                result = [ratio(payload["text"], text) / 100 for text in payload["comparisons"]]
            elif operation == "ping":
                result = {"versions": versions}
            else:
                raise ValueError("UNKNOWN_OPERATION")
            if time.time() * 1000 > frame["deadline"]:
                raise ValueError("DEADLINE_EXCEEDED")
            emit({"protocolVersion": 1, "requestId": request_id, "ok": True, "result": result})
        except Exception as error:
            # No input text or local file paths in protocol errors or routine logs.
            print(type(error).__name__, file=sys.stderr, flush=True)
            emit({"protocolVersion": 1, "requestId": request_id, "ok": False, "error": str(error) if isinstance(error, ValueError) else "ANALYSIS_FAILED"})


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("ANALYZER_STARTUP_FAILED", file=sys.stderr, flush=True)
        sys.exit(1)
