# Repository Guidelines

## Commit Messages

Use Conventional Commits format: `<type>: <description>`.
Choose a prefix that matches the change, such as `feat:`, `fix:`, `refactor:`,
`docs:`, or `chore:`.

## Implementation Guidelines

- Use `@/` for imports across directories within `src/`. Keep same-directory
  imports relative, and use relative paths for imports from `shared/` and for
  local imports in standalone scripts and tool configuration files.
- Prefer type inference and type narrowing in TypeScript.
- Prioritize maintainability and readability. Keep implementations simple
  while meeting requirements and avoid unnecessary abstraction.
- When an `if` statement has `else` or `else if` branches, use braces
  for all branches.

<!--injected-by-void-v1.12.0-->
## Void

- This project uses [Void](https://void.cloud), a full-stack Vite framework for Cloudflare Workers with file-based API routing, server-rendered pages, and typed backend services.
- Use Void's CLI and typed APIs. Before working with Void, read the relevant Markdown docs in `node_modules/void/docs/`; start with `guide/quickstart.md` for setup and `reference/cli.md` for commands.

<!--/injected-by-void-->
