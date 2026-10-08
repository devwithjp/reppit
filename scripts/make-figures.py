#!/usr/bin/env python3
"""
make-figures.py -- generative hand-drawn (Wait But Why style) SVG figures.

Emits one standalone HTML file per figure into docs/figures/ and rasterises
each to docs/screenshots/<name>.png with headless Chrome.

Standard library only. Fonts are embedded as base64 data URIs, so rendering
is fully offline. All randomness is seeded, so output is deterministic.

Usage:
    python3 scripts/make-figures.py
    python3 scripts/make-figures.py --only f4-the-mismatch
    python3 scripts/make-figures.py --no-render
"""

import argparse
import base64
import math
import os
import shutil
import subprocess
import sys

# --------------------------------------------------------------------------
# paths
# --------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIG_DIR = os.path.join(ROOT, "docs", "figures")
FONT_DIR = os.path.join(FIG_DIR, "fonts")
SHOT_DIR = os.path.join(ROOT, "docs", "screenshots")

W, H = 1600, 900

# --------------------------------------------------------------------------
# palette
# --------------------------------------------------------------------------

# xkcd is monochrome: one black ink, one white ground, no accents at all.
# The accent names survive so the figure code reads the same, but they all
# resolve to the same ink -- emphasis comes from arrangement, not colour.
INK = "#000000"
INK_SOFT = "#000000"
PAPER = "#ffffff"
AMBER = "#000000"
RED = "#000000"
BLUE = "#000000"
BLUE_SOFT = "#000000"
# "soft" fills are now simply no fill -- nothing is tinted
AMBER_SOFT = "none"
RED_SOFT = "none"
WHITE = "#ffffff"

# one confident pass, one even line weight
INK_W = 2.0          # nominal stroke width at the 1600x900 canvas
WOBBLE = 0.55        # xkcd is loose, not scratchy
UPPERCASE = True

# the real xkcd Script hand (OFL, github.com/ipython/xkcd-font), with
# Patrick Hand in caps as the fallback if it ever fails to load
XKCD = "'XKCDScript','PatrickHand',cursive"
PATRICK = XKCD
CAVEAT = XKCD
KALAM = XKCD


# --------------------------------------------------------------------------
# seeded PRNG (LCG -- small, deterministic, no dependency on random module
# internals changing across Python versions)
# --------------------------------------------------------------------------


class Rng:
    def __init__(self, seed):
        self.s = (int(seed) ^ 0x9E3779B9) & 0xFFFFFFFF
        if self.s == 0:
            self.s = 0x12345
        for _ in range(8):
            self.next()

    def next(self):
        # numerical recipes LCG
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0

    def uniform(self, a, b):
        return a + (b - a) * self.next()

    def pick(self, seq):
        return seq[int(self.next() * len(seq)) % len(seq)]


def name_seed(name):
    """Stable hash -- Python's hash() is randomised per-process, so roll our own."""
    h = 2166136261
    for ch in name:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


# --------------------------------------------------------------------------
# geometry helpers
# --------------------------------------------------------------------------


def _dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _resample(points, closed, step):
    """Subdivide a polyline into roughly `step`-long segments."""
    pts = list(points)
    if closed and pts[0] != pts[-1]:
        pts = pts + [pts[0]]
    out = []
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        d = _dist(a, b)
        n = max(1, int(round(d / step)))
        for k in range(n):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    out.append(pts[-1])
    return out


def _wobble(points, closed, amp, rng, step=26.0):
    """Offset each resampled point perpendicular to the local direction."""
    pts = _resample(points, closed, step)
    n = len(pts)
    out = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        # ends wobble less so joins stay tight
        edge = 1.0
        if not closed:
            edge = min(1.0, 0.35 + 1.6 * min(i, n - 1 - i) / max(1.0, n - 1))
        o = rng.uniform(-amp, amp) * edge
        t = rng.uniform(-amp, amp) * 0.35 * edge
        out.append((p[0] + nx * o + dx / L * t, p[1] + ny * o + dy / L * t))
    if closed:
        out[-1] = out[0]
    return out


