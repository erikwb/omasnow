# Vintage snowflakes from Wsnow

The seven `snow00.png`–`snow06.png` files are unmodified images from
**Wsnow 0.92**, copyright 2020 Willem Vermin, released under the MIT license.
The archive's license declaration is preserved verbatim in
[`UPSTREAM-README.md`](UPSTREAM-README.md); the MIT terms are in [`LICENSE`](LICENSE).

Source: https://sourceforge.net/projects/wsnow/files/wsnow-0.92.zip/download

Project: https://sourceforge.net/projects/wsnow/

Archive SHA-256: `4193cc420673ae33fbfcd7639067b4c8d3593693e5e1629e613f8bec734ec22d`.
Checksums for the unmodified source images are recorded in [`SHA256SUMS`](SHA256SUMS).

Wsnow acknowledges Rick Jansen as the creator of the original Xsnow.
These seven masks preserve the pixel silhouettes of Xsnow's vintage flakes.

Omasnow's `tools/build_flakes.py` decodes these 1-bit grayscale PNGs using the
Python standard library. It exports their masks to `Flakes.js` and creates
`assets/flake0.png`–`assets/flake6.png` with the X11 `snow` color (`#fffafa`).
The conversion changes the opaque source pixels from white to `snow`; their
positions, transparency, and dimensions remain unchanged.

Keep this attribution and the MIT license with the original images and their
generated derivatives.
