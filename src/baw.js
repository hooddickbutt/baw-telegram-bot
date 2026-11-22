import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;
const VERIFY_MAX_MS = 6 * 60 * 1000;

function parseJsonPayload(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // baw --json should print one object; if logs sneak in, take the last JSON object.
    const matches = text.match(/\{[\s\S]*\}/g);
    if (!matches) return null;
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(matches[i]);
      } catch {
        // keep looking
      }
    }
    return null;
  }
}

export function runBaw(args, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = spawn("baw", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, 2000);
      finish({
        ok: false,
        success: false,
        data: null,
        error: {
          code: "TIMEOUT",
          name: "TIMEOUT",
          message: `baw ${args.join(" ")} timed out after ${timeoutMs}ms`,
        },
        exitCode: null,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      const missing = err && err.code === "ENOENT";
      finish({
        ok: false,
        success: false,
        data: null,
        error: {
          code: missing ? "BAW_NOT_FOUND" : "SPAWN_ERROR",
          name: missing ? "BAW_NOT_FOUND" : "SPAWN_ERROR",
          message: missing ? "baw command not found" : String(err.message || err),
        },
        exitCode: null,
        timedOut: false,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      const parsed = parseJsonPayload(stdout);
      if (parsed && typeof parsed === "object") {
        const success = parsed.success === true;
        finish({
          ok: success,
          success,
          data: parsed.data ?? null,
          error: parsed.error ?? (success ? null : { code: "UNKNOWN", name: "UNKNOWN", message: "Unknown baw error" }),
          exitCode: code,
          timedOut: false,
        });
        return;
      }
      finish({
        ok: false,
        success: false,
        data: null,
        error: {
          code: "INVALID_JSON",
          name: "INVALID_JSON",
          message: stderr.trim() || "baw returned no JSON",
        },
        exitCode: code,
        timedOut: false,
      });
    });
  });
}

export function walletStatus() {
  return runBaw(["wallet", "status", "--json"]);
}

export function walletAddress() {
  return runBaw(["wallet", "address", "--json"]);
}

export function walletBalance() {
  return runBaw(["wallet", "balance", "--json"]);
}

export function walletSettings() {
  return runBaw(["wallet", "settings", "--json"]);
}

export function authSignin() {
  return runBaw(["auth", "signin", "--json"], { timeoutMs: 30_000 });
}

export function authSignout() {
  return runBaw(["auth", "signout", "--json"]);
}

export function authVerify(qrCodeId, { expireAt } = {}) {
  if (!/^[0-9a-fA-F-]{36}$/.test(String(qrCodeId || ""))) {
    return Promise.resolve({
      ok: false,
      success: false,
      data: null,
      error: {
        code: "INVALID_PARAMS",
        name: "INVALID_PARAMS",
        message: "Invalid qrCodeId",
      },
      exitCode: null,
      timedOut: false,
    });
  }

  let timeoutMs = VERIFY_MAX_MS;
  const expireMs = Number(expireAt);
  if (Number.isFinite(expireMs) && expireMs > 0) {
    const untilExpiry = expireMs - Date.now() + 20_000;
    if (untilExpiry > 5_000) {
      timeoutMs = Math.min(VERIFY_MAX_MS, untilExpiry);
    }
  }

  return runBaw(["auth", "verify", "--qrCodeId", String(qrCodeId), "--json"], {
    timeoutMs,
  });
}
