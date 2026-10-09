#!/usr/bin/env python3
"""
Post build-in-public updates to X, straight from docs/tweets.md.

Two modes, because they trade off very differently:

  intent (default)  Opens a pre-filled compose window in your browser. You read it and
                    click Post. Free, and uses no API, so there is nothing for X to
                    flag as automation. One click per post.

  api               Posts through the X API v2. Fully hands-off, but X moved to
                    pay-per-use in February 2026: $0.015 a post, and $0.20 if the post
                    contains a link. Needs credentials and prepaid credits.

A thread posts in order and each part replies to the one before it. In intent mode you
click through them one at a time; the script waits for you between parts.

Usage
  ./scripts/xpost.py list                       show every post found, with its id
  ./scripts/xpost.py show p1-3                  print one post and its character count
  ./scripts/xpost.py open p1-3                  open that post pre-filled in the browser
  ./scripts/xpost.py thread "Phase 1"           walk a whole thread, one click each
  ./scripts/xpost.py api p1-3                   post it through the API
  ./scripts/xpost.py api-thread "Phase 1"       post a whole thread through the API

API credentials, from https://developer.x.com (OAuth 1.0a user context):
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
Put them in .env at the repo root; this reads that file if present.
"""
from __future__ import annotations

import os
import re
import sys
import json
import time
import base64
import hashlib
import hmac
import secrets
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TWEETS = ROOT / "docs" / "tweets.md"
LIMIT = 280


# ---------------------------------------------------------------- parsing

class Post:
    def __init__(self, pid: str, section: str, label: str, text: str, image: str | None):
        self.id, self.section, self.label, self.text, self.image = pid, section, label, text, image

    @property
    def length(self) -> int:
        # X counts a URL as 23 characters regardless of real length.
        return len(re.sub(r"https?://\S+", "x" * 23, self.text))

    @property
    def has_link(self) -> bool:
        return bool(re.search(r"https?://\S+", self.text))

    def __repr__(self) -> str:
        flag = "" if self.length <= LIMIT else f"  OVER BY {self.length - LIMIT}"
        img = f"  [{self.image}]" if self.image else ""
        return f"{self.id:<10} {self.length:>3}c  {self.label}{img}{flag}"


def load_posts(path: Path = TWEETS) -> list[Post]:
    """Pull every blockquote out of the tweets file, keyed by the heading above it."""
    if not path.exists():
        sys.exit(f"no tweets file at {path}")
    lines = path.read_text(encoding="utf-8").splitlines()

    posts: list[Post] = []
    section = "general"
    label = ""
    buf: list[str] = []
    image: str | None = None
    counter: dict[str, int] = {}

    def flush() -> None:
        nonlocal buf, image, label
        if buf:
            text = "\n".join(buf).strip()
            if text:
                slug = re.sub(r"[^a-z0-9]+", "", section.lower())[:6] or "post"
                counter[slug] = counter.get(slug, 0) + 1
                posts.append(Post(f"{slug}-{counter[slug]}", section, label or "(untitled)", text, image))
        buf, image = [], None

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("## "):
            flush()
            section = line[3:].strip()
            # "Phase 1 - Naming" -> "p1"
            m = re.match(r"phase\s*(\d+)", section, re.I)
            if m:
                section = f"p{m.group(1)}"
            label = ""
        elif line.startswith("### ") or line.startswith("**") and line.endswith("**"):
            flush()
            label = line.strip("#* ").strip()
        elif line.startswith(">"):
            buf.append(line[1:].lstrip())
        elif line.startswith("`") and buf:
            # image filename line directly under a post
            image = line.strip("`").split(" ")[0]
        elif not line and buf:
            flush()
        elif line.startswith("---"):
            flush()
    flush()
    return posts


def find(posts: list[Post], pid: str) -> Post:
    for p in posts:
        if p.id == pid:
            return p
    sys.exit(f"no post with id {pid}. run 'list' to see them.")


def thread_of(posts: list[Post], section: str) -> list[Post]:
    key = section.lower().replace(" ", "")
    key = re.sub(r"phase(\d+)", r"p\1", key)
    out = [p for p in posts if key in p.section.lower().replace(" ", "")]
    if not out:
        sys.exit(f"no posts in a section matching {section!r}")
    return out


# ---------------------------------------------------------------- browser

def open_url(url: str) -> None:
    for cmd in (["xdg-open", url], ["google-chrome", url], ["firefox", url]):
        try:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except FileNotFoundError:
            continue
    print(f"could not launch a browser. open this yourself:\n{url}")


def intent_url(text: str) -> str:
    return "https://x.com/intent/post?text=" + urllib.parse.quote(text, safe="")


