# Run results

Measurements for issue #1535. Three variants: no harness, Ziva's prompt
borrowed, and a purpose-built skill — a naive → borrowed → steel-man escalation. Times marked *(transcript)* are derived from the
local session `.jsonl` timestamps; times marked *(reported)* are as given by
the operator.

| # | Harness | Wall clock | Prompt | Notes |
|---|---|---|---|---|
| 01 | Claude Code, no extra config | ~50 min *(transcript)* | identical | interrupted 54s in, re-prompted 33 min later; 50 min is re-prompt → `push` |
| 02 | Ziva system prompt in CLAUDE.md, verbatim | 71 min *(reported)*, 75.3 raw / 63.5 active *(transcript)* | identical | true one-shot, 1 turn. 6 screenshots. Ignored the prompt's no-bash rule: 89 Bash + 9 Write calls |
| 03 | Fable-generated skill implementing Ziva's loop | — | — | queued |

Both prompts so far are byte-identical to `/tmp/skyward-prompt.txt` (verified by
comparison against the transcripts, not by eye).

## Browser availability differs between runs

Whichever run gets the chrome-devtools MCP can screenshot its own game; runs
without it are blind. Run 01 and run 03 took zero screenshots (run 03 tried and
hit a locked profile). Run 02 took 6. Worth holding
constant, or at least recording per run, since it is plausibly a larger effect
than the prompt.

## Measured output (AMD RX 7700S, Vulkan/ANGLE, headless Chrome, live Pages build)

Median frame time sampled over 3s of real rAF; payload from `PerformanceResourceTiming.transferSize` on first load.

| Run | FPS | Frame ms | First load | JS | Models fetched |
|---|---|---|---|---|---|
| 01 Skyward | 59.9 | 16.7 | 964 KB | 207 KB | 41 (754 KB) |
| 02 Sky Island Run | 59.9 | 16.7 | 901 KB | 168 KB | 34 (733 KB) |
| Driftlands *(discarded 2nd baseline)* | 59.9 | 16.7 | 873 KB | 170 KB | 35 (703 KB) |

All three are vsync-capped at 60. None is anywhere near the draft's "12 FPS",
and first load is under 1 MB against the draft's comparison to a 54 MB Godot
export. The performance and size arguments in the draft do not survive these
numbers; the quality and no-engine-UI arguments are untouched by them.

## Why there is no "Ziva as MCP server" variant

Ziva's MCP bridge cannot target a web project. `prepareBridgeContext()` in
`apps/plugin-server/src/mcp/install.ts` throws without `--godot-bin`, its
~40 tools (`get-scene-tree`, `run-scene`, `get-godot-errors`, `edit-tilemap`)
drive a live Godot editor, and `install-into-project.ts` bootstraps
`addons/ziva_agent/` into a Godot project. Supported engines are `godot` and
`unity`; there is no web target.

That is a finding, not a gap: the MCP route is unavailable for web game dev,
so the escalation goes straight from the borrowed prompt to a purpose-built
skill.

## Run 03 — the Fable-generated skill

Fable read Ziva's source and wrote
`.claude/skills/game-dev-loop/SKILL.md` (156 lines). It is the only file in
the run folder that differs from runs 01 and 02; `CLAUDE.md` is the unmodified
scaffold, so the skill is the single variable.

The loop it extracted, with the source that showed it:

- **Plan** — hard-gated read-only phase. `tools/visibility.ts` filters plan
  mode to query tools; `interaction-mode.ts` blocks action calls outright.
- **Implement** — todo-driven. `extensions/todo-list.ts` injects up to three
  "incomplete todos" reminders when the agent tries to end its turn.
- **Validate** — proactive structural checks before testing
  (`validate-physics-setup`, `get-node-warnings`), plus engine diagnostics
  appended to every tool result by `tools/executor.ts`.
- **Playtest** — the differentiator. `run-scene` takes timed input scripts with
  a required duration ("zero-work success is forbidden"); `qa-session` requires
  a probe per act ("without one there is no witness"); the playtest subagent
  prompt takes a refutation stance and treats a console error during a run as a
  failure.

What Fable judged **impossible** to replicate in a skill is the most useful
result for the article: every enforcement mechanism lives in harness code
outside the model. Plan-mode tool blocking, turn-end todo nudges, the loop
detector that kills a turn after three identical calls, and the ledger that
refuses a fifth repeat are all things Ziva *enforces* on a model that has
stopped paying attention. A skill can only ask. Also unreplicable: the
harness-kept attempt ledger (built precisely because model context is
unreliable memory), frozen turn-based game state with frame-exact stepping,
and trusted engine-level input injection — synthetic DOM events are
`isTrusted: false`.

## Run 02's CLAUDE.md

`ziva/packages/shared/system-prompt/__fixtures__/godot-pro.txt`, copied in
verbatim — byte-identical, no edits — above the unchanged scaffold doc. The
scaffold half and every other file in the folder match what runs 01 and 03
started from, so `CLAUDE.md` is the only variable.

The prompt is Godot-specific (GDScript conventions, `get_scene_tree`,
`run_scene`, a rule against using bash to write project files). That is a
property of the thing being tested, not a defect to correct: whatever it does
to a Three.js build is the measurement.

### Discarded attempt

An earlier run at this slot (1h30, transcript `992e75dd`, committed then
reverted) used an *edited* version of the prompt with the Godot-specific
sections removed. That is not a 1:1 test — the input was changed — so it is
not a valid data point for the comparison and has been discarded. It is
recoverable from git history if a "Ziva rules, adapted" row is ever wanted as
a separate variant.

## Browser availability differs between runs

Whichever run gets the chrome-devtools MCP can screenshot its own game; runs
without it are blind. Run 01 and run 03 took zero screenshots (run 03 tried and
hit a locked profile). Run 02 took 6. Worth holding
constant, or at least recording per run, since it is plausibly a larger effect
than the prompt.

## Measured output (AMD RX 7700S, Vulkan/ANGLE, headless Chrome, live Pages build)

Median frame time sampled over 3s of real rAF; payload from `PerformanceResourceTiming.transferSize` on first load.

| Run | FPS | Frame ms | First load | JS | Models fetched |
|---|---|---|---|---|---|
| 01 Skyward | 59.9 | 16.7 | 964 KB | 207 KB | 41 (754 KB) |
| 02 Sky Island Run | 59.9 | 16.7 | 901 KB | 168 KB | 34 (733 KB) |
| Driftlands *(discarded 2nd baseline)* | 59.9 | 16.7 | 873 KB | 170 KB | 35 (703 KB) |

All three are vsync-capped at 60. None is anywhere near the draft's "12 FPS",
and first load is under 1 MB against the draft's comparison to a 54 MB Godot
export. The performance and size arguments in the draft do not survive these
numbers; the quality and no-engine-UI arguments are untouched by them.

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
