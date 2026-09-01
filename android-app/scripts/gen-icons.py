#!/usr/bin/env python3
"""Generate simple Fiberix launcher PNGs (no Pillow)."""
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'res')


def chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)


def write_png(path, w, h, pixel):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixel(x, y, w, h))
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def icon_pixel(x, y, w, h, round_icon=False):
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    nx = (x - cx) / (w / 2.0)
    ny = (y - cy) / (h / 2.0)
    r2 = nx * nx + ny * ny
    # rounded square for adaptive / round
    radius = 0.92 if round_icon else 0.78
    if round_icon:
        inside = r2 <= 1.02
    else:
        ax, ay = abs(nx), abs(ny)
        # squircle-ish
        inside = (ax ** 4 + ay ** 4) <= (radius ** 4) * 1.15
    if not inside:
        return (0, 0, 0, 0)
    t = (y / max(h - 1, 1))
    r = lerp(14, 2, t)
    g = lerp(165, 132, t)
    b = lerp(233, 199, t)
    # letter F
    fx, fy = x / w, y / h
    on_f = (
        (0.32 <= fx <= 0.46 and 0.26 <= fy <= 0.74)
        or (0.32 <= fx <= 0.70 and 0.26 <= fy <= 0.38)
        or (0.32 <= fx <= 0.62 and 0.46 <= fy <= 0.56)
    )
    if on_f:
        return (255, 255, 255, 255)
    return (r, g, b, 255)


def main():
    sizes = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }
    for folder, size in sizes.items():
        write_png(
            os.path.join(ROOT, folder, 'ic_launcher.png'),
            size, size,
            lambda x, y, w, h: icon_pixel(x, y, w, h, False),
        )
        write_png(
            os.path.join(ROOT, folder, 'ic_launcher_round.png'),
            size, size,
            lambda x, y, w, h: icon_pixel(x, y, w, h, True),
        )
    print('icons written')


if __name__ == '__main__':
    main()