def warn_if_long(p: Post) -> None:
    if p.length > LIMIT:
        print(f"  warning: {p.length} characters, {p.length - LIMIT} over the limit")
    if p.image:
        print(f"  attach the image by hand: docs/screenshots/{p.image}")


# ---------------------------------------------------------------- api

def load_env() -> None:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)", line)
            if m and not os.environ.get(m.group(1)):
                os.environ[m.group(1)] = m.group(2).strip().strip("\"'")


def oauth1_header(method: str, url: str, body_is_json: bool = True) -> str:
    """OAuth 1.0a user-context signature. The JSON body is not part of the signature."""
    ck = os.environ.get("X_API_KEY")
    cs = os.environ.get("X_API_SECRET")
    tk = os.environ.get("X_ACCESS_TOKEN")
    ts_ = os.environ.get("X_ACCESS_SECRET")
    if not all([ck, cs, tk, ts_]):
        sys.exit(
            "missing API credentials.\n"
            "set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_SECRET in .env\n"
            "get them at https://developer.x.com (the app needs read and write)."
        )
    params = {
        "oauth_consumer_key": ck,
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": tk,
        "oauth_version": "1.0",
    }
    q = lambda s: urllib.parse.quote(str(s), safe="")
    base = "&".join([method.upper(), q(url), q("&".join(f"{q(k)}={q(v)}" for k, v in sorted(params.items())))])
    key = f"{q(cs)}&{q(ts_)}".encode()
    sig = base64.b64encode(hmac.new(key, base.encode(), hashlib.sha1).digest()).decode()
    params["oauth_signature"] = sig
    return "OAuth " + ", ".join(f'{q(k)}="{q(v)}"' for k, v in sorted(params.items()))


def api_post(text: str, reply_to: str | None = None) -> str:
    url = "https://api.x.com/2/tweets"
    payload: dict = {"text": text}
    if reply_to:
        payload["reply"] = {"in_reply_to_tweet_id": reply_to}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", oauth1_header("POST", url))
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
            return out["data"]["id"]
    except urllib.error.HTTPError as e:
        sys.exit(f"X API {e.code}: {e.read().decode()[:500]}")


def cost_estimate(posts: list[Post]) -> str:
    n_link = sum(1 for p in posts if p.has_link)
    total = n_link * 0.20 + (len(posts) - n_link) * 0.015
    return f"${total:.3f} ({len(posts) - n_link} plain at $0.015, {n_link} with a link at $0.20)"


# ---------------------------------------------------------------- commands

def main() -> None:
    load_env()
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd, rest = args[0], args[1:]
    posts = load_posts()

    if cmd == "list":
        sec = None
        for p in posts:
            if p.section != sec:
                sec = p.section
                print(f"\n[{sec}]")
            print("  " + repr(p))
        over = [p for p in posts if p.length > LIMIT]
        print(f"\n{len(posts)} posts. {len(over)} over {LIMIT} characters.")

    elif cmd == "show":
        p = find(posts, rest[0])
        print(f"--- {p.id}  {p.label}  ({p.length} characters)\n{p.text}")
        warn_if_long(p)

    elif cmd == "open":
        p = find(posts, rest[0])
        print(f"opening {p.id}: {p.label}")
        warn_if_long(p)
        open_url(intent_url(p.text))

    elif cmd == "thread":
        group = thread_of(posts, " ".join(rest))
        print(f"{len(group)} posts in this thread. Post each one, then press Enter for the next.")
        print("Reply to your previous post each time so it chains.\n")
        for i, p in enumerate(group, 1):
            print(f"--- {i}/{len(group)}  {p.id}  ({p.length} characters)")
            print(p.text)
            warn_if_long(p)
            open_url(intent_url(p.text))
            if i < len(group):
                input("\npress Enter when that one is posted... ")

    elif cmd == "api":
        p = find(posts, rest[0])
        print(f"{p.text}\n\ncost: {cost_estimate([p])}")
        if input("post this? [y/N] ").strip().lower() != "y":
            return
        print("posted: https://x.com/i/status/" + api_post(p.text))

    elif cmd == "api-thread":
        group = thread_of(posts, " ".join(rest))
        for p in group:
            print(f"--- {p.id} ({p.length}c)\n{p.text}\n")
        print(f"cost: {cost_estimate(group)}")
        if input(f"post all {len(group)} as a thread? [y/N] ").strip().lower() != "y":
            return
        prev = None
        for p in group:
            prev = api_post(p.text, reply_to=prev)
            print(f"  posted {p.id}: https://x.com/i/status/{prev}")
            time.sleep(2)

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
