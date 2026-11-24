import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { COPY } from "../i18n";
import { clearSessionVault, syncSessionVault } from "../lib/sessionVault";
import type {
  AgentTriggerMode,
  PublicTelegramConfig,
  TelegramAuthMode,
  TelegramDialogSummary,
  UiLang,
} from "../types";

interface ChannelSettingsProps {
  lang: UiLang;
  config: PublicTelegramConfig | null;
  onConfigUpdated: (next: PublicTelegramConfig) => void;
  onNotify: (type: "success" | "error", message: string) => void;
}

export function ChannelSettings({
  lang,
  config,
  onConfigUpdated,
  onNotify,
}: ChannelSettingsProps) {
  const t = COPY[lang];

  const [mode, setMode] = useState<TelegramAuthMode>(
    config?.authMode ?? "user"
  );

  // Direct Telegram Account MTProto states
  const [loginMethod, setLoginMethod] = useState<"qr" | "otp" | "session">("qr");
  const [apiId, setApiId] = useState(config?.apiId ? String(config.apiId) : "");
  const [apiHash, setApiHash] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(config?.userPhone ?? "");
  const [authId, setAuthId] = useState<string | null>(null);
  const [codeViaApp, setCodeViaApp] = useState<boolean>(true);
  const [canResendSms, setCanResendSms] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [isVerifyingLogin, setIsVerifyingLogin] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  // QR / 1-Tap App Login states
  const [qrAuthId, setQrAuthId] = useState<string | null>(null);
  const [qrLoginUrl, setQrLoginUrl] = useState<string | null>(null);
  const [qrImageDataUrl, setQrImageDataUrl] = useState<string | null>(null);
  const [qrRequires2FA, setQrRequires2FA] = useState(false);
  const [qrPassword, setQrPassword] = useState("");
  const [isStartingQr, setIsStartingQr] = useState(false);
  const [isCheckingQr, setIsCheckingQr] = useState(false);
  const qrPollBusyRef = useRef(false);

  // Session Import & Export states
  const [importSessionString, setImportSessionString] = useState("");
  const [isImportingSession, setIsImportingSession] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [exportedCredentials, setExportedCredentials] = useState<{
    apiId: number;
    apiHash: string;
    sessionString: string;
    channelId: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<"session" | "env" | null>(null);

  // User's Telegram channels list
  const [channels, setChannels] = useState<TelegramDialogSummary[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [manualChannelInput, setManualChannelInput] = useState(
    config?.channelId ?? ""
  );

  // Bot API fallback states
  const [botToken, setBotToken] = useState("");
  const [botChannelId, setBotChannelId] = useState(config?.channelId ?? "");
  const [isVerifyingBot, setIsVerifyingBot] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);

  // Agent persona states
  const [persona, setPersona] = useState(config?.agentPersona ?? "");
  const [defaultLang, setDefaultLang] = useState<"bn" | "en" | "auto">(
    config?.defaultLanguage ?? "auto"
  );
  const [isSavingPersona, setIsSavingPersona] = useState(false);

  // Telegram Group Agent control states
  const [controlGroupId, setControlGroupId] = useState(
    config?.controlGroupId ?? ""
  );
  const [controlGroupTitle, setControlGroupTitle] = useState(
    config?.controlGroupTitle ?? ""
  );
  const [triggerMode, setTriggerMode] = useState<AgentTriggerMode>(
    config?.agentTriggerMode ?? "all"
  );
  const [isUpdatingListener, setIsUpdatingListener] = useState(false);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [confirmDisconnectUser, setConfirmDisconnectUser] = useState(false);
  const [confirmClearToken, setConfirmClearToken] = useState(false);

  useEffect(() => {
    if (config) {
      setMode(config.authMode || "user");
      if (config.apiId) setApiId(String(config.apiId));
      setManualChannelInput(config.channelId || "");
      setBotChannelId(config.channelId || "");
      setPersona(config.agentPersona || "");
      setDefaultLang(config.defaultLanguage || "auto");
      setControlGroupId(config.controlGroupId || "");
      setControlGroupTitle(config.controlGroupTitle || "");
      setTriggerMode(config.agentTriggerMode || "all");
    }
  }, [config]);

  const safeReadJson = async (res: Response): Promise<Record<string, any>> => {
    const raw = await res.text();
    try {
      return raw ? (JSON.parse(raw) as Record<string, any>) : {};
    } catch {
      const compact = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      throw new Error(
        compact
          ? `Server error (${res.status}): ${compact.slice(0, 140)}`
          : `Server returned HTTP ${res.status}`
      );
    }
  };

  const fetchUserChannels = async () => {
    setLoadingChannels(true);
    setDirectError(null);
    try {
      const res = await fetch("/api/telegram/user/channels");
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to load channels");
      setChannels(data.channels || []);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load channels";
      setDirectError(msg);
      onNotify("error", msg);
    } finally {
      setLoadingChannels(false);
    }
  };

  useEffect(() => {
    if (config?.hasUserSession && channels.length === 0) {
      void fetchUserChannels();
    }
  }, [config?.hasUserSession]);

  useEffect(() => {
    if (!qrLoginUrl) {
      setQrImageDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrLoginUrl, {
      width: 220,
      margin: 2,
      color: { dark: "#06110D", light: "#F8FAFC" },
    })
      .then((url) => {
        if (!cancelled) setQrImageDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrImageDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrLoginUrl]);

  const handleSendCode = async (overridePhone?: string) => {
    setDirectError(null);
    const cleanApiId = apiId.trim();
    const cleanApiHash = apiHash.trim();
    const cleanPhone = (overridePhone ?? phoneNumber).trim();

    if (!cleanApiId) {
      const msg =
        lang === "bn"
          ? "my.telegram.org থেকে পাওয়া API ID দিন।"
          : "Please enter your Telegram API ID from my.telegram.org.";
      setDirectError(msg);
      onNotify("error", msg);
      return;
    }
    if (!cleanApiHash && !config?.hasApiCredentials) {
      const msg =
        lang === "bn"
          ? "my.telegram.org থেকে পাওয়া API Hash দিন।"
          : "Please enter your Telegram API Hash from my.telegram.org.";
      setDirectError(msg);
      onNotify("error", msg);
      return;
    }
    if (!cleanPhone) {
      const msg =
        lang === "bn"
          ? "দেশের কোডসহ ফোন নম্বর লিখুন (যেমন +8801XXXXXXXXX)।"
          : "Please enter your phone number with country code (e.g. +8801XXXXXXXXX).";
      setDirectError(msg);
      onNotify("error", msg);
      return;
    }

    setIsSendingCode(true);
    try {
      const res = await fetch("/api/telegram/user/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: cleanApiId,
          apiHash: cleanApiHash || undefined,
          phoneNumber: cleanPhone,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to send login code");
      setAuthId(data.authId);
      setCodeViaApp(Boolean(data.isCodeViaApp));
      setCanResendSms(Boolean(data.canResendSms));
      setRequires2FA(false);
      setOtpCode("");
      setTwoFaPassword("");
      void syncSessionVault();
      onNotify(
        "success",
        data.isCodeViaApp
          ? lang === "bn"
            ? "আপনার টেলিগ্রাম অ্যাপের Telegram (777000) চ্যাটে কোড পাঠানো হয়েছে!"
            : "Verification code sent to your Telegram app chat (777000)!"
          : lang === "bn"
            ? "আপনার ফোনে SMS/কল-এর মাধ্যমে ভেরিফিকেশন কোড পাঠানো হয়েছে।"
            : "Verification code sent via SMS/call."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      setDirectError(msg);
      onNotify("error", msg);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleResendCode = async () => {
    if (!authId) return;
    setDirectError(null);
    setIsResendingCode(true);
    try {
      const res = await fetch("/api/telegram/user/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to resend code");
      if (data.authId) setAuthId(data.authId);
      setCodeViaApp(Boolean(data.isCodeViaApp));
      setCanResendSms(Boolean(data.canResendSms));
      onNotify(
        "success",
        data.isCodeViaApp
          ? lang === "bn"
            ? "টেলিগ্রাম অ্যাপে পুনরায় কোড পাঠানো হয়েছে।"
            : "Code resent to your Telegram app."
          : lang === "bn"
            ? "SMS/কল-এর মাধ্যমে নতুন কোড পাঠানো হয়েছে।"
            : "New code sent via SMS."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setDirectError(msg);
      onNotify("error", msg);
    } finally {
      setIsResendingCode(false);
    }
  };

  const handleVerifyLogin = async () => {
    if (!authId) return;
    setDirectError(null);
    setIsVerifyingLogin(true);
    try {
      const res = await fetch("/api/telegram/user/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authId,
          code: requires2FA ? undefined : otpCode.trim(),
          password: twoFaPassword || undefined,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Sign in failed");

      if (data.requires2FA) {
        if (typeof data.authId === "string" && data.authId) {
          setAuthId(data.authId);
        }
        setRequires2FA(true);
        return;
      }

      setAuthId(null);
      setOtpCode("");
      setTwoFaPassword("");
      setRequires2FA(false);
      onConfigUpdated(data.config);
      void syncSessionVault();
      if (Array.isArray(data.channels)) {
        setChannels(data.channels);
      } else {
        void fetchUserChannels();
      }
      onNotify(
        "success",
        lang === "bn"
          ? "টেলিগ্রাম অ্যাকাউন্ট সফলভাবে সংযুক্ত হয়েছে! এবার চ্যানেল নির্বাচন করুন।"
          : "Telegram account signed in! Select your target channel below."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setDirectError(msg);
      onNotify("error", msg);
    } finally {
      setIsVerifyingLogin(false);
    }
  };

  const handleStartQrLogin = async () => {
    setDirectError(null);
    const cleanApiId = apiId.trim();
    const cleanApiHash = apiHash.trim();

    if (!cleanApiId) {
      const msg =
        lang === "bn"
          ? "my.telegram.org থেকে পাওয়া API ID দিন।"
          : "Please enter your Telegram API ID from my.telegram.org.";
      setDirectError(msg);
      onNotify("error", msg);
      return;
    }
    if (!cleanApiHash && !config?.hasApiCredentials) {
      const msg =
        lang === "bn"
          ? "my.telegram.org থেকে পাওয়া API Hash দিন।"
          : "Please enter your Telegram API Hash from my.telegram.org.";
      setDirectError(msg);
      onNotify("error", msg);
      return;
    }

    setIsStartingQr(true);
    try {
      const res = await fetch("/api/telegram/user/qr-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: cleanApiId,
          apiHash: cleanApiHash || undefined,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to generate QR login");
      setQrAuthId(data.qrAuthId);
      setQrLoginUrl(data.loginUrl);
      setQrRequires2FA(false);
      setQrPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create QR code";
      setDirectError(msg);
      onNotify("error", msg);
    } finally {
      setIsStartingQr(false);
    }
  };

  const handleCheckQrLogin = useCallback(
    async (explicitPassword?: string) => {
      if (!qrAuthId || qrPollBusyRef.current) return;
      qrPollBusyRef.current = true;
      setIsCheckingQr(true);
      try {
        const res = await fetch("/api/telegram/user/qr-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrAuthId,
            password: explicitPassword?.trim() || undefined,
          }),
        });
        const data = await safeReadJson(res);
        if (!res.ok) throw new Error(data.error || "QR verification failed");

        if (data.status === "pending") {
          if (data.qrAuthId) setQrAuthId(data.qrAuthId);
          if (data.loginUrl) setQrLoginUrl(data.loginUrl);
          return;
        }

        if (data.status === "requires_2fa") {
          if (data.qrAuthId) setQrAuthId(data.qrAuthId);
          setQrRequires2FA(true);
          setDirectError(null);
          return;
        }

        if (data.status === "signed_in") {
          setQrAuthId(null);
          setQrLoginUrl(null);
          setQrImageDataUrl(null);
          setQrRequires2FA(false);
          setQrPassword("");
          setDirectError(null);
          onConfigUpdated(data.config);
          void syncSessionVault();
          if (Array.isArray(data.channels)) {
            setChannels(data.channels);
          } else {
            void fetchUserChannels();
          }
          onNotify(
            "success",
            lang === "bn"
              ? "টেলিগ্রাম অ্যাপ অনুমোদনের মাধ্যমে সফলভাবে লগইন হয়েছে!"
              : "Telegram account signed in via app approval!"
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "QR check failed";
        setDirectError(msg);
        if (explicitPassword) {
          onNotify("error", msg);
        } else if (msg.includes("মেয়াদ শেষ") || msg.includes("expired")) {
          setQrAuthId(null);
          setQrLoginUrl(null);
        }
      } finally {
        qrPollBusyRef.current = false;
        setIsCheckingQr(false);
      }
    },
    [qrAuthId, lang, onConfigUpdated, onNotify]
  );

  useEffect(() => {
    if (
      mode !== "user" ||
      config?.hasUserSession ||
      loginMethod !== "qr" ||
      !qrAuthId ||
      qrRequires2FA
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void handleCheckQrLogin();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [mode, config?.hasUserSession, loginMethod, qrAuthId, qrRequires2FA, handleCheckQrLogin]);

  const handleImportSession = async () => {
    setDirectError(null);
    const cleanApiId = apiId.trim();
    const cleanApiHash = apiHash.trim();
    const cleanSession = importSessionString.trim();

    if (!cleanApiId) {
      const msg =
        lang === "bn"
          ? "my.telegram.org থেকে পাওয়া API ID দিন।"
          : "Please enter your Telegram API ID.";
      setDirectError(msg);
      return;
    }
    if (!cleanApiHash && !config?.hasApiCredentials) {
      const msg =
        lang === "bn"
          ? "my.telegram.org থেকে পাওয়া API Hash দিন।"
          : "Please enter your Telegram API Hash.";
      setDirectError(msg);
      return;
    }
    if (!cleanSession || cleanSession.length < 40) {
      const msg =
        lang === "bn"
          ? "সঠিক GramJS Session String পেস্ট করুন।"
          : "Please paste a valid GramJS Session String.";
      setDirectError(msg);
      return;
    }

    setIsImportingSession(true);
    try {
      const res = await fetch("/api/telegram/user/import-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: cleanApiId,
          apiHash: cleanApiHash || undefined,
          sessionString: cleanSession,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to import session");

      setImportSessionString("");
      onConfigUpdated(data.config);
      void syncSessionVault();
      if (Array.isArray(data.channels)) {
        setChannels(data.channels);
      } else {
        void fetchUserChannels();
      }
      onNotify(
        "success",
        lang === "bn"
          ? "Session String থেকে টেলিগ্রাম অ্যাকাউন্ট কানেক্ট হয়েছে!"
          : "Telegram account connected from Session String!"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Session import failed";
      setDirectError(msg);
      onNotify("error", msg);
    } finally {
      setIsImportingSession(false);
    }
  };

  const handleToggleExportPanel = async () => {
    if (showExportPanel) {
      setShowExportPanel(false);
      return;
    }
    setShowExportPanel(true);
    setIsLoadingExport(true);
    try {
      const res = await fetch("/api/telegram/user/export-session");
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to export session");
      setExportedCredentials({
        apiId: Number(data.apiId),
        apiHash: String(data.apiHash || ""),
        sessionString: String(data.sessionString || ""),
        channelId: String(data.channelId || ""),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not export session";
      onNotify("error", msg);
      setShowExportPanel(false);
    } finally {
      setIsLoadingExport(false);
    }
  };

  const handleCopyExport = async (kind: "session" | "env") => {
    if (!exportedCredentials) return;
    const text =
      kind === "session"
        ? exportedCredentials.sessionString
        : [
            `TELEGRAM_API_ID=${exportedCredentials.apiId}`,
            `TELEGRAM_API_HASH=${exportedCredentials.apiHash}`,
            `TELEGRAM_SESSION_STRING=${exportedCredentials.sessionString}`,
            exportedCredentials.channelId
              ? `TELEGRAM_CHANNEL_ID=${exportedCredentials.channelId}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(kind);
      window.setTimeout(() => setCopiedField(null), 2400);
    } catch {
      onNotify("error", "Clipboard permission blocked.");
    }
  };

  const handleSelectChannel = async (
    channelId: string,
    channelTitle: string,
    channelType: string
  ) => {
    setDirectError(null);
    try {
      const res = await fetch("/api/telegram/user/select-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, channelTitle, channelType }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to set channel");
      onConfigUpdated(data.config);
      void syncSessionVault();
      onNotify(
        "success",
        lang === "bn"
          ? `টার্গেট চ্যানেল "${channelTitle}" নির্বাচিত হয়েছে।`
          : `Target channel set to "${channelTitle}".`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to select channel";
      setDirectError(msg);
      onNotify("error", msg);
    }
  };

  const handleDisconnectUser = async () => {
    if (!confirmDisconnectUser) {
      setConfirmDisconnectUser(true);
      window.setTimeout(() => setConfirmDisconnectUser(false), 6000);
      return;
    }
    setConfirmDisconnectUser(false);
    try {
      const res = await fetch("/api/telegram/user/session", {
        method: "DELETE",
      });
      const data = await safeReadJson(res);
      await clearSessionVault("user");
      onConfigUpdated(data as PublicTelegramConfig);
      setChannels([]);
      setAuthId(null);
      setExportedCredentials(null);
      setShowExportPanel(false);
      onNotify(
        "success",
        lang === "bn"
          ? "টেলিগ্রাম অ্যাকাউন্ট ম্যানুয়ালি ডিসকানেক্ট করা হয়েছে।"
          : "Telegram account manually disconnected."
      );
    } catch {
      onNotify("error", "Failed to disconnect account.");
    }
  };

  const handleVerifyAndSaveBot = async () => {
    setBotError(null);
    setIsVerifyingBot(true);
    try {
      const res = await fetch("/api/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: botToken.trim() || undefined,
          channelId: botChannelId.trim(),
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok || !data.verified) {
        throw new Error(data.error || "Telegram verification failed");
      }
      setBotToken("");
      onConfigUpdated(data.config as PublicTelegramConfig);
      void syncSessionVault();
      onNotify(
        "success",
        lang === "bn"
          ? `সংযোগ সফল! বট @${data.config.botUsername} এবং চ্যানেল "${data.config.channelTitle}" যুক্ত হয়েছে।`
          : `Connected @${data.config.botUsername} to "${data.config.channelTitle}".`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not verify connection";
      setBotError(msg);
      onNotify("error", msg);
    } finally {
      setIsVerifyingBot(false);
    }
  };

  const handleClearBotToken = async () => {
    if (!confirmClearToken) {
      setConfirmClearToken(true);
      window.setTimeout(() => setConfirmClearToken(false), 6000);
      return;
    }
    setConfirmClearToken(false);
    try {
      const res = await fetch("/api/telegram/token", { method: "DELETE" });
      const data = await safeReadJson(res);
      await clearSessionVault("bot");
      onConfigUpdated(data as PublicTelegramConfig);
      onNotify(
        "success",
        lang === "bn"
          ? "বট টোকেন ম্যানুয়ালি মুছে ফেলা হয়েছে।"
          : "Bot token manually cleared."
      );
    } catch {
      onNotify("error", "Failed to clear token.");
    }
  };

  const handleToggleGroupListener = async (
    nextEnabled: boolean,
    overrideGroupId?: string,
    overrideGroupTitle?: string,
    overrideTrigger?: AgentTriggerMode
  ) => {
    setListenerError(null);
    setIsUpdatingListener(true);
    try {
      const res = await fetch("/api/telegram/agent/listener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlGroupId: overrideGroupId ?? controlGroupId,
          controlGroupTitle: overrideGroupTitle ?? controlGroupTitle,
          agentListenerEnabled: nextEnabled,
          agentTriggerMode: overrideTrigger ?? triggerMode,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to update group agent");
      onConfigUpdated(data.config as PublicTelegramConfig);
      void syncSessionVault();
      onNotify(
        "success",
        nextEnabled
          ? lang === "bn"
            ? "টেলিগ্রাম গ্রুপ এআই এজেন্ট সক্রিয় হয়েছে! এখন টেলিগ্রাম গ্রুপে মেসেজ পাঠান।"
            : "Telegram Group AI Agent is now active!"
          : lang === "bn"
            ? "টেলিগ্রাম গ্রুপ এআই এজেন্ট বন্ধ করা হয়েছে।"
            : "Telegram Group AI Agent paused."
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not update group agent";
      setListenerError(msg);
      onNotify("error", msg);
    } finally {
      setIsUpdatingListener(false);
    }
  };

  const handleSavePersona = async () => {
    setIsSavingPersona(true);
    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentPersona: persona.trim(),
          defaultLanguage: defaultLang,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Save failed");
      onConfigUpdated(data as PublicTelegramConfig);
      void syncSessionVault();
      onNotify(
        "success",
        lang === "bn"
          ? "এজেন্ট পার্সোনা সংরক্ষিত হয়েছে।"
          : "Agent preferences saved."
      );
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Failed to save preferences"
      );
    } finally {
      setIsSavingPersona(false);
    }
  };

  const isConnectionActive =
    config?.authMode === "user"
      ? Boolean(config?.hasUserSession && config?.channelId)
      : Boolean(config?.hasBotToken && config?.channelId && config?.verifiedAt);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">
          {t.channelTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-400">{t.channelSubtitle}</p>
      </div>

      {/* Active Connection Summary */}
      <div className="hacker-panel rounded-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isConnectionActive ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-slate-500 shrink-0" />
          )}
          <div>
            <div className="text-sm font-semibold text-slate-100">
              {isConnectionActive ? t.verifiedConnection : t.notConnected}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {config?.authMode === "user" && config?.hasUserSession
                ? `${config.userDisplayName || config.userPhone}${
                    config.userUsername ? ` (@${config.userUsername})` : ""
                  } · ${
                    config.channelTitle || config.channelId || "Select a target"
                  }${config.channelType === "bot" ? " [bot]" : ""}`
                : config?.verifiedAt
                  ? `@${config.botUsername} · ${config.channelTitle} (${config.channelId})`
                  : "No active Telegram target selected"}
            </div>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[#06090D] border border-slate-800 rounded-sm">
          <button
            type="button"
            onClick={() => setMode("user")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
              mode === "user"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.modeDirectTab}
          </button>
          <button
            type="button"
            onClick={() => setMode("bot")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
              mode === "bot"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.modeBotTab}
          </button>
        </div>
      </div>

      {mode === "user" ? (
        <>
          {config?.hasUserSession ? (
            /* Logged-in User Account + Channel / Bot Picker */
            <div className="hacker-panel rounded-sm p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {config.userDisplayName}{" "}
                    {config.userUsername && (
                      <span className="font-mono font-normal text-cyan-400">
                        @{config.userUsername}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    {config.userPhone} · ID {config.userId}
                  </div>
                  <div className="text-[11px] text-emerald-400/90 mt-1">
                    {lang === "bn"
                      ? "সেশন স্থায়ীভাবে সংরক্ষিত — ম্যানুয়ালি ডিসকানেক্ট না করা পর্যন্ত লগইন থাকবে"
                      : "Persistent session locked — stays signed in until manually disconnected"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleExportPanel}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                      showExportPanel
                        ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/40"
                        : "text-cyan-300 bg-[#0A141E] border-cyan-500/35 hover:border-cyan-400/60"
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {lang === "bn"
                      ? "Session / Vercel Env কপি"
                      : "Copy Session / Env"}
                  </button>
                  <button
                    type="button"
                    onClick={fetchUserChannels}
                    disabled={loadingChannels}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        loadingChannels ? "animate-spin" : ""
                      }`}
                    />
                    {t.refreshChannelsBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectUser}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                      confirmDisconnectUser
                        ? "text-white bg-rose-600 border-rose-400 hover:bg-rose-500"
                        : "text-rose-300 bg-rose-950/35 border-rose-500/35 hover:bg-rose-950/60"
                    }`}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {confirmDisconnectUser
                      ? lang === "bn"
                        ? "নিশ্চিত ডিসকানেক্ট?"
                        : "Confirm Disconnect?"
                      : t.disconnectAccountBtn}
                  </button>
                </div>
              </div>

              {showExportPanel && (
                <div className="p-4 rounded-sm border border-cyan-500/30 bg-[#050C12] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-cyan-200">
                      {lang === "bn"
                        ? "স্থায়ী কানেকশনের জন্য Session বা Vercel Env ভেরিয়েবল কপি করুন"
                        : "Copy Session String or Vercel Environment Variables"}
                    </div>
                    {exportedCredentials && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyExport("session")}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-200 bg-[#0D1720] border border-slate-700 rounded-sm hover:border-emerald-500/40 cursor-pointer"
                        >
                          {copiedField === "session" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-cyan-400" />
                          )}
                          {copiedField === "session"
                            ? lang === "bn"
                              ? "কপি হয়েছে!"
                              : "Copied!"
                            : lang === "bn"
                              ? "Session String কপি"
                              : "Copy Session"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyExport("env")}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 cursor-pointer"
                        >
                          {copiedField === "env" ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedField === "env"
                            ? lang === "bn"
                              ? "Env কপি হয়েছে!"
                              : "Copied Env!"
                            : lang === "bn"
                              ? "Vercel Env কপি করুন"
                              : "Copy Vercel Env"}
                        </button>
                      </div>
                    )}
                  </div>

                  {isLoadingExport ? (
                    <div className="py-2 flex items-center gap-2 text-xs font-mono text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      {lang === "bn" ? "লোড হচ্ছে..." : "Loading credentials..."}
                    </div>
                  ) : exportedCredentials ? (
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {lang === "bn"
                        ? "উপরের 'Vercel Env কপি করুন' চেপে Vercel Project Settings > Environment Variables-এ পেস্ট করলে ডিপ্লয়মেন্ট রিস্টার্ট হলেও সব সময় কানেক্টেড থাকবে। অথবা যেকোনো ব্রাউজারে 'Session Import' ট্যাবে শুধু Session String দিয়ে লগইন করতে পারবেন। (এটি গোপন রাখুন)"
                        : "Paste the copied block into Vercel Environment Variables so cold starts always stay connected, or paste the Session String into the Session Import tab on any browser. Keep these credentials private."}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-300">
                    {t.selectChannelLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectChannel("@QuizBot", "@QuizBot", "bot")
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-sm border transition-colors cursor-pointer ${
                      config.channelId?.toLowerCase() === "@quizbot"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-cyan-500/40 bg-cyan-950/35 text-cyan-300 hover:bg-cyan-950/60"
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {t.quickQuizBotBtn}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400">
                  {t.botTargetHint}
                </p>

                {loadingChannels ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    Scanning Telegram channels, groups & bots...
                  </div>
                ) : channels.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {channels.map((ch) => {
                      const selected =
                        config.channelId === ch.id ||
                        (ch.username &&
                          config.channelId?.toLowerCase() ===
                            `@${ch.username}`.toLowerCase());
                      const roleLabel =
                        ch.type === "bot"
                          ? lang === "bn"
                            ? "বট টার্গেট"
                            : "Bot"
                          : ch.isAdmin === true
                            ? lang === "bn"
                              ? "এডমিন"
                              : "Admin"
                            : ch.isAdmin === false
                              ? lang === "bn"
                                ? "সদস্য (এডমিন নন)"
                                : "Not Admin"
                              : "";
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() =>
                            handleSelectChannel(
                              ch.username ? `@${ch.username}` : ch.id,
                              ch.title,
                              ch.type
                            )
                          }
                          className={`text-left px-3.5 py-2.5 rounded-sm border transition-colors cursor-pointer ${
                            selected
                              ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                              : ch.type === "bot"
                                ? "border-cyan-500/30 bg-[#080F17] text-slate-100 hover:border-cyan-400/60"
                                : ch.isAdmin === false
                                  ? "border-slate-800 bg-[#070B10] text-slate-500 hover:bg-slate-900/60"
                                  : "border-slate-800 bg-[#070B10] hover:border-emerald-500/35 text-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">
                              {ch.title}
                            </span>
                            {selected && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate font-mono flex items-center justify-between gap-2">
                            <span className="truncate">
                              {ch.type} · {ch.username ? `@${ch.username}` : ch.id}
                            </span>
                            {roleLabel && (
                              <span
                                className={`font-sans text-xs shrink-0 ${
                                  ch.type === "bot"
                                    ? "text-cyan-400 font-medium"
                                    : ch.isAdmin
                                      ? "text-emerald-400 font-medium"
                                      : "text-slate-500"
                                }`}
                              >
                                {roleLabel}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* Manual username/ID/bot option */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={manualChannelInput}
                    onChange={(e) => setManualChannelInput(e.target.value)}
                    placeholder={t.manualChannelPlaceholder}
                    className="flex-1 px-3 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectChannel(
                        manualChannelInput,
                        manualChannelInput,
                        manualChannelInput.trim().toLowerCase().endsWith("bot")
                          ? "bot"
                          : "channel"
                      )
                    }
                    disabled={!manualChannelInput.trim()}
                    className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {t.useThisChannelBtn}
                  </button>
                </div>
              </div>

              {directError && (
                <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                  {directError}
                </div>
              )}
            </div>
          ) : (
            /* Direct Telegram Login: QR / 1-Tap App, Phone+OTP, or Session Import */
            <div className="hacker-panel rounded-sm p-5 space-y-5">
              {/* Login Method Sub-Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#06090D] border border-slate-800 rounded-sm">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("qr");
                    setDirectError(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                    loginMethod === "qr"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {lang === "bn"
                    ? "QR / ১-ট্যাপ অ্যাপ (কোড ছাড়াই)"
                    : "QR / 1-Tap App (No Code)"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("otp");
                    setDirectError(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                    loginMethod === "otp"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  {lang === "bn" ? "ফোন ও কোড (OTP)" : "Phone & Code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("session");
                    setDirectError(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                    loginMethod === "session"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {lang === "bn" ? "Session ইমপোর্ট" : "Import Session"}
                </button>
              </div>

              {/* Shared API ID + API Hash Fields (hidden only mid-OTP verification) */}
              {!(loginMethod === "otp" && authId) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        {t.apiIdLabel}
                      </label>
                      <a
                        href="https://my.telegram.org/apps"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono font-medium text-cyan-400 hover:underline"
                      >
                        my.telegram.org
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                      placeholder="e.g. 24198765"
                      className="w-full px-3.5 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.apiHashLabel}
                    </label>
                    <input
                      type="password"
                      value={apiHash}
                      onChange={(e) => setApiHash(e.target.value)}
                      placeholder={
                        config?.hasApiCredentials
                          ? "Saved (leave blank to reuse)"
                          : "32-character API hash"
                      }
                      className="w-full px-3.5 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                    />
                  </div>
                </div>
              )}

              {loginMethod === "qr" ? (
                <div className="space-y-4">
                  {!qrAuthId ? (
                    <>
                      <div className="px-3.5 py-2.5 text-xs text-cyan-200 bg-cyan-950/30 border border-cyan-500/30 rounded-sm leading-relaxed">
                        {lang === "bn"
                          ? "কোনো SMS বা ৭৭৭০০০ কোড ছাড়াই লগইন করুন! মোবাইল থেকে এক ক্লিকে Telegram অ্যাপে অনুমোদন করুন, অথবা অন্য ফোন দিয়ে QR স্ক্যান করুন।"
                          : "Sign in without waiting for SMS or 777000 codes! Tap once on mobile to approve inside your Telegram app, or scan the QR from another device."}
                      </div>

                      {directError && (
                        <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                          {directError}
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleStartQrLogin}
                          disabled={isStartingQr}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                        >
                          {isStartingQr ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <QrCode className="w-4 h-4" />
                          )}
                          {isStartingQr
                            ? lang === "bn"
                              ? "QR তৈরি হচ্ছে..."
                              : "Generating QR..."
                            : lang === "bn"
                              ? "QR কোড ও অ্যাপ লিংক তৈরি করুন"
                              : "Generate QR & 1-Tap App Link"}
                        </button>
                      </div>
                    </>
                  ) : qrRequires2FA ? (
                    <div className="space-y-4">
                      <div className="px-3.5 py-2.5 text-xs text-emerald-200 bg-emerald-950/35 border border-emerald-500/35 rounded-sm">
                        {lang === "bn"
                          ? "অ্যাপ থেকে অনুমোদন সম্পন্ন হয়েছে! আপনার অ্যাকাউন্টে 2FA পাসওয়ার্ড চালু থাকায় নিচে পাসওয়ার্ড দিন।"
                          : "App approval succeeded! Enter your Telegram 2FA cloud password to finish signing in."}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          {t.twoFaLabel}
                        </label>
                        <input
                          type="password"
                          value={qrPassword}
                          onChange={(e) => setQrPassword(e.target.value)}
                          placeholder={t.twoFaPlaceholder}
                          className="w-full px-3.5 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
                        />
                      </div>

                      {directError && (
                        <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                          {directError}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setQrAuthId(null);
                            setQrLoginUrl(null);
                            setQrRequires2FA(false);
                            setDirectError(null);
                          }}
                          className="text-xs font-medium text-slate-400 hover:text-slate-100 cursor-pointer"
                        >
                          {lang === "bn" ? "বাতিল ও নতুন QR নিন" : "Start New QR"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCheckQrLogin(qrPassword)}
                          disabled={isCheckingQr || !qrPassword.trim()}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 disabled:opacity-60 cursor-pointer"
                        >
                          {isCheckingQr && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          {t.verifyLoginBtn}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-sm bg-[#050C12] border border-emerald-500/25">
                        {qrImageDataUrl ? (
                          <div className="p-2 bg-white rounded-sm shrink-0">
                            <img
                              src={qrImageDataUrl}
                              alt="Telegram QR Login"
                              className="w-44 h-44 block"
                            />
                          </div>
                        ) : (
                          <div className="w-48 h-48 flex items-center justify-center bg-slate-900 rounded-sm shrink-0">
                            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                          </div>
                        )}

                        <div className="space-y-3 flex-1 min-w-0">
                          <div className="text-xs text-slate-200 leading-relaxed">
                            {lang === "bn" ? (
                              <>
                                <strong className="text-emerald-300">মোবাইল থেকে:</strong> নিচের বাটনে ট্যাপ করে Telegram অ্যাপে অনুমোদন দিন। অথবা অন্য ডিভাইস থেকে{" "}
                                <span className="font-mono text-cyan-300">
                                  Telegram &gt; Settings &gt; Devices &gt; Link Desktop Device
                                </span>{" "}
                                দিয়ে QR স্ক্যান করুন।
                              </>
                            ) : (
                              <>
                                <strong className="text-emerald-300">On Mobile:</strong> Tap the button below to approve inside Telegram. Or scan with{" "}
                                <span className="font-mono text-cyan-300">
                                  Telegram &gt; Settings &gt; Devices &gt; Link Desktop Device
                                </span>
                                .
                              </>
                            )}
                          </div>

                          {qrLoginUrl &&
                            qrLoginUrl.startsWith("tg://login?token=") && (
                              <a
                                href={qrLoginUrl}
                                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                                {lang === "bn"
                                  ? "Telegram অ্যাপে খুলে অনুমোদন করুন (১-ট্যাপ)"
                                  : "Open in Telegram App to Approve (1-Tap)"}
                              </a>
                            )}

                          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>
                              {lang === "bn"
                                ? "অ্যাপ থেকে অনুমোদনের জন্য স্বয়ংক্রিয়ভাবে অপেক্ষা করা হচ্ছে..."
                                : "Waiting automatically for app approval..."}
                            </span>
                          </div>
                        </div>
                      </div>

                      {directError && (
                        <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                          {directError}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={handleStartQrLogin}
                          disabled={isStartingQr}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 cursor-pointer"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              isStartingQr ? "animate-spin" : ""
                            }`}
                          />
                          {lang === "bn" ? "নতুন QR তৈরি করুন" : "Refresh QR"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCheckQrLogin()}
                          disabled={isCheckingQr}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 cursor-pointer"
                        >
                          {isCheckingQr && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                          {lang === "bn"
                            ? "আমি অনুমোদন করেছি — যাচাই করুন"
                            : "I Approved — Check Now"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : loginMethod === "otp" ? (
                !authId ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        {t.phoneLabel}
                      </label>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder={t.phonePlaceholder}
                        className="w-full px-3.5 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      />
                    </div>

                    {directError && (
                      <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                        {directError}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleSendCode()}
                        disabled={isSendingCode}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                      >
                        {isSendingCode && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {isSendingCode ? t.sendingCodeBtn : t.sendCodeBtn}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {!requires2FA ? (
                      <div className="space-y-3">
                        <div className="px-3.5 py-2.5 text-xs text-emerald-200 bg-emerald-950/35 border border-emerald-500/35 rounded-sm leading-relaxed">
                          {codeViaApp
                            ? lang === "bn"
                              ? "কোডটি আপনার টেলিগ্রাম অ্যাপের ভেতরে অফিসিয়াল 'Telegram' চ্যাটে (777000) পাঠানো হয়েছে (মোবাইল SMS-এ নয়)। আপনার ফোনের Telegram অ্যাপটি খুলে 777000 চ্যাট চেক করুন।"
                              : "Code sent inside your Telegram app in the official 'Telegram' service chat (777000), not via SMS."
                            : lang === "bn"
                              ? "কোডটি আপনার ফোন নম্বরে SMS/কল-এর মাধ্যমে পাঠানো হয়েছে।"
                              : "Code sent to your phone number via SMS/call."}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            {t.otpLabel}
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            placeholder={t.otpPlaceholder}
                            className="w-full px-3.5 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          {t.twoFaLabel}
                        </label>
                        <input
                          type="password"
                          value={twoFaPassword}
                          onChange={(e) => setTwoFaPassword(e.target.value)}
                          placeholder={t.twoFaPlaceholder}
                          className="w-full px-3.5 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                        />
                      </div>
                    )}

                    {directError && (
                      <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                        {directError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex flex-wrap items-center gap-4">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthId(null);
                            setRequires2FA(false);
                            setDirectError(null);
                          }}
                          className="text-xs font-medium text-slate-400 hover:text-slate-100 cursor-pointer"
                        >
                          {t.restartLoginBtn}
                        </button>

                        {!requires2FA && canResendSms && (
                          <button
                            type="button"
                            onClick={handleResendCode}
                            disabled={isResendingCode}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 disabled:opacity-60 cursor-pointer"
                          >
                            {isResendingCode && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            {lang === "bn"
                              ? "আবার কোড পাঠান (SMS)"
                              : "Resend Code (SMS)"}
                          </button>
                        )}

                        {!requires2FA && !canResendSms && (
                          <button
                            type="button"
                            onClick={() => handleSendCode()}
                            disabled={isSendingCode}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 disabled:opacity-60 cursor-pointer"
                          >
                            {isSendingCode && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            {lang === "bn"
                              ? "অ্যাপে নতুন কোড রিফ্রেশ করুন"
                              : "Request Fresh App Code"}
                          </button>
                        )}

                        {!requires2FA && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthId(null);
                              setDirectError(null);
                              setLoginMethod("qr");
                            }}
                            className="text-xs font-medium text-emerald-300 hover:underline cursor-pointer"
                          >
                            {lang === "bn"
                              ? "কোড ছাড়াই QR / ১-ট্যাপ লগইন"
                              : "Try QR / 1-Tap Instead"}
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleVerifyLogin}
                        disabled={isVerifyingLogin}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                      >
                        {isVerifyingLogin && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {isVerifyingLogin ? t.verifyingLoginBtn : t.verifyLoginBtn}
                      </button>
                    </div>
                  </>
                )
              ) : (
                /* Session String Import Tab */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      {lang === "bn"
                        ? "GramJS Session String পেস্ট করুন"
                        : "Paste GramJS Session String"}
                    </label>
                    <textarea
                      rows={3}
                      value={importSessionString}
                      onChange={(e) => setImportSessionString(e.target.value)}
                      placeholder="1BVtsOMwBu..."
                      className="w-full px-3.5 py-2 text-xs font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
                    />
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {lang === "bn"
                        ? "আগে কানেক্ট করা ডিভাইস থেকে 'Session / Vercel Env কপি' করে এখানে পেস্ট করলে কোনো OTP ছাড়াই সাথে সাথে কানেক্ট হবে।"
                        : "Paste a Session String exported from another connected device to sign in instantly without OTP."}
                    </p>
                  </div>

                  {directError && (
                    <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                      {directError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleImportSession}
                      disabled={isImportingSession}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {isImportingSession && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {isImportingSession
                        ? lang === "bn"
                          ? "যাচাই ও কানেক্ট হচ্ছে..."
                          : "Importing & Connecting..."
                        : lang === "bn"
                          ? "Session ইমপোর্ট ও কানেক্ট করুন"
                          : "Import & Connect Session"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Direct Account Guide */}
          <div className="hacker-panel rounded-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">
              {t.directGuideTitle}
            </h3>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              {t.directGuideSteps.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        /* Optional Bot Token Mode */
        <>
          <div className="hacker-panel rounded-sm p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400 font-mono">
                {config?.hasBotToken
                  ? `Saved token: ${config.maskedBotToken}`
                  : "No Bot Token configured"}
              </div>
              {config?.hasBotToken && (
                <button
                  type="button"
                  onClick={handleClearBotToken}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                    confirmClearToken
                      ? "text-white bg-rose-600 border-rose-400 hover:bg-rose-500"
                      : "text-rose-300 bg-rose-950/35 border-rose-500/35 hover:bg-rose-950/60"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmClearToken
                    ? lang === "bn"
                      ? "নিশ্চিত মুছবেন?"
                      : "Confirm Clear?"
                    : t.clearTokenBtn}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t.botTokenLabel}
                </label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={
                    config?.hasBotToken
                      ? `${config.maskedBotToken} (leave blank to keep)`
                      : t.botTokenPlaceholder
                  }
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t.channelIdLabel}
                </label>
                <input
                  type="text"
                  value={botChannelId}
                  onChange={(e) => setBotChannelId(e.target.value)}
                  placeholder={t.channelIdPlaceholder}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                />
              </div>
            </div>

            <p className="text-[11px] text-amber-300/90">
              {lang === "bn"
                ? "দ্রষ্টব্য: টেলিগ্রাম নিয়ম অনুযায়ী বট-টোকেন মোডে অন্য বটে (@QuizBot) মেসেজ যায় না। @QuizBot বা অন্য বটে পাঠাতে 'সরাসরি টেলিগ্রাম অ্যাকাউন্ট' মোড ব্যবহার করুন।"
                : "Note: Telegram restricts bots from messaging other bots (@QuizBot). Switch to Direct Telegram Account mode to target bots."}
            </p>

            {botError && (
              <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                {botError}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleVerifyAndSaveBot}
                disabled={isVerifyingBot}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
              >
                {isVerifyingBot && <Loader2 className="w-4 h-4 animate-spin" />}
                {isVerifyingBot ? t.verifyingBtn : t.verifySaveBtn}
              </button>
            </div>
          </div>

          <div className="hacker-panel rounded-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">
              {t.guideTitle}
            </h3>
            <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
              {t.guideSteps.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* Telegram Group Conversational Agent Control */}
      <div className="hacker-panel rounded-sm p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                {lang === "bn"
                  ? "টেলিগ্রাম গ্রুপ থেকেই এআই এজেন্ট অপারেট ও কথা বলুন"
                  : "Operate & Chat with Your AI Agent Inside Telegram"}
              </h3>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              {lang === "bn"
                ? "আপনার একটি টেলিগ্রাম গ্রুপ (বা Saved Messages) নির্বাচন করে 'গ্রুপে এজেন্ট চালু করুন' বাটনে ক্লিক করুন। সরাসরি আপনার টেলিগ্রাম অ্যাকাউন্ট থেকেই এজেন্ট গ্রুপে উত্তর দিবে (আলাদা বট ছাড়াই)—এবং চালু হওয়ামাত্র গ্রুপে একটি স্বাগতম মেসেজ পাঠাবে।"
                : "Select a Telegram group (or Saved Messages) and click Activate Group Agent. In Direct Account mode, the agent responds directly inside that group via your session and sends a confirmation message there."}
            </p>
          </div>

          <div className="text-xs font-mono font-medium">
            {config?.agentListenerEnabled ? (
              <span className="text-emerald-400">
                {lang === "bn" ? "সক্রিয়" : "Active"}
              </span>
            ) : (
              <span className="text-slate-500">
                {lang === "bn" ? "বন্ধ আছে" : "Inactive"}
              </span>
            )}
          </div>
        </div>

        {mode === "user" && !config?.hasUserSession ? (
          <p className="text-xs text-slate-400">
            {lang === "bn"
              ? "প্রথমে উপরে আপনার টেলিগ্রাম অ্যাকাউন্ট লগইন করুন, তাহলে আপনার সব গ্রুপের তালিকা এখানে দেখাবে।"
              : "Sign in with your Telegram account above to load your Telegram groups."}
          </p>
        ) : (
          <div className="space-y-4 pt-1">
            {mode === "user" ? (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  {lang === "bn"
                    ? "অপারেটিং গ্রুপ নির্বাচন করুন (যে গ্রুপে এজেন্টের সাথে কথা বলবেন)"
                    : "Select Control Group (where you will chat with the agent)"}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      setControlGroupId("me");
                      setControlGroupTitle("Saved Messages");
                    }}
                    className={`text-left px-3 py-2 rounded-sm border transition-colors cursor-pointer ${
                      controlGroupId === "me"
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                        : "border-slate-800 bg-[#070B10] hover:border-emerald-500/35 text-slate-200"
                    }`}
                  >
                    <div className="text-xs font-semibold">
                      Saved Messages ({lang === "bn" ? "নিজের ইনবক্স" : "Personal Chat"})
                    </div>
                    <div className="text-xs text-slate-400 font-mono">me</div>
                  </button>

                  {channels
                    .filter((c) => c.type === "group")
                    .map((grp) => {
                      const active = controlGroupId === grp.id;
                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => {
                            setControlGroupId(grp.id);
                            setControlGroupTitle(grp.title);
                          }}
                          className={`text-left px-3 py-2 rounded-sm border transition-colors cursor-pointer ${
                            active
                              ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                              : "border-slate-800 bg-[#070B10] hover:border-emerald-500/35 text-slate-200"
                          }`}
                        >
                          <div className="text-xs font-semibold truncate">
                            {grp.title}
                          </div>
                          <div className="text-xs text-slate-400 font-mono truncate">
                            {grp.username ? `@${grp.username}` : grp.id}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {config?.botUsername && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-[#070B10] border border-slate-800 rounded-sm">
                    <div className="text-xs text-slate-300">
                      {lang === "bn"
                        ? "আপনার গ্রুপে বট এজেন্টকে যোগ করে গ্রুপে /start লিখুন:"
                        : "Add your bot agent to a group and send /start inside it:"}
                    </div>
                    <a
                      href={`https://t.me/${config.botUsername}?startgroup=true`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] transition-colors whitespace-nowrap"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      {lang === "bn"
                        ? "গ্রুপে এজেন্ট যোগ করুন"
                        : "Add Agent to Group"}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {lang === "bn"
                      ? "গ্রুপ আইডি (গ্রুপে /start লিখলে অটো সেট হবে)"
                      : "Control Group ID (auto-bound when you send /start in group)"}
                  </label>
                  <input
                    type="text"
                    value={controlGroupId}
                    onChange={(e) => setControlGroupId(e.target.value)}
                    placeholder="-1001234567890"
                    className="w-full px-3 py-2 text-sm font-mono bg-[#06090D] text-slate-100 placeholder:text-slate-500 border border-slate-800 rounded-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-300">
                  {lang === "bn" ? "ট্রিগার মোড:" : "Reply Mode:"}
                </label>
                <select
                  value={triggerMode}
                  onChange={(e) =>
                    setTriggerMode(e.target.value as AgentTriggerMode)
                  }
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-800 rounded-sm bg-[#06090D] text-slate-100"
                >
                  <option value="all">
                    {lang === "bn"
                      ? "গ্রুপের সব মেসেজে উত্তর দিবে"
                      : "Reply to all messages in group"}
                  </option>
                  <option value="prefix">
                    {lang === "bn"
                      ? "শুধু /ai বা !ai দিয়ে শুরু করলে"
                      : "Only when prefixed with /ai or !ai"}
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                {config?.agentListenerEnabled ? (
                  <>
                    <button
                      type="button"
                      disabled={isUpdatingListener}
                      onClick={() => handleToggleGroupListener(true)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 transition-colors cursor-pointer"
                    >
                      {lang === "bn" ? "আপডেট করুন" : "Save Group"}
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingListener}
                      onClick={() => handleToggleGroupListener(false)}
                      className="px-3.5 py-2 text-xs font-semibold text-rose-300 bg-rose-950/35 border border-rose-500/35 rounded-sm hover:bg-rose-950/60 transition-colors cursor-pointer"
                    >
                      {lang === "bn" ? "এজেন্ট বন্ধ করুন" : "Stop Agent"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={isUpdatingListener}
                    onClick={() => handleToggleGroupListener(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {isUpdatingListener && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    {lang === "bn"
                      ? "গ্রুপে এজেন্ট চালু করুন"
                      : "Activate Group Agent"}
                  </button>
                )}
              </div>
            </div>

            {listenerError && (
              <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                {listenerError}
              </div>
            )}

            <div className="text-xs text-slate-400 pt-1">
              {lang === "bn"
                ? 'টেলিগ্রাম গ্রুপে যা লিখতে পারেন: "এটা থেকে পসিবল সব কুইজ পোল বানাও", "@QuizBot এ পোল পোস্ট করো", "এই বিষয়ে একটা টেক্সট পোস্ট লিখে চ্যানেলে দাও", ছবি পাঠিয়ে "সুন্দর ক্যাপশন লিখে পোস্ট করো", "BCS কিওয়ার্ড দিয়ে চ্যানেল ইনডেক্স করো", অথবা "রাত ৯টায় শিডিউল করো"। '
                : 'Try messaging in Telegram: "Create all possible quiz polls", "Post polls to @QuizBot", "Write a text post and publish to channel", send a photo and say "Write a caption and post it", "Index channel posts for keyword BCS", or "Schedule for 9pm".'}
            </div>
          </div>
        )}
      </div>

      {/* Personal AI Agent Persona Settings */}
      <div className="hacker-panel rounded-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {t.personaLabel}
          </label>
          <textarea
            rows={3}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder={t.personaPlaceholder}
            className="w-full px-3.5 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-300">
              {t.outputLangLabel}:
            </label>
            <select
              value={defaultLang}
              onChange={(e) =>
                setDefaultLang(e.target.value as "bn" | "en" | "auto")
              }
              className="px-3 py-1.5 text-xs font-medium border border-slate-800 rounded-sm bg-[#06090D] text-slate-100"
            >
              <option value="auto">{t.langAuto}</option>
              <option value="bn">{t.langBn}</option>
              <option value="en">{t.langEn}</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleSavePersona}
            disabled={isSavingPersona}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {t.savePersonaBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
