"""يولّد أيقونات أندرويد من أيقونة سطح المكتب نفسها — شعار واحد للنسختين."""
import os, sys
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "..", "..", "desktop", "launcher", "icon.png")
im = Image.open(src).convert("RGBA")
for d, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    out = os.path.join(here, "res", "mipmap-" + d)
    os.makedirs(out, exist_ok=True)
    im.resize((px, px), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
print("icons ok")
