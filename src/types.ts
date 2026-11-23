export type PollType = "regular" | "quiz" | "text" | "image";
export type OutputFormat = "polls" | "text_post" | "image_post" | "both" | "index";
export type JobStatus = "pending" | "paused" | "posted" | "failed";
export type SourceKind = "text" | "image" | "pdf";
export type UiLang = "bn" | "en";
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
  scheduledAt: string;
  channelId: string;
  status: JobStatus;
  sourceKind: SourceKind;
  sourceLabel: string;
  createdAt: string;
  postedAt?: string;
  telegramMessageId?: number;
  errorMessage?: string;
}

export interface TelegramDialogSummary {
  id: string;
  title: string;
  username?: string;
  type: "channel" | "group" | "bot";
  isAdmin?: boolean;
  canPost?: boolean;
}

export interface PublicTelegramConfig {
  authMode: TelegramAuthMode;
  hasUserSession: boolean;
  hasApiCredentials: boolean;
  apiId?: number;
  userPhone?: string;
  userDisplayName?: string;
  userUsername?: string;
  userId?: string;
  channelId: string;
  botUsername?: string;
  channelTitle?: string;
  channelType?: string;
  verifiedAt?: string;
  controlGroupId: string;
  controlGroupTitle: string;
  agentListenerEnabled: boolean;
  agentTriggerMode: AgentTriggerMode;
  agentPersona: string;
  defaultLanguage: "bn" | "en" | "auto";
  hasBotToken: boolean;
  maskedBotToken: string;
}
