// Collects the static front-end files into dist/ for Netlify to publish.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync('src', `${out}/src`, { recursive: true });
for (const file of readdirSync('.')) {
  if (/\.(html|json|ico|png|svg|webmanifest|txt)$/.test(file) && !['package.json', 'package-lock.json'].includes(file)) {
    cpSync(file, `${out}/${file}`);
  }
}
for (const dir of ['public', 'assets', 'images']) {
  if (existsSync(dir)) cpSync(dir, `${out}/${dir}`, { recursive: true });
}

console.log(`Static files copied to ${out}/`);
