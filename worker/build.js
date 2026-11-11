import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
await writeFile('public/index.html','<!doctype html><meta charset="utf-8"><title>Blitz worker</title><p>Blitz public collector. Status: <a href="/health">/health</a></p>');