def _catmull(points, closed=False):
    """Catmull-Rom through points -> cubic bezier `d` string (smooth wobble)."""
    p = list(points)
    if len(p) < 2:
        return ""
    if closed:
        pts = [p[-2]] + p + [p[1]]
    else:
        pts = [p[0]] + p + [p[-1]]
    d = "M %.2f %.2f" % (p[0][0], p[0][1])
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d += " C %.2f %.2f %.2f %.2f %.2f %.2f" % (
            c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    if closed:
        d += " Z"
    return d


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


# --------------------------------------------------------------------------
# rough primitives -- every shape drawn twice with different offsets
# --------------------------------------------------------------------------


def rough_path(points, rng, closed=False, amp=1.9, sw=2.8, color=INK,
               passes=1, fill="none", fill_opacity=1.0, step=26.0,
               opacity=1.0, dash=None, smooth=True):
    """Core primitive: a wobbly polyline/polygon, drawn in ONE pass.

    xkcd does not have the sketched, gone-over-twice look -- it is a single
    confident line of near-constant weight. `sw` survives as a hint: anything
    heavy (ticks, crosses, the panel frame) gets a slightly fatter nib, and
    everything else draws at the nominal weight.
    """
    out = []
    amp = amp * WOBBLE
    if fill != "none":
        base = _wobble(points, True, amp * 0.7, rng, step)
        out.append(
            '<path d="%s" fill="%s" fill-opacity="%.3f" stroke="none"/>'
            % (_catmull(base, True), fill, fill_opacity))
    nib = INK_W * (1.3 if sw > 4.0 else 1.0)
    for i in range(passes):
        w = nib * (1.0 + rng.uniform(-0.06, 0.06))
        pts = _wobble(points, closed, amp, rng, step)
        op = opacity
        if smooth:
            d = _catmull(pts, closed)
        else:
            d = "M " + " L ".join("%.2f %.2f" % q for q in pts)
            if closed:
                d += " Z"
        extra = ' stroke-dasharray="%s"' % dash if dash else ""
        out.append(
            '<path d="%s" fill="none" stroke="%s" stroke-width="%.2f" '
            'stroke-linecap="round" stroke-linejoin="round" '
            'stroke-opacity="%.3f"%s/>' % (d, color, w, op, extra))
    return "".join(out)


def rough_line(x1, y1, x2, y2, rng, **kw):
    return rough_path([(x1, y1), (x2, y2)], rng, closed=False, **kw)


def rough_rect(x, y, w, h, rng, r=0, **kw):
    """Wobbly rectangle; r rounds the corners a little."""
    if r <= 0:
        pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    else:
        r = min(r, w / 2, h / 2)
        pts = []
        corners = [(x + r, y + r, 180, 270), (x + w - r, y + r, 270, 360),
                   (x + w - r, y + h - r, 0, 90), (x + r, y + h - r, 90, 180)]
        for cx, cy, a0, a1 in corners:
            for k in range(5):
                a = math.radians(a0 + (a1 - a0) * k / 4.0)
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return rough_path(pts, rng, closed=True, **kw)


def rough_ellipse(cx, cy, rx, ry, rng, n=30, start=0.0, sweep=None, **kw):
    sweep = 2 * math.pi if sweep is None else sweep
    closed = abs(sweep - 2 * math.pi) < 1e-6
    pts = []
    for i in range(n + 1):
        a = start + sweep * i / n
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    if closed:
        pts = pts[:-1]
    return rough_path(pts, rng, closed=closed, step=22.0, **kw)


def arrow_head(x, y, ang, rng, size=20, color=INK, sw=3.0):
    """Two short strokes forming an open arrowhead at (x,y) pointing along ang."""
    s = ""
    for d in (0.46, -0.46):
        a = ang + math.pi + d
        s += rough_line(x, y, x + size * math.cos(a), y + size * math.sin(a),
                        rng, sw=sw, color=color, amp=1.0, step=14.0)
    return s


def rough_arrow(points, rng, size=20, color=INK, sw=3.0, amp=1.8, head=True,
                step=26.0, dash=None):
    """Wobbly arrow along a polyline, arrowhead at the final point."""
    s = rough_path(points, rng, sw=sw, color=color, amp=amp, step=step, dash=dash)
    if head:
        a, b = points[-2], points[-1]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        s += arrow_head(b[0], b[1], ang, rng, size=size, color=color, sw=sw)
    return s


def curve_pts(p0, p1, p2, n=14):
    """Quadratic bezier sampled to points -- for curved arrows."""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return out


# --------------------------------------------------------------------------
# text
# --------------------------------------------------------------------------


def text(x, y, s, rng=None, size=40, family=PATRICK, color=INK, anchor="start",
         rot=0.0, opacity=1.0, letter=None, upper=None):
    """Hand lettering. xkcd letters in caps, with a little air between them."""
    if (UPPERCASE if upper is None else upper):
        s = s.upper()
    if letter is None:
        letter = size * 0.025
    tf = ""
    if abs(rot) > 1e-6:
        tf = ' transform="rotate(%.2f %.1f %.1f)"' % (rot, x, y)
    ls = ' letter-spacing="%.2f"' % letter if letter else ""
    return ('<text x="%.1f" y="%.1f" font-family="%s" font-size="%.1f" '
            'fill="%s" text-anchor="%s" fill-opacity="%.3f"%s%s>%s</text>'
            % (x, y, family, size, color, anchor, opacity, ls, tf, esc(s)))


def tw(s, size, family=PATRICK):
    """Rough width estimate for xkcd Script set in caps (measured, ~0.50em)."""
    return len(s) * size * 0.50


def underline(x, y, w, rng, color=INK, sw=3.4, amp=2.4, double=False):
    s = rough_line(x, y, x + w, y, rng, sw=sw, color=color, amp=amp, step=30.0)
    if double:
        s += rough_line(x + 8, y + 7, x + w - 10, y + 7, rng, sw=sw * 0.8,
                        color=color, amp=amp, step=34.0, opacity=0.75)
    return s


def title(s, rng, x=78, y=118, size=56, color=INK, rot=-0.6, family=PATRICK,
          ul_color=None):
    """Panel title: caps, top-left, no rule under it."""
    return text(x, y, s, size=size, family=family, color=color, rot=rot)


def panel_frame(rng):
    """Thin black border, like a comic cell."""
    return rough_rect(26, 26, W - 52, H - 52, rng, r=0, sw=5.0, color=INK,
                      amp=1.0, step=46.0, smooth=False)


def circle_emphasis(cx, cy, rx, ry, rng, color=AMBER, sw=3.6, laps=1):
    """Hand-drawn circle-for-emphasis -- overshoots, drawn round twice."""
    s = ""
    for i in range(laps):
        st = -0.35 + i * 0.5
        s += rough_ellipse(cx, cy, rx * (1 + 0.03 * i), ry * (1 + 0.04 * i), rng,
                           n=26, start=st, sweep=2 * math.pi + 0.55,
                           sw=sw, color=color, amp=2.6, passes=1,
                           opacity=0.95 if i == 0 else 0.7)
    return s


# --------------------------------------------------------------------------
# icon primitives
# --------------------------------------------------------------------------


def tick(cx, cy, rng, s=1.0, color=AMBER, sw=5.0):
    pts = [(cx - 26 * s, cy + 0 * s), (cx - 8 * s, cy + 22 * s),
           (cx + 30 * s, cy - 28 * s)]
    return rough_path(pts, rng, sw=sw, color=color, amp=1.6, step=16.0)


def cross(cx, cy, rng, s=1.0, color=RED, sw=5.0):
    r = 26 * s
    out = rough_line(cx - r, cy - r, cx + r, cy + r, rng, sw=sw, color=color,
                     amp=1.6, step=16.0)
    out += rough_line(cx + r, cy - r, cx - r, cy + r, rng, sw=sw, color=color,
                      amp=1.6, step=16.0)
    return out


def star(cx, cy, r, rng, color=AMBER, fill=None, sw=3.0, rot=-90):
    pts = []
    for i in range(10):
        a = math.radians(rot + i * 36)
        rr = r if i % 2 == 0 else r * 0.44
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return rough_path(pts, rng, closed=True, sw=sw, color=color, amp=1.3,
                      step=14.0, fill=fill or "none",
                      fill_opacity=0.55 if fill else 1.0)


def cursor(x, y, rng, s=1.0, color=INK, rot=0.0):
    pts = [(0, 0), (0, 46), (12, 34), (20, 54), (30, 49), (22, 30), (37, 29)]
    pts = [(x + px * s, y + py * s) for px, py in pts]
    g = rough_path(pts, rng, closed=True, sw=2.6, color=color, amp=1.0,
                   step=12.0, fill=PAPER)
    if abs(rot) > 1e-6:
        g = '<g transform="rotate(%.1f %.1f %.1f)">%s</g>' % (rot, x, y, g)
    return g


def cobweb(x, y, rng, s=1.0, corner="tl", color=BLUE, sw=2.0):
    """Corner cobweb: radial threads plus sagging arcs."""
    sx = 1 if corner in ("tl", "bl") else -1
    sy = 1 if corner in ("tl", "tr") else -1
    g = ""
    angs = [0.12, 0.42, 0.78, 1.14, 1.45]
    R = 125 * s
    for a in angs:
        g += rough_line(x, y, x + sx * R * math.cos(a), y + sy * R * math.sin(a),
                        rng, sw=sw, color=color, amp=1.2, step=24.0,
                        opacity=0.85, passes=1)
    for k in (0.42, 0.68, 0.95):
        pts = []
        for a in angs:
            rr = R * k * rng.uniform(0.93, 1.07)
            pts.append((x + sx * rr * math.cos(a), y + sy * rr * math.sin(a)))
        g += rough_path(pts, rng, sw=sw, color=color, amp=1.4, step=20.0,
                        opacity=0.8, passes=1)
    return g


# --------------------------------------------------------------------------
# stick figures
# --------------------------------------------------------------------------

# local coords: feet at y=0, standing head top near y=-218
HIP = (0, -78)
SHOULDER = (0, -150)


def _face(hc, r, rng, mood="neutral", look=0.0, color=INK):
    """Two dot eyes and one mouth line whose curve carries the mood."""
    cx, cy = hc
    ex = 11.5
    ey = cy - 7
    g = ""
    for sx in (-1, 1):
        px = cx + sx * ex + look * 7
        g += ('<circle cx="%.1f" cy="%.1f" r="3.4" fill="%s"/>'
              % (px, ey, color))
    # mouth
    mw = 24
    my = cy + 13
    curve = {"happy": 9.0, "neutral": 0.0, "flat": 0.0, "sad": -8.0,
             "worried": -5.0, "open": 6.0}.get(mood, 0.0)
    mx = cx + look * 5
    pts = [(mx - mw / 2, my), (mx, my + curve), (mx + mw / 2, my)]
    if mood == "worried":
        pts = [(mx - mw / 2, my + 3), (mx - mw / 6, my - 3),
               (mx + mw / 6, my + 4), (mx + mw / 2, my - 2)]
    g += rough_path(pts, rng, sw=2.6, color=color, amp=0.9, step=12.0)
    return g


def stick_figure(x, y, rng, s=1.0, pose="standing", mood="neutral", rot=0.0,
                 color=INK, look=0.0, sw=3.2, flip=False, face=False):
    """Circle head, wobbly body, two arms, two legs. Returns a transformed <g>."""
    hip, sh = HIP, SHOULDER
    neck = (0, -152)
    hc = (0, -184)
    r = 31

    if pose == "sitting":
        # seated: hips up at seat height, legs folded forward, torso upright
        hip = (0, -96)
        neck, hc = (10, -182), (16, -216)
        sh = (3, -176)
        legs = [[hip, (68, -100), (74, -6)], [hip, (58, -90), (64, -6)]]
        arms = [[sh, (56, -150), (110, -110)], [(4, -172), (60, -152), (106, -116)]]
        body = [hip, (5, -140), neck]
    elif pose == "pointing":
        legs = [[hip, (-34, 0)], [hip, (30, 0)]]
        arms = [[sh, (46, -176), (96, -186)], [sh, (-40, -112), (-46, -74)]]
        body = [hip, (0, -116), neck]
    elif pose == "shrugging":
        legs = [[hip, (-34, 0)], [hip, (34, 0)]]
        arms = [[sh, (-48, -148), (-58, -188)], [sh, (48, -148), (58, -188)]]
        body = [hip, (0, -116), neck]
    elif pose == "slumped":
        neck, hc = (13, -144), (20, -176)
        legs = [[hip, (-30, 0)], [hip, (32, 0)]]
        arms = [[sh, (-38, -112), (-34, -66)], [sh, (40, -110), (46, -64)]]
        body = [hip, (7, -112), neck]
    elif pose == "peering":  # leaning forward, hands on knees-ish
        neck, hc = (12, -150), (19, -182)
        legs = [[hip, (-32, 0)], [hip, (30, 0)]]
        arms = [[sh, (44, -132), (86, -142)], [sh, (-36, -116), (-40, -78)]]
        body = [hip, (5, -116), neck]
    else:  # standing
        legs = [[hip, (-34, 0)], [hip, (34, 0)]]
        arms = [[sh, (-44, -112), (-50, -72)], [sh, (44, -112), (50, -72)]]
        body = [hip, (0, -116), neck]

    g = ""
    g += rough_ellipse(hc[0], hc[1], r, r * 1.03, rng, n=22, sw=sw, color=color,
                       amp=1.5)
    g += rough_path(body, rng, sw=sw, color=color, amp=1.6, step=22.0)
    for limb in legs + arms:
        g += rough_path(limb, rng, sw=sw, color=color, amp=1.5, step=22.0)
    if face:
        # at most two dots -- never an expression
        for sx in (-1, 1):
            g += ('<circle cx="%.1f" cy="%.1f" r="3.2" fill="%s"/>'
                  % (hc[0] + sx * 11.5 + look * 7, hc[1] - 7, color))

    tf = "translate(%.1f %.1f)" % (x, y)
    if abs(rot) > 1e-6:
        tf += " rotate(%.2f)" % rot
    if abs(s - 1.0) > 1e-6 or flip:
        tf += " scale(%.4f %.4f)" % (-s if flip else s, s)
    return '<g transform="%s">%s</g>' % (tf, g)


# --------------------------------------------------------------------------
# bubbles
# --------------------------------------------------------------------------


def _cloud_pts(cx, cy, rx, ry, rng, lobes=13, n=120):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        bump = 1.0 + 0.085 * math.sin(lobes * a + 0.7)
        pts.append((cx + rx * bump * math.cos(a), cy + ry * bump * math.sin(a)))
    return pts


def thought_bubble(cx, cy, lines, rng, size=44, family=PATRICK, color=INK,
                   tail_to=None, pad_x=70, pad_y=52, line_h=None, rx=None,
                   ry=None, align="center", fill=PAPER, lobes=13):
    line_h = line_h or size * 1.26
    wmax = max([tw(l, size, family) for l in lines] or [0])
    rx = rx or max(150, wmax / 2 + pad_x)
    ry = ry or max(90, len(lines) * line_h / 2 + pad_y)
    pts = _cloud_pts(cx, cy, rx, ry, rng, lobes=lobes)
    g = rough_path(pts, rng, closed=True, sw=2.9, color=color, amp=1.7,
                   step=26.0, fill=fill, fill_opacity=0.92)
    y0 = cy - (len(lines) - 1) * line_h / 2 + size * 0.34
    for i, l in enumerate(lines):
        if align == "center":
            g += text(cx, y0 + i * line_h, l, size=size, family=family,
                      color=color, anchor="middle")
        else:
            g += text(cx - rx + pad_x, y0 + i * line_h, l, size=size,
                      family=family, color=color, anchor="start")
    if tail_to:
        tx, ty = tail_to
        dx, dy = tx - cx, ty - cy
        L = math.hypot(dx, dy) or 1
        ux, uy = dx / L, dy / L
        # start just outside the cloud edge
        er = (rx * ry) / math.hypot(ry * ux, rx * uy)
        for k, rr in ((0.30, 15), (0.58, 10.5), (0.84, 6.5)):
            px = cx + ux * (er + (L - er) * k)
            py = cy + uy * (er + (L - er) * k)
            g += rough_ellipse(px, py, rr, rr * 1.05, rng, n=14, sw=2.6,
                               color=color, amp=1.1, fill=fill,
                               fill_opacity=0.92)
    return g


def speech_bubble(cx, cy, lines, rng, size=44, family=PATRICK, color=INK,
                  tail_to=None, pad_x=46, pad_y=36, line_h=None, fill=PAPER,
                  r=28, align="center"):
    line_h = line_h or size * 1.26
    wmax = max(tw(l, size, family) for l in lines)
    w = wmax + pad_x * 2
    h = len(lines) * line_h + pad_y * 2
    x, y = cx - w / 2, cy - h / 2
    g = rough_rect(x, y, w, h, rng, r=r, sw=2.9, color=color, amp=1.7,
                   step=26.0, fill=fill, fill_opacity=0.94)
    if tail_to:
        tx, ty = tail_to
        # anchor the tail on the nearest edge
        ax = min(max(tx, x + w * 0.2), x + w * 0.8)
        ay = y + h if ty > cy else y
        g += rough_path([(ax - 26, ay), (tx, ty), (ax + 24, ay)], rng, sw=2.9,
                        color=color, amp=1.3, step=20.0, fill=fill,
                        fill_opacity=0.94)
        # patch the edge the tail grows out of
        g += rough_line(ax - 27, ay, ax + 25, ay, rng, sw=3.4, color=fill,
                        amp=0.5, step=24.0, passes=1)
    y0 = cy - (len(lines) - 1) * line_h / 2 + size * 0.34
    for i, l in enumerate(lines):
        if align == "center":
            g += text(cx, y0 + i * line_h, l, size=size, family=family,
                      color=color, anchor="middle")
        else:
            g += text(x + pad_x, y0 + i * line_h, l, size=size, family=family,
                      color=color, anchor="start")
    return g


# --------------------------------------------------------------------------
# props
# --------------------------------------------------------------------------


def laptop(x, y, rng, s=1.0, rot=0.0, color=INK):
    """Side-ish view laptop sitting on a surface; (x,y) is the base front-left."""
    g = ""
    g += rough_path([(0, 0), (168, 0), (150, -12), (-14, -12)], rng, closed=True,
                    sw=3.0, color=color, amp=1.4, step=22.0, fill=WHITE)
    g += rough_path([(-12, -12), (2, -116), (128, -116), (148, -12)], rng,
                    closed=True, sw=3.0, color=color, amp=1.5, step=24.0,
                    fill=WHITE)
    for i in range(4):
        yy = -36 - i * 20
        g += rough_line(16, yy, 118 - i * 3, yy, rng, sw=2.0, color=BLUE,
                        amp=1.0, step=26.0, passes=1, opacity=0.7)
    tf = "translate(%.1f %.1f)" % (x, y)
    if abs(rot) > 1e-6:
        tf += " rotate(%.2f)" % rot
    if abs(s - 1.0) > 1e-6:
        tf += " scale(%.4f)" % s
    return '<g transform="%s">%s</g>' % (tf, g)


def robot(x, y, rng, s=1.0, rot=0.0, color=INK):
    """Small boxy robot standing on the ground at (x,y)."""
    g = ""
    g += rough_line(0, -96, 0, -126, rng, sw=2.8, color=color, amp=1.1, step=18.0)
    g += rough_ellipse(0, -134, 9, 9, rng, n=12, sw=2.8, color=color, amp=1.0,
                       fill=AMBER, fill_opacity=0.8)
    g += rough_rect(-46, -96, 92, 72, rng, r=14, sw=3.1, color=color, amp=1.5,
                    fill=WHITE)
    for sx in (-19, 19):
        g += ('<circle cx="%.1f" cy="%.1f" r="5.6" fill="%s"/>' % (sx, -68, color))
    g += rough_path([(-20, -44), (-6, -38), (8, -44), (20, -38)], rng, sw=2.5,
                    color=color, amp=1.0, step=12.0)
    g += rough_rect(-36, -20, 72, 62, rng, r=10, sw=3.1, color=color, amp=1.5,
                    fill=WHITE)
    g += rough_rect(-18, -6, 36, 26, rng, r=5, sw=2.3, color=BLUE, amp=1.1)
    g += rough_path([(-36, -8), (-64, -2), (-66, 26)], rng, sw=3.0, color=color,
                    amp=1.3, step=20.0)
    g += rough_path([(36, -8), (64, -4), (68, 22)], rng, sw=3.0, color=color,
                    amp=1.3, step=20.0)
    for sx in (-20, 20):
        g += rough_line(sx, 42, sx, 66, rng, sw=3.0, color=color, amp=1.1,
                        step=18.0)
        g += rough_line(sx - 13, 66, sx + 13, 66, rng, sw=3.0, color=color,
                        amp=1.0, step=18.0)
    tf = "translate(%.1f %.1f)" % (x, y - 66 * s)
    if abs(rot) > 1e-6:
        tf += " rotate(%.2f)" % rot
    if abs(s - 1.0) > 1e-6:
        tf += " scale(%.4f)" % s
    return '<g transform="%s">%s</g>' % (tf, g)


def browser_window(x, y, w, h, rng, rot=0.0, color=INK):
    g = rough_rect(0, 0, w, h, rng, r=12, sw=3.2, color=color, amp=1.8,
                   step=30.0, fill=WHITE, fill_opacity=0.72)
    g += rough_line(0, 56, w, 56, rng, sw=2.8, color=color, amp=1.5, step=30.0)
    for i in range(3):
        g += rough_ellipse(30 + i * 30, 28, 9, 9, rng, n=12, sw=2.4, color=BLUE,
                           amp=1.0)
    g += rough_rect(120, 12, w - 160, 32, rng, r=14, sw=2.2, color=BLUE_SOFT,
                    amp=1.2, step=30.0, passes=1)
    tf = "translate(%.1f %.1f)" % (x, y)
    if abs(rot) > 1e-6:
        tf += " rotate(%.2f)" % rot
    return '<g transform="%s">%s</g>' % (tf, g)


def gravestone(x, y, rng, s=1.0, rot=0.0, color=INK):
    pts = [(-52, 0), (-52, -64)]
    for i in range(13):
        a = math.pi * (1 + i / 12.0)
        pts.append((52 * math.cos(a), -64 + 52 * math.sin(a)))
    pts.append((52, 0))
    g = rough_path(pts, rng, closed=True, sw=3.2, color=color, amp=1.6,
                   step=22.0, fill=WHITE)
    g += rough_line(-30, -78, 30, -78, rng, sw=3.0, color=color, amp=1.2,
                    step=20.0)
    g += rough_line(0, -108, 0, -54, rng, sw=3.0, color=color, amp=1.2, step=20.0)
    g += rough_line(-66, 2, 70, 2, rng, sw=3.0, color=color, amp=1.6, step=26.0)
    tf = "translate(%.1f %.1f)" % (x, y)
    if abs(rot) > 1e-6:
        tf += " rotate(%.2f)" % rot
    if abs(s - 1.0) > 1e-6:
        tf += " scale(%.4f)" % s
    return '<g transform="%s">%s</g>' % (tf, g)


def heartbeat(x, y, w, rng, color=AMBER, sw=4.0, amp=1.3):
    u = w / 10.0
    pts = [(x, y), (x + 2 * u, y), (x + 2.8 * u, y - 34), (x + 3.6 * u, y + 30),
           (x + 4.4 * u, y - 52), (x + 5.2 * u, y + 18), (x + 6.0 * u, y),
           (x + 10 * u, y)]
    return rough_path(pts, rng, sw=sw, color=color, amp=amp, step=18.0)


def box_label(x, y, w, h, lines, rng, size=40, color=INK, fill=None,
              fill_opacity=0.35, r=16, sw=3.2, rot=0.0, family=PATRICK,
              amp=2.0):
    g = rough_rect(0, 0, w, h, rng, r=r, sw=sw, color=color, amp=amp, step=30.0,
                   fill=fill or "none", fill_opacity=fill_opacity)
    lh = size * 1.18
    y0 = h / 2 - (len(lines) - 1) * lh / 2 + size * 0.34
    for i, l in enumerate(lines):
        g += text(w / 2, y0 + i * lh, l, size=size, family=family, color=color,
                  anchor="middle")
    tf = "translate(%.1f %.1f)" % (x, y)
    if abs(rot) > 1e-6:
        tf += " rotate(%.2f %.1f %.1f)" % (rot, w / 2, h / 2)
    return '<g transform="%s">%s</g>' % (tf, g)


# --------------------------------------------------------------------------
# the nine figures
# --------------------------------------------------------------------------


def f1_the_moment(rng):
    g = title("Every day now", rng)

    GROUND = 812
    PX, PS = 368, 1.3             # person x / scale
    DTOP = 672                    # desk surface
    DX, DW = 486, 530

    # stool, behind the person -- explains the seated pose
    g += rough_line(PX - 76, GROUND - 126, PX + 58, GROUND - 130, rng, sw=3.2,
                    amp=1.5, step=30.0)
    g += rough_line(PX - 64, GROUND - 126, PX - 72, GROUND, rng, sw=2.8,
                    amp=1.3, step=30.0)
    g += rough_line(PX + 44, GROUND - 128, PX + 52, GROUND, rng, sw=2.8,
                    amp=1.3, step=30.0)

    # person, seated, facing the laptop
    g += stick_figure(PX, GROUND, rng, s=PS, pose="sitting", look=0.6,
                      face=True)

    # desk drawn over the legs so they read as passing underneath
    g += rough_rect(DX, DTOP, DW, 20, rng, r=4, sw=3.2, amp=1.8, step=34.0,
                    fill=WHITE, fill_opacity=1.0)
    g += rough_line(DX + 44, DTOP + 20, DX + 36, GROUND, rng, sw=3.0, amp=1.5,
                    step=32.0)
    g += rough_line(DX + DW - 46, DTOP + 20, DX + DW - 38, GROUND, rng, sw=3.0,
                    amp=1.5, step=32.0)
    g += laptop(DX + 24, DTOP + 2, rng, s=0.92, rot=-1.2)

    g += rough_line(170, GROUND + 6, 1430, GROUND + 6, rng, sw=2.6,
                    color=BLUE_SOFT, amp=2.0, step=48.0, passes=1, opacity=0.8)

    # robot
    g += robot(1200, GROUND, rng, s=1.18, rot=1.2)

    # robot speech bubble
    lines = ["I'll use quickxml-parse", "for this."]
    bcx, bcy, bsize = 1156, 272, 48
    g += speech_bubble(bcx, bcy, lines, rng, size=bsize, color=INK,
                       tail_to=(1194, 548), pad_x=48, pad_y=34)
    lh = bsize * 1.26
    base = bcy - lh / 2 + bsize * 0.34
    w1 = tw(lines[0], bsize)
    lx = bcx - w1 / 2 + (len("I'll use ") / len(lines[0])) * w1
    g += rough_line(lx, base + 16, bcx + w1 / 2, base + 16, rng, sw=3.4,
                    color=AMBER, amp=2.0, step=30.0)

    # person's thought bubble
    g += thought_bubble(374, 250, ["...is that good?"], rng, size=52,
                        family=CAVEAT, tail_to=(384, 512), lobes=11)
    return g


def f2_the_only_check(rng):
    g = title("So you check", rng)

    bw, bh = 760, 400
    bx, by = 690, 238
    g += browser_window(bx, by, bw, bh, rng, rot=-1.0)
    g += '<g transform="rotate(-1.0 %.1f %.1f)">' % (bx, by)
    g += star(bx + 148, by + 236, 58, rng, color=AMBER, fill=AMBER_SOFT, sw=3.4)
    g += text(bx + 232, by + 262, "12,000", rng, size=116, color=INK)
    g += text(bx + 234, by + 352, "stars", rng, size=70, color=INK_SOFT)
    g += text(bx + 40, by + 112, "some-org / xml-thing", rng, size=42,
              color=INK_SOFT)
    g += "</g>"

    # person peering at the screen
    g += stick_figure(310, 800, rng, s=1.2, pose="peering", look=0.7, rot=1.0,
                      face=True)
    g += thought_bubble(300, 300, ["Fine.", "Good enough."], rng, size=52,
                        family=CAVEAT, tail_to=(338, 534), lobes=11)

    # aside
    g += text(694, 806, "this is the entire quality check", rng, size=44,
              color=INK, rot=-1.6)
    g += rough_arrow(curve_pts((1310, 756), (1352, 624), (1198, 512)), rng,
                     sw=3.0, color=INK, size=24, amp=1.6)
    return g


def f3_what_a_star_is(rng):
    g = title("What a star actually is", rng)

    ty = 556
    g += rough_arrow([(130, ty), (1500, ty)], rng, sw=4.0, size=24, amp=2.6,
                     step=48.0)

    marks = [(350, "2019"), (830, "2021"), (1290, "2026")]
    for mx, lab in marks:
        g += rough_line(mx, ty - 22, mx, ty + 22, rng, sw=3.4, amp=1.5, step=20.0)
        g += text(mx, ty + 88, lab, rng, size=56, anchor="middle", color=INK)

    # 2019 -- someone clicks a star on a lunch break
    g += stick_figure(262, ty - 14, rng, s=0.86, pose="pointing", mood="happy",
                      look=0.4, rot=-1.5, sw=3.4)
    g += star(430, ty - 246, 52, rng, color=AMBER, fill=AMBER_SOFT, sw=3.2)
    g += cursor(470, ty - 230, rng, s=0.95, rot=12)
    g += text(350, ty + 146, "on a lunch break", rng, size=46, family=CAVEAT,
              color=INK_SOFT, anchor="middle", rot=-1.5)

    # 2021 -- repo dies
    g += gravestone(830, ty - 22, rng, s=1.42, rot=2.0, color=RED)
    g += text(830, ty + 146, "repo dies", rng, size=46, family=CAVEAT,
              color=RED, anchor="middle", rot=1.5)

    # 2026 -- the star is still sitting there
    g += star(1290, ty - 186, 74, rng, color=AMBER, fill=AMBER_SOFT, sw=3.6)
    g += circle_emphasis(1290, ty - 186, 114, 110, rng, color=AMBER, sw=3.2)
    g += text(1290, ty + 146, "star: still there", rng, size=46, family=CAVEAT,
              color=AMBER, anchor="middle", rot=-1.0)

    g += text(800, 836, "nothing ever takes it back", rng, size=48,
              family=CAVEAT, color=INK_SOFT, anchor="middle", rot=-0.8)
    return g


def f4_the_mismatch(rng):
    g = title("The problem", rng)

    cy, chh = 196, 400
    # LEFT: dead repo
    g += box_label(120, cy, 590, chh, [], rng, color=RED, fill=RED_SOFT,
                   fill_opacity=0.10, r=18, sw=3.4, rot=-1.1)
    g += '<g transform="rotate(-1.1 415 429)">'
    g += text(415, cy + 110, "40,000 stars", rng, size=62, anchor="middle",
              color=RED)
    g += text(415, cy + 182, "last commit: 3 years ago", rng, size=40,
              anchor="middle", color=INK_SOFT)
    g += box_label(238, cy + 248, 354, 100, ["ARCHIVED"], rng, size=56, color=RED,
                   fill=RED_SOFT, fill_opacity=0.22, r=10, sw=3.6, rot=-3.0)
    g += cobweb(142, cy + 20, rng, s=0.62, corner="tl", color=BLUE)
    g += cobweb(698, cy + chh - 14, rng, s=0.62, corner="br", color=BLUE)
    g += "</g>"

    # RIGHT: alive repo
    g += box_label(890, cy, 590, chh, [], rng, color=AMBER, fill=AMBER_SOFT,
                   fill_opacity=0.16, r=18, sw=3.4, rot=1.0)
    g += '<g transform="rotate(1.0 1185 429)">'
    g += text(1185, cy + 110, "300 stars", rng, size=62, anchor="middle",
              color=AMBER)
    g += text(1185, cy + 182, "updated Tuesday", rng, size=40, anchor="middle",
              color=INK)
    g += heartbeat(960, cy + 312, 450, rng, color=AMBER, sw=4.4)
    g += "</g>"

    g += text(800, cy + 220, "vs", rng, size=64, color=INK,
              anchor="middle", rot=-3.0)

    # the arrangement does the work: both repos placed on one dead/alive axis
    axy = 680
    g += rough_arrow([(150, axy), (1450, axy)], rng, sw=3.0, size=22, amp=1.6,
                     step=56.0)
    for mxp, lab in ((415, "dead"), (1185, "alive")):
        g += rough_line(mxp, axy - 18, mxp, axy + 18, rng, sw=3.0, amp=1.2,
                        step=20.0)
        g += text(mxp, axy + 68, lab, rng, size=48, anchor="middle")

    msg = "every tool you use ranks the dead one first"
    g += text(800, 840, msg, rng, size=46, color=INK, anchor="middle",
              rot=-0.5)
    return g


def f5_what_you_want(rng):
    g = title("What you actually want to know", rng)

    g += stick_figure(250, 852, rng, s=1.15, pose="shrugging", rot=-1.0,
                      face=True)

    lines = ["Does it still work?",
             "Did it break for anyone?",
             "Does it work in MY setup?"]
    cx, cy = 960, 440
    g += thought_bubble(cx, cy, [], rng, size=56, rx=560, ry=258, lobes=15,
                        tail_to=(330, 690))
    lh = 96
    y0 = cy - lh + 20
    for i, l in enumerate(lines):
        col = AMBER if i == 2 else INK
        g += text(cx, y0 + i * lh, l, rng, size=60, color=col, anchor="middle",
                  rot=-0.6 + i * 0.6)
    w3 = tw(lines[2], 60)
    g += rough_path(curve_pts((cx - w3 / 2, y0 + 2 * lh + 20),
                              (cx, y0 + 2 * lh + 32),
                              (cx + w3 / 2, y0 + 2 * lh + 16)), rng, sw=4.0,
                    color=AMBER, amp=2.4, step=36.0)
    g += text(820, 820, "none of this is a number", rng, size=46,
              color=INK, anchor="middle", rot=-0.6)
    return g


def f6_the_reason_tag(rng):
    g = title("Downvotes need a reason", rng)

    # big downvote arrow
    ax, ay = 306, 496
    pts = [(-52, -132), (52, -132), (52, -14), (104, -14), (0, 108),
           (-104, -14), (-52, -14)]
    pts = [(ax + p[0], ay + p[1]) for p in pts]
    g += rough_path(pts, rng, closed=True, sw=4.0, color=RED, amp=2.2, step=26.0,
                    fill=RED_SOFT, fill_opacity=0.22)
    g += cursor(ax + 34, ay + 44, rng, s=1.5, rot=-8)
    for k, (dx, dy) in enumerate([(-150, -40), (-146, 34), (150, -40), (146, 34)]):
        g += rough_line(ax + dx, ay + dy, ax + dx * 1.22, ay + dy * 1.22, rng,
                        sw=3.0, color=AMBER, amp=1.2, step=20.0, passes=1)
    g += text(ax, ay + 248, "click", rng, size=46, family=CAVEAT, color=INK_SOFT,
              anchor="middle", rot=-2.0)

    # popped-out menu
    mx, my, mw, mh = 700, 170, 762, 600
    g += box_label(mx, my, mw, mh, [], rng, color=INK, fill=WHITE,
                   fill_opacity=0.6, r=20, sw=3.4, rot=1.0)
    items = ["unmaintained", "insecure", "broken on an agent", "misleading",
             "low quality"]
    g += '<g transform="rotate(1.0 %.1f %.1f)">' % (mx + mw / 2, my + mh / 2)
    g += text(mx + 48, my + 74, "why?", rng, size=44, family=CAVEAT, color=AMBER)
    g += rough_line(mx + 46, my + 100, mx + mw - 64, my + 100, rng, sw=2.6,
                    color=INK_SOFT, amp=1.6, step=34.0, passes=1)
    for i, it in enumerate(items):
        iy = my + 190 + i * 92
        g += rough_rect(mx + 40, iy - 25, 28, 28, rng, r=5, sw=2.6,
                        color=INK_SOFT, amp=1.1, step=16.0)
        g += text(mx + 118, iy, it, rng, size=48, color=INK)
    # one circled by hand
    iy = my + 190 + 2 * 92
    g += circle_emphasis(mx + 344, iy - 14, 238, 46, rng, color=INK, sw=3.4)
    g += "</g>"

    g += rough_arrow(curve_pts((446, 404), (570, 312), (680, 330)), rng, sw=3.2,
                     color=INK_SOFT, size=22, amp=1.8)
    return g


def f7_number_vs_sentence(rng):
    g = title("One of these is useful", rng)

    bw, bh, by = 620, 338, 214
    # LEFT -- the number
    g += box_label(130, by, bw, bh, [], rng, color=INK, fill=None,
                   r=18, sw=3.4, rot=-1.2)
    g += '<g transform="rotate(-1.2 440 423)">'
    g += text(440, by + 148, "347 people", rng, size=72, anchor="middle",
              color=BLUE)
    g += text(440, by + 240, "downvoted this", rng, size=72, anchor="middle",
              color=BLUE)
    g += "</g>"


    # RIGHT -- the sentence
    g += box_label(850, by, bw, bh, [], rng, color=INK, fill=None,
                   r=18, sw=3.6, rot=1.1)
    g += '<g transform="rotate(1.1 1160 423)">'
    g += text(1160, by + 128, "9 people say", rng, size=66, anchor="middle",
              color=INK)
    g += text(1160, by + 208, "it is", rng, size=66, anchor="middle", color=INK)
    g += text(1160, by + 294, "unmaintained", rng, size=70, anchor="middle",
              color=AMBER)
    g += "</g>"

    # spectrum underneath -- the arrangement is the argument
    axy = 650
    g += rough_arrow([(150, axy), (1430, axy)], rng, sw=3.0, size=22, amp=1.6,
                     step=56.0)
    g += text(154, axy - 26, "useless", rng, size=40, anchor="start")
    g += text(1420, axy - 26, "useful", rng, size=40, anchor="end")
    for mxp, lab in ((440, "a number"), (1160, "a decision")):
        g += rough_line(mxp, axy - 18, mxp, axy + 18, rng, sw=3.0, amp=1.2,
                        step=20.0)
        g += text(mxp, axy + 68, lab, rng, size=48, anchor="middle")
    g += stick_figure(1330, 856, rng, s=0.62, pose="pointing", flip=True,
                      rot=1.0, sw=3.4)
    return g


def f8_the_agent_grid(rng):
    g = title("Does it work in YOUR agent?", rng)

    x0, y0 = 140, 240
    colw = [420, 232, 232]
    rowh = 126
    rows = ["Claude Code", "Codex", "Cursor"]
    cells = [("tick", None), (None, "cross"), ("tick", "cross")]
    totw = sum(colw)
    toth = rowh * (len(rows) + 1)

    g += rough_rect(x0, y0, totw, toth, rng, r=10, sw=3.4, amp=2.2, step=34.0)
    # vertical rules
    cx = x0
    for w in colw[:-1]:
        cx += w
        g += rough_line(cx, y0, cx, y0 + toth, rng, sw=2.8, amp=1.8, step=34.0)
    # horizontal rules
    for i in range(1, len(rows) + 1):
        yy = y0 + i * rowh
        g += rough_line(x0, yy, x0 + totw, yy, rng, sw=2.8, amp=1.8, step=34.0)

    g += text(x0 + colw[0] + colw[1] / 2, y0 + 78, "works", rng, size=50,
              anchor="middle", color=AMBER)
    g += text(x0 + colw[0] + colw[1] + colw[2] / 2, y0 + 78, "breaks", rng,
              size=50, anchor="middle", color=RED)

    for i, label in enumerate(rows):
        yy = y0 + (i + 1) * rowh
        g += text(x0 + 36, yy + 78, label, rng, size=52, color=INK,
                  rot=-0.7 + i * 0.6)
        mark_y = yy + rowh / 2
        for j, m in enumerate(cells[i]):
            mcx = x0 + colw[0] + sum(colw[1:j + 1]) + colw[j + 1] / 2
            if m == "tick":
                g += tick(mcx, mark_y, rng, s=1.1, color=AMBER, sw=5.4)
            elif m == "cross":
                g += cross(mcx, mark_y, rng, s=1.0, color=RED, sw=5.4)
            else:
                g += text(mcx, mark_y + 22, "?", rng, size=62, color=BLUE_SOFT,
                          anchor="middle", rot=3.0)

    for i, ln in enumerate(("nobody tracks", "this anywhere")):
        g += text(1308, 446 + i * 54, ln, rng, size=44, color=INK,
                  anchor="middle", rot=-2.0)
    g += rough_arrow(curve_pts((1152, 470), (1110, 524), (1062, 500)), rng,
                     sw=3.0, color=INK, size=22, amp=1.6)
    g += text(x0 + 6, y0 + toth + 72, "the question nobody can answer", rng,
              size=46, color=INK, rot=-0.8)
    return g


def f9_the_loop(rng):
    g = title("How it actually gets used", rng)

    by, bh = 288, 172
    boxes = [
        (70, 220, ["you"], INK, None),
        (366, 330, ["your agent"], INK, None),
        (772, 250, ["reppit"], INK, None),
        (1098, 440, ["ranked answer", "+ reasons"], INK, None),
    ]
    centers = []
    for i, (bx, bw, lines, col, fill) in enumerate(boxes):
        size = 46 if len(lines) > 1 else 54
        g += box_label(bx, by, bw, bh, lines, rng, size=size, color=col,
                       fill=fill, fill_opacity=0.22, r=16, sw=3.4,
                       rot=(-1.4, 1.1, -1.0, 1.2)[i])
        centers.append((bx, bx + bw, bx + bw / 2))

    for i in range(3):
        a = boxes[i][0] + boxes[i][1]
        b = boxes[i + 1][0]
        g += rough_arrow([(a + 18, by + bh / 2), (b - 16, by + bh / 2)], rng,
                         sw=3.4, size=24, amp=2.0, step=30.0)

    # loop back to the agent
    start = (boxes[3][0] + boxes[3][1] / 2, by + bh + 14)
    end = (boxes[1][0] + boxes[1][1] / 2, by + bh + 14)
    g += rough_arrow(curve_pts(start, ((start[0] + end[0]) / 2, by + bh + 240),
                               end, n=18), rng, sw=3.4, size=24, amp=2.2,
                     step=34.0, color=AMBER)
    g += text((start[0] + end[0]) / 2, by + bh + 212,
              "your agent installs it", rng, size=50, family=CAVEAT,
              color=AMBER, anchor="middle", rot=-1.0)

    msg = "you never open the website"
    g += text(800, 836, msg, rng, size=56, family=CAVEAT, color=INK,
              anchor="middle", rot=-1.2)
    wmsg = tw(msg, 56, CAVEAT)
    g += underline(800 - wmsg / 2, 856, wmsg, rng, color=INK, sw=3.6, amp=2.4)
    return g


# --------------------------------------------------------------------------
# data-figure primitives
#
# These nine panels are charts rather than scenes, so the rule is that the
# number has to BE the picture. Bars and dots are drawn with the same rough
# primitives as everything else -- never a neat rectangle -- and anything
# compared in one frame is drawn at true relative scale, because the ratio is
# the whole point.
# --------------------------------------------------------------------------


def halo(x, y, w, h):
    """Invisible white backing, so lettering never collides with plotted data."""
    return ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
            % (x, y, w, h, WHITE))


