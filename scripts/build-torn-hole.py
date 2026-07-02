"""Rebuild the hero torn-hole assets from the rawpixel green-screen source.

Produces (into public/):
  torn-hole.webm   - VP9+alpha, 1280x800: the page-lime paper tearing open ONCE
                     with an ease-out settle, frozen fully open on the last frame
  torn-poster.webp - frame 0 (video poster; alpha, hole partially open)
  torn-page.webp   - last frame (static fallback for Safari / reduced motion)

Pipeline (per frame):
  1. chroma-key the green hole -> soft matte (+ green despill before luma)
  2. flat-field correction — divides out the paper's vignette/uneven lighting
  3. colorize paper luma onto the EXACT page field (#A3E635 — the fixed
     PaperBackground sheet the landing actually shows; its grain overlay is
     replicated OVER the video by PageTear): multiply below base, lift toward
     white for the bright torn fibres
  4. radially attenuate texture so the far field is EXACTLY flat lime
  5. bake an inner rim shadow just inside the hole (depth cue)
  6. place onto a 1280x800 canvas; feather alpha to 0 well inside every
     object-fit:cover crop (box aspects 1:1 ... 1.7:1) -> zero visible seams
  7. time-remap source frames 0..30 (the opening half of the source's
     palindrome loop) with an ease-out curve -> the tear opens, settles, freezes

The CSS geometry in src/index.css (--rs and the (640, 388) hole centre) is
derived from the SCALE / TX / TY constants below — keep them in sync.

Usage:  python scripts/build-torn-hole.py   (needs ffmpeg, numpy, scipy, pillow)
"""
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image
import subprocess, os, math, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "torn-hole-source.mp4")
PUB = os.path.join(ROOT, "public")
TMP = tempfile.mkdtemp(prefix="torn-hole-")
print("frames ->", TMP)

# ---------------- color targets ----------------
def oklch_to_linear_srgb(L, C, Hdeg):
    a = C * math.cos(math.radians(Hdeg)); b = C * math.sin(math.radians(Hdeg))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return np.array([
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s])

def srgb_encode(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)

# The landing's visible sheet is PaperBackground's fixed #A3E635 field (NOT the
# .paper --background token) — the paper must match what is actually on screen.
LIME = np.array([0xA3, 0xE6, 0x35], np.float64) / 255.0
SH_RGB = srgb_encode(np.clip(oklch_to_linear_srgb(0.13, 0.015, 200.0), 0, 1))  # rim shadow

# ---------------- load source frames 0..31 (opening half-cycle) ----------------
W = H = 480
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", SRC, "-frames:v", "32",
                      "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
src = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32) / 255.0

# ---------------- per-source-frame derived channels ----------------
CX, CY = 235.0, 235.0                     # hole centroid at max-open (frame 30)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

mattes, shadings = [], []
for i in range(src.shape[0]):
    f = src[i]
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    hole = smoothstep(0.10, 0.32, g - np.maximum(r, b))    # 1 = green hole
    g_d = np.minimum(g, np.maximum(r, b) * 1.04)           # despill
    luma = 0.2126 * r + 0.7152 * g_d + 0.0722 * b
    paper = 1 - hole
    illum = gaussian_filter(luma * paper, 42) / np.maximum(gaussian_filter(paper, 42), 1e-4)
    shadings.append(np.clip(luma / np.maximum(illum, 1e-4), 0.45, 1.55))
    mattes.append(hole)
mattes = np.stack(mattes); shadings = np.stack(shadings)

# ---------------- static maps ----------------
SCALE = 1.5                               # source px -> canvas px
CANW, CANH = 1280, 800
TX, TY = 640.0, 388.0                     # hole centre on canvas
RX1, RY1, RX2, RY2 = 305.0, 295.0, 380.0, 358.0   # feather: alpha 1 inside, 0 beyond

def feather_map(shape, cx, cy, sc=1.0):
    yyc, xxc = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    dx = (xxc - cx) * sc; dy = (yyc - cy) * sc
    rr = np.sqrt(dx ** 2 + dy ** 2); ang = np.arctan2(dy, dx)
    r1 = 1.0 / np.sqrt((np.cos(ang) / RX1) ** 2 + (np.sin(ang) / RY1) ** 2)
    r2 = 1.0 / np.sqrt((np.cos(ang) / RX2) ** 2 + (np.sin(ang) / RY2) ** 2)
    u = np.clip((rr - r1) / np.maximum(r2 - r1, 1e-6), 0, 1)
    return 0.5 + 0.5 * np.cos(np.pi * u)                   # 1 -> 0, cosine

FEATHER_SRC = feather_map((H, W), CX, CY, SCALE)
DETAIL_W = FEATHER_SRC ** 2                                # texture dies a bit faster
FEATHER_CAN = feather_map((CANH, CANW), TX, TY)
VBIAS = 1 + 0.35 * np.clip((CY - yy) / 150.0, -1, 1)       # rim shadow: stronger up top

