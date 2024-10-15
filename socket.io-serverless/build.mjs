import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import debug from 'debug';

debug.inspectOpts.depth = 10;

const debugLogger = debug('demo-server:build');

const ___file = new URL(import.meta.url).pathname;

const ___dirname = path.dirname(___file);
const sioPackagesRoot = path.join(___dirname, '../socket.io/packages');
const sioServerlessRoot = ___dirname; // path.join(___dirname, '../socket.io-serverless');
const mocksRoot = path.join(sioServerlessRoot, 'mocks');

async function getLocalSioDir(pkgName) {
  if (pkgName.includes('socket.io') || pkgName.includes('engine.io')) {
    return path.join(sioPackagesRoot, pkgName);
  }
  throw new Error(`Could not find package directory for ${pkgName}`);
}

/**
 * wrangler have problem bundling require('crypto')
 * @type {esbuild.Plugin}
 */
const renameNodeStdlibImports = {
  name: 'renameNodeStdlibImports',
  setup(build) {
    build.onResolve({filter: /^crypto$/}, async (args) => {
      debugLogger('renameNodeStdlibImports', args);
      // return {path: 'node:crypto', external: true}
      return {path: path.join(mocksRoot, 'node_crypto.mjs')};
    });
    build.onResolve({filter: /^u$rl$/}, async (args) => {
      debugLogger('renameNodeStdlibImports', args);
      // return {path: 'node:url', external: true}
      return {path: path.join(mocksRoot, 'node_url.mjs')};
    });
  },
};

/**
 * rewire import of socket.io files, to bypass export map and import TS directly
 * @type {esbuild.Plugin}
 */
const rewireSocketIoImports = {
  name: 'rewireSocketIoPackages',
  setup(build) {
    const packageImportMap = {
      // 'base64id': path.join(sioServerlessRoot, 'node_modules/base64id/index.mjs'),
      // "socket.io": path.join(sioPackagesRoot, "socket.io/lib/index.ts"),
      // base64id: 'base64id/lib/base64id.js',
      'engine.io': path.join(sioPackagesRoot, 'engine.io/lib/engine.io.ts'),
      // './polling': path.join(mocksRoot, 'empty.js'),
      // './polling-jsonp': path.join(mocksRoot, 'empty.js'),
      // './userver': path.join(mocksRoot, 'empty.js'),
      'engine.io-parser': path.join(
        sioPackagesRoot,
        'engine.io-parser/lib/index.ts',
      ),
      'socket.io-adapter': path.join(
        sioPackagesRoot,
        'socket.io-adapter/lib/index.ts',
      ),
      'socket.io-parser': path.join(
        sioPackagesRoot,
        'socket.io-parser/lib/index.ts',
      ),
      '@socket.io/component-emitter': path.join(
        sioPackagesRoot,
        'socket.io-component-emitter/lib/esm/index.js',
      ),
    };
    build.onResolve({filter: /./}, async (args) => {
      const resolvedPath = packageImportMap[args.path];
      if (resolvedPath) {
        return {
          path: resolvedPath,
        };
      }
      if (
        args.importer.includes('packages/socket.io/lib/') ||
        args.importer.includes('packages/engine.io/lib/')
      ) {
        if (
          [
            './uws',
            './userver',
            './transports/index',
            './transports',
            './transports/webtransport',
            './server',
          ].includes(args.path)
        ) {
          return {
            path: path.join(mocksRoot, 'empty.js'),
          };
        }
      }

      return null;
    });
  },
};

/**
 * rewire when building for serverless environment
 * @param {string[]} imports
 * @return {esbuild.Plugin}
 */
function buildRewirePlugin(imports) {
  const serverlessRewireMap = {
    // debug: path.join(mocksRoot, "debug/index.js"),
    ws: path.join(mocksRoot, 'ws/index.js'),
    debug: path.join(___dirname, 'src/debug/index.ts'),
    accepts: path.join(mocksRoot, 'empty_callable.js'),
    path: path.join(mocksRoot, 'empty.js'),
    fs: path.join(mocksRoot, 'empty.js'),
    zlib: path.join(mocksRoot, 'empty.js'),
    crypto: path.join(mocksRoot, 'empty.js'),
    events: path.join(mocksRoot, 'empty.js'),
    https: path.join(mocksRoot, 'empty.js'),
    http: path.join(mocksRoot, 'empty.js'),
    tls: path.join(mocksRoot, 'empty.js'),
    url: path.join(mocksRoot, 'empty.js'),
    querystring: path.join(mocksRoot, 'empty.js'),
    // base64id: path.join(mocksRoot, "empty.js"),
    cors: path.join(mocksRoot, 'empty.js'),
    net: path.join(mocksRoot, 'empty.js'),
    timers: path.join(mocksRoot, 'empty.js'),
    stream: path.join(mocksRoot, 'empty.js'),
  };

  return {
    name: 'rewireLibImports',
    setup(build) {
      build.onResolve({filter: /./}, async (args) => {
        if (args.path === 'base64id') {
          const {path, ...rest} = args;
          return build.resolve('base64id/lib/base64id.js', rest);
        }
        if (imports.includes(args.path)) {
          return {
            path: serverlessRewireMap[args.path],
          };
        }
        return null;
      });
    },
  };
}

// Ensure the output directory exists
const outputDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

/**
 * @type {esbuild.BuildOptions}
 */

const cfBuildContext = {
  logLevel: 'info',
  entryPoints: ['src/cf/index.ts'],
  bundle: true,
  platform: 'neutral',
  // target: "esnext",
  format: 'esm',
  metafile: true,
  outfile: 'dist/cf.js',
  sourcemap: true,
  legalComments: 'linked',
  external: [
    'cloudflare:workers',
    'events',
    // "debug",
    'timers',
    'url',
    'node:url',
    'zlib',
    'stream',
    'crypto',
    'node:crypto',
    'querystring',
    // "base64id", //let wrangler bundle it */
  ],
  plugins: [
    rewireSocketIoImports,
    renameNodeStdlibImports,
    buildRewirePlugin([
      'accepts',
      'debug',
      'http',
      'net',
      'tls',
      'https',
      'cors',
      'ws',
      'path',
      'fs',
    ]),
  ],
};

async function buildCf(watch = false) {
  if (watch) {
    return watchCf();
  }
  const buildResult = await esbuild.build(cfBuildContext);
  debugLogger('build finish', buildResult);
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
  const {metafile} = buildResult;
  const {outputs} = metafile;
  for (const [inputFile, inputInfo] of Object.entries(metafile.inputs)) {
    const {imports, bytes} = inputInfo;
    for (const imp of imports) {
      if (imp.external) {
        continue;
      }
      console.log(imp.kind, inputFile, imp.original, imp.path);
    }
  }
  for (const [outputFile, outputInfo] of Object.entries(outputs)) {
    const {bytes, imports, exports} = outputInfo;
    console.log('output', outputFile, {bytes, imports, exports});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = process.argv.includes('--watch') ? watchCf() : buildCf();
  started.then(reportBuildResult).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
