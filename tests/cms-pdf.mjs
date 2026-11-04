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
const summaryPayload={...payload,contentName:'November campaign',campaignName:'Regional campaign',category:'Animation table',approvedBy:'Client approver',resizedBy:'CMS team',remarks:'',screens:['Online','Online','Offline','Unstable','Not checked'].map((network,i)=>({...screen,screenId:'summary-'+i,screenName:'Screen '+(i+1),location:'Example store',region:'Dubai',country:'United Arab Emirates',network,scheduling:i<3?'Scheduled':'Pending',playback:i<2?'Verified':'Not verified',remarks:''}))};
for(const [name,data] of [['summary',summaryPayload],['unchecked',{...summaryPayload,screens:[{...summaryPayload.screens[0],network:'Not checked',scheduling:'Pending',playback:'Not verified'}]}],['max-counts',{...summaryPayload,screens:Array.from({length:500},(_,i)=>({...summaryPayload.screens[0],screenId:'max-'+i,screenName:'Screen '+(i+1)}))}]])fs.writeFileSync(path.join(out,name+'.pdf'),await renderCmsPdf(data,image,'CMS-SUMMARY',now,true));
fs.writeFileSync(path.join(out,'filtered.pdf'),await renderCmsPdf({...summaryPayload,screens:[summaryPayload.screens[2]]},image,'CMS-FILTERED',now,true,{description:'Network: Offline | Search: Example store',total:5}));
const python=process.env.PDF_TEST_PYTHON||'python';
execFileSync(python,['-c',String.raw`import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader
root=Path(sys.argv[1])
for name in ['boundary','legacy','many','summary','unchecked','max-counts','filtered']:
 r=PdfReader(root/(name+'.pdf'))
 text=''.join(p.extract_text() or '' for p in r.pages)
 links=[a.get_object().get('/A',{}).get('/URI') for p in r.pages for a in p.get('/Annots',[])]
 assert 'PRIVATE-NOTE-DO-NOT-EXPORT' not in text
 assert 'https://media.example.test' not in text
 assert 'Content status' in text and 'Network status' in text
 assert 'scheduled*' in text and 'playback verified*' in text
 for page in r.pages:
  page_text=page.extract_text() or ''
  for expected in ['* Note:', 'uploaded and scheduled in the CMS.', 'Offline devices must reconnect', 'playback was checked by our support team.']: assert expected in page_text,(name,expected)
 if name=='legacy': assert not links and 'Watch content video' not in text
 else: assert 'https://media.example.test/ad.mp4?token=fixture' in links and 'Watch content video' in text
 with pdfplumber.open(root/(name+'.pdf')) as pdf:
  summary_page=next(page for page in pdf.pages if 'Content status' in (page.extract_text() or ''))
  summary_words=summary_page.extract_words()
  content=next(w for w in summary_words if w['text']=='Content')
  network=next(w for w in summary_words if w['text']=='Network' and abs(w['top']-content['top'])<1)
  assert network['x0']>content['x0']+200,(name,'summaries are side by side')
  for page in pdf.pages:
   note=next(w for w in page.extract_words() if w['text']=='Note:')
   # Body and table text must stop above the reserved note area.
   body=[w for w in page.extract_words() if w['top']<note['top']-1]
   assert all(w['bottom']<=note['top']-10 for w in body),(name,'body overlaps footer note')
   words=[w for w in page.extract_words() if w['top']<page.height-45]
   for word in words:
    assert word['x0']>=35 and word['x1']<=page.width-35 and word['bottom']<=page.height-54,(name,word)
 if name=='many':
  assert len(r.pages)>1
  for i in range(1,71): assert 'Screen '+str(i).zfill(3) in text
 if name=='filtered':
  for expected in ['Filtered screen list: 1 of 5 screens. Network: Offline','Search: Example store','1 screen','0 online','1 offline','0 unstable','Screen 3']: assert expected in text,expected
  assert 'Screen 1' not in text and 'Screen 2' not in text
 if name=='summary':
  for expected in ['5 screens','3 scheduled','2 playback verified','2 online','1 offline','1 unstable','1 not checked']: assert expected in text,expected
 if name=='unchecked':
  for expected in ['1 screen','0 scheduled','0 playback verified','0 online','0 offline','0 unstable','1 not checked']: assert expected in text,expected
 if name=='max-counts':
  for expected in ['500 screens','500 scheduled','500 playback verified','500 online','0 offline','0 unstable']: assert expected in text,expected
 if name in ['boundary','legacy','many','max-counts']: assert 'not checked' not in text
 print(name+': PDF links, privacy and page boundaries passed')
`,out],{stdio:'inherit'});
assert.ok(fs.statSync(path.join(out,'boundary.pdf')).size>0);
console.log('CMS PDF boundary/link regressions passed.');
