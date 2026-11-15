import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
if(!existsSync('node_modules/vinext')){
 const npm=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(p=>p&&existsSync(p));
 if(!npm){console.error('Cannot find npm. Install the official Node.js 24 LTS distribution, then run start-web.cmd again.');process.exit(1);}
 const result=spawnSync(process.execPath,[npm,'run','install:ci'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
const setup=spawnSync(process.execPath,['scripts/init-local.mjs'],{stdio:'inherit'});if(setup.status!==0)process.exit(setup.status||1);
const dev=spawnSync(process.execPath,['scripts/run-framework.mjs','dev','--hostname','127.0.0.1','--port','8767'],{stdio:'inherit'});process.exit(dev.status||0);
