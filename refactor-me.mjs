import * as esbuild from 'esbuild';
import path from 'node:path';
import url from 'node:url';

const ___dirname = path.dirname(url.fileURLToPath(import.meta.url));

const buildForProd = process.env.NODE_ENV === 'production';

const built = await esbuild.build({
  entryPoints: ['main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  metafile: true,
  minify: buildForProd,
  sourcemap: true,
  // FIXME should use tsc for more consistentcy between dev/prod
  // but this plugins does not work.
  // plugins: [esbuildPluginTsc({force: true})],
  outfile: path.join(___dirname, '../build/server-main.js'),
});

if (buildForProd) {
  console.debug(
    'analyze of bundle',
    await esbuild.analyzeMetafile(built.metafile, {color: true})
  );
}

function shortenBytes(n) {
  const k = Math.floor(Math.log2(n) / 10)
  const rank = (k > 0 ? 'KMGT'[k - 1] : '') + 'b';
  const count = (n / Math.pow(1024, k)).toFixed(2);
  return count + rank;
}

{
  console.group('build result');

  const {
    metafile: {outputs},
    ...rest
  } = built;

  const formattedOutputFiles = Array.from(Object.entries(outputs)).map(
    ([filename, entry]) => ({
      filename,
      size: shortenBytes(entry.bytes),
    })
  );
  console.table(formattedOutputFiles);
  console.info('built', rest);
  console.groupEnd('build result');
}
