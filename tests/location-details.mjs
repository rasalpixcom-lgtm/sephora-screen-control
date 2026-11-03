import assert from "node:assert/strict";
import { parseLocationDetails } from "../lib/location-details.ts";
assert.deepEqual(parseLocationDetails({}), {});
assert.deepEqual(parseLocationDetails({address:"  Unit 12  ",gps_lat:"0",gps_lng:"-180",access_notes:"Line 1\nLine 2"}), {address:"Unit 12",gps_lat:"0",gps_lng:"-180",access_notes:"Line 1\nLine 2"});
assert.deepEqual(parseLocationDetails({gps_lat:"-90",gps_lng:"180",contact_email:" person@example.test "}), {gps_lat:"-90",gps_lng:"180",contact_email:"person@example.test"});
for (const value of [null,[],false,"text",{unknown:"x"},{address:12},{address:"x".repeat(501)},{contact_name:"a\nb"},{access_notes:"a\u0000b"},{gps_lat:"91",gps_lng:"0"},{gps_lat:"0",gps_lng:"-181"},{gps_lat:"0"},{gps_lng:"0"},{gps_lat:"NaN",gps_lng:"0"},{gps_lat:"1e1",gps_lng:"0"},{gps_lat:"Infinity",gps_lng:"0"},{contact_email:"bad@address"}]) assert.throws(()=>parseLocationDetails(value),Error);
assert.deepEqual(parseLocationDetails({contact_phone:" +971 (0) 50-123-4567 ",working_hours:"Mon-Sat 10:00-22:00",access_notes:"  "}), {contact_phone:"+971 (0) 50-123-4567",working_hours:"Mon-Sat 10:00-22:00"});
console.log("Location detail validation passed: optional fields, GPS pairs and bounds, contact email, lengths and unsafe text.");
