import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {createApp} from './app.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
dotenv.config({path:[path.join(root,'.env.local'),path.join(root,'.env')]});
const port=process.env.PORT||8787;
createApp().listen(port,()=>console.log(`BashaShift server on :${port}`));
