#!/usr/bin/env python3
"""Generate simple Fiberix launcher PNGs (no Pillow)."""
import argparse
import os
import struct
import zlib

DEFAULT_ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'res')


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


def parse_rgb(s):
    parts = [int(x.strip()) for x in s.split(',')]
    if len(parts) != 3 or any(n < 0 or n > 255 for n in parts):
        raise ValueError('rgb must be r,g,b 0-255')
    return tuple(parts)


def letter_on(letter, fx, fy):
    L = (letter or 'F').upper()[:1]
    if L == 'P':
        return (
            (0.32 <= fx <= 0.46 and 0.26 <= fy <= 0.74)
            or (0.32 <= fx <= 0.68 and 0.26 <= fy <= 0.38)
            or (0.32 <= fx <= 0.68 and 0.46 <= fy <= 0.56)
            or (0.56 <= fx <= 0.68 and 0.26 <= fy <= 0.56)
        )
    # default F
    return (
        (0.32 <= fx <= 0.46 and 0.26 <= fy <= 0.74)
        or (0.32 <= fx <= 0.70 and 0.26 <= fy <= 0.38)
        or (0.32 <= fx <= 0.62 and 0.46 <= fy <= 0.56)
    )


def make_pixel(letter, from_rgb, to_rgb, round_icon):
    def icon_pixel(x, y, w, h):
        cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
        nx = (x - cx) / (w / 2.0)
        ny = (y - cy) / (h / 2.0)
        r2 = nx * nx + ny * ny
        radius = 0.92 if round_icon else 0.78
        if round_icon:
            inside = r2 <= 1.02
        else:
            ax, ay = abs(nx), abs(ny)
            inside = (ax ** 4 + ay ** 4) <= (radius ** 4) * 1.15
        if not inside:
            return (0, 0, 0, 0)
        t = (y / max(h - 1, 1))
        r = lerp(from_rgb[0], to_rgb[0], t)
        g = lerp(from_rgb[1], to_rgb[1], t)
        b = lerp(from_rgb[2], to_rgb[2], t)
        fx, fy = x / w, y / h
        if letter_on(letter, fx, fy):
            return (255, 255, 255, 255)
        return (r, g, b, 255)
    return icon_pixel


def write_icons(out_root, letter, from_rgb, to_rgb):
    sizes = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }
    for folder, size in sizes.items():
        write_png(
            os.path.join(out_root, folder, 'ic_launcher.png'),
            size, size,
            make_pixel(letter, from_rgb, to_rgb, False),
        )
        write_png(
            os.path.join(out_root, folder, 'ic_launcher_round.png'),
            size, size,
            make_pixel(letter, from_rgb, to_rgb, True),
        )


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=DEFAULT_ROOT)
    p.add_argument('--letter', default='F')
    p.add_argument('--from-rgb', default='14,165,233')
    p.add_argument('--to-rgb', default='2,132,199')
    args = p.parse_args()
    write_icons(args.out, args.letter, parse_rgb(args.from_rgb), parse_rgb(args.to_rgb))
    print('icons written to', os.path.abspath(args.out))


if __name__ == '__main__':
    main()
