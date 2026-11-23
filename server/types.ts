export type PollType = "regular" | "quiz" | "text" | "image";
export type OutputFormat = "polls" | "text_post" | "image_post" | "both" | "index";
export type JobStatus = "pending" | "paused" | "posted" | "failed";
export type SourceKind = "text" | "image" | "pdf";
export type TelegramAuthMode = "user" | "bot";
export type AgentTriggerMode = "all" | "prefix";

export interface PollDraft {
  id: string;
  question: string;
  options: string[];
  type: PollType;
  postText?: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageName?: string;
  indexingKeywords?: string[];
  correctOptionIndex?: number;
  explanation?: string;
  isAnonymous: boolean;
  allowsMultipleAnswers: boolean;
  caption?: string;
}

export interface PollCustomizationOptions {
  optionsPerPoll?: "auto" | 2 | 3 | 4 | 5 | 6;
  difficulty?: "auto" | "easy" | "medium" | "hard";
  tone?: "auto" | "exam" | "engaging" | "concise";
  explanationMode?: "auto" | "include" | "omit";
  numberingStyle?: "none" | "bn" | "en";
  questionPrefix?: string;
  sourceFidelity?: "balanced" | "strict_verbatim";
  shuffleOptions?: boolean;
}

export interface ScheduledPollJob extends PollDraft {
  scheduledAt: string; // ISO 8601 UTC timestamp
  channelId: string;
  status: JobStatus;
  sourceKind: SourceKind;
  sourceLabel: string;
  createdAt: string;
  postedAt?: string;
  telegramMessageId?: number;
  errorMessage?: string;
}

export interface TelegramConfig {
  authMode: TelegramAuthMode;
  // Direct Telegram Account (MTProto)
  apiId?: number;
  apiHash?: string;
  sessionString?: string;
  userPhone?: string;
  userDisplayName?: string;
  userUsername?: string;
  userId?: string;
  // Bot API mode (optional)
  botToken: string;
  botUsername?: string;
  // Target channel/group for posting polls
  channelId: string;
  channelTitle?: string;
  channelType?: string;
  verifiedAt?: string;
  // Telegram Group Agent (conversational control inside Telegram)
  controlGroupId?: string;
  controlGroupTitle?: string;
  agentListenerEnabled?: boolean;
  agentTriggerMode?: AgentTriggerMode;
  timezoneOffsetMinutes?: number;
  // Agent settings
  agentPersona: string;
  defaultLanguage: "bn" | "en" | "auto";
}

export interface TelegramDialogSummary {
  id: string;
  title: string;
  username?: string;
  type: "channel" | "group" | "bot";
  isAdmin?: boolean;
  canPost?: boolean;
}

export interface AgentStoreData {
  config: TelegramConfig;
  jobs: ScheduledPollJob[];
}
