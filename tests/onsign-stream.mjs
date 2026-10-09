import assert from "node:assert/strict";
import { startOnSignStream, onSignToken, FRAME_TIMEOUT_MS, HEARTBEAT_MS } from "../lib/onsign-stream.ts";
let checks = 0;
function check(condition, description) { assert.ok(condition, description); checks++; }
function fixture(onFrame = async () => {}) {
  let time = 0, id = 0;
  const timers = new Map(), sockets = [], statuses = [];
  const environment = {
    createSocket(url) {
      const socket = { url, readyState:0, binaryType:"blob", sent:[], closed:false,
        send(message) { this.sent.push(JSON.parse(message)); }, close() { this.closed=true; this.readyState=3; },
        open() { this.readyState=1; this.onopen?.({}); }, message(data) { return this.onmessage?.({data}); },
      };
      sockets.push(socket); return socket;
    },
    setTimeout(callback, delay) { const key=++id;timers.set(key,{callback,at:time+delay});return key; },
    clearTimeout(key) { timers.delete(key); },
  };
  const controller=startOnSignStream("example-token",{onStatus:status=>statuses.push(status),onFrame},environment);
  const advance = delay => {
    const end=time+delay;
    while(true) {
      const next=[...timers].filter(([,task])=>task.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      time=next[1].at;timers.delete(next[0]);next[1].callback();
    }
    time=end;
  };
  const frame=async(socket,rotation=0,bytes=new Uint8Array([255,216,255,217]).buffer)=>{
    await socket.message(JSON.stringify({t:"live-view:image",id:2,binaryField:"buffer",data:{rotation}}));
    await socket.message(bytes);
  };
  return {controller,sockets,statuses,timers,advance,frame};
}

check(onSignToken("https://app.onsign.tv/embed/a_B-12/")==="a_B-12","valid preview token");
for(const url of ["http://app.onsign.tv/embed/token","https://app.onsign.tv.attacker.test/embed/token","https://app.onsign.tv:8443/embed/token","https://app.onsign.tv/players/token","https://app.onsign.tv/embed/","https://app.onsign.tv/embed/a/b","invalid"])check(onSignToken(url)===null,"reject invalid preview endpoint");
check(FRAME_TIMEOUT_MS===30000,"stale detection uses image age, with a 30 second deadline");
const received=[];
const live=fixture(async(bytes,rotation,isCurrent)=>{received.push({size:bytes.byteLength,rotation,current:isCurrent()});});
const first=live.sockets[0];
check(first.url==="wss://app.onsign.tv/livews"&&first.binaryType==="arraybuffer","initial connection uses canonical secure endpoint and binary images");
first.open();
check(first.sent[0].t==="live-view:subscribe"&&first.sent[0].data.originalRes===false,"subscribe to preview without full-resolution load");
await live.frame(first,90);
check(received[0].rotation===90&&received[0].current&&live.statuses.at(-1)==="live","decoded frame activates preview");
check(first.sent.some(packet=>packet.t==="ack"&&packet.ack===2),"acknowledge image after rendering");
live.advance(HEARTBEAT_MS);
check(first.sent.some(packet=>packet.t==="hb"),"connection heartbeat sent");
await first.message(JSON.stringify({t:"ack",ack:3}));
live.advance(FRAME_TIMEOUT_MS-HEARTBEAT_MS);
check(first.closed&&live.statuses.at(-1)==="reconnecting","heartbeat activity cannot hide missing images");
live.advance(1000);
check(live.sockets.length===2&&live.sockets[1].binaryType==="arraybuffer","stalled connection is replaced automatically with correct binary type");
const second=live.sockets[1];second.open();await live.frame(second);
live.advance(20000);await live.frame(second);live.advance(20000);
check(!second.closed,"fresh frames reset the stale timer");
live.controller.pause();check(second.closed&&live.timers.size===0,"hidden-page pause closes transport and timers");
live.advance(120000);check(live.sockets.length===2,"paused preview does not reconnect in background");
live.controller.resume();check(live.sockets.length===3,"visible-page resume reconnects automatically");
const third=live.sockets[2];third.open();third.onerror?.({});live.advance(1000);
check(third.closed&&live.sockets.length===4,"network failures automatically recover");
live.controller.dispose();live.advance(120000);
check(live.timers.size===0&&live.sockets.length===4&&live.sockets[3].closed,"unmounted preview frees connections and retry timers");

const errors=fixture(async()=>{throw new Error("decode failed");});
errors.sockets[0].open();await errors.frame(errors.sockets[0]);
check(errors.sockets[0].closed&&errors.statuses.at(-1)==="reconnecting","invalid image cannot mark stale content as live");
errors.advance(1000);errors.sockets[1].open();await errors.sockets[1].message("invalid JSON");
check(errors.sockets[1].closed,"malformed packets reconnect instead of hanging");
errors.advance(2000);errors.sockets[2].open();await errors.frame(errors.sockets[2],0,new Blob(["image bytes"]));
check(errors.sockets[2].closed,"Blob images are normalized before decoding and decode failures recover");
errors.controller.dispose();

const denied=fixture();denied.sockets[0].open();await denied.sockets[0].message(JSON.stringify({t:"error",data:{}}));
check(denied.statuses.at(-1)==="unavailable"&&denied.sockets[0].closed,"provider denial shows unavailable instead of pretending preview is live");
denied.advance(29999);check(denied.sockets.length===1,"provider errors do not cause rapid retry loops");
denied.advance(1);check(denied.sockets.length===2,"provider availability is retried automatically");denied.controller.dispose();

let finishFrame;
const late=fixture(()=>new Promise(resolve=>{finishFrame=resolve;}));late.sockets[0].open();
const pending=late.frame(late.sockets[0]);await Promise.resolve();await Promise.resolve();late.controller.dispose();finishFrame();await pending;
check(!late.statuses.includes("live"),"a late frame cannot revive a disposed monitor");
const steady=fixture();steady.sockets[0].open();
for(let index=0;index<20;index++){await steady.frame(steady.sockets[0]);steady.advance(10000);}
check(steady.sockets.length===1&&!steady.sockets[0].closed,"healthy preview remains connected beyond three minutes without blind refreshes");
steady.controller.dispose();
const blob=fixture(async(bytes)=>{assert.ok(bytes instanceof ArrayBuffer);});blob.sockets[0].open();
await blob.frame(blob.sockets[0],0,new Blob(["image bytes"]));
check(blob.statuses.at(-1)==="live","older-WebView Blob frames normalize successfully");blob.controller.dispose();
console.log(checks+" OnSign stream recovery checks passed.");
