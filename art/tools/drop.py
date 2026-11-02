"""Outline of the Drop symbol for a given line width and dot radius.
The line: arc r100 around (128,128) from the top, 270° clockwise; arc r64 around (92,128); arc r36 around
(92,100) ending at (128,100) heading down; then straight down into a dot centred at (128, dot_y)."""
import math, sys

def drop(w, r_dot, dot_y):
    h = w / 2
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    dy = math.sqrt(r_dot**2 - h**2)
    y_meet = dot_y - dy
    xr, xl = 128 + h, 128 - h
    o1, o2, o3 = 100 + h, 64 + h, 36 + h
    i1, i2, i3 = 100 - h, 64 - h, 36 - h
    d = (f"M128 {f(28-h)} A{f(o1)} {f(o1)} 0 1 1 {f(28-h)} 128 "
         f"A{f(o2)} {f(o2)} 0 0 1 92 {f(64-h)} "
         f"A{f(o3)} {f(o3)} 0 0 1 {f(xr)} 100 "
         f"V{f(y_meet)} A{f(r_dot)} {f(r_dot)} 0 1 1 {f(xl)} {f(y_meet)} V100 "
         f"A{f(i3)} {f(i3)} 0 0 0 92 {f(64+h)} "
         f"A{f(i2)} {f(i2)} 0 0 0 {f(28+h)} 128 "
         f"A{f(i1)} {f(i1)} 0 1 0 128 {f(28+h)} "
         f"A{f(h)} {f(h)} 0 0 1 128 {f(28-h)} Z")
    return d

title, w, r, y = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-labelledby="t">'
      f'<title id="t">{title}</title>\n<path id="symbol" d="{drop(w, r, y)}"/></svg>')
