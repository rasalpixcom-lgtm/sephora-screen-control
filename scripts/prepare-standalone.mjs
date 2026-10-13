import fs from "node:fs";
if (!fs.existsSync(".next/standalone/server.js")) throw new Error("Run npm run build first.");
fs.cpSync("public", ".next/standalone/public", { recursive: true });
fs.cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
const reportFont = "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf";
if (fs.existsSync(reportFont)) fs.copyFileSync(reportFont, ".next/standalone/report-font.ttf");
// Runtime secrets belong on the server, never inside a deployment bundle.
for (const name of fs.readdirSync(".next/standalone").filter((name) => name.startsWith(".env"))) fs.unlinkSync(`.next/standalone/${name}`);
console.log("Standalone assets prepared.");
