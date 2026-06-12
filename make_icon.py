from PIL import Image, ImageDraw

SS = 4            # supersampling factor
S = 512 * SS      # working size

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# ── background: vertical green gradient ──
img = Image.new("RGB", (S, S))
top = (0x52, 0xb7, 0x88)
bot = (0x1b, 0x43, 0x32)
px = img.load()
for y in range(S):
    c = lerp(top, bot, y / (S - 1))
    for x in range(S):
        px[x, y] = c

# soft light blob top-right
blob = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(blob)
bd.ellipse([S*0.55, -S*0.15, S*1.15, S*0.45], fill=(255, 255, 255, 18))
img = Image.alpha_composite(img.convert("RGBA"), blob)

d = ImageDraw.Draw(img)

LEAF = (0xdd, 0xf5, 0xe2, 255)   # light leaf
LEAF2 = (0xc3, 0xea, 0xd0, 255)  # leaf shade
STEM = (0xd8, 0xf3, 0xdc, 255)
POT = (0xe8, 0xfa, 0xee, 255)

def leaf(cx, cy, w, h, angle, color):
    """Draw a rotated leaf (ellipse) centred at cx,cy."""
    pad = int(max(w, h))
    layer = Image.new("RGBA", (pad*2, pad*2), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([pad - w//2, pad - h//2, pad + w//2, pad + h//2], fill=color)
    layer = layer.rotate(angle, resample=Image.BICUBIC, center=(pad, pad))
    img.alpha_composite(layer, (int(cx - pad), int(cy - pad)))

cx = S // 2

# stem
d.line([(cx, int(S*0.78)), (cx, int(S*0.40))], fill=STEM, width=int(S*0.032))
d.ellipse([cx-int(S*0.016), int(S*0.40)-int(S*0.016),
           cx+int(S*0.016), int(S*0.40)+int(S*0.016)], fill=STEM)

# leaves
leaf(cx - int(S*0.13), int(S*0.50), int(S*0.30), int(S*0.16),  35, LEAF2)
leaf(cx + int(S*0.13), int(S*0.42), int(S*0.30), int(S*0.16), -35, LEAF)
leaf(cx, int(S*0.31), int(S*0.16), int(S*0.30), 8, LEAF)

# pot
top_y = int(S*0.76)
bot_y = int(S*0.93)
d.polygon([(int(S*0.385), top_y), (int(S*0.615), top_y),
           (int(S*0.575), bot_y), (int(S*0.425), bot_y)], fill=POT)
# rim
d.rounded_rectangle([int(S*0.36), int(S*0.72), int(S*0.64), int(S*0.785)],
                    radius=int(S*0.03), fill=(0xea, 0xfa, 0xf0, 255))

img = img.convert("RGB")

for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    img.resize((size, size), Image.LANCZOS).save(name)
    print("wrote", name)
