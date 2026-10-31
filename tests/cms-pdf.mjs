import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const root=process.cwd(), out=path.resolve('.server-runtime/cms-pdf-regression');
fs.mkdirSync(out,{recursive:true});
const bundle=path.join(out,'renderer.cjs');
await build({stdin:{contents:'export {renderCmsPdf} from "./lib/cms-pdf";',resolveDir:root,loader:'ts'},outfile:bundle,platform:'node',format:'cjs',bundle:true,external:['pdfkit','sharp']});
const {renderCmsPdf}=createRequire(import.meta.url)(bundle);
const now='2026-10-31T12:00:00Z';
const screen={screenId:'s',screenName:'W'.repeat(80),location:'W'.repeat(80),region:'W'.repeat(80),country:'W'.repeat(80),network:'Online',scheduling:'Scheduled',playback:'Verified',checkedAt:now,remarks:'W'.repeat(300)};
const payload={contentName:'W'.repeat(160),campaignName:'W'.repeat(160),category:'W'.repeat(100),receivedAt:now,missingReceivedAt:now,scheduledAt:now,playbackStart:'2026-10-31',playbackEnd:'2026-11-30',approvedBy:'W'.repeat(120),resizedBy:'W'.repeat(120),remarks:'W'.repeat(600),internalNotes:'PRIVATE-NOTE-DO-NOT-EXPORT',videoUrl:'https://media.example.test/ad.mp4?token=fixture',screens:[screen]};
const image=fs.readFileSync('public/led-display-sample.webp');
const legacy={...payload};delete legacy.videoUrl;
for(const [name,data,picture] of [['boundary',payload,image],['legacy',legacy,null],['many',{...payload,contentName:'Layout regression',screens:Array.from({length:70},(_,i)=>({...screen,screenId:'s'+i,screenName:'Screen '+String(i+1).padStart(3,'0'),remarks:''}))},image]])fs.writeFileSync(path.join(out,name+'.pdf'),await renderCmsPdf(data,picture,'CMS-REGRESSION',now,true));
const python=process.env.PDF_TEST_PYTHON||'python';
execFileSync(python,['-c',String.raw`import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader
root=Path(sys.argv[1])
for name in ['boundary','legacy','many']:
 r=PdfReader(root/(name+'.pdf'))
 text=''.join(p.extract_text() or '' for p in r.pages)
 links=[a.get_object().get('/A',{}).get('/URI') for p in r.pages for a in p.get('/Annots',[])]
 assert 'PRIVATE-NOTE-DO-NOT-EXPORT' not in text
 assert 'https://media.example.test' not in text
 if name=='legacy': assert not links and 'Watch content video' not in text
 else: assert 'https://media.example.test/ad.mp4?token=fixture' in links and 'Watch content video' in text
 with pdfplumber.open(root/(name+'.pdf')) as pdf:
  for page in pdf.pages:
   words=[w for w in page.extract_words() if w['top']<page.height-45]
   for word in words:
    assert word['x0']>=35 and word['x1']<=page.width-35 and word['bottom']<=page.height-54,(name,word)
 if name=='many':
  assert len(r.pages)>1
  for i in range(1,71): assert 'Screen '+str(i).zfill(3) in text
 print(name+': PDF links, privacy and page boundaries passed')
`,out],{stdio:'inherit'});
assert.ok(fs.statSync(path.join(out,'boundary.pdf')).size>0);
console.log('CMS PDF boundary/link regressions passed.');
