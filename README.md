# tpmidiconfig

This folder defines the GitHub Pages deployment for TPMidi Config.

The workflow builds a clean artifact containing only:

- `index.html`
- `config.css`
- `tokens.css`
- `firmware-update.js`

Firmware source, signing material, A/B tooling, DAW scripts and all other
repository files are excluded from the published artifact.

`Update latest release` can only download from a public GitHub Release. If the
firmware repository remains private, use `Use manual file` or publish signed
`.tmim` assets in a separate public release-only repository and update the API
URL in `TPMidi/config.html` accordingly.
