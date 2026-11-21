# Void Board

A shared canvas for ideas. Add, edit, move, and delete sticky notes together using a private-by-link board.

## Local development

Use the Node.js version in `.nvmrc`, which includes npm 11.20.0. Install the pnpm version pinned in `package.json`, for example by enabling Corepack.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The project uses Void with the project-local Vite+ toolchain. The `pnpm dev` and `pnpm build` scripts run `vp dev` and `vp build`.

Open the URL printed by the dev server and select **Create a board** once. From the board, select **Share link** → **Open this board in a new tab**. Both tabs should show the same `?board=…` URL and a **Live** status. Creating a board generates a different URL.

When you first open a board in a tab, enter a display name or continue as **Guest**. The tab remembers your choice for the session. Drag a note or move your cursor over the canvas to see it update live in the other tab. Select your name below the canvas to change the name shown next to your cursor.

A Cloudflare Durable Object stores each board's notes, including their final positions after a drop. Cursor positions and drag previews are shared live. Anyone with the link can edit the board.

```sh
pnpm typecheck
pnpm build
pnpm preview
```

## Deploy to Cloudflare

Run the following from the repository root. Void prompts you to sign in to Cloudflare and select an account when needed.

```sh
pnpm deploy
```

Use the URL that Void prints to create and share a deployed board.