def hatch_rect(x, y, w, h, rng, gap=24, sw=2.0, color=INK, opacity=0.9):
    """Diagonal hand shading clipped to a rectangle -- reads as filled, stays light."""
    g = ""
    k = x - (y + h)
    kmax = x + w - y
    while k <= kmax:
        ylo = max(y, x - k)
        yhi = min(y + h, x + w - k)
        if yhi - ylo > 3:
            g += rough_line(ylo + k, ylo, yhi + k, yhi, rng, sw=sw, color=color,
                            amp=0.9, step=34.0, opacity=opacity)
        k += gap
    return g


def rough_bar(x, y, w, h, rng, shaded=False, gap=24, sw=3.0, color=INK):
    """A hand-drawn bar. Never a neat rectangle."""
    g = ""
    if shaded:
        g += hatch_rect(x, y, w, h, rng, gap=gap, color=color, opacity=0.85)
    g += rough_rect(x, y, w, h, rng, r=0, sw=sw, color=color, amp=1.4,
                    step=38.0, smooth=False)
    return g


def dot(cx, cy, r, rng, color=INK):
    return rough_ellipse(cx, cy, r, r * rng.uniform(0.92, 1.08), rng, n=9,
                         sw=2.4, color=color, amp=0.7, fill=color,
                         fill_opacity=1.0)


