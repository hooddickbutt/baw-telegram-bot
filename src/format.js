const DHAKA = "Asia/Dhaka";

export const WAITING = "একটু অপেক্ষা করুন…";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatDhaka(msOrIso) {
  let date;
  if (msOrIso == null || msOrIso === "") return "অজানা";
  if (typeof msOrIso === "number" || /^\d+$/.test(String(msOrIso))) {
    const n = Number(msOrIso);
    date = new Date(n < 1e12 ? n * 1000 : n);
  } else {
    date = new Date(msOrIso);
  }
  if (Number.isNaN(date.getTime())) return "অজানা";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted} (Asia/Dhaka)`;
}

export function money(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

const ERROR_BN = {
  NOT_LOGGED_IN: "ওয়ালেট কানেক্ট করা নেই। আগে «🔗 ওয়ালেট কানেক্ট» চাপুন।",
  UNAUTHORIZED: "সেশনটি আর বৈধ নয়। আবার কানেক্ট করুন।",
  SESSION_EXPIRED: "সেশনের মেয়াদ শেষ হয়েছে। আবার কানেক্ট করুন।",
  SESSION_NOT_FOUND: "সেশন পাওয়া যায়নি। আবার কানেক্ট করুন।",
  AUTH_REJECTED: "QR কোডের মেয়াদ শেষ বা লগইন বাতিল হয়েছে। আবার «🔗 ওয়ালেট কানেক্ট» চাপুন। নতুন কোড ছাড়া পুরোনো কোড দিয়ে আবার চেষ্টা করা যাবে না।",
  QR_CODE_EXPIRED: "QR কোডের মেয়াদ শেষ হয়েছে। আবার «🔗 ওয়ালেট কানেক্ট» চাপুন।",
  POLLING_TIMEOUT: "নিশ্চিতকরণের সময় শেষ। আবার «🔗 ওয়ালেট কানেক্ট» চাপুন।",
  TIMEOUT: "অপেক্ষার সময় শেষ। আবার চেষ্টা করুন।",
  BAW_NOT_FOUND: "সার্ভারে baw কমান্ড পাওয়া যায়নি। @binance/agentic-wallet ইনস্টল আছে কি না দেখুন।",
  LOGIN_API_ERROR: "Binance লগইন সার্ভিসে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।",
  NETWORK_ERROR: "নেটওয়ার্ক বা Binance সার্ভিসে যোগাযোগ করা যায়নি। একটু পরে আবার চেষ্টা করুন।",
};

export function friendlyError(result) {
  const err = result?.error || {};
  const name = String(err.name || err.code || "");
  if (name && ERROR_BN[name]) return ERROR_BN[name];
  if (result?.timedOut) return ERROR_BN.TIMEOUT;
  return "কাজটি সম্পন্ন করা যায়নি। একটু পরে আবার চেষ্টা করুন।";
}

export function formatStatus(status, addresses) {
  const map = {
    CONNECTED: "কানেক্টেড",
    UNCONNECTED: "কানেক্ট করা নেই",
    CREATING: "ওয়ালেট তৈরি হচ্ছে",
  };
  const label = map[status] || status || "অজানা";
  let text = `<b>📊 ওয়ালেট স্ট্যাটাস</b>\n\nঅবস্থা: <b>${escapeHtml(label)}</b>`;
  if (status === "CONNECTED" && Array.isArray(addresses) && addresses.length) {
    text += "\n\nঠিকানা:";
    for (const item of addresses) {
      const chain = item.chainName || item.binanceChainId || "Chain";
      const addr = item.address || "—";
      text += `\n• ${escapeHtml(chain)}: <code>${escapeHtml(addr)}</code>`;
    }
  } else if (status === "UNCONNECTED") {
    text += "\n\nকানেক্ট করতে «🔗 ওয়ালেট কানেক্ট» চাপুন।";
  }
  return text;
}

export function formatBalances(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "💰 <b>ব্যালেন্স</b>\n\nদেখানোর মতো কোনো ব্যালেন্স নেই। শূন্য ব্যালেন্স এবং ০.০১ ডলারের নিচের টোকেন সাধারণত দেখানো হয় না।";
  }
  let text = "💰 <b>ব্যালেন্স</b>\n";
  let total = 0;
  let hasTotal = false;
  for (const item of items) {
    const symbol = item.symbol || "TOKEN";
    const chain = item.binanceChainId || "";
    const chainLabel =
      chain === "56" ? "BSC" : chain === "1" ? "ETH" : chain === "8453" ? "Base" : chain === "CT_501" ? "Solana" : chain;
    const bal = money(item.balance);
    const value = item.value != null ? Number(item.value) : NaN;
    const valuePart = Number.isFinite(value) ? ` ≈ $${money(value)}` : "";
    if (Number.isFinite(value)) {
      total += value;
      hasTotal = true;
    }
    text += `\n• ${escapeHtml(symbol)}${chainLabel ? ` (${escapeHtml(chainLabel)})` : ""}: <code>${escapeHtml(bal)}</code>${escapeHtml(valuePart)}`;
  }
  if (hasTotal) {
    text += `\n\nমোট আনুমানিক: <b>$${escapeHtml(money(total))}</b>`;
  }
  return text;
}

export function formatDailyLimit(settings) {
  if (!settings || typeof settings !== "object") {
    return "📅 দৈনিক লিমিটের তথ্য পাওয়া যায়নি।";
  }
  const lines = [
    "📅 <b>দৈনিক লিমিট</b>",
    "",
    `সর্বোচ্চ লিমিট: <b>$${escapeHtml(money(settings.dailyLimit))}</b>`,
    `আজ খরচ হয়েছে: <b>$${escapeHtml(money(settings.quotaUsed))}</b>`,
    `আজ বাকি আছে: <b>$${escapeHtml(money(settings.quotaLeft))}</b>`,
  ];
  if (settings.quotaDate) {
    lines.push(`তারিখ: ${escapeHtml(settings.quotaDate)}`);
  }
  if (settings.sessionExpireTime) {
    lines.push(`সেশন শেষ হবে: ${escapeHtml(formatDhaka(settings.sessionExpireTime))}`);
  }
  if (settings.inactiveSignOutTime) {
    lines.push(`নিষ্ক্রিয় থাকলে সাইন আউট: ${escapeHtml(formatDhaka(settings.inactiveSignOutTime))}`);
  }
  lines.push("", "লিমিট শুধু Binance অ্যাপ থেকে পরিবর্তন করা যায়। এই বট লেনদেন করে না।");
  return lines.join("\n");
}

export function formatDevMode(settings) {
  if (!settings || typeof settings !== "object") {
    return "🛠 Developer mode-এর তথ্য পাওয়া যায়নি।";
  }
  const dev = settings.devMode || {};
  const enabled = dev.enabled === true;
  const expiresAt = dev.expiresAt;
  const expired = !enabled || expiresAt == null || Number(expiresAt) * 1000 < Date.now();
  const state = enabled && !expired ? "চালু আছে" : "বন্ধ বা মেয়াদোত্তীর্ণ";
  const lines = [
    "🛠 <b>Developer mode স্ট্যাটাস</b>",
    "",
    `অবস্থা: <b>${escapeHtml(state)}</b>`,
  ];
  if (expiresAt) {
    lines.push(`মেয়াদ শেষ: ${escapeHtml(formatDhaka(Number(expiresAt) * 1000))}`);
  }
  if (dev.dailyLimit != null) {
    lines.push(`ডেভ মোড দৈনিক লিমিট: $${escapeHtml(money(dev.dailyLimit))}`);
  }
  if (settings.developerModeQuotaUsed != null) {
    lines.push(`আজ ব্যবহার হয়েছে: $${escapeHtml(money(settings.developerModeQuotaUsed))}`);
  }
  if (settings.developerModeQuotaDate) {
    lines.push(`তারিখ: ${escapeHtml(settings.developerModeQuotaDate)}`);
  }
  if (dev.balanceExceeded === true) {
    lines.push("সতর্কতা: ওয়ালেট ব্যালেন্স ডেভ মোডের সীমা ছাড়িয়ে গেছে।");
  }
  lines.push(
    "",
    "Developer mode শুধু Binance অ্যাপে চালু/বন্ধ করা যায়: Agentic Wallet ম্যানেজমেন্ট পেজ → Settings। এই বট কোনো কন্ট্র্যাক্ট কল বা সাইন করে না।",
  );
  return lines.join("\n");
}

export function formatConnectCaption({ pairingCode, urlForWeb, expireAt }) {
  return [
    "🔗 <b>ওয়ালেট কানেক্ট</b>",
    "",
    "Binance অ্যাপ দিয়ে এই QR কোড স্ক্যান করুন, অথবা নিচের লিংকে চাপুন। মোবাইলে লিংক খুললে সরাসরি অ্যাপে যেতে পারে।",
    "",
    `পেয়ারিং কোড: <code>${escapeHtml(pairingCode)}</code>`,
    "অ্যাপে যে কোড দেখাবে, সেটা এই কোডের সাথে মিলিয়ে নিন। অচেনা আইপি বা লোকেশন দেখলে কনফার্ম করবেন না।",
    "",
    `লিংক: <a href="${escapeHtml(urlForWeb)}">${escapeHtml(urlForWeb)}</a>`,
    "",
    `মেয়াদ শেষ: ${escapeHtml(formatDhaka(expireAt))}`,
    "",
    "অ্যাপে নিশ্চিত করার পর এখানে স্বয়ংক্রিয়ভাবে ফলাফল আসবে। অপেক্ষা করুন…",
  ].join("\n");
}

export const WELCOME = [
  "স্বাগতম! এটি আপনার ব্যক্তিগত Binance Agentic Wallet বট।",
  "",
  "শুধু আপনার নিজের ওয়ালেট কানেক্ট করে স্ট্যাটাস, ব্যালেন্স, দৈনিক লিমিট ও Developer mode দেখা যাবে।",
  "<b>কোনো লেনদেন, টোকেন কেনা-বেচা, অনুমোদন (approve) বা ক্লেইম এই বটে নেই।</b>",
  "",
  "নিচের বাটন থেকে শুরু করুন।",
].join("\n");

export const STRANGER_REFUSAL = "এই বটটি শুধু মালিকের ব্যক্তিগত ব্যবহারের জন্য। আপনি এটি ব্যবহার করতে পারবেন না।";
