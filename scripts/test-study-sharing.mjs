// Isolated route regression: no production database writes or real user accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const requireModule = createRequire(import.meta.url);
let user = { id: 'owner-a' };
const rows = new Map();
const prisma = { studyNote: {
  findUnique: async ({where}) => rows.get(where.id) || null,
  findMany: async () => [...rows.values()].filter(row => row.visibility === 'PUBLIC'),
  upsert: async ({where,create,update}) => {
    const now = new Date();
    rows.set(where.id, rows.has(where.id) ? {...rows.get(where.id),...update,updatedAt:now} : {...create,createdAt:now,updatedAt:now,lastOpenedAt:now,pinned:false,favorite:false});
  },
  update: async ({where,data}) => rows.set(where.id,{...rows.get(where.id),...data}),
}};
const sets = new Map();
prisma.studySet = {
  findUnique: async ({where}) => sets.get(where.id) || null,
  findMany: async ({where,take}) => [...sets.values()].filter(row => row.visibility === where.visibility && (!where.OR || where.OR.some(condition => Object.entries(condition).some(([field,filter]) => filter.contains && String(row[field] || "").toLowerCase().includes(filter.contains.toLowerCase()))))).slice(0,take),
  upsert: async ({where,create,update}) => sets.set(where.id, sets.has(where.id) ? {...sets.get(where.id),...update} : create),
  update: async ({where,data}) => sets.set(where.id,{...sets.get(where.id),...data}),
};
prisma.flashcard = {deleteMany:async()=>{},createMany:async()=>{}};
prisma.$transaction = async fn => fn(prisma);
const cache = {};
function load(path) {
  if (cache[path]) return cache[path];
  const mod = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)((id) => {
    if(id==='@/lib/prisma') return {__esModule:true,default:prisma};
    if(id==='@/lib/auth/session') return {getCurrentStudyUser:async()=>user,requireCurrentStudyUser:async()=>{if(!user)throw Error('UNAUTHORIZED');return user;}};
    if(id==='@/lib/study/server') return {serializeStudySet:row=>({...row,visibility:row.visibility.toLowerCase()}),toDbDifficulty:value=>value.toUpperCase()};
    if(id==='@/lib/study/public-sets') return load('lib/study/public-sets.ts');
    if(id==='@/lib/study/public-notes') return load('lib/study/public-notes.ts');
    return requireModule(id);
  },mod,mod.exports);
  return cache[path]=mod.exports;
}
(async()=>{
 const api=load('app/api/study/public-notes/route.ts');
 const note={id:'shared-note',title:'Photosynthesis lecture',course:'BIOS 120',subject:'Biology',noteDate:'2026-09-11',tags:[],rawContent:'Photosynthesis converts light energy into chemical energy in plant cells.',transcriptContent:'',structuredContent:null,sourceType:'manual'};
 const post=()=>api.POST(new Request('http://localhost/api/study/public-notes',{method:'POST',body:JSON.stringify({note})}));
 const del=()=>api.DELETE(new Request('http://localhost/api/study/public-notes',{method:'DELETE',body:JSON.stringify({noteId:note.id})}));
 const search=async()=> (await (await api.GET(new Request('http://localhost/api/study/public-notes?q=Photosynthesis'))).json()).items;
 assert.equal((await post()).status,200);
 user={id:'viewer-b'};
 assert.equal((await search()).length,1);
 assert.equal((await post()).status,403);
 assert.equal((await del()).status,403);
 user=null;
 assert.equal((await search()).length,1);
 assert.equal((await post()).status,401);
 assert.equal((await del()).status,401);
 user={id:'owner-a'};
 assert.equal((await del()).status,200);
 assert.equal((await search()).length,0);
 const setApi=load('app/api/study/public-sets/route.ts');
 const set={id:'shared-set',title:'Photosynthesis cards',description:'Plant biology',course:'BIOS 120',subject:'Biology',tags:[],difficulty:'medium',cards:[{id:'card-a',front:'Chlorophyll',back:'Pigment that absorbs light',tags:[],difficulty:'medium'},{id:'card-b',front:'Chloroplast',back:'Organelle for photosynthesis',tags:[],difficulty:'medium'}]};
 const publishSet=()=>setApi.POST(new Request('http://localhost/api/study/public-sets',{method:'POST',body:JSON.stringify({set})}));
 const hideSet=()=>setApi.DELETE(new Request('http://localhost/api/study/public-sets',{method:'DELETE',body:JSON.stringify({setId:set.id})}));
 const searchSets=async()=> (await (await setApi.GET(new Request('http://localhost/api/study/public-sets?q=photosynthesis'))).json()).items;
 assert.equal((await publishSet()).status,200);
 user={id:'viewer-b'};
 assert.equal((await searchSets()).length,1);
 assert.equal((await publishSet()).status,403);
 assert.equal((await hideSet()).status,403);
 user=null;
 assert.equal((await searchSets()).length,1);
 assert.equal((await publishSet()).status,401);
 user={id:'owner-a'};
 assert.equal((await hideSet()).status,200);
 assert.equal((await searchSets()).length,0);
 console.log('PASS: owner publishes, second user and guest discover, nonowners cannot modify, private notes and sets disappear');
})().catch(error=>{console.error(error);process.exitCode=1;});
