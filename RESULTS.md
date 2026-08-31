# Run results

Measurements for issue #1535. Times marked *(transcript)* are derived from the
local session `.jsonl` timestamps; times marked *(reported)* are as given by
the operator.

| # | Harness | Wall clock | Prompt | Notes |
|---|---|---|---|---|
| 01 | Claude Code, no extra config | ~50 min *(transcript)* | identical | interrupted 54s in, re-prompted 33 min later; 50 min is re-prompt → `push` |
| 02 | Claude Code, no extra config — see caveat | 39 min *(reported)*, 42.3 min *(transcript)* | identical | one screenshot pasted by the operator 27 min in |
| 03 | Claude Code, no extra config — see caveat | 54 min *(transcript)* | identical | true one-shot: 1 user turn, no pasted images |
| 04 | Fable-generated skill | — | — | not yet run |

Both prompts so far are byte-identical to `/tmp/skyward-prompt.txt` (verified by
comparison against the transcripts, not by eye).

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

## Caveat on run 02

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
