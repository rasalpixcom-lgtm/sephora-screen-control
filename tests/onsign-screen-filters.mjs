import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const out=new URL("../.server-runtime/onsign-screen-filters.cjs",import.meta.url);
await build({entryPoints:["lib/onsign-screen-filters.ts"],outfile:fileURLToPath(out),bundle:true,platform:"node",format:"cjs"});
const {matchesOnSignScreen:matches,emptyOnSignScreenFilters:empty,onSignScreenValues:values,validOnSignScreenFilters:valid,onSignFilterValueLabel:label}=createRequire(import.meta.url)(fileURLToPath(out));
const players=new Map([
 ["one",{id:"one",isConnected:true,osVersion:"Windows 10 x86_64",ssids:["DSI","Guest"]}],
 ["two",{id:"two",isConnected:false,osVersion:"Windows 11 x86_64",ssids:["DSI"]}],
 ["three",{id:"three",isConnected:null,osVersion:null,ssids:[]}]
]);
let count=0;const check=value=>{assert.ok(value);count++};
check(matches({onsignPlayerId:"one"},empty(),players));
check(matches({onsignPlayerId:"one"},{...empty(),ssid:"v:DSI",os:"v:Windows 10 x86_64",connectivity:"v:Connected"},players));
check(!matches({onsignPlayerId:"two"},{...empty(),connectivity:"v:Connected"},players));
check(matches({onsignPlayerId:"two"},{...empty(),ssid:"v:DSI",connectivity:"v:Disconnected"},players));
check(!matches({onsignPlayerId:"one"},{...empty(),ssid:"v:dsi"},players));
check(matches({onsignPlayerId:"one"},{...empty(),ssid:"v:Guest"},players));
check(matches({onsignPlayerId:"three"},{...empty(),ssid:"@unknown",connectivity:"@unknown",os:"@unknown"},players));
check(matches({onsignPlayerId:"missing"},{...empty(),os:"@unknown"},players));
check(matches({},{...empty(),os:"@unlinked"},players));
check(!matches({},{...empty(),os:"@unknown"},players));
check(!matches({onsignPlayerId:"missing"},{...empty(),os:"@unlinked"},players));
check(values("one",players.get("one"),"ssid").length===2);
check(label("@unlinked")==="No OnSign player linked"&&label("@unknown")==="Not reported");
check(label("v:@unknown")==="@unknown");
check(valid({...empty(),ssid:"v:DSI",connectivity:"v:Connected"}));
for(const value of ["Connected","v:Online","v:","x".repeat(515),"v:a\nb"])check(!valid({...empty(),connectivity:value}));
check(players.get("one").ssids.join(",")==="DSI,Guest");
// SSIDs are exact names: DSA, DSI and DSA Guest must stay distinct.
const wifiPlayers=new Map([
 ['dsa-online',{id:'dsa-online',isConnected:true,osVersion:'Windows 10',ssids:['DSA','Guest Wi-Fi']}],
 ['dsa-offline',{id:'dsa-offline',isConnected:false,osVersion:'Windows 11',ssids:['DSA']}],
 ['dsi',{id:'dsi',isConnected:true,osVersion:'Android 10',ssids:['DSI']}],
 ['dsa-guest',{id:'dsa-guest',isConnected:true,osVersion:'Android 10',ssids:['DSA Guest']}],
 ['special',{id:'special',isConnected:true,osVersion:'Android 10',ssids:['Store & Café Wi-Fi', 'شبكة المتجر']}]
]);
const screens=[{id:'1',onsignPlayerId:'dsa-online'},{id:'2',onsignPlayerId:'dsa-offline'},{id:'3',onsignPlayerId:'dsi'},{id:'4',onsignPlayerId:'dsa-guest'},{id:'5',onsignPlayerId:'special'},{id:'6',onsignPlayerId:'dsa-online'},{id:'7'}];
const wifiOptions=[...new Set(screens.flatMap(s=>values(s.onsignPlayerId,wifiPlayers.get(s.onsignPlayerId),'ssid')))];
check(wifiOptions.filter(v=>v==='v:DSA').length===1);
for(const name of ['DSA','DSI','DSA Guest','Guest Wi-Fi','Store & Café Wi-Fi','شبكة المتجر']) check(wifiOptions.includes('v:'+name));
check(screens.filter(s=>matches(s,{...empty(),ssid:'v:DSA'},wifiPlayers)).map(s=>s.id).join(',')==='1,2,6');
check(screens.filter(s=>matches(s,{...empty(),ssid:'v:DSI'},wifiPlayers)).map(s=>s.id).join(',')==='3');
check(screens.filter(s=>matches(s,{...empty(),ssid:'v:DSA',connectivity:'v:Connected'},wifiPlayers)).map(s=>s.id).join(',')==='1,6');
check(screens.filter(s=>matches(s,{...empty(),ssid:'v:DSA',connectivity:'v:Disconnected'},wifiPlayers)).map(s=>s.id).join(',')==='2');
check(!screens.some(s=>matches(s,{...empty(),ssid:'v:Unavailable network'},wifiPlayers)));
for(const value of wifiOptions) check(valid({...empty(),ssid:value}));
console.log(count+" OnSign screen filter checks passed.");
