import { Bot, InputFile, InlineKeyboard } from "grammy";
import * as baw from "./baw.js";
import { writeQrPng } from "./qr.js";
import {
  WELCOME,
  STRANGER_REFUSAL,
  WAITING,
  friendlyError,
  formatStatus,
  formatBalances,
  formatDailyLimit,
  formatDevMode,
  formatConnectCaption,
} from "./format.js";

function requireOwnerId() {
  const id = String(process.env.OWNER_TELEGRAM_ID || "").trim();
  if (!/^\d+$/.test(id)) {
    console.error(
      "OWNER_TELEGRAM_ID সেট নেই বা অবৈধ। বট চালু করতে ./start.sh <আপনার_টেলিগ্রাম_ইউজার_আইডি> ব্যবহার করুন।",
    );
    process.exit(1);
  }
  return id;
}

function requireToken() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN এনভায়রনমেন্টে সেট নেই। টোকেন ফাইলে লিখবেন না।");
    process.exit(1);
  }
  return token;
}

const OWNER_ID = requireOwnerId();
const TOKEN = requireToken();

function isOwner(ctx) {
  const fromId = ctx.from?.id;
  return fromId != null && String(fromId) === OWNER_ID;
}

function mainMenu() {
  return new InlineKeyboard()
    .text("🔗 ওয়ালেট কানেক্ট", "menu:connect")
    .row()
    .text("📊 স্ট্যাটাস", "menu:status")
    .text("💰 ব্যালেন্স", "menu:balance")
    .row()
    .text("📅 দৈনিক লিমিট", "menu:quota")
    .text("🛠 Developer mode স্ট্যাটাস", "menu:devmode")
    .row()
    .text("🔌 ডিসকানেক্ট", "menu:disconnect");
}

function disconnectConfirmKeyboard() {
  return new InlineKeyboard()
    .text("হ্যাঁ, সাইন আউট করুন", "confirm:disconnect")
    .text("না, থাক", "cancel:disconnect");
}

const menuExtra = { parse_mode: "HTML", reply_markup: mainMenu() };

let connectInProgress = false;

async function answerIfCallback(ctx) {
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery();
    } catch {
      // already answered or expired
    }
  }
}

async function beginBawAction(ctx) {
  await answerIfCallback(ctx);
  return ctx.reply(WAITING);
}

async function safeReply(ctx, text, extra = {}) {
  const payload = { parse_mode: "HTML", ...extra };
  await answerIfCallback(ctx);
  return ctx.reply(text, payload);
}

async function handleStart(ctx) {
  await safeReply(ctx, WELCOME, { reply_markup: mainMenu() });
}

async function handleStatus(ctx) {
  await beginBawAction(ctx);
  const statusRes = await baw.walletStatus();
  if (!statusRes.ok) {
    await ctx.reply(friendlyError(statusRes), menuExtra);
    return;
  }
  const status = statusRes.data?.status;
  let addresses = null;
  if (status === "CONNECTED") {
    const addrRes = await baw.walletAddress();
    if (addrRes.ok) {
      addresses = addrRes.data?.addresses || [];
    }
  }
  await ctx.reply(formatStatus(status, addresses), menuExtra);
}

async function requireConnected(ctx) {
  const statusRes = await baw.walletStatus();
  if (!statusRes.ok) {
    await ctx.reply(friendlyError(statusRes), menuExtra);
    return null;
  }
  const status = statusRes.data?.status;
  if (status !== "CONNECTED") {
    await ctx.reply(formatStatus(status, null), menuExtra);
    return null;
  }
  return status;
}

async function handleBalance(ctx) {
  await beginBawAction(ctx);
  if (!(await requireConnected(ctx))) return;
  const res = await baw.walletBalance();
  if (!res.ok) {
    await ctx.reply(friendlyError(res), menuExtra);
    return;
  }
  await ctx.reply(formatBalances(res.data), menuExtra);
}

async function handleQuota(ctx) {
  await beginBawAction(ctx);
  if (!(await requireConnected(ctx))) return;
  const res = await baw.walletSettings();
  if (!res.ok) {
    await ctx.reply(friendlyError(res), menuExtra);
    return;
  }
  await ctx.reply(formatDailyLimit(res.data), menuExtra);
}

async function handleDevMode(ctx) {
  await beginBawAction(ctx);
  if (!(await requireConnected(ctx))) return;
  const res = await baw.walletSettings();
  if (!res.ok) {
    await ctx.reply(friendlyError(res), menuExtra);
    return;
  }
  await ctx.reply(formatDevMode(res.data), menuExtra);
}

async function finishConnectInBackground(chatId, qrCodeId, expireAt) {
  try {
    const verify = await baw.authVerify(qrCodeId, { expireAt });
    const statusAfter = await baw.walletStatus();
    const connected = statusAfter.ok && statusAfter.data?.status === "CONNECTED";

    let text;
    if (connected) {
      const addrRes = await baw.walletAddress();
      const addresses = addrRes.ok ? addrRes.data?.addresses || [] : [];
      text = "কানেক্ট সফল হয়েছে।\n\n" + formatStatus("CONNECTED", addresses);
    } else if (verify.timedOut) {
      text = friendlyError({ timedOut: true, error: { name: "TIMEOUT" } });
    } else {
      text = friendlyError(verify);
    }
    await bot.api.sendMessage(chatId, text, menuExtra);
  } catch (err) {
    console.error("connect verify failed:", err?.message || "error");
    try {
      await bot.api.sendMessage(
        chatId,
        "কানেক্ট করতে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।",
        menuExtra,
      );
    } catch {
      // ignore send failure
    }
  } finally {
    connectInProgress = false;
  }
}

