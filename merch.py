"""The merch page: product cards with drawn mockups that use the corn wheel.

Products are listed in merch.json. Each names one of the drawings below in
"art". A product with a "url" gets a Buy link; one without says Coming soon.
The drawings reuse the #ear symbol defined once in template.html, plus the
shading gradients in DEFS below.
"""
import html

GOLD, BLACK, WHITE = "#FFCD00", "#000", "#FFF"


def esc(text):
    return html.escape(str(text), quote=True)


# Shading shared by every drawing: soft edges on cloth, a highlight around a
# cylinder, brushed metal, and blurred shadows on the table.
DEFS = """<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="m-sides" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".2" stop-color="#000" stop-opacity="0"/>
    <stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".26"/>
  </linearGradient>
  <linearGradient id="m-down" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#FFF" stop-opacity=".12"/><stop offset=".45" stop-color="#FFF" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".2"/>
  </linearGradient>
  <linearGradient id="m-round" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".28" stop-color="#FFF" stop-opacity=".3"/>
    <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/>
  </linearGradient>
  <linearGradient id="m-metal" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#8E949B"/><stop offset=".3" stop-color="#F4F6F8"/>
    <stop offset=".6" stop-color="#B9BEC4"/><stop offset="1" stop-color="#7B8188"/>
  </linearGradient>
  <filter id="m-blur" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="m-lift" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".28"/>
  </filter>
</defs></svg>"""


# ---------- the logo on a product ----------

def wheel(cx, cy, size):
    """The corn wheel mark, centred on (cx, cy)."""
    return '<use href="#ear" x="%.1f" y="%.1f" width="%.1f" height="%.1f"/>' % (
        cx - size / 2, cy - size / 2, size, size)


def badge(cx, cy, r, ring=3):
    """The wheel on a gold disc, for dark cloth where its black outline would vanish."""
    return ('<circle cx="%s" cy="%s" r="%s" fill="%s" stroke="%s" stroke-width="%s"/>' % (cx, cy, r, GOLD, BLACK, ring)
            + wheel(cx, cy, r * 1.74))


# widths in ems of Antonio Bold, the display face used across the site
WORDS = {"ROLL": [("R", .484), ("@", .94), ("LL", .734)],
         "CORN": [("C", .473), ("@", .94), ("RN", 1.006)]}


def word(which, cx, baseline, size, fill=BLACK):
    """ROLL or CORN, with the wheel as its O, centred on cx."""
    pieces = WORDS[which]
    x = cx - sum(w for _, w in pieces) * size / 2
    out = []
    for text, w in pieces:
        width = w * size
        if text == "@":
            out.append(wheel(x + width / 2, baseline - .42 * size, .94 * size))
        else:
            out.append(
                '<text x="%.1f" y="%.1f" font-size="%.1f" textLength="%.1f" lengthAdjust="spacingAndGlyphs" '
                'fill="%s" class="art-type">%s</text>' % (x, baseline, size, width - .02 * size, fill, text))
        x += width
    return "".join(out)


def wordmark(cx, baseline, size, fill=BLACK):
    """ROLL CORN on one line, centred on cx."""
    roll = sum(w for _, w in WORDS["ROLL"]) * size
    corn = sum(w for _, w in WORDS["CORN"]) * size
    gap = .34 * size
    left = cx - (roll + gap + corn) / 2
    return (word("ROLL", left + roll / 2, baseline, size, fill)
            + word("CORN", left + roll + gap + corn / 2, baseline, size, fill))


def plain_name(cx, baseline, size, fill):
    return ('<text x="%s" y="%s" font-size="%s" text-anchor="middle" fill="%s" '
            'class="art-type" letter-spacing=".08em">ROLL CORN</text>' % (cx, baseline, size, fill))


# ---------- cloth ----------

def table_shadow(cx, cy, rx, ry=9, strength=.3):
    return ('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#000" opacity="%s" filter="url(#m-blur)"/>'
            % (cx, cy, rx, ry, strength))


def cloth(path, fill, edge):
    """One piece of fabric: flat colour, then soft shading at the sides and toward the hem."""
    return ('<path d="{p}" fill="{f}"/>'
            '<path d="{p}" fill="url(#m-sides)"/>'
            '<path d="{p}" fill="url(#m-down)"/>'
            '<path d="{p}" fill="none" stroke="{e}" stroke-width="1.6" stroke-linejoin="round"/>'
            ).format(p=path, f=fill, e=edge)


