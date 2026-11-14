#!/usr/bin/env python3
"""Auth-probe an OpenAI-compatible chat endpoint.

Prints one word: ok, auth, or unknown. The key stays in the environment
and is not written here.
"""
import json
import os
import urllib.error
import urllib.request


def request(method, url, key, body):
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", "Bearer " + key)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp.read(256)
            return resp.status
    except urllib.error.HTTPError as err:
        return err.code
    except Exception:
        return None


def classify(code):
    if code is None:
        return None
    if 200 <= code < 300:
        return "ok"
    if code in (401, 403):
        return "auth"
    return None


def main():
    base = os.environ.get("LUMEN_PROBE_URL", "").rstrip("/")
    key = os.environ.get("LUMEN_PROBE_KEY", "")
    model = os.environ.get("LUMEN_PROBE_MODEL", "") or "deepseek-flash"
    if not base or not key:
        print("unknown")
        return
    found = classify(request("GET", base + "/models", key, None))
    if found:
        print(found)
        return
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
    }).encode()
    found = classify(request("POST", base + "/chat/completions", key, body))
    print(found or "unknown")


if __name__ == "__main__":
    main()
