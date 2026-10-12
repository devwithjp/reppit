#!/usr/bin/env python3
"""
The build-in-public desk: the queue, the metrics log, and the numbers the desk
session optimises against. Standard library only.

  ./bip/desk.py status                 what is due, what is next, what needs approval
  ./bip/desk.py due                    queue items whose slot has passed and are approved
  ./bip/desk.py approve <group|id>     mark a day or a single post approved (the user says so first)
  ./bip/desk.py posted <id> <url>      record that a post went live
  ./bip/desk.py record <id> <checkpoint> views=N likes=N reposts=N replies=N bookmarks=N [follows=N]
                                       checkpoint is one of 1h, 24h, 72h
  ./bip/desk.py checkpoints            metric snapshots that are now due
  ./bip/desk.py summary                per-post table and grouped comparisons
  ./bip/desk.py sync                   write bip/tracker/state.json for the tracker artifact

Post text lives in docs/tweets.md and nowhere else. The queue only refers to post ids.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
BIP = ROOT / "bip"
QUEUE = BIP / "queue.json"
METRICS = BIP / "metrics.jsonl"
STATE = BIP / "tracker" / "state.json"
CHECKPOINTS = {"1h": timedelta(hours=1), "24h": timedelta(hours=24), "72h": timedelta(hours=72)}

sys.path.insert(0, str(ROOT / "scripts"))
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("xpost", ROOT / "scripts" / "xpost.py")
xpost = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(xpost)  # type: ignore[union-attr]


def now() -> datetime:
    return datetime.now(timezone.utc)


def load_queue() -> dict:
    return json.loads(QUEUE.read_text())


def save_queue(q: dict) -> None:
    QUEUE.write_text(json.dumps(q, indent=1) + "\n")


def posts_by_id() -> dict:
    return {p.id: p for p in xpost.load_posts()}


def metrics() -> list[dict]:
    if not METRICS.exists():
        return []
    return [json.loads(l) for l in METRICS.read_text().splitlines() if l.strip()]


def latest(mets: list[dict]) -> dict:
    out: dict = {}
    order = {"1h": 0, "24h": 1, "72h": 2}
    for m in mets:
        cur = out.get(m["id"])
        if cur is None or order[m["checkpoint"]] >= order[cur["checkpoint"]]:
            out[m["id"]] = m
    return out


def items(q: dict):
    for slot in q["slots"]:
        for pid in slot["posts"]:
            yield slot, pid


def fmt_slot(slot: dict) -> str:
    t = datetime.fromisoformat(slot.get("post_at_utc", slot["at_utc"]).replace("Z", "+00:00"))
    et = t.astimezone(ZoneInfo("America/New_York"))  # follows US daylight saving
    syd = t.astimezone(ZoneInfo("Australia/Sydney"))
    return f"{et:%a %d %b %H:%M} ET / {syd:%a %H:%M} Sydney"


def cmd_status(q: dict) -> None:
    posted = q.get("posted", {})
    print(f"now: {now():%Y-%m-%d %H:%M} UTC\n")
    for slot in q["slots"]:
        state = "posted" if all(p in posted for p in slot["posts"]) else (
            "APPROVED" if slot.get("approved") else "awaiting approval")
        t = datetime.fromisoformat(slot.get("post_at_utc", slot["at_utc"]).replace("Z", "+00:00"))
        late =" (slot has passed)" if t <= now() and state == "APPROVED" else ""
        print(f"{slot['name']:<16} {fmt_slot(slot)}  {len(slot['posts'])} post(s)  {state}{late}")
    due = list(cmd_checkpoints(q, quiet=True))
    print(f"\nmetric snapshots due: {len(due)}")


def cmd_due(q: dict) -> None:
    posted = q.get("posted", {})
    found = False
    for slot in q["slots"]:
        t = datetime.fromisoformat(slot.get("post_at_utc", slot["at_utc"]).replace("Z", "+00:00"))
        if slot.get("approved") and t <= now():
            todo = [p for p in slot["posts"] if p not in posted]
            if todo:
                found = True
                print(f"{slot['name']}: {', '.join(todo)}")
    if not found:
        print("nothing due")


def cmd_approve(q: dict, key: str) -> None:
    import random
    hit = False
    for slot in q["slots"]:
        if key in ("all", slot["name"]) or key in slot["posts"]:
            slot["approved"] = True
            slot["approved_at"] = now().isoformat(timespec="seconds")
            # Irregular but consistent: each slot lands somewhere between 25 minutes early and
            # 40 minutes late, so posts never go out on the same round minute.
            if "post_at_utc" not in slot:
                base = datetime.fromisoformat(slot["at_utc"].replace("Z", "+00:00"))
                slot["post_at_utc"] = (base + timedelta(minutes=random.randint(-25, 40))).strftime("%Y-%m-%dT%H:%M:%SZ")
            hit = True
            print(f"approved: {slot['name']:<14} posts at {fmt_slot(slot)}")
    if not hit:
        sys.exit(f"no slot or post named {key}")
    save_queue(q)


def cmd_posted(q: dict, pid: str, url: str) -> None:
    if pid not in posts_by_id():
        sys.exit(f"unknown post id {pid}")
    q.setdefault("posted", {})[pid] = {"url": url, "at": now().isoformat(timespec="seconds")}
    save_queue(q)
    print(f"{pid} posted at {q['posted'][pid]['at']}")


def cmd_record(q: dict, pid: str, cp: str, kv: list[str]) -> None:
    if cp not in CHECKPOINTS:
        sys.exit("checkpoint must be 1h, 24h or 72h")
    if pid not in q.get("posted", {}):
        sys.exit(f"{pid} is not recorded as posted yet")
    row = {"id": pid, "checkpoint": cp, "at": now().isoformat(timespec="seconds")}
    for pair in kv:
        k, _, v = pair.partition("=")
        row[k] = int(v.replace(",", ""))
    with METRICS.open("a") as f:
        f.write(json.dumps(row) + "\n")
    print("recorded", row)


def cmd_checkpoints(q: dict, quiet: bool = False):
    have = {(m["id"], m["checkpoint"]) for m in metrics()}
    for pid, info in q.get("posted", {}).items():
        at = datetime.fromisoformat(info["at"])
        for cp, delta in CHECKPOINTS.items():
            if now() >= at + delta and (pid, cp) not in have:
                if not quiet:
                    print(f"{pid} {cp}  {info['url']}")
                yield pid, cp


def rate(m: dict) -> float:
    v = m.get("views", 0)
    e = sum(m.get(k, 0) for k in ("likes", "reposts", "replies", "bookmarks"))
    return e / v if v else 0.0


def cmd_summary(q: dict) -> None:
    posts = posts_by_id()
    last = latest(metrics())
    if not last:
        print("no metrics recorded yet")
        return
    print(f"{'post':<10} {'cp':<4} {'views':>7} {'likes':>6} {'rp':>4} {'repl':>5} {'rate':>6}  section")
    for pid, m in sorted(last.items(), key=lambda kv: kv[0]):
        p = posts.get(pid)
        print(f"{pid:<10} {m['checkpoint']:<4} {m.get('views',0):>7} {m.get('likes',0):>6} "
              f"{m.get('reposts',0):>4} {m.get('replies',0):>5} {rate(m):>6.2%}  {p.section if p else '?'}")

    def group(label, keyfn):
        buckets: dict = {}
        for pid, m in last.items():
            p = posts.get(pid)
            if p is None:
                continue
            buckets.setdefault(keyfn(p), []).append(m)
        print(f"\n{label}")
        for k, ms in sorted(buckets.items(), key=lambda kv: str(kv[0])):
            avg_r = sum(rate(m) for m in ms) / len(ms)
            avg_v = sum(m.get("views", 0) for m in ms) / len(ms)
            print(f"  {str(k):<28} n={len(ms):<3} avg views {avg_v:>8.0f}  avg rate {avg_r:6.2%}")
        print("  (n under 5 in a bucket is an anecdote, not a finding)")

    tags = q.get("tags", {})
    group("by figure", lambda p: "with figure" if p.image else "no figure")
    group("by section", lambda p: p.section)
    group("by tag", lambda p: tags.get(p.id, "untagged"))


def cmd_sync(q: dict) -> None:
    last = latest(metrics())
    state = {"version": 1, "posts": {}}
    for pid, info in q.get("posted", {}).items():
        m = last.get(pid, {})
        state["posts"][pid] = {
            "status": "posted", "url": info["url"], "postedAt": info["at"][:10],
            "views": str(m.get("views", "")), "likes": str(m.get("likes", "")),
            "reposts": str(m.get("reposts", "")), "replies": str(m.get("replies", "")),
            "notes": "",
        }
    STATE.write_text(json.dumps(state, indent=1) + "\n")
    print(f"wrote {STATE.relative_to(ROOT)} with {len(state['posts'])} posted entries")


def main() -> None:
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    q = load_queue()
    cmd = a[0]
    if cmd == "status":
        cmd_status(q)
    elif cmd == "due":
        cmd_due(q)
    elif cmd == "approve":
        cmd_approve(q, a[1])
    elif cmd == "posted":
        cmd_posted(q, a[1], a[2])
    elif cmd == "record":
        cmd_record(q, a[1], a[2], a[3:])
    elif cmd == "checkpoints":
        found = list(cmd_checkpoints(q))
        if not found:
            print("no snapshots due")
    elif cmd == "summary":
        cmd_summary(q)
    elif cmd == "sync":
        cmd_sync(q)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
