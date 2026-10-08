import fs from "node:fs";
import crypto from "node:crypto";
if (fs.existsSync(".env.local") || fs.existsSync(".server-runtime/postgres.env")) throw new Error("Local server configuration already exists; refusing to overwrite it.");
fs.mkdirSync(".server-runtime", { recursive: true });
const password = crypto.randomBytes(32).toString("hex");
const previous = fs.readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((line) => /^AUTH_/.test(line));
fs.writeFileSync(".server-runtime/postgres.env", `POSTGRES_USER=sephora\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=sephora\n`, { mode: 0o600 });
fs.writeFileSync(".env.local", `DATABASE_URL=postgresql://sephora:${password}@127.0.0.1:55432/sephora\nDATABASE_SSL=false\nPORT=5174\nHOSTNAME=127.0.0.1\n${previous.join("\n")}\n`, { mode: 0o600 });
console.log("Local configuration created; secret values were not printed.");