TEE = ("M168 62 L104 84 L52 150 L92 176 L118 142 C116 210 114 280 114 348 Q200 361 286 348 "
       "C286 280 284 210 282 142 L308 176 L348 150 L296 84 L232 62 C224 83 176 83 168 62Z")
CREW = ("M166 64 L98 88 C78 150 64 230 56 300 L54 322 L94 330 L98 308 C104 250 112 200 122 152 "
        "L120 350 L280 350 L278 152 C288 200 296 250 302 308 L306 330 L346 322 L344 300 "
        "C336 230 322 150 302 88 L234 64 C226 85 174 85 166 64Z")


def neck(y, fill, inside, edge):
    """Back of the neck showing through the collar, then the ribbed collar band."""
    return (
        '<path d="M{l} {y} C{a} {b1} {c} {b1} {r} {y} C{c} {f1} {a} {f1} {l} {y}Z" fill="{inside}"/>'
        '<path d="M{l} {y} C{a} {f1} {c} {f1} {r} {y}" fill="none" stroke="{edge}" stroke-width="9" stroke-linecap="round"/>'
        '<path d="M{l} {y} C{a} {f1} {c} {f1} {r} {y}" fill="none" stroke="{fill}" stroke-width="6.5" stroke-linecap="round"/>'
    ).format(l=167, r=233, a=178, c=222, y=y, b1=y + 9, f1=y + 24, fill=fill, inside=inside, edge=edge)


def seams(pairs, colour):
    return '<path d="%s" fill="none" stroke="%s" stroke-width="1.4" stroke-linecap="round"/>' % (pairs, colour)


def enlarge(inner, k=1.13, cy=206):
    return '<g transform="translate(200 %s) scale(%s) translate(-200 -%s)">%s</g>' % (cy, k, cy, inner)


# ---------- the drawings ----------

def tee(fill, inside, edge, seam, print_):
    body = (cloth(TEE, fill, edge)
            + seams("M104 84 C112 104 117 124 118 142 M296 84 C288 104 283 124 282 142 "
                    "M57 143 L97 169 M343 143 L303 169 M115 339 Q200 352 285 339", seam)
            + neck(62, fill, inside, edge) + print_)
    return table_shadow(200, 388, 120) + enlarge(body)


def tee_wheel():
    return tee("#161616", "#060606", "#000", "#3A3A3A",
               badge(200, 178, 50) + plain_name(200, 262, 24, GOLD))


def tee_sign():
    return tee(WHITE, "#DAD7CB", "#B9B5A5", "#D2CFC2",
               '<rect x="130" y="138" width="140" height="64" rx="9" fill="%s" stroke="%s" stroke-width="4"/>' % (GOLD, BLACK)
               + wordmark(200, 181, 25.5))


def crew_gold():
    body = (cloth(CREW, GOLD, "#A88700")
            + seams("M98 88 C108 110 118 130 122 152 M302 88 C292 110 282 130 278 152 "
                    "M120 334 L280 334 M56 301 L98 309 M344 301 L302 309", "#B89400")
            + neck(64, GOLD, "#C9A200", "#A88700")
            + word("ROLL", 200, 196, 50) + word("CORN", 200, 250, 50))
    return table_shadow(200, 390, 120) + enlarge(body, 1.1, 208)


def cap_black():
    crown = "M96 238 C92 152 140 102 202 102 C264 102 310 152 306 234 C250 216 150 218 96 238Z"
    brim = ("M96 238 C150 218 250 216 306 234 C350 246 384 268 386 286 C380 293 372 293 366 290 "
            "C310 266 180 254 100 272 C93 264 93 248 96 238Z")
    return (
        table_shadow(236, 304, 150, 10, .3)
        + '<path d="%s" fill="#0C0C0C"/>' % brim
        + '<path d="M100 272 C180 254 310 266 366 290 C372 293 380 293 386 286 C330 262 200 246 98 262Z" fill="#2A2A2A"/>'
        + '<path d="%s" fill="none" stroke="#000" stroke-width="1.6"/>' % brim
        + cloth(crown, "#171717", "#000")
        + seams("M202 102 C197 142 197 186 201 216 M150 122 C137 154 131 194 133 226 "
                "M254 122 C267 154 271 190 270 222", "#3D3D3D")
        + '<ellipse cx="202" cy="101" rx="9" ry="4.5" fill="#222" stroke="#000" stroke-width="1.4"/>'
        + '<circle cx="146" cy="160" r="2.6" fill="#000"/><circle cx="258" cy="160" r="2.6" fill="#000"/>'
        + '<g filter="url(#m-lift)">' + badge(202, 172, 42, 2.5) + '</g>')


