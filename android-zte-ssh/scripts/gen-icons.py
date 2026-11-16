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
    bg = (7, 8, 20, 255)
    acc = (34, 211, 238, 255)
    mag = (255, 78, 205, 255)
    ok = (74, 222, 128, 255)

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
    rect(30, 50, 58, 58, mag)
    rect(30, 66, 70, 74, ok)
    return bytes(px)


def draw_feature(w, h):
    px = bytearray(w * h * 4)
    bg = (7, 8, 20, 255)
    acc = (34, 211, 238, 255)
    mag = (255, 78, 205, 255)
    ok = (74, 222, 128, 255)
    text = (248, 250, 252, 255)

    def setp(x, y, c):
        if 0 <= x < w and 0 <= y < h:
            i = (y * w + x) * 4
            px[i:i + 4] = bytes(c)

    for y in range(h):
        for x in range(w):
            setp(x, y, bg)
    for y in range(0, h):
        for x in range(0, 8):
            setp(x, y, acc)
    for y in range(36, 44):
        for x in range(48, 280):
            setp(x, y, acc)
    for y in range(56, 64):
        for x in range(48, 180):
            setp(x, y, mag)
    for y in range(76, 84):
        for x in range(48, 220):
            setp(x, y, ok)
    for y in range(120, 128):
        for x in range(48, 360):
            setp(x, y, text)
    for y in range(h - 8, h):
        for x in range(0, w):
            setp(x, y, mag)
    return bytes(px)


def main():
    res = os.path.join(ROOT, 'app', 'src', 'main', 'res')
    for folder, size in SIZES.items():
        data = draw(size)
        write_png(os.path.join(res, folder, 'ic_launcher.png'), size, size, data)
        write_png(os.path.join(res, folder, 'ic_launcher_round.png'), size, size, data)
    play = os.path.join(ROOT, 'play')
    write_png(os.path.join(play, 'icon-512.png'), 512, 512, draw(512))
    write_png(os.path.join(play, 'feature-1024x500.png'), 1024, 500, draw_feature(1024, 500))
    print('icons ok')


if __name__ == '__main__':
    main()
