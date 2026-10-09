import {build} from 'esbuild';
import {aliases} from '@swc-uxp-wrappers/utils';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'plugin/vendor');
fs.mkdirSync(output,{recursive:true});
// Apply Adobe's official aliases to transitive imports as well as entry imports.
const supportedAliases=Object.fromEntries(Object.entries(aliases).filter(([name])=>!name.startsWith('.')));
for(const name of ['base','theme','styles','shared','reactive-controllers','icon','icons','iconset','icons-ui','icons-workflow'])supportedAliases['@spectrum-web-components/'+name]='@swc-uxp-internal/'+name;
const result=await build({absWorkingDir:root,entryPoints:['ui/spectrum-entry.js'],outfile:'plugin/vendor/spectrum.js',bundle:true,format:'iife',target:'es2020',minify:true,legalComments:'external',metafile:true,alias:supportedAliases,logLevel:'warning'});
const packages=new Set();
for(const input of Object.keys(result.metafile.inputs)){
 const parts=input.split('/'),last=parts.lastIndexOf('node_modules');if(last<0)continue;
 const length=parts[last+1].startsWith('@')?last+3:last+2;packages.add(parts.slice(0,length).join('/'));
}
const notices=['Bundled third-party UI components. Generated from the pinned npm dependencies.'];
for(const packagePath of [...packages].sort()){
 const dir=path.join(root,packagePath),pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
 notices.push(`\n${pkg.name} ${pkg.version} — ${pkg.license||'see package license'}`);
 for(const file of fs.readdirSync(dir).filter(f=>/^licen[sc]e(?:\.|$)|^copying$/i.test(f)))if(fs.statSync(path.join(dir,file)).isFile())notices.push(fs.readFileSync(path.join(dir,file),'utf8'));
}
// The Adobe wrappers' npm tarballs omit the license file; retain the full Apache license.
const apache=path.join(root,'ui/LICENSE-APACHE-2.0.txt');if(!fs.existsSync(apache))throw Error('Missing Apache license');
notices.push(fs.readFileSync(apache,'utf8'));
fs.writeFileSync(path.join(output,'THIRD-PARTY-NOTICES.txt'),notices.join('\n'));
console.log(`Spectrum UXP bundle: ${(fs.statSync(path.join(output,'spectrum.js')).size/1024).toFixed(1)} KiB; ${packages.size} third-party packages.`);