async function handleConnect(ctx) {
  await answerIfCallback(ctx);

  if (connectInProgress) {
    await ctx.reply(
      "একটি কানেক্ট অনুরোধ ইতিমধ্যে চলছে। QR স্ক্যান করে অ্যাপে নিশ্চিত করুন, অথবা মেয়াদ শেষ হওয়া পর্যন্ত অপেক্ষা করুন।",
      menuExtra,
    );
    return;
  }

  connectInProgress = true;
  let handedOff = false;
  let qrCleanup = null;

  try {
    await ctx.reply(WAITING);

    const statusRes = await baw.walletStatus();
    if (statusRes.ok && statusRes.data?.status === "CONNECTED") {
      const addrRes = await baw.walletAddress();
      const addresses = addrRes.ok ? addrRes.data?.addresses || [] : [];
      await ctx.reply("ওয়ালেট ইতিমধ্যে কানেক্টেড আছে।\n\n" + formatStatus("CONNECTED", addresses), menuExtra);
      return;
    }

    const signin = await baw.authSignin();
    if (!signin.ok) {
      await ctx.reply(friendlyError(signin), menuExtra);
      return;
    }
    if (signin.data?.status === "ALREADY_CONNECTED") {
      const addrRes = await baw.walletAddress();
      const addresses = addrRes.ok ? addrRes.data?.addresses || [] : [];
      await ctx.reply("ওয়ালেট ইতিমধ্যে কানেক্টেড আছে।\n\n" + formatStatus("CONNECTED", addresses), menuExtra);
      return;
    }

    const { urlForWeb, qrCodeId, expireAt, pairingCode } = signin.data || {};
    if (!urlForWeb || !qrCodeId) {
      await ctx.reply("লগইন লিংক বা QR তথ্য পাওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।", menuExtra);
      return;
    }

    const qr = await writeQrPng(urlForWeb);
    qrCleanup = qr.cleanup;
    const caption = formatConnectCaption({ pairingCode, urlForWeb, expireAt });
    await ctx.replyWithPhoto(new InputFile(qr.filePath), {
      caption,
      parse_mode: "HTML",
    });
    await qr.cleanup();
    qrCleanup = null;

    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.reply("চ্যাট আইডি পাওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।", menuExtra);
      return;
    }

    // Do not await verify in the request path — other menu buttons must stay responsive.
    handedOff = true;
    void finishConnectInBackground(chatId, qrCodeId, expireAt);
  } catch (err) {
    console.error("connect failed:", err?.message || "error");
    try {
      await ctx.reply("কানেক্ট করতে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।", menuExtra);
    } catch {
      // ignore
    }
  } finally {
    if (qrCleanup) {
      try {
        await qrCleanup();
      } catch {
        // ignore
      }
    }
    if (!handedOff) {
      connectInProgress = false;
    }
  }
}

async function handleDisconnectAsk(ctx) {
  await safeReply(
    ctx,
    "ওয়ালেট থেকে সাইন আউট করতে চান? লোকাল সেশন মুছে যাবে। পরে আবার QR দিয়ে কানেক্ট করতে পারবেন।",
    { reply_markup: disconnectConfirmKeyboard() },
  );
}

async function handleDisconnectConfirm(ctx) {
  await beginBawAction(ctx);
  const res = await baw.authSignout();
  if (!res.ok && res.error?.name !== "NOT_LOGGED_IN") {
    await ctx.reply(friendlyError(res), menuExtra);
    return;
  }
  await ctx.reply("সাইন আউট হয়েছে। ওয়ালেট আর কানেক্টেড নেই।", menuExtra);
}

async function handleDisconnectCancel(ctx) {
  await safeReply(ctx, "সাইন আউট বাতিল করা হয়েছে।", menuExtra);
}

const bot = new Bot(TOKEN);

bot.use(async (ctx, next) => {
  if (!isOwner(ctx)) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery({ text: STRANGER_REFUSAL, show_alert: true });
      } catch {
        // ignore
      }
    } else if (ctx.message) {
      try {
        await ctx.reply(STRANGER_REFUSAL);
      } catch {
        // ignore
      }
    }
    return;
  }
  await next();
});

bot.command("start", handleStart);
bot.command("help", handleStart);
bot.command("connect", handleConnect);
bot.command("status", handleStatus);
bot.command("balance", handleBalance);
bot.command("quota", handleQuota);
bot.command("devmode", handleDevMode);
bot.command("disconnect", handleDisconnectAsk);

bot.callbackQuery("menu:connect", handleConnect);
bot.callbackQuery("menu:status", handleStatus);
bot.callbackQuery("menu:balance", handleBalance);
bot.callbackQuery("menu:quota", handleQuota);
bot.callbackQuery("menu:devmode", handleDevMode);
bot.callbackQuery("menu:disconnect", handleDisconnectAsk);
bot.callbackQuery("confirm:disconnect", handleDisconnectConfirm);
bot.callbackQuery("cancel:disconnect", handleDisconnectCancel);

bot.on("message:text", handleStart);

bot.catch((err) => {
  console.error("bot error:", err?.error?.message || err?.message || "unknown");
});

const shutdown = async () => {
  try {
    await bot.stop();
  } catch {
    // ignore
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const me = await bot.api.getMe();
console.log(`বট চালু হয়েছে: @${me.username}`);
console.log("শুধু মালিকের অ্যাকাউন্ট থেকে অনুরোধ গ্রহণ করা হবে। লেনদেন ফিচার নেই।");
await bot.start({
  drop_pending_updates: true,
});
