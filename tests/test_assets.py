from pathlib import Path
import struct
import unittest
import zlib
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_flakes import read_mask, png


class AssetTests(unittest.TestCase):
    def test_shipped_png_pixels_match_each_upstream_mask(self):
        for i in range(7):
            with self.subTest(flake=i):
                rows = read_mask(ROOT / 'assets' / 'wsnow' / f'snow{i:02d}.png')
                data = (ROOT / 'assets' / f'flake{i}.png').read_bytes()
                self.assertEqual(data, png(rows), 'Regenerate assets with tools/build_flakes.py')
                offset, compressed = 8, b''
                while offset < len(data):
                    length = struct.unpack('!I', data[offset:offset + 4])[0]
                    if data[offset + 4:offset + 8] == b'IDAT':
                        compressed += data[offset + 8:offset + 8 + length]
                    offset += length + 12
                pixels = zlib.decompress(compressed)
                for y, row in enumerate(rows):
                    for x, char in enumerate(row):
                        start = y * (len(row) * 4 + 1) + 1 + x * 4
                        self.assertEqual(pixels[start:start + 4], b'\xff\xfa\xfa\xff' if char == '.' else b'\0\0\0\0')


if __name__ == '__main__':
    unittest.main()
