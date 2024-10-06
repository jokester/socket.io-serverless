import esbuild from "esbuild";
import path from "path";
import fs from "fs";
import debug from "debug";

debug.inspectOpts.depth = 10;

const debugLogger = debug("demo-server:build");

const ___file = new URL(import.meta.url).pathname;

const ___dirname = path.dirname(___file);
const sioPackagesRoot = path.join(___dirname, "../socket.io/packages");
const sioServerlessRoot = ___dirname; // path.join(___dirname, '../socket.io-serverless');
const mocksRoot = path.join(sioServerlessRoot, "mocks");

async function getLocalSioDir(pkgName) {
  if (pkgName.includes("socket.io") || pkgName.includes("engine.io")) {
    return path.join(sioPackagesRoot, pkgName);
  }
  throw new Error(`Could not find package directory for ${pkgName}`);
}

/**
 * @param {string} pkgName
 * @returns {Promise<string>}
 */
async function findPackageDir2(pkgName) {
  try {
    // should be a file inside that package
    const resolved = import.meta.resolve(pkgName);
    const resolvedPath = new URL(resolved).pathname;

    for (
      let dir = path.dirname(resolvedPath);
      dir !== path.dirname(dir);
      dir = path.dirname(dir)
    ) {
      if (
        path.basename(dir) === pkgName &&
        fs.existsSync(path.join(dir, "package.json"))
      ) {
        return dir;
      }
    }
    throw new Error(`Could not find package directory upward from ${resolved}`);
  } catch (e) {
    if (typeof e.path === "string" && e.path.endsWith("/package.json")) {
      return path.dirname(e.path);
    }
    throw e;
  }
}

/**
 * @type {esbuild.Plugin}
 */
const renameNodeStdlibImports = {
  name: 'renameNodeStdlibImports',
  setup(build) {
    build.onResolve({filter: /^crypto$/}, async (args) => {
      console.debug('renameNodeStdlibImports', args)
      // return {path: 'node:crypto', external: true}
      return {path: path.join(mocksRoot, 'node_crypto.mjs')}
    })
    build.onResolve({filter: /^url$/}, async (args) => {
      console.debug('renameNodeStdlibImports', args)
      // return {path: 'node:url', external: true}
      return {path: path.join(mocksRoot, 'node_url.mjs')}
    })

  }
}
/**
 * rewire import of socket.io files, to bypass export map and import TS directly
 * @type {esbuild.Plugin}
 */
const rewireSocketIoImports = {
  name: "rewireSocketIoPackages",
  setup(build) {
    const packageImportMap = {
      // 'base64id': path.join(sioServerlessRoot, 'node_modules/base64id/index.mjs'),
      "socket.io": path.join(sioPackagesRoot, "socket.io/lib/index.ts"),
      "base64id": path.join(sioPackagesRoot, "engine.io/node_modules/base64id/lib/base64id.js"),
      "engine.io": path.join(sioPackagesRoot, "engine.io/lib/engine.io.ts"),
      // './polling': path.join(mocksRoot, 'empty.js'),
      // './polling-jsonp': path.join(mocksRoot, 'empty.js'),
      // './userver': path.join(mocksRoot, 'empty.js'),
      "engine.io-parser": path.join(
        sioPackagesRoot,
        "engine.io-parser/lib/index.ts",
      ),
      "socket.io-adapter": path.join(
        sioPackagesRoot,
        "socket.io-adapter/lib/index.ts",
      ),
      "socket.io-parser": path.join(
        sioPackagesRoot,
        "socket.io-parser/lib/index.ts",
      ),
      "@socket.io/component-emitter": path.join(
        sioPackagesRoot,
        "socket.io-component-emitter/lib/esm/index.js",
      ),
    };
    build.onResolve({ filter: /./ }, async (args) => {
      const resolvedPath = packageImportMap[args.path];
      if (resolvedPath) {
        return {
          path: resolvedPath,
        };
      }
    });

    build.onResolve({ filter: /./ }, async (args) => {
      /**
       * rewire import of in-package file
       */
      for (const pkg of ["socket.io", "engine.io"]) {
        const argsSegments = args.path.split("/");
        if (argsSegments.length > 1 && argsSegments[0] === pkg) {
          let basename = argsSegments.pop();
          if (![".ts", ".js"].some((ext) => basename.endsWith(ext))) {
            basename += ".ts";
          }
          const fsPath = path.join(
            await getLocalSioDir(pkg),
            ...argsSegments.slice(1),
            basename,
          );
          return {
            path: fsPath,
          };
        }
      }
    });
  },
};

