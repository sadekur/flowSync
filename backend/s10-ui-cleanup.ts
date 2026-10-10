import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const API = "http://localhost:4000";

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.COMMANDCODE_SCRATCHPAD as string, "s10-ui.json"), "utf8"),
) as { aEmail: string; aPassword: string; bEmail: string; workspaceId: string };

async function main(): Promise<void> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.aEmail, password: cfg.aPassword }),
  });
  const pairs = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
  const csrf = decodeURIComponent((pairs.find((p) => p.startsWith("csrfToken=")) ?? "=").split("=")[1]!);
  const cookie = pairs.join("; ");

  const del = await fetch(`${API}/api/workspaces/${cfg.workspaceId}`, {
    method: "DELETE",
    headers: { Cookie: cookie, "X-CSRF-Token": csrf },
  });
  console.log("delete workspace:", del.status);

  await mongoose.connect(process.env.MONGO_URI as string);
  const r = await mongoose.connection.db!.collection("users").deleteMany({ email: { $in: [cfg.aEmail, cfg.bEmail] } });
  console.log("removed users:", r.deletedCount);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
