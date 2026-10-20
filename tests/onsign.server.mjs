import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import pg from "pg";
import sharp from "sharp";
import { migrate } from "../scripts/migrate-postgres.mjs";

const databaseName = "sephora_onsign_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(process.env.DATABASE_URL); adminUrl.pathname = "/postgres";
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = "/" + databaseName;
const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
const pool = new pg.Pool({ connectionString: testUrl.toString() });
let server, logs = "", created = false, checks = 0;
const uiFinished = path.resolve(".server-runtime/onsign-ui-finished");
const photoDirectory = path.resolve(".server-runtime", databaseName + "-photos");
const check = (value, message) => { assert.ok(value, message); checks++; console.log("PASS " + message); };
try {
  await adminPool.query(`CREATE DATABASE "${databaseName}"`); created = true;
  await migrate(pool); await migrate(pool);
  check(true, "new migration applies and remains repeatable");
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex"), password = "OnSign-UI-Test-2026!";
  server = spawn(process.execPath, ["--require", path.resolve("tests/fixtures/onsign-preload.cjs"), path.resolve(".next/standalone/server.js")], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.toString(), AUTH_URL: origin,
      AUTH_ADDITIONAL_ORIGINS: "", AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL: "onsign-admin@example.test",
      AUTH_BOOTSTRAP_HASH: crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000),
      ONSIGN_API_TOKEN: "onsign-test-token", ONSIGN_ORGANIZATION_ID: "", ALERT_EMAIL_USER: "", ALERT_EMAIL_APP_PASSWORD: "", ULTRAMSG_TOKEN: "",
      SCREEN_PHOTO_DIR: photoDirectory,
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.ok(ready, "test server starts: " + logs.slice(-2000));
  const request = (route, body, cookie = "", extra = {}) => fetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  check((await request("/api/onsign")).status === 401, "API requires authentication");
  check((await request("/api/activate", { token, password })).ok, "isolated admin account is activated");
  const login = await request("/api/auth/sign-in/email", { email: "onsign-admin@example.test", password });
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  check(login.ok, "isolated admin can sign in");
  const listResponse = await request("/api/onsign", undefined, cookie), list = await listResponse.json();
  check(listResponse.ok && list.players.length === (process.env.ONSIGN_TEST_LONG_NAMES === "true" ? 32 : 2) && list.players[0].name === "Abu Dhabi Player", "authenticated endpoint discovers Sephora on a later organization page and returns only its paginated players");
  check(listResponse.headers.get("cache-control") === "no-store", "device information is not cached by browsers");
  async function create(type, name, parentId = null, extra = {}) {
    const response = await request("/api/state", { action: "create", type, name, parentId, ...extra }, cookie);
    assert.ok(response.ok, await response.clone().text());
    return (await response.json()).entities.find(item => item.name === name && item.type === type);
  }
  const country = await create("country", "Test country"), region = await create("region", "Test region", country.id), location = await create("store", "Test location", region.id);
  const screen = await create("screen", "Dubai Screen", location.id, { onsignPlayerId: "player-1", liveUrl: "https://example.test/preview" });
  const photoBytes = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#d9e9e4" } }).composite([{ input: Buffer.from('<svg width="1600" height="1000"><rect x="480" y="180" width="640" height="520" rx="18" fill="#172823"/><rect x="505" y="205" width="590" height="470" fill="#2b8c71"/><text x="800" y="430" text-anchor="middle" fill="white" font-size="52" font-family="Arial">SCREEN PHOTO</text><text x="800" y="510" text-anchor="middle" fill="white" font-size="30" font-family="Arial">TEST FIXTURE</text><rect x="775" y="700" width="50" height="100" fill="#172823"/><rect x="650" y="800" width="300" height="25" fill="#172823"/></svg>') }]).png().withMetadata({ orientation: 6 }).toBuffer();
  fs.mkdirSync(photoDirectory, { recursive: true });
  const fixturePhoto = path.join(photoDirectory, "upload-fixture.png"); fs.writeFileSync(fixturePhoto, photoBytes);
  const upload = (metadata, bytes = photoBytes, type = "image/png", session = cookie, originHeader = origin) => {
    const form = new FormData(); form.set("metadata", JSON.stringify(metadata)); form.set("photo", new Blob([bytes], { type }), "installation.png");
    return fetch(origin + "/api/state", { method: "POST", headers: { Cookie: session, Origin: originHeader }, body: form });
  };
  const photoUpdate = { action: "update", type: "screen", id: screen.id, name: screen.name, parentId: location.id, liveUrl: screen.liveUrl, photoAction: "replace", photoExpectedKey: null };
  check((await upload(photoUpdate, photoBytes, "image/png", "")).status === 401, "photo upload requires authentication");
  check((await upload(photoUpdate, photoBytes, "image/png", cookie, "https://attacker.test")).status === 403, "cross-origin photo upload is blocked");
  check((await upload(photoUpdate, Buffer.from("<svg/>"), "image/png")).status === 400, "disguised vector files are rejected before image decoding");
  check((await upload(photoUpdate, photoBytes, "image/gif")).status === 415, "unsupported photo formats are rejected");
  check((await upload(photoUpdate, Buffer.alloc(5 * 1024 * 1024 + 1))).status === 413, "oversized photos are rejected");
  const withPhoto = await upload(photoUpdate), photoState = await withPhoto.json();
  let key = photoState.entities?.find(item => item.id === screen.id)?.photoKey;
  check(withPhoto.ok && typeof key === "string", "saving a photo associates its server-generated reference with the screen");
  const photoUrl = (size = "thumbnail", version = key) => `/api/screen-photo?${new URLSearchParams({ screenId: screen.id, v: version, size })}`;
  const thumb = await request(photoUrl(), undefined, cookie), thumbBytes = Buffer.from(await thumb.arrayBuffer());
  const full = await request(photoUrl("full"), undefined, cookie), fullBytes = Buffer.from(await full.arrayBuffer());
  const thumbInfo = await sharp(thumbBytes).metadata(), fullInfo = await sharp(fullBytes).metadata();
  check(thumb.ok && full.ok && thumb.headers.get("content-type") === "image/webp", "authenticated thumbnail and full images are served as WebP");
  check(thumbInfo.width <= 320 && thumbInfo.height <= 240 && fullInfo.width === 1000 && fullInfo.height === 1600, "photos preserve proportions, apply EXIF rotation and create a small thumbnail");
  check(!fullInfo.exif && !fullInfo.orientation && !fullInfo.xmp, "saved photo strips EXIF and location metadata");
  check(full.headers.get("cache-control") === "private, no-store" && full.headers.get("x-content-type-options") === "nosniff", "photo responses remain private and non-sniffable");
  check((await request(photoUrl())).status === 401 && (await request(photoUrl("full", "../../secret"), undefined, cookie)).status === 404, "private photos cannot be read anonymously or through arbitrary file paths");
  const beforeFailedSave = fs.readdirSync(photoDirectory).length;
  check((await upload({ ...photoUpdate, name: "", photoExpectedKey: key })).status === 400 && fs.readdirSync(photoDirectory).length === beforeFailedSave, "failed inventory validation removes newly prepared photo files");
  const replaced = await upload({ ...photoUpdate, photoExpectedKey: key });
  const nextKey = (await replaced.json()).entities.find(item => item.id === screen.id).photoKey;
  check(replaced.ok && nextKey !== key && !fs.existsSync(path.join(photoDirectory, key + ".webp")), "replacement removes old image files only after successful save");
  check((await upload({ ...photoUpdate, photoExpectedKey: key })).status === 409 && fs.readdirSync(photoDirectory).length === beforeFailedSave, "stale photo changes are rejected and staged files cleaned up");
  key = nextKey;
  const noPhotoChange = await request("/api/state", { action: "update", type: "screen", id: screen.id, name: screen.name, parentId: location.id, liveUrl: screen.liveUrl }, cookie);
  check(noPhotoChange.ok && (await noPhotoChange.json()).entities.find(item => item.id === screen.id).photoKey === key, "older clients and ordinary edits preserve the saved photo");
  const removedPhoto = await request("/api/state", { ...photoUpdate, photoAction: "remove", photoExpectedKey: key }, cookie);
  check(removedPhoto.ok && (await request(photoUrl(), undefined, cookie)).status === 404 && !fs.existsSync(path.join(photoDirectory, key + ".webp")), "removal revokes image access and deletes the stored image pair");
  const finalPhoto = await upload(photoUpdate); key = (await finalPhoto.json()).entities.find(item => item.id === screen.id).photoKey;
  check(finalPhoto.ok, "a new photo can be saved after removal");
  const photoCreate = await upload({ action: "create", type: "screen", name: "Photo-only Screen", parentId: location.id, photoAction: "replace", photoExpectedKey: null });
  const photoOnly = (await photoCreate.json()).entities.find(item => item.name === "Photo-only Screen");
  check(photoCreate.ok && photoOnly.photoKey && !photoOnly.onsignPlayerId, "Add Screen supports a photo independently of OnSign");
  const photoOnlyPage = await request(`/admin/screens/${photoOnly.id}`, undefined, cookie);
  check(photoOnlyPage.ok && (await photoOnlyPage.text()).includes("Physical screen photo"), "unlinked screens still display the physical photo card");
  check((await request("/api/state", { action: "delete", id: photoOnly.id }, cookie)).ok && !fs.existsSync(path.join(photoDirectory, photoOnly.photoKey + ".webp")), "screen deletion removes physical photo files");
  check(screen.onsignPlayerId === "player-1", "creating a screen validates and saves its player link");
  const detailsResponse = await request("/api/onsign?screenId=" + screen.id, undefined, cookie), details = await detailsResponse.json();
  check(detailsResponse.ok && details.player.isConnected && details.player.name === "Dubai Player", "screen details resolve the saved player ID");
  check(details.player.network[0].inet === "192.0.2.20", "device endpoint returns available network details");
  check(!JSON.stringify(details).includes("onsign-test-token"), "API credentials never appear in response data");
  const section = (name, extra = "", session = cookie) => request(`/api/onsign?screenId=${screen.id}&section=${name}${extra}`, undefined, session);
  const extra = await (await section("extended")).json();
  check(extra.values.serialNumber === "TEST-SERIAL-123" && extra.values.batteryLevel === 0 && extra.values.isUpdateLocked === false, "extended device fields preserve zero and false values");
  const alerts = await (await section("alerts")).json();
  check(alerts.nodes.length === 1 && alerts.pageInfo.hasNextPage, "related alert records use independent pagination");
  const nextAlerts = await (await section("alerts", "&after=next-alert")).json();
  check(nextAlerts.nodes[0].id === "alert-2", "related list cursors fetch the next page");
  for (const name of ["captures", "groups", "content"]) check((await section(name)).ok, `Admin can read ${name} for the linked player`);
  check((await section("content", "&loop=TRIGGER")).ok, "Admin can read trigger metadata without executing an action");
  check((await section("content", "&groupId=group-1")).ok, "linked group content passes membership validation");
  check((await section("content", "&groupId=foreign-group")).status === 404, "unrelated group content is blocked");
  check((await section("unknown")).status === 400 && (await section("content", "&loop=INVALID")).status === 400, "invalid detail section and loop options fail validation");
  check((await section("extended", "", "")).status === 401, "expanded information requires authentication");
  const update = extra => request("/api/state", { action: "update", type: "screen", id: screen.id, name: screen.name, parentId: location.id, liveUrl: screen.liveUrl, ...extra }, cookie);
  const otherBrand = await update({ onsignPlayerId: "other-brand-player" });
  check(otherBrand.status === 404 && (await otherBrand.json()).error.includes("Sephora"), "Admin cannot link a player outside the selected Sephora organization");
  await pool.query("UPDATE entities SET onsign_player_id = 'other-brand-player' WHERE id = $1", [screen.id]);
  check((await request("/api/onsign?screenId=" + screen.id, undefined, cookie)).status === 404, "legacy player links cannot expose details outside Sephora");
  await pool.query("UPDATE entities SET onsign_player_id = 'player-1' WHERE id = $1", [screen.id]);
  check((await update({ onsignPlayerId: "missing-player" })).status === 404, "linking a player outside the account is rejected");
  const afterRejected = (await (await request("/api/state", undefined, cookie)).json()).entities.find(item => item.id === screen.id);
  check(afterRejected.onsignPlayerId === "player-1" && afterRejected.liveUrl === screen.liveUrl, "failed linking preserves the existing player and preview");
  const updated = await update({ onsignPlayerId: "player-2" });
  check(updated.ok && (await updated.json()).entities.find(item => item.id === screen.id).onsignPlayerId === "player-2", "Admin can replace a player link");
  const disconnected = await (await request("/api/onsign?screenId=" + screen.id, undefined, cookie)).json();
  check(disconnected.player.isConnected === false, "disconnected status is not confused with an API error");
  check((await update({ onsignPlayerId: "" })).ok && (await request("/api/onsign?screenId=" + screen.id, undefined, cookie)).status === 409, "unlink removes device access while retaining the screen");
  check((await update({ onsignPlayerId: "player-1" })).ok, "player can be linked again");
  check((await request("/api/state", { action: "update", type: "screen", id: screen.id, name: screen.name, parentId: location.id, onsignPlayerId: "player-1" }, cookie, { Origin: "https://attacker.test" })).status === 403, "cross-origin player link writes are blocked");
  check((await request("/api/state", { action: "update", type: "country", id: country.id, name: country.name, onsignPlayerId: "player-1" }, cookie)).status === 400, "only screens can be linked to players");
  await update({ onsignPlayerId: "player-1" });
  const unlinked = await create("screen", "Unlinked Screen", location.id);
  check((await request("/api/onsign?screenId=" + unlinked.id, undefined, cookie)).status === 409, "unlinked details have a helpful empty state");
  const shared = await create("screen", "Second display on same player", location.id, { onsignPlayerId: "player-1" });
  check(shared.onsignPlayerId === "player-1", "one player can be associated with multiple physical displays");
  const detailsPage = `/admin/screens/${encodeURIComponent(screen.id)}`;
  const page = await request(detailsPage, undefined, cookie), pageHtml = await page.text();
  check(page.ok && pageHtml.includes("Screen details") && pageHtml.includes("Dubai Screen") && pageHtml.includes("Back to screens"), "Admin can open the dedicated screen details page directly");
  const unlinkedPage = await request(`/admin/screens/${unlinked.id}`, undefined, cookie);
  check(unlinkedPage.ok && (await unlinkedPage.text()).includes("No OnSign player linked"), "unlinked screens have a full-page empty state");
  check((await request("/admin/screens/unknown-screen", undefined, cookie)).status === 404, "unknown screen details URLs return 404");
  check((await request(`/admin/screens/${location.id}`, undefined, cookie)).status === 404, "non-screen records cannot open a details page");
  check((await fetch(origin + detailsPage, { redirect: "manual" })).status === 307, "anonymous users cannot open device details pages");
  const createdController = await request("/api/users", { action: "create", name: "Test controller", email: "onsign-controller@example.test", role: "controller", password }, cookie);
  assert.ok(createdController.ok, "controller fixture can be created");
  const controllerLogin = await request("/api/auth/sign-in/email", { email: "onsign-controller@example.test", password });
  assert.ok(controllerLogin.ok, "controller fixture can sign in");
  const controllerCookie = controllerLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  check((await fetch(origin + detailsPage, { headers: { Cookie: controllerCookie }, redirect: "manual" })).status === 307, "Controller accounts cannot open Admin details pages");
  check((await section("extended", "", controllerCookie)).status === 403 && (await section("content", "", controllerCookie)).status === 403, "Controller accounts cannot read expanded information or content");
  check((await request(photoUrl(), undefined, controllerCookie)).status === 403 && (await upload({ ...photoUpdate, photoExpectedKey: key }, photoBytes, "image/png", controllerCookie)).status === 403, "Controller accounts cannot view or upload private screen photos");
  check((await request("/api/onsign?screenId=" + location.id, undefined, cookie)).status === 404, "locations cannot expose device information");
  await assert.rejects(() => pool.query("UPDATE entities SET onsign_player_id = 'bad id' WHERE id = $1", [screen.id])); checks++;
  check(true, "database enforces player ID constraints");
  await pool.query("ALTER TABLE entities RENAME COLUMN onsign_player_id TO onsign_player_health_fixture");
  try { check((await request("/api/health")).status === 503, "health detects a missing player-link migration"); }
  finally { await pool.query("ALTER TABLE entities RENAME COLUMN onsign_player_health_fixture TO onsign_player_id"); }
  check((await request("/api/health")).ok, "health recovers after the migration column is restored");
  await pool.query("ALTER TABLE entities RENAME COLUMN photo_key TO photo_key_health_fixture");
  try { check((await request("/api/health")).status === 503, "health detects a missing screen-photo migration"); }
  finally { await pool.query("ALTER TABLE entities RENAME COLUMN photo_key_health_fixture TO photo_key"); }
  check((await request("/api/health")).ok, "health recovers after restoring the photo metadata column");
  console.log(`${checks} OnSign server checks passed on an isolated PostgreSQL database.`);
  if (process.argv.includes("--ui")) {
    fs.rmSync(uiFinished, { force: true });
    console.log(`UI test server: ${origin}/login | onsign-admin@example.test | ${password}`);
    console.log(`Photo upload fixture: ${fixturePhoto}`);
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline && !fs.existsSync(uiFinished)) await new Promise(resolve => setTimeout(resolve, 500));
    fs.rmSync(uiFinished, { force: true });
  }
} finally {
  if (server && server.exitCode === null) { const exit = once(server, "exit"); server.kill(); await exit; }
  await pool.end();
  if (created) await adminPool.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await adminPool.end();
  // Resolve and check this exact disposable fixture directory before recursive removal.
  const runtimeRoot = path.resolve(".server-runtime") + path.sep;
  if (!photoDirectory.startsWith(runtimeRoot) || !path.basename(photoDirectory).startsWith(databaseName)) throw new Error("Unsafe test cleanup path");
  fs.rmSync(photoDirectory, { recursive: true, force: true });
}
