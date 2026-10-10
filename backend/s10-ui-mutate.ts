import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { io as ioc, type Socket } from "socket.io-client";

const API = "http://localhost:4000";
const ORIGIN = "http://localhost:3000";

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.COMMANDCODE_SCRATCHPAD as string, "s10-ui.json"), "utf8"),
) as { aEmail: string; aPassword: string; projectId: string; workspaceId: string };

async function main(): Promise<void> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.aEmail, password: cfg.aPassword }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]!).join("; ");

  const socket: Socket = await new Promise((resolve, reject) => {
    const s = ioc(API, { autoConnect: true, extraHeaders: { Cookie: cookie, Origin: ORIGIN } });
    const t = setTimeout(() => reject(new Error("connect timeout")), 8000);
    s.on("connect", () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on("connect_error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });

  const ack = await new Promise<any>((resolve) =>
    socket.emit("message:send", { projectId: cfg.projectId, text: "Live notification from A 👋" }, resolve),
  );
  console.log("message ack:", JSON.stringify(ack));
  socket.close();
  process.exit(ack?.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
