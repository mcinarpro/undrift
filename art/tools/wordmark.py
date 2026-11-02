"""Monoline lowercase 'undrift' built from filled capsules and arc bands (no strokes, no live text).
Line 26, x-height 80..200, ascender 30. The f and t share one crossbar; the i's dot echoes the symbol's dot."""
import math, sys
W = 26; H = W / 2
f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")

def capsule(x1, y1, x2, y2):
    if x1 == x2:  # vertical, y1 < y2
        return (f"M{f(x1-H)} {f(y1)} A{f(H)} {f(H)} 0 0 1 {f(x1+H)} {f(y1)} V{f(y2)} "
                f"A{f(H)} {f(H)} 0 0 1 {f(x1-H)} {f(y2)} Z")
    return (f"M{f(x1)} {f(y1+H)} A{f(H)} {f(H)} 0 0 1 {f(x1)} {f(y1-H)} H{f(x2)} "
            f"A{f(H)} {f(H)} 0 0 1 {f(x2)} {f(y1+H)} Z")

def pt(cx, cy, r, a):
    return cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))

def band(cx, cy, r, a0, a1):
    """Arc band from angle a0 to a1 (degrees, screen coords: 90 = bottom), butt ends."""
    ro, ri = r + H, r - H
    sweep = 1 if a1 > a0 else 0
    large = 1 if abs(a1 - a0) > 180 else 0
    o0, o1, i1, i0 = pt(cx, cy, ro, a0), pt(cx, cy, ro, a1), pt(cx, cy, ri, a1), pt(cx, cy, ri, a0)
    return (f"M{f(o0[0])} {f(o0[1])} A{f(ro)} {f(ro)} 0 {large} {sweep} {f(o1[0])} {f(o1[1])} "
            f"L{f(i1[0])} {f(i1[1])} A{f(ri)} {f(ri)} 0 {large} {1-sweep} {f(i0[0])} {f(i0[1])} Z")

def dot(cx, cy, r):
    return f"M{f(cx-r)} {f(cy)} A{f(r)} {f(r)} 0 1 0 {f(cx+r)} {f(cy)} A{f(r)} {f(r)} 0 1 0 {f(cx-r)} {f(cy)} Z"

def ring(cx, cy, r):
    ro, ri = r + H, r - H
    return (f"M{f(cx-ro)} {f(cy)} A{f(ro)} {f(ro)} 0 1 0 {f(cx+ro)} {f(cy)} A{f(ro)} {f(ro)} 0 1 0 {f(cx-ro)} {f(cy)} Z "
            f"M{f(cx-ri)} {f(cy)} A{f(ri)} {f(ri)} 0 1 1 {f(cx+ri)} {f(cy)} A{f(ri)} {f(ri)} 0 1 1 {f(cx-ri)} {f(cy)} Z")

letters = {
    "u": [capsule(20, 80, 20, 140), band(80, 140, 60, 180, 0), capsule(140, 80, 140, 200)],
    "n": [capsule(196, 80, 196, 200), band(256, 140, 60, 180, 360), capsule(316, 140, 316, 200)],
    "d": [ring(432, 140, 60), capsule(492, 30, 492, 200)],
    "r": [capsule(550, 80, 550, 200), band(610, 140, 60, 180, 270), dot(610, 80, H)],
    "i": [capsule(664, 80, 664, 200), dot(664, 36, 19)],
    "f": [capsule(736, 70, 736, 200), band(776, 70, 40, 180, 270), capsule(776, 30, 788, 30)],
    "ft": [capsule(712, 80, 862, 80)],
    "t": [capsule(822, 50, 822, 160), band(862, 160, 40, 180, 90), dot(862, 200, H)],
}

def group(dx=0, dy=0):
    paths = "\n".join(f'  <path d="{d}"/>' for k in letters for d in letters[k])
    return f'<g id="wordmark" transform="translate({f(dx)} {f(dy)})">\n{paths}\n</g>'

if __name__ == "__main__":
    print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 882 256" width="882" height="256" role="img" '
          f'aria-labelledby="t"><title id="t">undrift</title>\n{group(0, 13)}</svg>')