def cooler_gold():
    sleeve = "M132 132 L132 326 A68 13 0 0 0 268 326 L268 132 A68 13 0 0 1 132 132Z"
    return (
        table_shadow(200, 342, 92, 10, .34)
        # the can standing in the cooler
        + '<path d="M146 92 L146 136 A54 10 0 0 0 254 136 L254 92Z" fill="url(#m-metal)" stroke="#5E646B" stroke-width="1.4"/>'
        + '<ellipse cx="200" cy="92" rx="54" ry="10" fill="#E9ECEF" stroke="#5E646B" stroke-width="1.4"/>'
        + '<ellipse cx="200" cy="92" rx="45" ry="7.5" fill="none" stroke="#9AA0A7" stroke-width="1.6"/>'
        + '<ellipse cx="208" cy="93" rx="11" ry="3.4" fill="#7E848B"/>'
        # the cooler sleeve
        + '<path d="%s" fill="%s"/>' % (sleeve, GOLD)
        + '<path d="%s" fill="url(#m-round)"/>' % sleeve
        + '<path d="%s" fill="none" stroke="#8A6F00" stroke-width="1.6"/>' % sleeve
        + '<path d="M132 146 A68 13 0 0 0 268 146 M132 312 A68 13 0 0 0 268 312" fill="none" '
          'stroke="#8A6F00" stroke-width="1.4" stroke-dasharray="5 4"/>'
        + wheel(200, 214, 112)
        + plain_name(200, 296, 21, BLACK))


def stickers():
    return (
        '<g filter="url(#m-lift)" transform="rotate(-9 156 164)">'
        '<circle cx="156" cy="164" r="92" fill="#FFF"/>'
        + badge(156, 164, 80) + '</g>'
        '<g filter="url(#m-lift)" transform="rotate(7 246 296)">'
        '<rect x="126" y="246" width="240" height="100" rx="18" fill="#FFF"/>'
        '<rect x="137" y="257" width="218" height="78" rx="11" fill="%s" stroke="#000" stroke-width="5"/>' % GOLD
        + wordmark(246, 311, 39) + '</g>')


ART = {
    "tee-wheel": (tee_wheel, "Black T-shirt with the corn wheel on a gold disc on the chest"),
    "tee-sign": (tee_sign, "White T-shirt with the yellow Roll Corn seed sign on the chest"),
    "crew-gold": (crew_gold, "Gold crewneck sweatshirt with Roll Corn stacked in black across the chest"),
    "cap-black": (cap_black, "Black cap with the corn wheel on a gold patch"),
    "cooler-gold": (cooler_gold, "Gold can cooler with the corn wheel, holding a can"),
    "stickers": (stickers, "Two stickers: a round corn wheel and a yellow Roll Corn seed sign"),
}


# ---------- the page ----------

def card(product):
    draw, alt = ART[product["art"]]
    art = ('<svg class="product-art" viewBox="0 0 400 400" role="img" aria-label="%s">%s</svg>'
           % (esc(alt), draw()))
    if product.get("url"):
        label = "Buy" + (" for %s" % esc(product["price"]) if product.get("price") else "")
        status = '<a class="product-buy" href="%s" rel="noopener">%s</a>' % (esc(product["url"]), label)
    else:
        status = '<p class="product-soon">Coming soon</p>'
    return ('<li class="product">%s<h3 class="product-name">%s</h3>'
            '<p class="product-blurb">%s</p>%s</li>'
            % (art, esc(product["name"]), esc(product["blurb"]), status))


def page(config):
    cards = "".join(card(p) for p in config["products"])
    return (
        DEFS + '\n<main id="merch" class="merch">\n'
        '  <h2 class="sign">Merch</h2>\n'
        '  <div class="merch-body">\n'
        '    <p class="merch-intro">%s</p>\n'
        '    <ul class="products">%s</ul>\n'
        '  </div>\n'
        '</main>' % (esc(config["intro"]), cards))
