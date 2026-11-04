import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import sharp from 'sharp';
const out=path.resolve('.server-runtime/screen-details-pdf');fs.mkdirSync(out,{recursive:true});
await build({entryPoints:['lib/screen-details-pdf.ts'],outfile:path.join(out,'renderer.cjs'),bundle:true,platform:'node',format:'cjs',external:['pdfkit','sharp']});
const {renderScreenDetailsPdf}=createRequire(import.meta.url)(path.join(out,'renderer.cjs'));
const portrait=await sharp({create:{width:400,height:900,channels:3,background:'#eec795'}}).webp().toBuffer();
const landscape=await sharp({create:{width:1200,height:400,channels:3,background:'#97badd'}}).png().toBuffer();
const base={id:'00000000-0000-4000-8000-000000000001',name:'Example Mall - Animation Table',screenType:'LCD',location:'Example Mall',region:'Dubai',country:'United Arab Emirates',hardware:{lcd:{tv_model:'QM32R',tv_size:'32',manufactured_by:'Samsung',installed_by:'PIXCOM'},ledDisplay:{manufacturer:'HIDDEN-LED-FIELD',resolution:'9999 x 9999'}},ppm:{ppmDate:'2026-11-03',overallStatus:'Follow-up',brightness_colour:'Fail',final_playback:'Pass',findings:'Colour mismatch.\nInspect the upper display.',correctiveAction:'Review colour calibration.'},locationDetails:{address:'Unit 10',contact_name:'Demo Contact',working_hours:'10:00–22:00',access_notes:'Arrange access ahead of the visit.'},screenPhotos:[{label:'Screen front',bytes:portrait},{label:'Connection diagram',bytes:landscape}],locationPhotos:[{label:'Store entrance',bytes:landscape}],includeLocationPhotos:false};
const cases=[
 ['lcd',base],
 ['led',{...base,screenType:'LED',hardware:{ledDisplay:{manufacturer:'LED Brand',resolution:'2000 × 800',width_mm:'5100',height_mm:'2100',total_sqm:'10.71',pixelPitch:'2.5',dimensions:'DO-NOT-EXPORT-DERIVED'},ledController:{brand:'Novastar'},mediaPlayer:{model:'P388'},powerNetwork:{networkSwitch:'Aruba'}}}],
 ['wall',{...base,screenType:'Video Wall',hardware:{video_wall:{display_qty:'25',total_width_mm:'6500',total_height_mm:'3750'}}}],
 ['unknown',{...base,screenType:null,screenPhotos:[],locationPhotos:[]}],
 ['with-location',{...base,includeLocationPhotos:true}],
 ['missing',{...base,screenPhotos:[{label:'Missing file',bytes:null},{label:'Unreadable photo',bytes:Buffer.from('invalid')}],locationPhotos:[],includeLocationPhotos:true}],
 ['long',{...base,id:'long-'+ 'W'.repeat(220)+'-ID-END',name:'Long screen name '.repeat(10),ppm:{...base.ppm,findings:'Detail line\n'.repeat(300)+'FINDINGS-END',correctiveAction:'W'.repeat(3990)+'ACTION-END'},locationDetails:{access_notes:'Access detail\n'.repeat(140)+'ACCESS-END'}}],
 ['many-photos',{...base,screenPhotos:Array.from({length:8},(_,i)=>({label:'Screen photo '+(i+1),bytes:i%2?portrait:landscape})),locationPhotos:Array.from({length:5},(_,i)=>({label:'Store photo '+(i+1),bytes:portrait})),includeLocationPhotos:true}],
];
for(const [name,data] of cases){const pdf=await renderScreenDetailsPdf(data,new Date('2026-11-03T12:00:00Z'));assert.ok(pdf.subarray(0,4).toString()==='%PDF');fs.writeFileSync(path.join(out,name+'.pdf'),pdf);}
execFileSync(process.env.PDF_TEST_PYTHON||'python',['-c',String.raw`import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader
root=Path(sys.argv[1])
for name in ['lcd','led','wall','unknown','with-location','missing','long','many-photos']:
 reader=PdfReader(root/(name+'.pdf')); text='\n'.join(p.extract_text() or '' for p in reader.pages)
 assert 'SCREEN DETAILS REPORT' in text and 'PPM inspection' in text and 'Location details' in text
 assert 'HIDDEN-LED-FIELD' not in text and 'DO-NOT-EXPORT-DERIVED' not in text
 assert 'Submitted' not in text and 'Entered in main system' not in text
 fonts={str(font.get_object().get('/BaseFont','')) for page in reader.pages for font in page['/Resources']['/Font'].get_object().values()}
 assert any('Outfit' in font and 'Regular' in font for font in fonts),fonts
 assert any('Outfit' in font and 'SemiBold' in font for font in fonts),fonts
 if name=='lcd':
  assert 'LCD TV' in text and 'QM32R' in text and 'Samsung' in text and 'LED display' not in text and 'Video Wall' not in text
 if name=='led':
  for expected in ['LED display','Sending card & controller','Media player','Power & network','5100','2100','10.71']: assert expected in text,expected
  assert 'LCD TV' not in text
  assert text.count('2000 × 800')==1 and text.count('Screen resolution (px)')==1
 if name=='wall': assert '6500' in text and '3750' in text and 'LCD TV' not in text and 'LED display' not in text
 if name=='unknown': assert 'Not specified' in text and 'No screen photos added.' in text and 'LCD TV' not in text
 if name=='with-location': assert 'Store entrance' in text and 'Location photos (1)' in text
 elif name!='many-photos': assert 'Store entrance' not in text
 if name=='missing': assert text.count('Photo unavailable.')==2 and 'No location photos added.' in text
 if name=='long':
  for expected in ['ID-END','FINDINGS-END','ACTION-END','ACCESS-END','(continued)']: assert expected in text.replace('\n',''),expected
 if name=='many-photos':
  for i in range(1,9): assert 'Screen photo '+str(i) in text
  for i in range(1,6): assert 'Store photo '+str(i) in text
 with pdfplumber.open(root/(name+'.pdf')) as pdf:
  first_words=pdf.pages[0].extract_words()
  id_label=next(w for w in first_words if w['text']=='ID')
  type_label=next(w for w in first_words if w['text']=='type')
  assert abs(id_label['top']-type_label['top'])<1 and type_label['x0']-id_label['x0']>200,(name,'summary columns')
  for i,page in enumerate(pdf.pages):
   assert 'Page '+str(i+1)+' of '+str(len(pdf.pages)) in (page.extract_text() or '')
   assert '16:00 GST' in (page.extract_text() or '')
   for word in page.extract_words():
    assert word['x0']>=41 and word['x1']<=page.width-41,(name,i,word)
    if word['top']<page.height-45: assert word['bottom']<=page.height-65,(name,i,word)
   for image in page.images:
    if image['top']>90:
     assert abs(image['width']/image['height']-image['srcsize'][0]/image['srcsize'][1])<.01,(name,'photo aspect ratio')
     assert image['bottom']<=page.height-66,(name,'photo footer overlap')
 print(name+': contents, pagination, margins and photo proportions passed ('+str(len(reader.pages))+' pages)')
`,out],{stdio:'inherit'});
console.log('Screen details PDF regression checks passed.');
