export interface IndexedChannelMessage {
  messageId: number;
  dateIso: string;
  kind: "poll" | "photo" | "text" | "document";
  text: string;
  link: string;
}

export function buildTelegramPostLink(
  channelId: string,
  username: string | undefined,
  messageId: number
): string {
  const cleanUser = (username || "").trim().replace(/^@/, "");
  if (cleanUser) {
    return `https://t.me/${cleanUser}/${messageId}`;
  }
  const cleanId = channelId.trim();
  if (cleanId.startsWith("@")) {
    return `https://t.me/${cleanId.slice(1)}/${messageId}`;
  }
  if (cleanId.startsWith("-100")) {
    return `https://t.me/c/${cleanId.slice(4)}/${messageId}`;
  }
  return `#${messageId}`;
}

export function normalizeKeywordList(
  rawKeywords: string[] | string | undefined
): string[] {
  if (!rawKeywords) return [];
  const rawArr = Array.isArray(rawKeywords)
    ? rawKeywords
    : rawKeywords.split(/[,;\n|]+/);

  const expanded: string[] = [];
  for (const item of rawArr) {
    const trimmed = String(item || "").trim();
    if (!trimmed) continue;
    // If user typed space-separated hashtags like "#BCS #GK", split them
    if (trimmed.includes("#") && /\s+/.test(trimmed)) {
      for (const token of trimmed.split(/\s+/)) {
        const clean = token.trim();
        if (clean) expanded.push(clean);
      }
    } else {
      expanded.push(trimmed);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const kw of expanded) {
    const key = kw.replace(/^#/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(kw);
    if (unique.length >= 10) break;
  }
  return unique;
}

function summarizeSnippet(raw: string): string {
  const firstLine = raw
    .replace(/\s+/g, " ")
    .trim();
  if (firstLine.length <= 72) return firstLine;
  return `${firstLine.slice(0, 69)}...`;
}

function kindBadge(kind: IndexedChannelMessage["kind"], lang: "bn" | "en"): string {
  if (kind === "poll") return lang === "bn" ? "[পোল]" : "[Poll]";
  if (kind === "photo") return lang === "bn" ? "[ছবি]" : "[Photo]";
  if (kind === "document") return lang === "bn" ? "[ফাইল]" : "[File]";
  return "";
}

export function formatChannelIndexPost(params: {
  channelTitle: string;
  channelId: string;
  channelUsername?: string;
  keywords: string[];
  items: IndexedChannelMessage[];
  lang?: "bn" | "en";
}): {
  indexText: string;
  matchedCount: number;
  groups: Array<{ keyword: string; count: number }>;
} {
  const lang = params.lang === "en" ? "en" : "bn";
  const channelHandle = params.channelUsername
    ? `@${params.channelUsername.replace(/^@/, "")}`
    : params.channelId;

  const sorted = [...params.items].sort((a, b) => b.messageId - a.messageId);
  const keywords = normalizeKeywordList(params.keywords);

  const lines: string[] = [
    lang === "bn"
      ? `📌 চ্যানেল ইনডেক্স — ${params.channelTitle} (${channelHandle})`
      : `📌 Channel Index — ${params.channelTitle} (${channelHandle})`,
  ];

  const groups: Array<{ keyword: string; count: number }> = [];
  let totalMatched = 0;

  if (keywords.length === 0) {
    const recent = sorted.slice(0, 30);
    totalMatched = recent.length;
    if (recent.length === 0) {
      return {
        indexText:
          lang === "bn"
            ? `⚠️ "${params.channelTitle}" চ্যানেলে ইনডেক্স করার মতো কোনো পোস্ট পাওয়া যায়নি।`
            : `⚠️ No posts found to index in "${params.channelTitle}".`,
        matchedCount: 0,
        groups: [],
      };
    }

    lines.push(
      lang === "bn"
        ? `📚 সাম্প্রতিক ${recent.length}টি পোস্ট:`
        : `📚 Latest ${recent.length} post(s):`
    );
    lines.push("");

    for (let i = 0; i < recent.length; i++) {
      const item = recent[i];
      const badge = kindBadge(item.kind, lang);
      const entry = `${i + 1}. ${badge ? `${badge} ` : ""}${summarizeSnippet(
        item.text
      )}\n🔗 ${item.link}`;
      if (lines.join("\n").length + entry.length + 80 > 3850) {
        lines.push(
          lang === "bn"
            ? `... এবং আরও ${recent.length - i}টি পোস্ট`
            : `... and ${recent.length - i} more post(s)`
        );
        break;
      }
      lines.push(entry);
    }

    return {
      indexText: lines.join("\n"),
      matchedCount: totalMatched,
      groups: [{ keyword: "recent", count: recent.length }],
    };
  }

  lines.push(
    `${lang === "bn" ? "🔎 কিওয়ার্ড:" : "🔎 Keywords:"} ${keywords
      .map((k) => (k.startsWith("#") ? k : `#${k.replace(/\s+/g, "_")}`))
      .join(" ")}`
  );
  lines.push("");

  const matchedMsgIds = new Set<number>();

  for (const kw of keywords) {
    const cleanKw = kw.replace(/^#/, "").toLowerCase();
    const matches = sorted.filter((item) => {
      const hay = item.text.toLowerCase();
      return hay.includes(cleanKw) || hay.includes(`#${cleanKw}`);
    });
    groups.push({ keyword: kw, count: matches.length });

    if (matches.length === 0) {
      lines.push(
        lang === "bn"
          ? `🔹 ${kw}: কোনো পোস্ট পাওয়া যায়নি`
          : `🔹 ${kw}: No matching posts found`
      );
      lines.push("");
      continue;
    }

    lines.push(
      lang === "bn"
        ? `🔹 ${kw} (${matches.length}টি):`
        : `🔹 ${kw} (${matches.length}):`
    );

    let addedInGroup = 0;
    for (let i = 0; i < matches.length && i < 20; i++) {
      const item = matches[i];
      matchedMsgIds.add(item.messageId);
      const badge = kindBadge(item.kind, lang);
      const entry = `${i + 1}. ${badge ? `${badge} ` : ""}${summarizeSnippet(
        item.text
      )} — ${item.link}`;
      if (lines.join("\n").length + entry.length + 100 > 3850) {
        lines.push(
          lang === "bn"
            ? `... আরও ${matches.length - addedInGroup}টি`
            : `... ${matches.length - addedInGroup} more`
        );
        break;
      }
      lines.push(entry);
      addedInGroup++;
    }
    lines.push("");
  }

  totalMatched = matchedMsgIds.size;

  return {
    indexText: lines.join("\n").trim(),
    matchedCount: totalMatched,
    groups,
  };
}
