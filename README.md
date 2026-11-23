# JetBrains Junie for Ekko Studio

This MIT-licensed plugin registers `plugin:junie/junie` for streaming one-to-one chat through the official JetBrains Junie CLI and Agent Client Protocol (ACP). It supports Junie's native model and authentication settings in Studio's **Global** mode.

## Install

1. Install the official Junie CLI on the machine running the Studio server and check `junie --version`. The tested CLI was Junie **26.11.2 (4100.11)** on macOS arm64. JetBrains provides installers for macOS, Linux and Windows. [Junie CLI quickstart](https://junie.jetbrains.com/docs/junie-cli.html)
2. As the OS user who runs Studio, open a terminal in the workspace and run `junie`. Choose JetBrains browser sign-in, Junie API key, or a provider/model configured in Junie. The Studio process can also inherit `JUNIE_API_KEY`. Keep credentials in the native CLI or service environment. Studio never prompts for the key in chat. [Authentication and configuration](https://junie.jetbrains.com/docs/junie-cli.html#manage-your-account) · [Custom models](https://junie.jetbrains.com/docs/custom-llm-models.html)
3. In Studio **Plugins**, install `https://github.com/EKKOLearnAI/ekko-studio-plugin-junie` or the local plugin's absolute directory. For reproducible installs, use `github:EKKOLearnAI/ekko-studio-plugin-junie#<full-commit>`. Confirm trust and enable it with the Studio account and Profile that will use Junie's native credentials.
4. Open **Agent management** and check JetBrains Junie. Start a single chat, choose **Global** and a model from the Junie catalog, then select your workspace. Refresh the model list after signing in or changing a model.

Studio resolves `junie` on the service PATH, then under `~/.local/bin`. On Windows it also reads the official installer's current version marker under `~/.local/share/junie` and launches the associated `junie.exe`. If Studio's PATH differs from the terminal's, set `EKKO_JUNIE_EXECUTABLE` in the Studio service environment to an absolute executable path. On Windows use the native `.exe`. If using a separate native profile, point the terminal and Studio at the same `JUNIE_HOME`. Restart the Studio service after changing its environment.

## Runtime and limits

- Junie runs locally as `junie --acp=true`; a JetBrains IDE connection is optional. IDE-backed capabilities depend on a matching open project with the Junie IDE plugin. The official CLI release completed standalone ACP chat and cross-process `session/load` against a loopback model on macOS arm64. JetBrains account and API key success require a usable account or key. [ACP setup](https://junie.jetbrains.com/docs/junie-cli-acp.html) · [IDE integration](https://junie.jetbrains.com/docs/junie-cli-jetbrains-ide-integration.html)
- A separate native ACP session and process handles each Studio turn. Studio sends the conversation history on subsequent turns and after a Studio restart. Studio native resume remains disabled pending restart and interrupted-turn verification with a real account.
- Junie must confirm **Safe** for each turn. Studio handles ACP permission requests for the active turn using single-use decisions. Junie's native project trust, settings and operating-system access still apply.
- PNG, JPEG, GIF and WebP are sent as ACP images. Files travel as embedded ACP resources. The combined limit is 32 unique attachments and 8 MiB across the current prompt and its history. The Junie model must support the supplied image format. Managed Studio MCP servers cross the ACP boundary using the negotiated transport.
- The native login is available only to the Studio account and Profile that enabled the plugin. The current release supports the chat surface. Scoped Studio models and managed engine installation are outside the current release.

## Develop

Use Node 24.2 or newer in the 24.x series.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run harness:check
npm test
npm pack --dry-run --ignore-scripts
```

GitHub Actions runs the fixture suite on Linux, macOS and Windows. Use a separate `HERMES_WEB_UI_HOME` for Studio integration testing. Register this project with `ekko-studio plugins link /absolute/path/to/ekko-studio-plugin-junie` (or `ekko-studio web plugins link` on desktop installations with that CLI layout). See [plugin contracts](docs/CONTRACTS.md) for ACP behavior and [SDK development](docs/DEVELOPMENT.md) for host guidance.

The plugin and its original icon are MIT licensed. The Studio SDK has its own [MIT license](sdk/LICENSE) and [attribution](sdk/NOTICE). The proprietary Junie CLI is installed from JetBrains and is distributed under JetBrains terms. Junie and JetBrains are JetBrains marks. [JetBrains AI service terms](https://www.jetbrains.com/legal/docs/terms/jetbrains-ai-service/)
