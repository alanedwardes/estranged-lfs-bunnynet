import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["browser", "worker", "import", "default"],
  external: [],
  define: { "process.env.NODE_ENV": '"production"' },
  minify: !isWatch,
  outfile: "dist/index.js",
  banner: {
    js: 'import * as process from "node:process";import { Buffer } from "node:buffer";globalThis.process ??= process;globalThis.Buffer ??= Buffer;globalThis.global ??= globalThis;',
  },
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete: dist/index.js");
}