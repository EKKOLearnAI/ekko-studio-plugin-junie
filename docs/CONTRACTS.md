# Junie runtime contract

`plugin.json` declares the `agents` permission. `apply(ctx)` registers local ID `junie` on Agent API v1 and returns the registration disposer. Studio computes `plugin:junie/junie`. The runtime uses the SDK's [Agent definitions](../sdk/src/agents.ts). `contracts/plugin.json` has no plugin RPC, storage or checkpoint definitions.

## Identity and engine discovery

Native configuration and authentication belong to the OS user that runs Studio. Engine discovery and model access use the same Studio user and Profile that activated the plugin. Runs also check the current session ID and Agent ID. The CLI receives an allowlist of process environment variables for operating system support and Junie configuration. `EKKO_JUNIE_EXECUTABLE` is resolved before PATH. Absolute executables are launched directly. The Windows installer version marker resolves the native executable behind its launcher. Installation status probes `--version` and suppresses CLI output and discovery paths.

## ACP and model catalog

ACP v1 runs newline-delimited JSON-RPC over stdio with CLI wire logging and the startup update check disabled. The handshake checks the native agent identity. Authentication-required replies become a stable sign-in instruction. The model catalog uses `session/new` in a temporary workspace and reads the native `model` and `effort` select options, including grouped choices. The current default model's effort options are exposed. Disposable catalog sessions are deleted where the engine supports deletion. A turn confirms the selected model and effort in the real workspace before prompting. Raw CLI stderr and ACP error bodies are discarded.

## Turn, tools and attachments

Every run uses the Studio workspace's canonical directory and creates a fresh ACP session. The prompt contains Studio instructions, labeled history when available, and current user parts. Attachments are obtained through authorized SDK methods. Images use inline base64 and files use text or binary embedded resources. The prompt bypasses Studio storage paths. MCP is passed through `session/new` using ACP stdio, HTTP or SSE records, as supported by the agent.

The plugin sets Junie's `brave_mode` to `off` and verifies the response. Only the active native session can request a Studio tool approval. A single explicit grant maps to `allow_once`. Denial maps to a unique `reject_once` when available and cancellation otherwise. Approval and tool events expose a generic operation kind. Native arguments and results stay out of these events. The runtime forwards ordered text chunks and commits one final reply with optional native usage. It sends ACP cancel for the current turn before closing the process when the turn is interrupted.

## Continuity

The release advertises `streaming: true` and `resume: false`. Continuity comes from the Studio transcript supplied to each turn. ACP `session/load` was verified across separate processes on macOS with an isolated local model. JetBrains-account restart recovery, interruption and checkpoint compatibility need verification before publishing native Studio resume.
