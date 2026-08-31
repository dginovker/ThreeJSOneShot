# ThreeJS One-Shot

Vite + Three.js scaffold that deploys itself to GitHub Pages. Drop a game into
`src/main.js`, push, and it's live.

## Local

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # serve the built dist/
```

## Publish

1. Create the GitHub repo and push this to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   (One-time. Without it the workflow fails at the deploy step.)
3. Every push to `main` builds and publishes to
   `https://<user>.github.io/<repo>/`. Watch it under the Actions tab.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | Page shell: canvas host, `#hud`, `#fatal` overlay |
| `src/main.js` | Game entry point — replace this |
| `src/fatal.js` | Puts uncaught errors on screen instead of the console |
| `vite.config.js` | `base: './'` so the build works at any Pages path |
| `.github/workflows/deploy.yml` | Build + deploy on push to `main` |
| `CLAUDE.md` | Constraints for an agent generating the game |
