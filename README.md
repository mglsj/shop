# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@1.1.1 create --template minimal --types ts --add tailwindcss="plugins:typography,forms" sveltekit-adapter="adapter:auto" drizzle="database:sqlite+sqlite:libsql" ai-tools="ide:claude-code,vscode+delivery:tools+tools:mcp,svelte-code-writer,svelte-core-bestpractices,svelte-file-editor+mcpSetup:local" --install bun shop
```

## Adding features

Add features to your project with `sv add`:

```sh
npx sv add
```

For example, to add Tailwind CSS:

```sh
npx sv add tailwindcss
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Deploy on Vercel

A local SQLite file does not persist on Vercel, so use a remote libSQL database (Turso).

1. Create the database (region `aws-ap-south-1` Mumbai matches the function region `bom1`):
   ```sh
   turso db create voice-khata --location aws-ap-south-1
   turso db show voice-khata --url          # libsql://...
   turso db tokens create voice-khata       # auth token
   ```
2. Create the tables once from your machine:
   ```sh
   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... bunx drizzle-kit push
   ```
3. Import the repo in Vercel and set these environment variables: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SARVAM_API_KEY`.
4. Deploy. The app has no auth, so anyone with the URL can use it and spend your Sarvam credits. Turn on Vercel Deployment Protection (or add auth) before sharing the link.

The microphone needs HTTPS, which Vercel provides.
