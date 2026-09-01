# Run results

Measurements for issue #1535. Times marked *(transcript)* are derived from the
local session `.jsonl` timestamps; times marked *(reported)* are as given by
the operator.

| # | Harness | Wall clock | Prompt | Notes |
|---|---|---|---|---|
| 01 | Claude Code, no extra config | ~50 min *(transcript)* | identical | interrupted 54s in, re-prompted 33 min later; 50 min is re-prompt → `push` |
| 02 | Ziva workflow rules in CLAUDE.md | 1h30 *(reported)*, 88.9 min active *(transcript)* | identical | **saw its own game**: 8 screenshots, 10 navigations, 9 script evals. One `.` nudge after a 7.4h idle gap |
| 03 | Claude Code, no extra config — see caveat | 54 min *(transcript)* | identical | true one-shot: 1 user turn, no pasted images |
| 04 | Fable-generated skill | — | — | not yet run |

Both prompts so far are byte-identical to `/tmp/skyward-prompt.txt` (verified by
comparison against the transcripts, not by eye).

## Run 02 (rerun) — the first run where the harness actually differed

`CLAUDE.md` carried the adapted Ziva rules for the whole run (106 lines,
unchanged from handoff). Prompt byte-identical to run 01.

The headline difference is that this run **had vision**: it drove the browser,
took 8 screenshots of its own game, evaluated scripts against the running page
and iterated. Runs 01 and 03 never got a single screenshot — run 03 tried and
was blocked by a locked browser profile. So run 02 vs 03 is not a clean
prompt-only comparison; vision availability differed too, and that is probably
the larger effect.

Active time excludes idle: the raw session span is 542 min, of which 453 min is
a single overnight gap. The 19-minute tail after the operator typed `.` is
included in the 88.9 min.

## Caveat on run 03

Run 03 was intended as "Ziva as MCP server". No Ziva MCP server was attached:
the only MCP tools in the transcript are the ambient chrome-devtools and stripe
plugins, and there is no `.mcp.json` or `.claude/` in the run folder.

It is the cleanest run so far in one respect — a single user turn, prompt
byte-identical to run 01, no pasted screenshots. 54 min matches the transcript
exactly (16:18:43 → 17:13:01); the session's raw 367-minute span is a 310-minute
idle gap after work stopped.

Notably it *tried* to see its own game: it called the chrome-devtools MCP and
got `The browser is already running for .../chrome-profile` every time, then
gave up and proceeded without ever taking a screenshot. So it was blind by
tooling failure rather than by design — worth knowing before citing it as
evidence that Claude Code works blind.

## How run 02's CLAUDE.md was built

Ziva's own system prompt is Godot-specific
(`ziva/packages/shared/system-prompt/__fixtures__/godot-pro.txt`). Pasted
verbatim into a Three.js project it would instruct the agent to use tools that
do not exist here (`get_scene_tree`, `run_scene`, `search_docs`,
`create_file`/`edit_file`) and would forbid it from using bash to write project
files — which is how Claude Code builds anything. That would measure a
mismatched prompt, not a harness.

So the engine-agnostic workflow rules were kept and the engine-specific
sections dropped. The diff against the scaffold CLAUDE.md is a pure addition:
43 lines added, 0 removed.

**Kept** (translated where a tool was named): investigate before acting; infer
intent rather than asking clarifying questions; batch independent calls; form a
plan then execute; diagnose root cause and never retry an identical call; don't
give up after one failure; don't re-execute a denied call; verify after changing
— re-read files, build, run the game and look at it; prefer `.gltf`.

**Dropped**: GDScript typing conventions, Godot scene/tileset/sprite-atlas
tooling, the Ziva-tool file-write rule, multiplayer and analytics provisioning,
and the Godot runtime footer.

## Caveat on the overwritten run 02 (Skybound)

Run 02 was intended as "Ziva system prompt in CLAUDE.md", but the executed run
does not match that description:

- `runs/02-claude-md/CLAUDE.md` is byte-identical to the scaffold it was copied
  from — no Ziva prompt was appended.
- No `.mcp.json` and no `.claude/` directory in the run folder.
- No Ziva system-prompt text anywhere in the session transcript.

As executed it is a second no-extra-config run. Either re-run it with the Ziva
prompt actually in `CLAUDE.md`, or relabel it — the folder name and the card in
`index.html` both still say `claude-md`.

Run 02 also received a pasted screenshot 27 minutes in, so it was not blind for
its whole duration the way run 01 was. That matters for the "the user was
blind" claim in the issue.
