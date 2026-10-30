#!/usr/bin/env python3
"""Build a reviewable campaign and its comics; never posts or approves anything."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import textwrap

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("figures", ROOT / "scripts/make-figures.py")
fig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fig)
campaign = json.loads((ROOT / "bip/campaign.json").read_text())
out = ROOT / "bip/campaign-assets"
out.mkdir(exist_ok=True)
pages = []
for day, row in enumerate(campaign["days"], 1):
    for part, (post, dialogue) in enumerate(zip(row["posts"], row["comic"]), 1):
        if len(post) > 280:
            raise SystemExit(f"Day {day} post {part}: {len(post)} characters")
        name = f"day-{day:02}-{part}"
        rng = fig.Rng(fig.name_seed(name))
        body = fig.panel_frame(rng) + fig.title(row["title"], rng, size=48)
        for x, line, pose in zip([420, 1170], dialogue, ["shrugging", "pointing"]):
            body += fig.stick_figure(x, 760, rng, s=1.45, pose=pose)
            for i, wrapped in enumerate(textwrap.wrap(line, 29)):
                body += fig.text(x, 280 + i * 58, wrapped, size=38, anchor="middle")
        body += fig.text(90, 840, f"reppit / day {day} / {part}", size=22)
        html = out / f"{name}.html"
        png = out / f"{name}.png"
        asset = row.get("assets", [None] * len(row["posts"]))[part - 1]
        if asset:
            source = ROOT / asset
            if not source.is_file():
                raise SystemExit(f"Day {day} post {part}: missing asset {asset}")
            if not png.exists() or png.stat().st_mtime < max(source.stat().st_mtime, (ROOT / "bip/campaign.json").stat().st_mtime):
                shutil.copyfile(source, png)
        else:
            html.write_text(fig.build_html(name, body, fig.font_css()))
            if not png.exists() or png.stat().st_mtime < (ROOT / "bip/campaign.json").stat().st_mtime:
                fig.render(str(html), str(png))
        pages.append(f'<article><h2>Day {day}: {fig.esc(row["title"])} ({part}/2)</h2><pre>{fig.esc(post)}</pre><img src="{name}.png" alt="{fig.esc(" / ".join(dialogue))}"></article>')
(out / "index.html").write_text('<!doctype html><meta charset="utf-8"><title>reppit campaign review</title><style>body{font:18px system-ui;max-width:1000px;margin:40px auto;background:#faf9f6;color:#222}article{padding:24px;margin:24px 0;background:white;border:1px solid #ccc}pre{white-space:pre-wrap;font:inherit;line-height:1.6}img{width:100%}</style><h1>reppit: 20 nights</h1><p>Review copy and images before activating the schedule.</p>' + ''.join(pages))
print(f"Prepared {len(pages)} posts. Review: {out / 'index.html'}")
