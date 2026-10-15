import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {build} from "esbuild";
const root=process.cwd(),qa=path.join(root,".server-runtime/pdf-qa"),output=path.join(root,".server-runtime/output/pdf");
await fs.mkdir(qa,{recursive:true});await fs.mkdir(output,{recursive:true});
const bundle=path.join(qa,"whatsapp-pdf.cjs");
await build({stdin:{contents:'export * from "./lib/whatsapp-alert-pdf";',resolveDir:root,loader:"ts"},outfile:bundle,platform:"node",format:"cjs",bundle:true,external:["pdfkit"]});
const lib=createRequire(import.meta.url)(bundle);let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;console.log("PASS "+message);};
const generatedAt=new Date("2026-10-15T08:00:00.000Z"),stamp=minutes=>new Date(generatedAt.getTime()-minutes*60000).toISOString();
const rows=[
 {screenName:"Window S-3 - Left",locationName:"Yas Mall",regionName:"Abu Dhabi",countryName:"United Arab Emirates",startedAt:stamp(117),lastCheckedAt:stamp(1),resolvedAt:null},
 {screenName:"Animation table",locationName:"Dubai Mall",regionName:"Dubai",countryName:"United Arab Emirates",startedAt:stamp(384),lastCheckedAt:stamp(1),resolvedAt:null},
 {screenName:"Behind cash",locationName:"Doha Mall",regionName:"Doha",countryName:"Qatar",startedAt:stamp(40),lastCheckedAt:stamp(1),resolvedAt:null},
];
const inspection=`import json,sys\nfrom pypdf import PdfReader\nimport pdfplumber\nr=PdfReader(sys.argv[1])\ntext='\\n'.join(p.extract_text() or '' for p in r.pages)\nbounds=True\nwith pdfplumber.open(sys.argv[1]) as pdf:\n for page in pdf.pages:\n  for word in page.extract_words():\n   if word['x0']<39 or word['x1']>page.width-39 or word['top']<29 or word['bottom']>page.height-20: bounds=False\nprint(json.dumps({'text':text,'pages':len(r.pages),'width':float(r.pages[0].mediabox.width),'height':float(r.pages[0].mediabox.height),'bounds':bounds}))`;
function inspect(file){try{return JSON.parse(execFileSync(process.env.PDF_TEST_PYTHON||"python",["-c",inspection,file],{encoding:"utf8",maxBuffer:10*1024*1024}));}catch(error){throw new Error("PDF inspection requires Python with pypdf and pdfplumber. Set PDF_TEST_PYTHON to that Python executable.",{cause:error});}}
async function render(name,report,folder=qa){const bytes=await lib.renderWhatsAppAlertPdf(report),file=path.join(folder,name);await fs.writeFile(file,bytes);return {bytes,file,...inspect(file)};}
try{
 const sample=await render("whatsapp-alert-sample.pdf",{kind:"unavailable",rows,generatedAt,sample:true},output);
 check(sample.bytes.subarray(0,5).toString()==="%PDF-"&&sample.bytes.length<lib.WHATSAPP_PDF_MAX_BYTES,"template creates a bounded real PDF attachment");
 check(sample.pages===1&&Math.abs(sample.width-595.28)<1&&Math.abs(sample.height-841.89)<1,"short reports use one portrait A4 page");
 check(sample.text.includes("SEPHORA")&&sample.text.includes("SCREEN CONTROL")&&sample.text.includes("FICTIONAL DATA"),"sample has branding and an explicit sample-data label");
 check(sample.text.includes("15 Oct 2026, 12:00")&&sample.text.includes("GST (UTC+4)"),"PDF states generation time and GST timezone");
 check(sample.text.indexOf("Animation table")<sample.text.indexOf("Window S-3")&&sample.text.indexOf("Window S-3")<sample.text.indexOf("Behind cash"),"PDF sorts complete rows by longest outage first");
 check(sample.text.includes("6h 24m")&&sample.text.includes("1h 57m")&&sample.text.includes("40m"),"PDF reports accurate outage durations");
 check(rows.every(row=>sample.text.includes(row.screenName)&&sample.text.includes(row.locationName)&&sample.text.includes(row.countryName)),"PDF includes every screen name and full location");
 check(sample.text.includes("Unavailable since")&&sample.text.includes("Last checked")&&sample.text.includes("Page 1 of 1"),"PDF includes labelled timestamps and page numbering");
 check(sample.bounds,"sample text stays within page margins");
 const live=await render("automatic.pdf",{kind:"unavailable",rows,generatedAt});
 check(live.text.includes("AUTOMATIC ALERT")&&live.text.includes("Preview unavailable")&&!live.text.includes("FICTIONAL DATA"),"automatic PDF has the correct real-report heading");
 check(live.text.includes("does not confirm physical player connectivity"),"report explains what preview status measures");
 const manual=await render("manual.pdf",{kind:"manual",rows,generatedAt});
 check(manual.text.includes("MANUAL REPORT")&&!manual.text.includes("AUTOMATIC ALERT"),"manual PDF is clearly distinguished from automatic alerts");
 const test=await render("test.pdf",{kind:"test",rows:[rows[0]],generatedAt});
 check(test.text.includes("TEST DOCUMENT")&&test.text.includes("does not report a real outage"),"test PDF cannot be confused with a real outage report");
 const many=Array.from({length:85},(_,index)=>({...rows[0],screenName:`Screen ${String(index+1).padStart(3,"0")}`,startedAt:stamp(index+20)}));
 const long=await render("many-screens.pdf",{kind:"unavailable",rows:many,generatedAt});
 check(long.pages>2&&(long.text.match(/Screen \d{3}/g)||[]).length===85,"long reports paginate without dropping any of 85 screens");
 check((long.text.match(/SCREEN \/ LOCATION/g)||[]).length===long.pages,"table headers repeat on every page");
 check(Array.from({length:long.pages},(_,index)=>long.text.includes(`Page ${index+1} of ${long.pages}`)).every(Boolean),"each page has a correct page number and total");
 check(long.bounds,"all pages of a long report keep text within page margins");
 const longRow={...rows[0],screenName:"Long screen name ".repeat(5).slice(0,80),locationName:"Long location name ".repeat(5).slice(0,80),regionName:"Long region name ".repeat(5).slice(0,80),countryName:"Long country name ".repeat(5).slice(0,80)};
 const wrapped=await render("long-names.pdf",{kind:"unavailable",rows:Array.from({length:9},()=>longRow),generatedAt});
 check(wrapped.pages>1&&wrapped.bounds,"maximum app label lengths wrap within columns over multiple pages");
 const privacy=await render("privacy.pdf",{kind:"manual",rows:[{...rows[0],screenName:"Screen <script> & sample\r\nname",liveUrl:"https://private-preview.invalid/secret-token",fingerprint:"secret-fingerprint"}],generatedAt});
 check(!privacy.text.includes("secret-token")&&!privacy.text.includes("secret-fingerprint")&&!privacy.bytes.includes(Buffer.from("/URI")),"PDF excludes private source fields and active links");
 check(privacy.text.includes("Screen <script> & sample name"),"entity text is literal and control characters are cleaned");
 for(const [report,message] of [
  [{kind:"manual",rows:[],generatedAt},"empty reports are rejected"],
  [{kind:"manual",rows:Array(5001).fill(rows[0]),generatedAt},"oversized screen lists are rejected without truncation"],
  [{kind:"manual",rows,generatedAt:new Date("invalid")},"invalid report timestamps fail before generation"],
  [{kind:"manual",rows:[{...rows[0],startedAt:"invalid"}],generatedAt},"invalid incident timestamps fail safely"],
  [{kind:"manual",rows:[{...rows[0],screenName:"X ".repeat(10000)}],generatedAt},"a label exceeding an entire page fails without clipping"],
 ]){await assert.rejects(()=>lib.renderWhatsAppAlertPdf(report));check(true,message);}
 console.log(`${checks} WhatsApp PDF layout and content checks passed. Sample: ${sample.file}`);
}finally{await fs.unlink(bundle).catch(()=>{});}
