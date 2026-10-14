import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const output = new URL("../.server-runtime/monitor-summary-test.cjs", import.meta.url);
await fs.mkdir(new URL("../.server-runtime/", import.meta.url), { recursive:true });
await build({ stdin:{ contents:'export * from "./lib/monitor-preview-summary"; export * from "./lib/screens"; export * from "./lib/preview-timing";', resolveDir:process.cwd(), loader:"ts" }, outfile:fileURLToPath(output), platform:"node", format:"cjs", bundle:true });
const { monitorPreviewSummary, screensFor, unavailableMinutes } = createRequire(import.meta.url)(fileURLToPath(output));
let checks = 0;
function check(condition, description) { assert.ok(condition, description); checks++; }
const entity = (id,type,parentId=null,liveUrl=null) => ({id,type,name:id,parentId,liveUrl,isDemo:0,createdAt:""});
const screen = (id,parentId,url=`https://app.onsign.tv/embed/${id}`) => entity(id,"screen",parentId,url);
const entities = [entity("UAE","country"),entity("Qatar","country"),entity("Dubai","region","UAE"),entity("Abu Dhabi","region","UAE"),entity("Doha","region","Qatar"),entity("Dubai Mall","store","Dubai"),entity("Other mall","store","Dubai"),entity("Dalama","store","Abu Dhabi"),entity("Qatar mall","store","Doha"),entity("group","group"),screen("s1","Dubai Mall"),screen("s2","Dubai Mall"),screen("s3","Other mall"),screen("s4","Dalama",null),screen("s5","Qatar mall"),screen("s6","Qatar mall","https://example.test/preview"),screen("s7","Qatar mall"),screen("s8",null)];
const health = ["available","unavailable","checking","unavailable","unknown","available","available","available"].map((status,index)=>({screenId:`s${index+1}`,status,lastImageAt:null,checkedAt:null}));
health.push({screenId:"not-selected",status:"unavailable",lastImageAt:null,checkedAt:null});
const state = {entities,members:[{groupId:"group",screenId:"s2"},{groupId:"group",screenId:"s7"},{groupId:"group",screenId:"s2"}],display:{selection:{},autoAdvance:true,intervalSeconds:10,updatedAt:""}};
const summary = selection => monitorPreviewSummary(screensFor(state, selection), entities, health);
try {
  const deviceNow = Date.now;
  try {
    Date.now = () => Date.parse("2035-01-01T00:00:00Z");
    check(unavailableMinutes("2026-10-14T10:00:00Z","2026-10-14T11:15:59Z")===75,"a device clock years ahead cannot inflate the recorded server outage duration");
    Date.now = () => Date.parse("2000-01-01T00:00:00Z");
    check(unavailableMinutes("2026-10-14T10:00:00Z","2026-10-14T11:15:59Z")===75,"a device clock years behind cannot shorten the server outage duration");
  } finally { Date.now = deviceNow; }
  check(unavailableMinutes(undefined,"2026-10-14T11:15:59Z")===null && unavailableMinutes("invalid","invalid")===null && unavailableMinutes("2026-10-14T11:15:59Z",undefined)===null,"missing or invalid timestamps do not invent durations");
  check(unavailableMinutes("2026-10-14T11:16:00Z","2026-10-14T11:15:59Z")===0,"future incident timestamps cannot produce negative durations");
  const all = summary({});
  check(all.counts.total===8 && all.counts.previewing===3 && all.counts.unavailable===1 && all.counts.checking===2 && all.counts.noLink===1 && all.counts.unsupported===1, "all-screen statuses are counted separately and missing/unsupported links cannot be called unavailable or previewing");
  check(all.countries.length===3 && all.countries.find(country=>country.name==="Unassigned").counts.total===1, "missing country ancestry does not lose a screen");
  check(all.countries.find(country=>country.id==="UAE").counts.total===4 && all.countries.find(country=>country.id==="Qatar").counts.total===3, "all-locations summary groups the selected screens by country");
  const namedEntities = entities.map(item => item.id === "UAE" ? {...item,name:"United Arab Emirates",shortName:"UAE"} : item);
  const namedSummary = monitorPreviewSummary(screensFor({...state,entities:namedEntities},{}),namedEntities,health);
  check(namedSummary.countries.find(country=>country.id==="UAE").shortName === "UAE" && namedSummary.countries.find(country=>country.id==="UAE").name === "United Arab Emirates", "country summaries retain the full name and optional badge short name");
  check(namedSummary.countries.find(country=>country.id==="Qatar").shortName === null && namedSummary.countries.find(country=>country.id==="Qatar").name === "Qatar", "countries without short names retain the full-name fallback");
  const country = summary({countryId:"UAE"});
  check(country.counts.total===4 && country.countries.length===1 && country.counts.unavailable===1, "country selection includes all its regions and excludes other countries");
  check(summary({regionId:"Dubai"}).counts.total===3, "region selection includes both of its locations only");
  const location = summary({storeId:"Dubai Mall"});
  check(location.counts.total===2 && location.counts.previewing===1 && location.counts.unavailable===1, "location selection counts only its screens");
  const group = summary({groupId:"group"});
  check(group.counts.total===2 && group.counts.previewing===1 && group.counts.unavailable===1 && group.countries.length===2, "group selections span countries without double counting duplicate memberships");
  check(summary({screenIds:["s1","s7","s1"]}).counts.total===2, "individual screen selections are counted once");
  check(summary({countryId:"Qatar",screenIds:["s1","s7"]}).counts.total===1, "combined selection filters are respected");
  check(summary({storeId:"missing"}).counts.total===0 && summary({storeId:"missing"}).countries.length===0, "empty selections produce zero counts without unrelated country badges");
  const waiting = monitorPreviewSummary(screensFor(state,{}),entities,[]);
  check(waiting.counts.checking===6 && waiting.counts.previewing===0 && waiting.counts.unavailable===0, "startup results never assume that unchecked screens are online or offline");
  const error = monitorPreviewSummary(screensFor(state,{}),entities,health,true);
  check(error.counts.checking===6 && error.counts.noLink===1 && error.counts.unsupported===1, "checker inventory failures suppress known status counts while preserving link categories");
  const fields = ["previewing","unavailable","checking","noLink","unsupported"];
  check(fields.reduce((sum,field)=>sum+all.counts[field],0)===all.counts.total && all.countries.every(country=>fields.reduce((sum,field)=>sum+country.counts[field],0)===country.counts.total), "every selected screen belongs to exactly one status category");
  check(fields.every(field=>all.countries.reduce((sum,country)=>sum+country.counts[field],0)===all.counts[field]), "country counts add up to the selected wall totals");
  const large = Array.from({length:1001},(_,index)=>screen(`large-${index}`,"Dubai Mall"));
  check(monitorPreviewSummary(large,[...entities,...large],[]).counts.total===1001, "counts cover the complete inventory rather than one rotation page");
  console.log(`${checks} monitor preview summary checks passed.`);
} finally { await fs.unlink(output).catch(()=>{}); }