def bracket_h(x1, x2, y, rng, depth=18, sw=3.0, color=INK):
    """Square bracket spanning a horizontal range, drawn by hand."""
    return rough_path([(x1, y + depth), (x1, y), (x2, y), (x2, y + depth)], rng,
                      sw=sw, color=color, amp=1.2, step=40.0)


def brace_v(x, y1, y2, rng, dirn=1, w=24, sw=3.0, color=INK):
    """Hand-drawn curly brace spanning a vertical range."""
    ym = (y1 + y2) / 2.0
    d = dirn * w
    top = [(x, y1), (x + d, y1 + (ym - y1) * 0.22), (x + d, ym - 18),
           (x + 2 * d, ym)]
    bot = [(x + 2 * d, ym), (x + d, ym + 18), (x + d, y2 - (y2 - ym) * 0.22),
           (x, y2)]
    return (rough_path(top, rng, sw=sw, color=color, amp=1.0, step=26.0)
            + rough_path(bot, rng, sw=sw, color=color, amp=1.0, step=26.0))


def clock(cx, cy, r, rng, minute_ang=30.0, sw=3.0, color=INK):
    """Timer face. Iconography, not data -- the labels carry the numbers."""
    g = rough_ellipse(cx, cy, r, r, rng, n=26, sw=sw, color=color, amp=1.2,
                      fill=WHITE, fill_opacity=1.0)
    for i in range(12):
        a = math.radians(i * 30)
        r0 = r * (0.84 if i % 3 else 0.76)
        g += rough_line(cx + r0 * math.sin(a), cy - r0 * math.cos(a),
                        cx + r * 0.94 * math.sin(a), cy - r * 0.94 * math.cos(a),
                        rng, sw=2.2, color=color, amp=0.6, step=14.0)
    a = math.radians(minute_ang)
    g += rough_line(cx, cy, cx + r * 0.78 * math.sin(a),
                    cy - r * 0.78 * math.cos(a), rng, sw=3.0, color=color,
                    amp=0.8, step=22.0)
    g += rough_line(cx, cy, cx + r * 0.46 * math.sin(math.radians(minute_ang * 0.3)),
                    cy - r * 0.46 * math.cos(math.radians(minute_ang * 0.3)),
                    rng, sw=3.2, color=color, amp=0.8, step=22.0)
    g += '<circle cx="%.1f" cy="%.1f" r="4.5" fill="%s"/>' % (cx, cy, color)
    return g


