import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const root = process.cwd();
const classicScripts = [
  'modules/runtime-guards.js',
  'gac-usage.js',
  'interface-adapter.js',
  'modules/core.js',
  'modules/acolyte.js',
  'modules/disciple.js',
  'modules/seigneur.js',
  'modules/sithari.js',
  'modules/runtime.js',
];
const stableFiles = [
  'manifest.webmanifest',
  'optimizer-worker.mjs',
  'sw.js',
  'python/optimizer.py',
  'python/kyber_data.py',
  'python/kyber_profiles.json',
  ...fs.readdirSync(path.join(root, 'python/optimizer_profiles'))
    .filter(file => file.endsWith('.json'))
    .map(file => `python/optimizer_profiles/${file}`),
  ...walkFiles(path.join(root, 'assets')).map(file => path.relative(root, file).replaceAll(path.sep, '/')),
];
function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function holocronClassicAssets() {
  const refs = new Map();
  const styleRefs = new Map();
  return {
    name: 'holocron-classic-assets',
    apply: 'build',
    buildStart() {
      for (const file of classicScripts) {
        refs.set(file, this.emitFile({ type: 'asset', name: path.basename(file), source: fs.readFileSync(path.join(root, file)) }));
      }
      for (const file of ['pages.css', 'sithari.css']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/url\((['\"]?)(assets\/)/g, 'url($1../$2');
        styleRefs.set(file, this.emitFile({ type: 'asset', name: file, source }));
      }
      for (const file of stableFiles) {
        const full = path.join(root, file);
        if (fs.existsSync(full)) this.emitFile({ type: 'asset', fileName: file, source: fs.readFileSync(full) });
      }
    },
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [original, reference] of refs) {
        const emitted = this.getFileName(reference);
        const pattern = new RegExp(`src=(['"])(?:\\./|/)?${escapeRegExp(original)}\\1`, 'g');
        source = source.replace(pattern, `src="./${emitted}"`);
      }
      source = source.replace(/href=(['"])(?:\.\/|\/)?(?:assets\/)?manifest(?:-[^'"]+)?\.webmanifest\1/g, 'href="./manifest.webmanifest"');
      html.source = source;
      const runtimeFile = this.getFileName(refs.get('modules/runtime.js'));
      const runtimeAsset = bundle[runtimeFile];
      if (runtimeAsset && runtimeAsset.type === 'asset') {
        let runtimeSource = String(runtimeAsset.source);
        runtimeSource = runtimeSource.replaceAll("'pages.css'", `'${this.getFileName(styleRefs.get('pages.css'))}'`);
        runtimeSource = runtimeSource.replaceAll("'sithari.css'", `'${this.getFileName(styleRefs.get('sithari.css'))}'`);
        runtimeAsset.source = runtimeSource;
      }
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [holocronClassicAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: { input: path.join(root, 'index.html') },
  },
});