/**
 * rewire when building for serverless environment
 * @param {string[]} imports
 * @return {esbuild.Plugin}
 *
 */
function buildRewirePlugin(imports) {
  const serverlessRewireMap = {
    debug: path.join(mocksRoot, "debug/index.js"),
    ws: path.join(mocksRoot, "ws/index.js"),
    accepts: path.join(mocksRoot, "empty.js"),
    path: path.join(mocksRoot, "empty.js"),
    fs: path.join(mocksRoot, "empty.js"),
    zlib: path.join(mocksRoot, "empty.js"),
    crypto: path.join(mocksRoot, "empty.js"),
    events: path.join(mocksRoot, "empty.js"),
    https: path.join(mocksRoot, "empty.js"),
    http: path.join(mocksRoot, "empty.js"),
    tls: path.join(mocksRoot, "empty.js"),
    url: path.join(mocksRoot, "empty.js"),
    querystring: path.join(mocksRoot, "empty.js"),
    // base64id: path.join(mocksRoot, "empty.js"),
    cors: path.join(mocksRoot, "empty.js"),
    net: path.join(mocksRoot, "empty.js"),
    timers: path.join(mocksRoot, "empty.js"),
    stream: path.join(mocksRoot, "empty.js"),
  };

  return {
    name: "injectSocketIoServerlessMocks",
    setup(build) {
      build.onResolve({ filter: /./ }, async (args) => {
        if (imports.includes(args.path)) {
          return {
            path: serverlessRewireMap[args.path],
          };
        }
      });
    },
  };
}

// Ensure the output directory exists
const outputDir = path.resolve(process.cwd(), "dist");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

/**
 * @type {esbuild.BuildOptions}
 */

const cfBuildContext = {
  entryPoints: ["src/cf/index.ts"],
  bundle: true,
  platform: "neutral",
  // target: "esnext",
  format: "esm",
  metafile: true,
  outfile: "dist/cf.js",
  // sourcemap: true,
  external: [
    "cloudflare:workers",
    "events",
    "debug",
    "timers",
    "url",
    "node:url",
    "zlib",
    "stream",
    "crypto",
    "node:crypto",
    "querystring",
    'base64id', //let wrangler bundle it */
  ],
  plugins: [
    rewireSocketIoImports,
    renameNodeStdlibImports,
    buildRewirePlugin([
      "debug",
      "http",
      "net",
      "tls",
      "https",
      "cors",
      "ws",
      "path",
      "fs",
    ]),
  ],
};

async function buildCf(watch = false) {
  if (watch) {
    return watchCf();
  }
  const buildResult = await esbuild.build(cfBuildContext);
  debugLogger("build finish", buildResult);
  return buildResult;
}

async function watchCf() {
  const ctx = await esbuild.context(cfBuildContext);

  await ctx.watch({});
}

async function reportBuildResult(buildResult) {
  if (!buildResult) {
    return;
  }
  const { metafile } = buildResult;
  const { outputs } = metafile;
  for (const [inputFile, inputInfo] of Object.entries(metafile.inputs)) {
    const { imports, bytes } = inputInfo;
    for (const imp of imports) {
      if (imp.path.includes("node_modules/hono/")) {
        continue;
      }
      console.log(imp.kind, inputFile, imp.original, imp.path);
    }
  }
  for (const [outputFile, outputInfo] of Object.entries(outputs)) {
    const { bytes, imports, exports } = outputInfo;
    console.log("output", outputFile, { bytes, imports, exports });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildCf(process.argv.includes("--watch"))
    .then(reportBuildResult)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
