# CoopCupid landing page

The one-page website shares its local Montserrat and Rubik Bubbles fonts, Valentine’s palette, and extension preview with the Chrome surface.

From the repository root:

```sh
npm run build:site
npm run preview:site
```

The static deployable output is `surfaces/site/dist`. No backend, analytics, external font calls, or visitor account is needed.

Release links are deliberately placeholders. Set `chrome` and `github` in `release-links.js` to real HTTPS release URLs. Empty URLs open an accessible coming-soon dialog; the page does not pretend an installation occurred.

`assets/extension-preview.png` is a rendered screenshot of the extension with synthetic test jobs. The surrounding laptop and WaterlooWorks view recreate the supplied screenshot in HTML/CSS with blurred synthetic posting details. Font licenses are shipped beside the fonts.

Hosting identity lives in `.openai/hosting.json`. The source build is run from the repository root so it can copy the extension's shared assets.

The hosted source snapshot includes shared assets under `assets/` and can also be built on its own with `node build.mjs`.
