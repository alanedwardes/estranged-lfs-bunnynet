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
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete: dist/index.js");
}