# JetBrains Junie for Ekko Studio

This MIT-licensed plugin registers `plugin:junie/junie` for streaming one-to-one chat through the official JetBrains Junie CLI and Agent Client Protocol (ACP). Use **Global** with Junie's native provider and credentials, or **Scoped** with your own Studio model configuration.

## Install the plugin and CLI

1. In Studio **Plugins**, install the plugin from its local absolute directory or the [GitHub repository](https://github.com/EKKOLearnAI/ekko-studio-plugin-junie), confirm trust and enable it. For a local checkout, run `npm ci --omit=dev --ignore-scripts` in the plugin directory first. For reproducible GitHub installs, use `github:EKKOLearnAI/ekko-studio-plugin-junie#<full-commit>`.
2. In **Agent management → JetBrains Junie**, choose **Install**. Studio downloads the latest stable JetBrains ACP binary for its host OS and architecture, checks the official SHA-256 and enforces the archive size limit and verifies the CLI version and ACP handshake. Compatible official archives are published for macOS, Linux and Windows on x64 and arm64. [JetBrains ACP releases](https://github.com/JetBrains/junie-acp-release/releases) · [ACP registry](https://agentclientprotocol.com/get-started/registry)
3. Use **Check update** to see the latest compatible stable build, then choose the offered upgrade. The **Automatic updates** policy, when enabled in Studio, applies to managed installations. **Delete** removes the managed engine and retains Junie's native login, home, settings and conversations. Install, update and delete require the activating Studio account and Profile and Studio's engine-management permissions.

### Use an external CLI

Studio detects an existing Junie executable on the service PATH or in the official installer location. An absolute `EKKO_JUNIE_EXECUTABLE` setting takes precedence. On Windows use the native `.exe`, or let Studio resolve the executable behind the official batch launcher. Studio resolves the native binary behind JetBrains' marked macOS/Linux launcher to avoid applying pending launcher updates.

Studio uses the existing external installation and reports that it is managed elsewhere. The shared Agent UI can still render management buttons for an external CLI. The backend refuses to upgrade or delete an external executable. After deleting a managed engine, Studio shows it as missing until reinstalled. To select an external executable after deletion, set an explicit override and restart Studio. [Junie CLI quickstart](https://junie.jetbrains.com/docs/junie-cli.html)

## Choose a mode

| Mode | Model and credentials | How to start |
| --- | --- | --- |
| **Global** | Junie's native model catalog and login under the Studio service OS user. Available to the Studio account and Profile that enabled the plugin. | In Agent management, open **Junie login** and run the displayed command as the Studio service user. Sign in through Junie, enter a Junie API key or configure a native model. Refresh the catalog and select a Junie model in Global chat. |
| **Scoped** | The calling account and Profile's Studio model selection. Studio issues the run authorization. Junie uses a private, per-turn local model profile and sends requests through Studio's gateway. | Configure a provider and model in Studio, choose **Scoped** and select that model. Select a workspace as in Global. |

When using a dedicated `JUNIE_HOME`, set the same value for the Studio process and the login terminal. The login command displays the selected executable without credentials. To use a native API key from the service environment, configure `JUNIE_API_KEY` there. [JetBrains account and keys](https://junie.jetbrains.com/docs/junie-cli.html#manage-your-account)

Scoped uses OpenAI Chat Completions between Junie and Studio. Studio determines how to reach the selected upstream provider. It records scoped usage from the gateway. Scoped starts with an isolated Junie home and custom model, and can receive run-scoped MCP servers from Studio when provided. [Junie custom models](https://junie.jetbrains.com/docs/custom-llm-models.html)

## Manage native user settings

Open **Agent management → JetBrains Junie → Settings** to see **Native configuration**, with runtime information, the terminal sign-in command and a link back to Agent management. **Junie login** remains available in the sidebar with the vendor attribution. The management pages are available to the Studio account and Profile that enabled the plugin.

| Page | Native file | Editing |
| --- | --- | --- |
| **Skills** | `$JUNIE_HOME/skills/<name>/SKILL.md` | Search name or description, select a row to read its Markdown, and add, edit or remove it. The editor writes YAML frontmatter from the name and description and preserves additional metadata. **Edit full SKILL.md** opens the raw editor. Removal leaves supporting files in place. |
| **MCP servers** | `$JUNIE_HOME/mcp/mcp.json` | Search cards by name, transport or visible connection parameters. View a redacted preview, add, patch, remove, enable or disable a named server. Use `command`, `args` and `env` for stdio, `url` and `headers` for HTTP(S), and optional `timeout` in milliseconds. |
| **Native configuration** | `$JUNIE_HOME/config.json` | Edit `model`, `effort`, `skill-default-locations` and `mcp-default-locations` as JSON. Removing an editable key restores the native fallback. Other keys are preserved on disk. |

Global ACP and these pages use the same native user home. The default is `~/.junie` for the host service user. The next Global session can load the saved files according to Junie's discovery and precedence rules. Project settings and launch options can override user defaults. Studio's Scoped mode continues to use its isolated per-turn home and model authorization. Studio can still pass its own MCP transports to either mode. [Skills](https://junie.jetbrains.com/docs/agent-skills.html) · [MCP configuration](https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html) · [Configuration precedence](https://junie.jetbrains.com/docs/junie-cli-configuration.html)

The pages manage the three default user locations. Use Junie's `/skills` for individual Skill activation, ACP `/mcp` for read-only connection status, and terminal Junie's `/mcp` for native MCP actions in other sources and OAuth. The native CLI also manages project settings, shared and additional Skills, model profiles and `settings.json`. The configuration page is read-only when the service disables default config locations.

The MCP switch uses Junie's native per-entry `enabled: false` when turned off and restores the default by removing the key when turned on. It applies to newly started Global turns that load the user file. The card and details show executable and script basenames, recognized launch options or package names, HTTP(S) origins and timeout. After a recognized script or package, the preview shows validated ports, worker counts such as `--threads 4`, local bind addresses, transport and log level. Directory options such as `--dir /tmp/project` can show ordinary relative paths or paths under recognized temporary roots. Private and credential-like paths, configuration file paths, unknown arguments and values after an ambiguous argument stay hidden. URI credentials, paths, queries and fragments stay hidden. Search uses only the displayed projection. Enter only the fields to change. Omitted fields stay unchanged and `null` clears a field. Replace or clear any affected connection values when changing a URL or command. [Junie MCP configuration](https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html)

## Runtime and verification

Junie runs with `--acp=true`. JetBrains IDE integration is optional. Each Studio turn creates a fresh ACP session and supplies Studio history. Native Studio resume remains disabled while JetBrains-account restart recovery is pending. Junie is put into Safe mode on each turn, and Studio handles ACP permission requests for that turn.

Supported image attachments are PNG, JPEG, GIF and WebP. The selected model must support the image format. Files are sent as embedded ACP resources. The combined limit is 32 unique attachments and 8 MiB across the prompt and its history. Studio-managed MCP servers use negotiated ACP transports.

Managed install, update and delete and both chat modes are exercised with the official Junie CLI on macOS arm64. Official Linux x64 and Windows x64 ZIPs are checked and extracted in platform verification. Running those CLIs on their native operating systems and JetBrains account login with paid or account-bound models require separate verification. [Junie ACP](https://junie.jetbrains.com/docs/junie-cli-acp.html)

## Develop

Use Node.js 24.2 or later in the 24.x series.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run harness:check
npm test
npm pack --dry-run --ignore-scripts
```

GitHub Actions runs the fixture suite on Linux, macOS and Windows. For integration tests use a separate `HERMES_WEB_UI_HOME`. To link the source, use `ekko-studio plugins link /absolute/path/to/ekko-studio-plugin-junie` or the equivalent `ekko-studio web plugins link`. See the [plugin contract](docs/CONTRACTS.md) and [SDK development guide](docs/DEVELOPMENT.md).

This independent integration uses its original terminal icon in the Studio Plugin Center and Agent management. The official Junie logo in the login settings identifies the upstream product. The plugin and terminal icon are MIT licensed. The upstream logo is governed by the [JetBrains Brand Guidelines](https://www.jetbrains.com/company/brand/) and credited in the [asset notice](assets/NOTICE.md). The included Studio SDK has its own [MIT license](sdk/LICENSE) and [attribution](sdk/NOTICE). The Junie executable is fetched separately from JetBrains and governed by the [JetBrains AI service terms](https://www.jetbrains.com/legal/docs/terms/jetbrains-ai-service/).

The Skill, MCP and configuration page layouts adapt the [MIT-licensed Cline Studio plugin](https://github.com/EKKOLearnAI/ekko-studio-plugin-cline/blob/8a8cf92ec59464820b5320aa41ec3333bf139123/client.mjs), copyright © 2026 Ekko Studio contributors. The license notice is included in [LICENSE](LICENSE).
