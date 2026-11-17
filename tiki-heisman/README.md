# Tiki — CJ Carr for Heisman

Notre Dame–themed OBS / IRL Toolkit browser-source overlays for Tiki. The page background is transparent. The lockup reads **CJ Carr for Heisman**. On the Block style, a reserved six-digit counter tracks how many times Tiki has said it, toward a goal of 100,000.

Hosted at:

https://crow-commits.github.io/wo-0cd376b7/tiki-heisman/

The controller is live across devices (no login, no account). Anyone who opens the controller URL can change the on-stream count and visibility.

## IRL Toolkit / OBS setup

Add **two** Browser sources. Set each source to **1920×1080**, and turn on a transparent background if the app offers it. Do **not** add the controller as a browser source.

**1. Card overlay** (default: bottom center)

```
https://crow-commits.github.io/wo-0cd376b7/tiki-heisman/overlay.html?style=block&pos=bottom-center&scale=1&w=1920&h=1080&anim=on
```

**2. Trophy overlay** (default: top right, its own source)

```
https://crow-commits.github.io/wo-0cd376b7/tiki-heisman/trophy.html?pos=top-right&scale=1&w=1920&h=1080&anim=on
```

Match the browser source width and height to the same `w` and `h` as the URL (1920×1080 by default). A typical layout is the card at bottom-center or bottom-left and the trophy at top-right.

## Controller

Open this on a phone or desktop. It is off-stream — keep it off the program bus.

```
https://crow-commits.github.io/wo-0cd376b7/tiki-heisman/controller.html
```

- The big gold **+1** button increments the count. There is also −1, Undo, Set exact value, and Reset (with a confirm).
- **Visibility** show/hide and anim on/off apply to the card and the trophy independently. Already-open overlays fade in or out.
- The status pill should read **Live** when the hosted channel is connected. **Reconnecting** / **Offline** mean the page is retrying; the last known count stays on screen.
- **Setup** (collapsed while you stream) still builds card and trophy URLs with position, scale, and canvas size if you need a custom layout.

The controller is password-protected on the device. Unlock it once and it stays unlocked in that browser until you tap **Lock**. This is a soft, client-side gate on a static site (the hosted channel topic still lives in `state.js`), so still treat the controller URL as private and share it only with people who should be able to tap +1.

Same-device tabs still update instantly (BroadcastChannel). Phones, other computers, and IRL Toolkit / OBS receive the same full state through a public pub/sub channel (ntfy.sh). Rapid taps are coalesced to at most about four hosted publishes per second; the latest full state is what gets sent. If the hosted cache expires (~12 hours with no messages), an overlay falls back to its last saved count or the `count=` URL seed, and reopening the controller republishes its last known state.

## Files

- `overlay.html` — the on-stream card overlay (text lockup and, in Block style, the times-said counter)
- `trophy.html` — a second on-stream overlay: a cutout of the real Heisman trophy
- `trophy.png` / `trophy.webp` — transparent cutout used by `trophy.html`
- `controller.html` — off-stream phone-first control panel
- `state.js` — shared counter state (local fast path + hosted live transport)

## Two styles

- **Style A, `?style=block`** (default) — the lockup sits inside one semi-opaque navy badge with a gold trim, plus the times-said counter.
- **Style B, `?style=text`** — loose lettering, no plate and no counter. A heavy navy stroke and a soft dark glow keep it readable on light and dark scenes.

## URL parameters

All values have safe fallbacks. Unknown or out-of-range values revert to the default.

| Param | Default | Notes |
| --- | --- | --- |
| `style` | `block` | `block` or `text` (aliases: `badge`/`plate`, `loose`/`outline`) |
| `pos` | `bottom-center` | `bottom-center`, `bottom-left`, `bottom-right`, `top-center`, `top-left`, `top-right`, `center` |
| `scale` | `1` | `0.15`–`4` |
| `w` | `1920` | Stage width, `100`–`7680` |
| `h` | `1080` | Stage height, `100`–`4320` |
| `anim` | `on` | `on`/`off` (also `1`/`0`, `true`/`false`). Alias: `animation`. Entrance + gold shimmer when on. Count pop on increment also follows this. |
| `count` | `0` | Cold-start seed for the times-said counter, `0`–`999,999`. Live updates from the controller override this once they arrive. |
| `room` | `default` | Isolates the same-device local channel if more than one counter is running on one computer. Does not change the hosted live topic. |

The copied overlay URL includes a snapshot of the current count as a seed. The Graduate font is embedded, so the overlay can render the type even if a font file is not next to it.

The counter reserves width for six digits plus a thousands comma (`000,000`) so 0, 12,345, and 100,000 do not shift the badge layout. A slim gold bar fills toward 100,000. Each increment plays a short gold pop when animation is on.

## Trophy overlay

`trophy.html` is a separate transparent page, not part of the card. Default position is **top-right**.

| Param | Default | Notes |
| --- | --- | --- |
| `pos` | `top-right` | Same position names as the card overlay |
| `scale` | `1` | `0.15`–`4` |
| `w` | `1920` | Stage width |
| `h` | `1080` | Stage height |
| `anim` | `on` | `on`/`off`. Entrance + gold shimmer across the trophy when on. Live show/hide and anim also follow the controller. |

The artwork is a transparent photo cutout of the real trophy (`trophy.png`, with a `trophy.webp` sibling), slightly warmed toward the overlay gold. A thin navy rim and a soft dark glow (CSS drop-shadow) keep it readable on light and dark scenes. When animation is on, a subtle gold sheen sweeps across the silhouette (CSS mask).
