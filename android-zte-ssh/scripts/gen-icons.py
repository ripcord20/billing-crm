#!/usr/bin/env python3
"""Generate launcher PNGs without Pillow."""
import os
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}


def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)


def write_png(path, w, h, pixels):
    raw = b''
    for y in range(h):
        raw += b'\x00' + pixels[y * w * 4:(y + 1) * w * 4]
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)


def draw(size):
    px = bytearray(size * size * 4)
    bg = (15, 23, 42, 255)
    acc = (56, 189, 248, 255)
    ok = (52, 211, 153, 255)

    def setp(x, y, c):
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 4
            px[i:i + 4] = bytes(c)

    for y in range(size):
        for x in range(size):
            setp(x, y, bg)

    m = size / 108.0

    def rect(x0, y0, x1, y1, c):
        for y in range(int(y0 * m), int(y1 * m)):
            for x in range(int(x0 * m), int(x1 * m)):
                setp(x, y, c)

    rect(30, 34, 78, 42, acc)
    rect(30, 50, 58, 58, acc)
    rect(30, 66, 70, 74, ok)
    return bytes(px)


def main():
    res = os.path.join(ROOT, 'app', 'src', 'main', 'res')
    for folder, size in SIZES.items():
        data = draw(size)
        write_png(os.path.join(res, folder, 'ic_launcher.png'), size, size, data)
        write_png(os.path.join(res, folder, 'ic_launcher_round.png'), size, size, data)
    print('icons ok')


if __name__ == '__main__':
    main()
