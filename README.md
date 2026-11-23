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

The plugin and icon are MIT licensed. The included Studio SDK has its own [MIT license](sdk/LICENSE) and [attribution](sdk/NOTICE). The Junie executable is fetched separately from JetBrains and governed by the [JetBrains AI service terms](https://www.jetbrains.com/legal/docs/terms/jetbrains-ai-service/).
