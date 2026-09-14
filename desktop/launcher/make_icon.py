#!/usr/bin/env python3
"""يرسم أيقونة التطبيق: شمس «ميزان الشمس» الذهبية على أرضية داكنة.

نفس شعار الترويسة في التطبيق (دائرة وثمانية أشعة) مرسوماً بدقة ٤× ثم
مصغَّراً، فتخرج الحواف ناعمة بلا خطوط مسنَّنة.
"""
import math
import os

from PIL import Image, ImageDraw

INK = (26, 23, 20, 255)        # --ink-000 الداكن
GOLD = (224, 169, 75, 255)     # --wheat الذهبي
SIZES = [16, 24, 32, 48, 64, 128, 256]
SS = 4                          # معامل الرسم الفائق


def draw_sun(px: int) -> Image.Image:
    n = px * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # أرضية مربعة بزوايا دائرية
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=INK)

    c = n / 2.0
    core = n * 0.175          # نصف قطر قرص الشمس
    ray_in = n * 0.255        # بداية الشعاع
    ray_out = n * 0.375       # نهاية الشعاع
    ray_w = max(1, int(n * 0.062))

    d.ellipse([c - core, c - core, c + core, c + core], fill=GOLD)
    for i in range(8):
        a = math.radians(i * 45)
        dx, dy = math.cos(a), math.sin(a)
        d.line([c + dx * ray_in, c + dy * ray_in,
                c + dx * ray_out, c + dy * ray_out],
               fill=GOLD, width=ray_w)
        # أطراف مدوّرة كما في الشعار الأصلي (stroke-linecap="round")
        r = ray_w / 2.0
        for t in (ray_in, ray_out):
            x, y = c + dx * t, c + dy * t
            d.ellipse([x - r, y - r, x + r, y + r], fill=GOLD)

    return img.resize((px, px), Image.LANCZOS)


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    frames = [draw_sun(s) for s in SIZES]
    out = os.path.join(here, "icon.ico")
    frames[-1].save(out, format="ICO", sizes=[(s, s) for s in SIZES])
    frames[-1].save(os.path.join(here, "icon.png"))
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
