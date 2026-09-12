import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.STUDY_TEST_URL || 'http://localhost:3100';
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const group={id:'group-materials',name:'Biology group',course:'BIOS 120',description:'',inviteCode:'BIO123',memberNames:['Owner'],setIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 const shared=[];
 await page.route('**/api/auth/session',route=>route.fulfill({json:{user:{id:'owner',name:'Owner'},expires:'2099-01-01'}}));
 await page.route('**/api/study/me',route=>route.fulfill({json:{library:{sets:[],groups:[group],sessions:[]}}}));
 await page.route('**/api/study/notes',route=>route.fulfill({json:{ok:true,note:route.request().postDataJSON()?.note}}));
 await page.route('**/api/study/groups/group-materials/notes',async route=>{
  if(route.request().method()==='POST'){shared.push(route.request().postDataJSON().note);await route.fulfill({json:{ok:true}});}else await route.fulfill({json:{notes:shared}});
 });
 await page.goto(`${base}/study?screen=groups&group=group-materials`);
 await page.getByRole('button',{name:'Create material',exact:true}).first().click();
 await page.getByRole('button',{name:'Study guide Generate a guide from your notes'}).click();
 await page.waitForURL('**/study/create?type=guide&group=group-materials');
 await page.goBack();
 await page.getByRole('button',{name:'Create material',exact:true}).first().click();
 await page.getByRole('button',{name:'Flashcards Create a flashcard set'}).click();
 await page.waitForURL('**/study/create?type=flashcards&group=group-materials');
 await page.goBack();
 await page.getByRole('button',{name:'Create material',exact:true}).first().click();
 await page.getByRole('button',{name:'Notes Write a new note for your group'}).click();
 await page.getByPlaceholder('Untitled note',{exact:true}).fill('Shared biology note');
 const editor=page.locator('textarea').first();
 await editor.fill('Photosynthesis turns light into chemical energy.');
 await page.getByRole('button',{name:'Save & done',exact:true}).click();
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.waitForURL('**/study?screen=groups&group=group-materials');
 await page.getByRole('button',{name:'Shared biology note Note · Group material'}).click();
 await page.getByRole('dialog',{name:'Shared biology note'}).waitFor();
 assert.equal(shared.length,1);
 assert.equal(shared[0].rawContent,'Photosynthesis turns light into chemical energy.');
 assert.equal(shared[0].visibility,'private');
 console.log('PASS: all three creation choices preserve group; new note saves, returns to group, and opens as a group-only material');
} finally {await browser.close();}
