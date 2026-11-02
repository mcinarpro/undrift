"""Horizontal and stacked lockups from the symbol master and the wordmark."""
import re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import wordmark
art = pathlib.Path(sys.argv[1])
d = re.search(r'\sd="([^"]+)"', (art / "undrift-symbol.svg").read_text()).group(1)
sym = lambda tx, ty: f'<g id="symbol" transform="translate({tx} {ty})"><path d="{d}"/></g>'
hdr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t"><title id="t">undrift</title>\n'
# Horizontal: the wordmark at 72 % so the symbol leads, 72 units clear of the symbol's edge (x 243),
# its x-height centre (140) on the symbol's centre (128): 128 - 140 * 0.72 = 27.2.
(art / "undrift-horizontal.svg").write_text(hdr.format(w=953, h=256) + sym(0, 0) + "\n" + wordmark.group(310, 27.2).replace('" transform="translate(310 27.2)"', '" transform="translate(310 27.2) scale(0.72)"') + "</svg>\n")
# Stacked: the wordmark at 70 % so the symbol leads.
(art / "undrift-stacked.svg").write_text(hdr.format(w=640, h=432) + sym(192, 0) + "\n" + wordmark.group(10, 262).replace('" transform="translate(10 262)"', '" transform="translate(10 262) scale(0.7)"') + "</svg>\n")