def square_block(x, y, n, cols, cell, gap, rng, sw=2.2, color=INK):
    """A block of n tiny hand-drawn squares, row-major."""
    g = ""
    pitch = cell + gap
    for i in range(n):
        cx = x + (i % cols) * pitch
        cy = y + (i // cols) * pitch
        g += rough_rect(cx, cy, cell, cell, rng, r=0, sw=sw, color=color,
                        amp=0.7, step=cell / 3.0, smooth=False)
    return g


# the same scatter serves f10 and f11, so the second really is the first
# picture with one dot circled
SCATTER_X0, SCATTER_X1 = 300.0, 1040.0
SCATTER_Y0, SCATTER_Y1 = 270.0, 690.0
OUTLIER = (1272.0, 666.0)


def star_cloud():
    """Shapeless cloud: x and y drawn independently, so there is no trend."""
    r = Rng(0x5EED10)
    pts = []
    for _ in range(72):
        u, v = r.next(), r.next()
        x = SCATTER_X0 + (SCATTER_X1 - SCATTER_X0) * (u ** 1.45)
        y = SCATTER_Y1 - (SCATTER_Y1 - SCATTER_Y0) * (v ** 1.25)
        pts.append((x, y, 6.5 + 3.5 * r.next()))
    return pts


def scatter_axes(rng):
    g = rough_arrow([(250, 720), (1420, 720)], rng, sw=3.2, size=22, amp=1.6,
                    step=60.0)
    g += rough_arrow([(250, 720), (250, 228)], rng, sw=3.2, size=22, amp=1.6,
                     step=60.0)
    g += text(840, 790, "stars", rng, size=46, anchor="middle")
    g += text(176, 476, "maintained", rng, size=42, anchor="middle", rot=-90)
    return g


def f10_the_cloud(rng):
    g = title("Stars vs whether it is maintained", rng, size=54)
    g += scatter_axes(rng)
    for x, y, r in star_cloud():
        g += dot(x, y, r, rng)
    g += dot(OUTLIER[0], OUTLIER[1], 9.0, rng)
    # the almost-flat trend line is the joke: a reader looks for it and it says nothing
    g += rough_line(300, 524, 1104, 503, rng, sw=2.6, amp=1.2, step=46.0,
                    dash="14 13", opacity=0.75)
    g += halo(1086, 258, 346, 164)
    g += text(1424, 324, "ρ = 0.10", rng, size=66, anchor="end",
              upper=False)
    g += text(1424, 396, "\"very weak\"", rng, size=46, anchor="end")
    g += rough_arrow(curve_pts((1280, 428), (1226, 476), (1138, 500)), rng,
                     sw=3.0, size=22, amp=1.6)
    return g


def f11_fifty_thousand_stars(rng):
    g = title("One real project", rng)
    g += scatter_axes(rng)
    for x, y, r in star_cloud():
        g += dot(x, y, r, rng)
    ox, oy = OUTLIER
    g += dot(ox, oy, 10.0, rng)
    g += circle_emphasis(ox, oy, 54, 50, rng, color=INK, sw=3.4)
    g += halo(920, 262, 512, 170)
    g += text(1424, 328, "50,034 stars", rng, size=56, anchor="end")
    g += text(1424, 396, "maintenance: 8 out of 100", rng, size=38,
              anchor="end")
    g += rough_arrow(curve_pts((1300, 424), (1346, 540), (1300, 604)), rng,
                     sw=3.0, size=22, amp=1.6)
    return g


def f12_weakest_signal(rng):
    g = title("Stars are the weakest thing they tested", rng, size=52)
    x0 = 452
    scale = 900.0 / 0.44
    rows = [("contributors", 0.44), ("project size", 0.38),
            ("core contributors", 0.15), ("stars", 0.10)]
    g += rough_line(x0, 258, x0, 714, rng, sw=3.0, amp=1.4, step=46.0)
    for i, (lab, val) in enumerate(rows):
        yy = 288 + i * 112
        w = val * scale
        g += rough_bar(x0, yy, w, 66, rng, shaded=(i == 3), gap=20)
        g += text(x0 - 30, yy + 48, lab, rng, size=42, anchor="end")
        g += text(x0 + w + 26, yy + 48, "%.2f" % val, rng, size=46)
    # only the stars bar gets a star on it
    sy = 288 + 3 * 112
    g += star(x0 + 352, sy + 30, 28, rng, color=INK, sw=2.6)
    g += text(684, sy + 136, "the one everyone uses", rng, size=44, rot=-1.0)
    g += rough_arrow(curve_pts((668, sy + 120), (590, sy + 104), (520, sy + 78)),
                     rng, sw=3.0, size=20, amp=1.4)
    return g


def f13_never_worked(rng):
    g = title("This predates ai", rng)
    ty = 498
    g += rough_arrow([(140, ty), (1506, ty)], rng, sw=3.4, size=24, amp=1.8,
                     step=60.0)

    g += rough_line(330, ty - 24, 330, ty + 24, rng, sw=3.2, amp=1.2, step=20.0)
    g += text(330, ty + 86, "nov 2017", rng, size=50, anchor="middle")
    g += text(330, 352, "this was measured here", rng, size=44, anchor="middle")
    g += rough_arrow([(330, 376), (330, ty - 40)], rng, sw=3.0, size=20,
                     amp=1.4, step=40.0)

    years = [(1030, "2022"), (1130, "2023"), (1230, "2024"), (1340, "2025"),
             (1450, "2026")]
    for mxp, lab in years:
        g += rough_line(mxp, ty - 18, mxp, ty + 18, rng, sw=2.8, amp=1.1,
                        step=18.0)
        g += text(mxp, ty + 76, lab, rng, size=34, anchor="middle")
    g += bracket_h(1010, 1462, 400, rng, depth=20, sw=3.0)
    g += text(1236, 364, "ai coding tools", rng, size=44, anchor="middle")

    # the gap is the image: nobody standing in it
    g += stick_figure(690, 742, rng, s=0.74, pose="shrugging", rot=-1.0,
                      sw=3.2)

    g += text(800, 836, "the signal was already broken. nobody was looking.",
              rng, size=44, anchor="middle", rot=-0.5)
    return g


def f14_repos_per_minute(rng):
    g = title("New repos per minute vs one person looking at one", rng, size=48)
    g += square_block(104, 300, 230, 23, 26, 7, rng)
    g += text(476, 684, "new repos in one minute", rng, size=44,
              anchor="middle")

    g += rough_line(966, 272, 966, 706, rng, sw=2.6, amp=1.6, step=56.0,
                    dash="16 14", opacity=0.75)

    g += rough_rect(1196, 496, 26, 26, rng, r=0, sw=2.6, amp=0.7, step=9.0,
                    smooth=False)
    g += stick_figure(1296, 626, rng, s=0.78, pose="slumped", rot=1.0, sw=3.2)
    g += text(1232, 706, "what one person", rng, size=42, anchor="middle")
    g += text(1232, 752, "can read", rng, size=42, anchor="middle")
    return g


def f15_three_registries(rng):
    g = title("Packages you could install today", rng)
    base = 742
    top = 560.0
    rows = [("npm", 4464731, 400), ("pypi", 907001, 760),
            ("crates.io", 347256, 1120)]
    big = float(rows[0][1])
    g += rough_line(220, base, 1490, base, rng, sw=2.8, amp=1.4, step=60.0)
    for name, n, cx in rows:
        h = top * n / big
        g += rough_bar(cx - 100, base - h, 200, h, rng, sw=3.2)
        # internal rules, so each bar reads as a stack rather than a block
        yy = base - 46
        while yy > base - h + 14:
            g += rough_line(cx - 92, yy, cx + 92, yy, rng, sw=2.0, amp=0.9,
                            step=40.0, opacity=0.7)
            yy -= 46
        g += text(cx, 796, name, rng, size=42, anchor="middle")
        g += text(cx, 850, "{:,}".format(n), rng, size=46, anchor="middle")
    # a person at the foot of it, for scale
    g += stick_figure(1396, base, rng, s=0.95, pose="standing", rot=-1.0)
    return g


def f16_zombie_bar(rng):
    """Two bars, NOT one split bar.

    93% is a share of codebases and 7% is a share of components -- different
    denominators. A single split bar would imply they are parts of one whole,
    which is exactly the detail a hostile reader uses to throw out the rest.
    So: two bars, a common 0-100 axis, each denominator spelled out, and a
    divider between them so nobody reads them as a stacked pair.
    """
    g = title("What is already in your build", rng)

    x0, span = 180, 1240.0          # shared 0-100 axis
    g += rough_line(x0, 312, x0, 716, rng, sw=3.0, amp=1.2, step=52.0)
    g += rough_line(x0 + span, 312, x0 + span, 716, rng, sw=2.4, amp=1.2,
                    step=46.0, dash="14 13", opacity=0.8)
    g += text(x0 + span, 286, "100%", rng, size=36, anchor="middle")

    rows = [(0.93, "93%", "of codebases have a component dead 2+ years", 302,
             326, True),
            (0.07, "7%", "of components in use are the latest version", 584,
             608, False)]
    for frac, pct, lab, ty, byy, shade in rows:
        g += text(x0 + 10, ty, pct, rng, size=66)
        # the label reads on from the percentage, so sit it right after it
        g += text(x0 + 10 + tw(pct, 66) + 26, ty - 2, lab, rng, size=40)
        g += rough_bar(x0, byy, span * frac, 96, rng, shaded=shade, gap=26,
                       sw=3.2)

    # the separation has to be unmistakable
    g += rough_line(140, 484, 1336, 484, rng, sw=2.4, amp=1.4, step=56.0,
                    dash="18 15", opacity=0.75)

    g += text(800, 806, "audit of 947 real codebases", rng, size=44,
              anchor="middle", rot=-0.5)
    return g


def f17_five_minutes(rng):
    g = title("What actually changed", rng)
    g += rough_line(800, 186, 800, 726, rng, sw=2.6, amp=1.6, step=56.0,
                    dash="16 14", opacity=0.75)

    # the human, five minutes, three tabs open
    g += clock(420, 282, 86, rng, minute_ang=30.0)
    g += text(420, 424, "5 minutes", rng, size=58, anchor="middle")
    g += text(420, 474, "of looking around", rng, size=38, anchor="middle")
    for i in range(3):
        g += rough_rect(306, 486 + i * 58, 228, 46, rng, r=5, sw=2.6, amp=1.0,
                        step=26.0)
    g += stick_figure(196, 712, rng, s=0.80, pose="standing", rot=-1.0)

    # the agent, two seconds, one tab, already done
    g += clock(1180, 282, 86, rng, minute_ang=4.0)
    g += text(1180, 424, "2 seconds", rng, size=58, anchor="middle")
    g += text(1180, 474, "already done", rng, size=38, anchor="middle")
    g += rough_rect(1066, 486, 228, 46, rng, r=5, sw=2.6, amp=1.0, step=26.0)
    g += robot(1180, 726, rng, s=0.82, rot=1.2)

    # the same weak number sits under both of them
    g += rough_line(110, 760, 1490, 760, rng, sw=2.6, amp=1.4, step=60.0)
    for cx in (420, 1180):
        g += rough_bar(cx - 100, 788, 200, 34, rng, sw=2.8)
    g += text(800, 816, "same weak number", rng, size=42, anchor="middle",
              rot=-0.6)
    return g


def f18_the_flat_line(rng):
    g = title("The line did not bend", rng)
    pts = [(268, 694), (626, 560), (984, 430), (1342, 294)]
    g += rough_line(220, 740, 1420, 740, rng, sw=2.8, amp=1.4, step=60.0)
    for i, (px, lab) in enumerate(zip([p[0] for p in pts],
                                      ("2022", "2023", "2024", "2025"))):
        g += rough_line(px, 740, px, 758, rng, sw=2.4, amp=0.8, step=16.0)
        g += text(px, 804, lab, rng, size=38, anchor="middle")
    g += rough_path(pts, rng, sw=3.4, amp=1.3, step=52.0)
    for p in pts:
        g += dot(p[0], p[1], 8.0, rng)
    for i, lab in enumerate(("+22%", "+17%", "+19%")):
        mx = (pts[i][0] + pts[i + 1][0]) / 2
        my = (pts[i][1] + pts[i + 1][1]) / 2
        g += halo(mx - 70, my - 92, 140, 56)
        g += text(mx, my - 50, lab, rng, size=46, anchor="middle")
    # where a bend would have been, had there been one
    g += rough_arrow([(880, 712), (880, 508)], rng, sw=3.0, size=22, amp=1.4,
                     step=44.0)
    g += text(908, 650, "ai arrives here", rng, size=44)
    return g


def f19_clones_before_ai(rng):
    g = title("The pile was mostly copies already", rng, size=52)
    bx, by, cell, gap, cols = 110, 244, 38, 7, 10
    pitch = cell + gap
    g += hatch_rect(bx, by, cols * pitch - gap, 7 * pitch - gap, rng, gap=29)
    g += square_block(bx, by, 100, cols, cell, gap, rng, sw=2.4)
    g += text(bx + (cols * pitch - gap) / 2, 744, "428 million files", rng,
              size=36, anchor="middle")

    g += text(636, 398, "70%", rng, size=140)
    g += text(636, 476, "files that were", rng, size=46)
    g += text(636, 526, "already copies", rng, size=46)
    g += text(636, 648, "2017", rng, size=88)
    g += underline(638, 672, 190, rng, sw=3.4, amp=1.8)

    g += rough_arrow([(900, 636), (1282, 636)], rng, sw=3.0, size=22, amp=1.4,
                     step=52.0, dash="16 14")
    g += robot(1376, 700, rng, s=0.58, rot=1.5)
    g += text(1376, 764, "ai shows up", rng, size=42, anchor="middle")
    return g


def f20_the_number_that_got_better(rng):
    g = title("The number that got better", rng)
    base = 700
    scale = 440.0 / 19.7
    bars = [(440, 19.7, "19.7%", "2025 study"),
            (1060, 4.6, "4.6%", "2026, current models")]
    g += rough_line(220, base, 1400, base, rng, sw=2.8, amp=1.4, step=60.0)
    for cx, val, lab, sub in bars:
        h = val * scale
        g += rough_bar(cx - 108, base - h, 216, h, rng, sw=3.2)
        g += text(cx, base - h - 28, lab, rng, size=62, anchor="middle")
        g += text(cx, base + 62, sub, rng, size=42, anchor="middle")
    # good news, drawn as good news
    g += rough_arrow(curve_pts((596, 232), (840, 326), (928, 560)), rng,
                     sw=3.4, size=26, amp=1.6)
    g += text(840, 292, "got better", rng, size=46, anchor="middle", rot=-1.0)
    g += text(800, 842, "packages models suggest that do not exist", rng,
              size=44, anchor="middle", rot=-0.5)
    return g


def f21_use_vs_trust(rng):
    g = title("Use vs trust", rng)
    base = 724
    scale = 490.0 / 83.0
    h1, h2 = 83.0 * scale, 6.6 * scale
    g += rough_line(176, base, 1510, base, rng, sw=2.8, amp=1.4, step=60.0)

    g += rough_bar(300, base - h1, 240, h1, rng, sw=3.4)
    g += text(420, base - h1 - 26, "83%", rng, size=74, anchor="middle")
    g += text(420, 778, "use ai coding tools", rng, size=34, anchor="middle")

    g += rough_bar(1060, base - h2, 240, h2, rng, sw=3.4)
    g += text(1180, base - h2 - 26, "6.6%", rng, size=74, anchor="middle")
    g += text(1180, 778, "would trust it for an important decision", rng,
              size=34, anchor="middle")

    # the empty space between the two tops is the whole picture
    g += brace_v(648, base - h1, base - h2, rng, dirn=1, w=34, sw=3.2)
    g += text(730, 448, "76 points", rng, size=50)
    g += stick_figure(890, base, rng, s=0.80, pose="standing", rot=-1.0)

    g += text(800, 846, "we use it constantly. we believe it almost never.",
              rng, size=42, anchor="middle", rot=-0.5)
    return g


FIGURES = [
    ("f1-the-moment", f1_the_moment),
    ("f2-the-only-check", f2_the_only_check),
    ("f3-what-a-star-is", f3_what_a_star_is),
    ("f4-the-mismatch", f4_the_mismatch),
    ("f5-what-you-want", f5_what_you_want),
    ("f6-the-reason-tag", f6_the_reason_tag),
    ("f7-number-vs-sentence", f7_number_vs_sentence),
    ("f8-the-agent-grid", f8_the_agent_grid),
    ("f9-the-loop", f9_the_loop),
    ("f10-the-cloud", f10_the_cloud),
    ("f11-fifty-thousand-stars", f11_fifty_thousand_stars),
    ("f12-weakest-signal", f12_weakest_signal),
    ("f13-never-worked", f13_never_worked),
    ("f14-repos-per-minute", f14_repos_per_minute),
    ("f15-three-registries", f15_three_registries),
    ("f16-zombie-bar", f16_zombie_bar),
    ("f17-five-minutes-two-seconds", f17_five_minutes),
    ("f18-the-flat-line", f18_the_flat_line),
    ("f19-clones-before-ai", f19_clones_before_ai),
    ("f20-the-number-that-got-better", f20_the_number_that_got_better),
    ("f21-use-vs-trust", f21_use_vs_trust),
]


# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------


def family_files(prefix):
    """All woff2 subsets for a family, largest first.

    Google Fonts splits a family across unicode-range subsets, and the LARGEST
    file is not necessarily the one holding basic Latin (for Caveat it is a
    Cyrillic subset, which silently falls back to a serif). Rather than guess,
    embed every subset under the same family name and let the font-matching
    algorithm fall through to whichever face actually has the glyph. Still
    entirely offline -- no network fetch at render time.
    """
    cands = [f for f in sorted(os.listdir(FONT_DIR))
             if f.lower().startswith(prefix.lower()) and f.endswith(".woff2")]
    if not cands:
        raise SystemExit("no woff2 found for %r in %s" % (prefix, FONT_DIR))
    cands.sort(key=lambda f: os.path.getsize(os.path.join(FONT_DIR, f)),
               reverse=True)
    return [os.path.join(FONT_DIR, f) for f in cands]


def font_css():
    css = []
    # the real xkcd hand, embedded as a data URI like everything else
    xk = os.path.join(FONT_DIR, "xkcd-script.ttf")
    if os.path.exists(xk):
        with open(xk, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        css.append(
            "@font-face{font-family:'XKCDScript';font-style:normal;"
            "font-weight:400;font-display:block;"
            "src:url(data:font/ttf;base64,%s) format('truetype');}" % b64)
    # Patrick Hand stays as the fallback hand
    for family, prefix in [("PatrickHand", "Patrick-")]:
        for path in family_files(prefix):
            with open(path, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode("ascii")
            css.append(
                "@font-face{font-family:'%s';font-style:normal;"
                "font-weight:400 700;font-display:block;"
                "src:url(data:font/woff2;base64,%s) format('woff2');}"
                % (family, b64))
    return "\n".join(css)



# --------------------------------------------------------------------------
# document
# --------------------------------------------------------------------------

PAPER_DEFS = ""


def build_html(name, body, css):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 %d %d">' % (W, H, W, H)
        + PAPER_DEFS
        + '<rect x="0" y="0" width="%d" height="%d" fill="%s"/>' % (W, H, PAPER)
        + body
        + "</svg>")
    return (
        "<!doctype html>\n<html><head><meta charset=\"utf-8\">\n"
        "<title>%s</title>\n<style>\n%s\n"
        "html,body{margin:0;padding:0;background:%s;}\n"
        ".frame{width:%dpx;height:%dpx;overflow:hidden;}\n"
        "svg{display:block;}\n</style></head>\n"
        "<body><div class=\"frame\">%s</div></body></html>\n"
        % (name, css, PAPER, W, H, svg))


def render(html_path, png_path):
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or \
        shutil.which("chromium-browser")
    if not chrome:
        raise SystemExit("google-chrome not found on PATH")
    cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox",
           "--hide-scrollbars", "--screenshot=%s" % png_path,
           "--window-size=1600,900", "--force-device-scale-factor=2",
           "--virtual-time-budget=4000", "file://%s" % html_path]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not os.path.exists(png_path):
        sys.stderr.write(r.stderr[-2000:] + "\n")
        raise SystemExit("render failed: %s" % png_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="build just this figure name")
    ap.add_argument("--no-render", action="store_true",
                    help="emit HTML only, skip rasterising")
    args = ap.parse_args()

    os.makedirs(FIG_DIR, exist_ok=True)
    os.makedirs(SHOT_DIR, exist_ok=True)

    figs = FIGURES
    if args.only:
        figs = [f for f in FIGURES if f[0] == args.only]
        if not figs:
            raise SystemExit("unknown figure %r; known: %s"
                             % (args.only, ", ".join(n for n, _ in FIGURES)))

    css = font_css()
    for name, fn in figs:
        rng = Rng(name_seed(name))
        body = panel_frame(rng) + fn(rng)
        html_path = os.path.join(FIG_DIR, name + ".html")
        with open(html_path, "w") as fh:
            fh.write(build_html(name, body, css))
        png_path = os.path.join(SHOT_DIR, name + ".png")
        if args.no_render:
            print("html  %s" % html_path)
            continue
        render(html_path, png_path)
        kb = os.path.getsize(png_path) / 1024.0
        print("ok    %-24s %7.0f KB" % (name, kb))


if __name__ == "__main__":
    main()
