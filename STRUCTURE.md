# Repo layout

One GitHub Pages site, one subdirectory per harness variant. The workflow
builds every `runs/*/` folder into `dist/<name>/` and publishes the root
`index.html` as the index.

```
index.html              landing page (plain static, no build step)
shared/models/          109 CC0 glTF — one copy, served by every run
runs/01-baseline/       Skyward — plain Claude Code            [done]
runs/02-claude-md/      Ziva system prompt in CLAUDE.md        [not yet run]
art-source/             .blend/.fbx/.obj sources (gitignored, 87MB)
```

## Adding a run

1. `cp -r runs/02-claude-md runs/03-whatever` **before** run 02 is played
   through, or copy from git: the pristine scaffold is commit `47bec9e`.
2. Add a `<li>` to `index.html`.

The workflow picks up the folder automatically.

## Why there is no CLAUDE.md at the repo root

Claude Code reads `CLAUDE.md` from the working directory *and every parent*.
A root one would give later runs context that run 01 never had, which would
quietly invalidate the comparison. Keep per-run instructions inside the run
folder.

## Keeping runs comparable

Every run starts from the same scaffold: same `index.html`, same
`src/{fatal,models,models.generated}.js`, same `vite.config.js`, same model
pack. Only the harness configuration differs. `runs/01-baseline/CLAUDE.md` is
byte-identical to `runs/02-claude-md/CLAUDE.md` — variant 02's change is to
*append* the Ziva system prompt to it.
