# Tiki — Road To The Natty overlay

A transparent OBS / Moblin browser-source overlay for Tiki. One line of Notre Dame–inspired gold typography flips on the X axis between **Road To The Natty** and **I'm Hearing You!** every 2.5 seconds (configurable). There is no plate or card — only the letters (plus small shamrock ornaments) on a fully transparent page.

Hosted on GitHub Pages:

- Overlay (browser source): https://crow-commits.github.io/wo-0cd376b7/tiki-natty/overlay.html
- Controller (off-stream URL builder): https://crow-commits.github.io/wo-0cd376b7/tiki-natty/controller.html

## Files

- `overlay.html` — the stream layer (add this as a browser source)
- `controller.html` — off-stream URL builder with a live preview (do **not** add this to the scene)

The controller does **not** remotely control a running overlay. It only builds a URL. After you change settings, copy the URL and paste it into the browser source.

## Fonts

Primary face is **Graduate** (embedded in `overlay.html`, so it works from a local file with no network). Fallback stack: Alfa Slab One, Rockwell, Trajan Pro, Arial Black, Times New Roman, serif.

Colors are ND-inspired — navy `#0C2340`, metallic gold `#C99700`, Irish green `#00843D` — with no official marks, logos, or leprechaun.

## URL parameters

All parameters are optional. Missing or invalid values fall back to the defaults below.

| Param | Default | Meaning |
| --- | --- | --- |
| `w` | `1920` | Overlay canvas width, in pixels |
| `h` | `1080` | Overlay canvas height, in pixels |
| `interval` | `2.5` | Seconds each phrase stays on screen before flipping |
| `a` | `Road To The Natty` | Front phrase |
| `b` | `I'm Hearing You!` | Back phrase |
| `pos` | `bottom-center` | `bottom-center`, `top-center`, `center`, `bottom-left`, `bottom-right` (also `top-left`, `top-right`) |
| `scale` | `1` | Scale of the typography (does not change `w` / `h`) |

Example:

```
overlay.html?w=1920&h=1080&interval=2.5&a=Road%20To%20The%20Natty&b=I'm%20Hearing%20You!&pos=bottom-center&scale=1
```

## OBS

1. Open `controller.html` in a regular browser (off-stream) and copy the overlay URL, or point at `overlay.html` directly.
2. In OBS, add a **Browser** source.
3. Use a local file (`overlay.html`) or a hosted URL, including any query parameters you want.
4. Set the Browser source **Width** and **Height** to the same values as `w` and `h` (1920 × 1080 by default).
5. Leave the source background transparent (OBS does this for Browser sources). Place and size the source in the scene if you need it somewhere other than the full canvas — but if `w` / `h` already match the canvas, you usually leave it at 1920 × 1080 and use the `pos` parameter to place the text.

Shutdown / refresh: after you change the URL, paste the new one into the source and refresh it. The overlay keeps flipping on its own with a CSS animation; you do not need to interact with it on stream.

## Moblin

Two different sizes are easy to mix up:

- **The webpage canvas (`w` and `h`)** is the size of the page itself — the coordinate space the typography is laid out in (default 1920 × 1080). The text is positioned inside that page by the `pos` and `scale` parameters. Set these in the overlay URL.
- **The Moblin scene widget position and size** is where you place and scale that entire webpage inside your Moblin scene. This is like moving a monitor around the program output. It does not change the page’s own `w` / `h`, and it does not replace `pos`.

Practical setup:

1. Build the URL in `controller.html` (or use `overlay.html` with defaults).
2. In Moblin, add a web / browser (webpage) widget for `overlay.html`.
3. Set the widget’s content size (or the page width and height Moblin asks for) to match `w` × `h`, typically 1920 × 1080.
4. Then position and resize the widget in the Moblin scene as you would any other source. If you shrink the widget, the whole 1920 × 1080 page — including the letters — scales down with it.
5. Moblin shows only the overlay page on stream. Keep `controller.html` on a separate device or desktop; it is not part of the scene.

If the text sits in the wrong part of the frame, change `pos` (or `scale`) in the URL first. Use the Moblin widget only to place the whole overlay in the scene.

## IRL Toolkit (Cloud OBS)

IRL Toolkit's Cloud OBS includes browser sources, and Remote OBS lets you add sources the same way as desktop OBS ([IRLToolkit](https://irltoolkit.com/), [Dashboard / Remote OBS](https://kb.irltoolkit.com/cloudobs/7-Advanced/dashboard)).

1. Open your server dashboard at irl.run and click **Remote OBS** in the navigation ([Quick Start](https://kb.irltoolkit.com/cloudobs/0-QuickStart)).
2. Open the scene that should show the overlay (usually `Ingest`; add it to `Ingest Low-bitrate` and `Ingest Offline` too if you want it on those scenes).
3. Add a **Browser** source.
4. Set the source **URL** to https://crow-commits.github.io/wo-0cd376b7/tiki-natty/overlay.html (add any query parameters you want, or paste the URL copied from the controller).
5. Set **Width** to `1920` and **Height** to `1080` (the same values as `w` and `h`).
6. Do **not** add `controller.html` to the scene. The controller stays off-stream at https://crow-commits.github.io/wo-0cd376b7/tiki-natty/controller.html. The Browser source runs on the remote server, not on your computer.

Official docs also describe uploading files in Remote OBS: click the `☰` button in the top right, drag files into the box, and they appear in the `dependencies` folder ([same Dashboard page](https://kb.irltoolkit.com/cloudobs/7-Advanced/dashboard)). That is documented as media upload onto the server. IRL Toolkit does not explicitly document pointing a Browser source at an uploaded `.html` as a local file, so a public https URL is the confirmed method.

