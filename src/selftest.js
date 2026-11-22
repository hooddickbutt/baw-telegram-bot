import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeQrPng } from "./qr.js";
import { runBaw, walletStatus, authSignout } from "./baw.js";
import {
  escapeHtml,
  formatDhaka,
  formatStatus,
  formatBalances,
  formatDailyLimit,
  formatDevMode,
  formatConnectCaption,
  friendlyError,
  WELCOME,
  STRANGER_REFUSAL,
} from "./format.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}`);
  }
}

function run(cmd, args, env, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err), timedOut: false });
    });
  });
}

function assertNoSecretLeak(...texts) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const blob = texts.join("\n");
  if (token && blob.includes(token)) {
    failed += 1;
    console.error("FAIL  secret leak: token appeared in test output");
    return false;
  }
  return true;
}

// Formatters
assert(escapeHtml("<x>&").includes("&lt;x&gt;&amp;"), "escapeHtml encodes HTML");
assert(formatDhaka("1772767626000").includes("Asia/Dhaka"), "formatDhaka labels Asia/Dhaka");
assert(formatStatus("UNCONNECTED", null).includes("কানেক্ট করা নেই"), "status unconnected is Bengali");
assert(formatStatus("CONNECTED", [{ chainName: "BSC", address: "0xabc" }]).includes("0xabc"), "status includes address");
assert(formatBalances([]).includes("ব্যালেন্স"), "empty balance message");
assert(
  formatBalances([{ symbol: "USDT", binanceChainId: "56", balance: "10", value: "10" }]).includes("USDT"),
  "balance lists token",
);
assert(formatDailyLimit({ dailyLimit: 50, quotaUsed: 5, quotaLeft: 45, quotaDate: "2026-11-22" }).includes("45"), "daily limit values");
assert(formatDevMode({ devMode: { enabled: false } }).includes("বন্ধ"), "dev mode off");
assert(formatConnectCaption({ pairingCode: "ABC123", urlForWeb: "https://example.com", expireAt: Date.now() + 60000 }).includes("ABC123"), "connect caption has pairing code");
assert(WELCOME.includes("লেনদেন"), "welcome mentions no transactions");
assert(STRANGER_REFUSAL.includes("মালিকের"), "stranger refusal is Bengali");
assert(friendlyError({ error: { name: "NOT_LOGGED_IN" } }).includes("কানেক্ট"), "friendly NOT_LOGGED_IN");

// QR generation from a harmless https URL (not a live sign-in)
const qr = await writeQrPng("https://app.binance.com/");
const { statSync } = await import("node:fs");
const st = statSync(qr.filePath);
assert(st.size > 100, `QR png written (${st.size} bytes)`);
await qr.cleanup();

// baw read commands (signed-out is expected)
const status = await walletStatus();
assert(status.ok && status.data?.status === "UNCONNECTED", `baw wallet status --json => ${status.data?.status || status.error?.name}`);

const balance = await runBaw(["wallet", "balance", "--json"]);
assert(!balance.ok && balance.error?.name === "NOT_LOGGED_IN", "baw wallet balance --json => NOT_LOGGED_IN when signed out");

const settings = await runBaw(["wallet", "settings", "--json"]);
assert(!settings.ok && settings.error?.name === "NOT_LOGGED_IN", "baw wallet settings --json => NOT_LOGGED_IN when signed out");

const address = await runBaw(["wallet", "address", "--json"]);
assert(!address.ok && address.error?.name === "NOT_LOGGED_IN", "baw wallet address --json => NOT_LOGGED_IN when signed out");

const signout = await authSignout();
assert(signout.ok && signout.data?.status === "LOGGED_OUT", "baw auth signout --json works while signed out");

// Invalid verify id is rejected locally (no long poll)
const { authVerify } = await import("./baw.js");
const localReject = await authVerify("bad");
assert(localReject.error?.name === "INVALID_PARAMS", "authVerify rejects non-UUID qrCodeId locally");

// Bot refuses to start without owner id
const noOwner = await run("node", ["src/index.js"], { OWNER_TELEGRAM_ID: "" }, 8000);
assert(noOwner.code === 1, `bot exits 1 when OWNER_TELEGRAM_ID unset (code=${noOwner.code})`);
assert((noOwner.stderr + noOwner.stdout).includes("OWNER_TELEGRAM_ID"), "missing-owner error mentions OWNER_TELEGRAM_ID");
assertNoSecretLeak(noOwner.stdout, noOwner.stderr);

const badOwner = await run("node", ["src/index.js"], { OWNER_TELEGRAM_ID: "abc" }, 8000);
assert(badOwner.code === 1, "bot exits 1 when OWNER_TELEGRAM_ID is not numeric");
assertNoSecretLeak(badOwner.stdout, badOwner.stderr);

// Telegram getMe — report username only
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  failed += 1;
  console.error("FAIL  TELEGRAM_BOT_TOKEN not set for getMe");
} else {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const body = await res.json();
  assert(body.ok === true && body.result?.is_bot === true, "Telegram getMe ok");
  if (body.ok) {
    console.log(`INFO  bot username: @${body.result.username}`);
    console.log(`INFO  bot first_name: ${body.result.first_name}`);
  } else {
    console.error("FAIL  getMe description:", body.description);
  }
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll self-tests passed");
