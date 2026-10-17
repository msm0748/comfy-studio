# SDD ledger — plan: docs/superpowers/plans/2026-10-17-image-generation.md

Execution: Native, user approved on 2026-10-17. Branch: feat/comfy-studio-image.
Pre-flight: tasks 1→2 share Preset/GenerationInput; tasks 2→3 share ApiGraph/NodeInfo; tasks 3→4 share JobRecord/ModelOption; interfaces consistent.
Ruling: user requested Higgsfield-like experience after approving the plan; use dark charcoal surfaces, lime accents and a large visual workspace instead of ivory. No additional approval needed for this explicit correction. Cost if wrong: visual styling needs revision.
Ruling: reuse the user's existing Next.js folder on a new feature branch, per desktop instructions. No new worktree. Cost if wrong: implementation lives alongside existing local work.
Ruling: adapt bash-only progress helpers to this checked-in PowerShell-compatible ledger. Cost if wrong: bookkeeping is manual, not generated.

Task 1: complete — commit 3f3dbfb, validation tests RED→GREEN, 3/3 passed.
Task 2: complete — three graph snapshots tested; saved settings, Qwen switch, Krea dynamic sampling preserved; workflow tests RED→GREEN, 4/4 passed.
Task 3: complete — persistent jobs, idempotent submissions, safe image lookup, missing-model checks and reconnect behavior; 11/11 tests and TypeScript passed. Test scratch moved inside workspace because sandbox denies atomic replace in virtualized OS temp.
Task 3: Ruling: local HTTP check exposed Next 16.4 Cache Components forbidding explicit route runtime exports; use the default Node runtime and remove those exports. Cost if wrong: a future runtime migration needs explicit configuration review.
Task 4: complete — responsive dark image workspace, three preset choices, model-specific sizes, prompt ideas, result download and native keyboard-accessible lightbox implemented.
Task 5: verification in progress — UI generated a real Z-Image 1024×1024 PNG (18.51 seconds of ComfyUI execution), PNG download returned HTTP 200, 1,121,707 bytes with correct signature/dimensions. Other two models passed graph/file/node checks only. Current suite 13/13 and production build passed.
Responsive QA: 320, 390 and 768 px content widths match viewport widths, no horizontal overflow. The failing mobile canvas ratio/min-height interaction was reproduced and corrected with explicit width constraints.
Ruling: Windows Tailwind-specific loader failed even outside the sandbox; use standard CSS and the default Turbopack CSS pipeline. Cost if wrong: future Tailwind utility work needs loader re-evaluation.
Ruling: Next.js normalizes the internal request URL; same-origin validation uses the actual Host header instead. Both same-host acceptance and cross-site rejection are covered by a regression test. Cost if wrong: a future reverse-proxy deployment must preserve the original Host correctly.
Final review: independent fresh reviewer found three Important issues and no Critical issues.
Final: fixed ambiguous POST/restore recovery — submit identity and input persist before POST; pending state survives response failure; recovery never creates a fresh ID. submission tests RED→GREEN.
Final: fixed accepted-job metadata failure — separate submission from persistence, retry persistence, retain accepted prompt in memory, recover by ComfyUI extra_data after restart. metadata replacement regression RED→GREEN.
Final: fixed stale availability — failed refresh disables models; generation requires confirmed connectivity; model API checks live health even when schemas are cached. availability regression RED→GREEN.
Deferred minors: none reported.
Task 5: complete — final 18/18 tests, TypeScript and production build passed after review fixes; no Critical or Important findings remain. No merge or external deployment performed. Existing local preview remains available on 127.0.0.1:3001.
