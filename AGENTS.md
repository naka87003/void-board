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
