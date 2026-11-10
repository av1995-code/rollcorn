#!/usr/bin/env python3
"""Draw the Roll Corn mark as PNG files (cursor, phone icon, share image).

The mark is the same drawing as public/mark.svg, rebuilt here from its
geometry so it can be saved as PNG without an SVG renderer.
Needs Pillow:  python3 tools/make_images.py
"""
import math
import pathlib

from PIL import Image, ImageChops, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "public"
GOLD, BLACK = (255, 205, 0, 255), (0, 0, 0, 255)
LIGHT, DARK = (63, 163, 77, 255), (34, 117, 58, 255)


def circle_arc(cx, cy, r, a0, a1, n=90):
    """Points along a circle from angle a0 to a1, in degrees, y pointing down."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def arc_between(p0, p1, centre, n=90):
    """Points from p0 to p1 the short way around `centre`."""
    cx, cy = centre
    r = math.hypot(p0[0] - cx, p0[1] - cy)
    a0 = math.degrees(math.atan2(p0[1] - cy, p0[0] - cx))
    a1 = math.degrees(math.atan2(p1[1] - cy, p1[0] - cx))
    d = (a1 - a0 + 180) % 360 - 180
    return circle_arc(cx, cy, r, a0, a0 + d, n)


def bezier(p0, p1, p2, p3, n=30):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return pts


def on_cob(pts):
    """The ear's own coordinates -> the mark: lean 30 degrees, centre (62, 58)."""
    c, s = math.cos(math.radians(30)), math.sin(math.radians(30))
    return [(x * c - y * s + 62, x * s + y * c + 58) for x, y in pts]


def rounded_rect(x, y, w, h, r, n=6):
    pts = []
    for cx, cy, a in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0),
                      (x + r, y + h - r, 90), (x + r, y + r, 180)):
        pts += circle_arc(cx, cy, r, a, a + 90, n)
    return pts


COB = on_cob(
    bezier((0, -43), (12, -43), (19.5, -23), (19.5, 2))
    + bezier((19.5, 2), (19.5, 26), (13, 42), (0, 42))
    + bezier((0, 42), (-13, 42), (-19.5, 26), (-19.5, 2))
    + bezier((-19.5, 2), (-19.5, -23), (-12, -43), (0, -43)))

KERNELS = []
for j in range(-1, 6):
    for i in range(-3, 4):
        ox, oy = -6.3 + 12.6 * i, -44 + 21 * j
        KERNELS.append(on_cob(rounded_rect(ox + 1.1, oy + 1.1, 10.4, 8.3, 3.4)))
        KERNELS.append(on_cob(rounded_rect(ox - 5.2, oy + 11.6, 10.4, 8.3, 3.4)))

# husk leaves: outer edge on the wheel's rim, inner edge a tighter arc
LEAF_DARK = circle_arc(60, 60, 56, 120, -20) + arc_between((112.6, 40.8), (45.8, 95.2), (53.2, 36.0))
LEAF_LIGHT = circle_arc(60, 60, 56, 110, 300) + arc_between((88, 11.5), (37.1, 92.8), (75.4, 60.3))


def draw_mark(size, pad=0.0):
    """The mark on a transparent square, `size` pixels, drawn large then shrunk."""
    big = 1536
    k = big * (1 - 2 * pad) / 120
    off = big * pad

    def S(pts):
        return [(x * k + off, y * k + off) for x, y in pts]

    def outline(d, pts, width):
        pts = S(pts)
        d.line(pts + pts[:2], fill=BLACK, width=round(width * k), joint="curve")

    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # stem
    a, b = S([(39, 103), (31, 115)])
    d.line([a, b], fill=BLACK, width=round(9 * k))
    for px, py in (a, b):
        d.ellipse([px - 4.5 * k, py - 4.5 * k, px + 4.5 * k, py + 4.5 * k], fill=BLACK)

    # cob with gold kernels, kept inside the cob's edge
    d.polygon(S(COB), fill=BLACK)
    kernels = Image.new("L", (big, big), 0)
    kd = ImageDraw.Draw(kernels)
    for kpts in KERNELS:
        kd.polygon(S(kpts), fill=255)
    inside = Image.new("L", (big, big), 0)
    ImageDraw.Draw(inside).polygon(S(COB), fill=255)
    img.paste(Image.new("RGBA", (big, big), GOLD), (0, 0), ImageChops.multiply(kernels, inside))
    d = ImageDraw.Draw(img)
    outline(d, COB, 4.5)

    # husk, dark leaf behind the light one
    for leaf, colour in ((LEAF_DARK, DARK), (LEAF_LIGHT, LIGHT)):
        d.polygon(S(leaf), fill=colour)
        outline(d, leaf, 4.5)

    return img.resize((size, size), Image.LANCZOS)


def on_gold(width, height, mark_size):
    canvas = Image.new("RGBA", (width, height), GOLD)
    mark = draw_mark(mark_size)
    canvas.alpha_composite(mark, ((width - mark_size) // 2, (height - mark_size) // 2))
    return canvas.convert("RGB")


def main():
    # mouse pointer: normal and over-a-link sizes, each at 1x and 2x
    for name, px in (("cursor", 32), ("cursor-link", 44)):
        draw_mark(px).save(OUT / f"{name}.png")
        draw_mark(px * 2).save(OUT / f"{name}@2x.png")
    draw_mark(512).save(OUT / "mark-512.png")              # the mark alone
    on_gold(180, 180, 150).save(OUT / "apple-touch-icon.png")
    on_gold(1200, 630, 470).save(OUT / "share.png")        # link previews
    print("wrote images to", OUT)


if __name__ == "__main__":
    main()