# ---------------- render ----------------
N_OUT = 84                                                 # 2.8 s @ 30 fps
S = int(round(W * SCALE))
x0, y0 = int(round(TX - CX * SCALE)), int(round(TY - CY * SCALE))

def build_frame(hole, shading):
    paper_a = 1 - hole
    s = 1 + (shading - 1) * DETAIL_W                       # far field -> flat lime
    dark = LIME[None, None, :] * (s[..., None] ** 1.12)    # tear shadows: multiply
    lift = np.clip((s - 1) * 2.4, 0, 0.92)[..., None]      # torn fibres: toward white
    paper_rgb = np.where(s[..., None] <= 1, dark, LIME[None, None, :] * (1 - lift) + lift)
    bl = gaussian_filter(paper_a, 9)                       # inner rim shadow
    sh_a = np.clip(np.clip(bl * 1.9, 0, 1) ** 1.25 * 0.62 * hole * VBIAS, 0, 0.85)
    a = paper_a + sh_a * (1 - paper_a)                     # paper OVER shadow
    rgb = (paper_rgb * paper_a[..., None]
           + SH_RGB[None, None, :] * (sh_a * (1 - paper_a))[..., None]) / np.maximum(a[..., None], 1e-5)
    pm8 = (np.clip(np.dstack([rgb * a[..., None], a[..., None]]), 0, 1) * 255).round().astype(np.uint8)
    pm_up = np.asarray(Image.fromarray(pm8, "RGBA").resize((S, S), Image.LANCZOS)).astype(np.float32) / 255.0
    canvas = np.empty((CANH, CANW, 4), np.float32)         # flat-lime alpha-1 base
    canvas[..., :3] = LIME[None, None, :]; canvas[..., 3] = 1.0
    canvas[y0:y0 + S, x0:x0 + S, :] = pm_up
    canvas *= FEATHER_CAN[..., None]                       # premultiplied feather
    a_c = canvas[..., 3:4]
    rgb_c = np.where(a_c > 1e-4, canvas[..., :3] / np.maximum(a_c, 1e-4), LIME[None, None, :])
    return (np.dstack([np.clip(rgb_c, 0, 1), np.clip(a_c, 0, 1)]) * 255).round().astype(np.uint8)

# Chrome's video pipeline renders this VP9 stream brighter than the same sRGB
# values in DOM/WebP (transfer/gamut handling applied regardless of the sRGB
# trc tag), with strong cross-channel gains (G reacts ~2x, B is nearly pinned
# by gamut clipping at this saturation). VIDEO_COMP was calibrated by
# screenshot-diffing the rendered page against the video zone (with the grain
# overlay active) until the flat paper matched the page. The WebP poster /
# fallback are NOT compensated (the image path renders sRGB faithfully).
VIDEO_COMP = np.array([-5.5, -0.4, -21.0], np.float32)
# The still-image path (poster/fallback <img>) renders sRGB faithfully, but the
# grain's soft-light pass composites differently over a replaced element than
# over the page background (B rises ~+17). Calibrated the same way as above.
WEBP_COMP = np.array([-4.4, 1.1, -20.3], np.float32)

def _comp(fr, comp):
    out = fr.astype(np.float32)
    out[..., :3] = np.clip(out[..., :3] + comp, 0, 255)
    return out.round().astype(np.uint8)

for i in range(N_OUT):
    u = i / (N_OUT - 1)
    ts = 30.0 * (1 - (1 - u) ** 3)                         # ease-out into the freeze
    f0 = int(np.floor(ts)); f1 = min(f0 + 1, 30); w = ts - f0
    fr = build_frame(mattes[f0] * (1 - w) + mattes[f1] * w,
                     shadings[f0] * (1 - w) + shadings[f1] * w)
    if i == 0:
        Image.fromarray(_comp(fr, WEBP_COMP), "RGBA").save(os.path.join(PUB, "torn-poster.webp"), quality=88, method=6)
    if i == N_OUT - 1:
        Image.fromarray(_comp(fr, WEBP_COMP), "RGBA").save(os.path.join(PUB, "torn-page.webp"), quality=88, method=6)
    Image.fromarray(_comp(fr, VIDEO_COMP), "RGBA").save(f"{TMP}/{i:04d}.png")

# transfer MUST be tagged sRGB (iec61966-2-1): the frames carry sRGB-encoded
# values, and an untagged/bt709-transfer HD stream makes Chrome apply a
# BT.1886->sRGB conversion that visibly lifts the dark blue channel of the lime.
subprocess.run([
    "ffmpeg", "-y", "-v", "warning", "-framerate", "30", "-i", f"{TMP}/%04d.png",
    "-vf", ("scale=out_color_matrix=bt709:out_range=tv,"
            "setparams=colorspace=bt709:color_primaries=bt709:color_trc=iec61966-2-1"),
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "30", "-b:v", "0",
    "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-auto-alt-ref", "0",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "iec61966_2_1",
    "-color_range", "tv", "-metadata:s:v:0", "alpha_mode=1",
    os.path.join(PUB, "torn-hole.webm")], check=True)
print("done:", os.path.join(PUB, "torn-hole.webm"))
