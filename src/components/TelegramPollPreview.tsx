import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Edit3,
  HelpCircle,
  Plus,
  Send,
  Shuffle,
  Trash2,
} from "lucide-react";
import { COPY } from "../i18n";
import type { PollDraft, UiLang } from "../types";

interface TelegramPollPreviewProps {
  poll: PollDraft;
  index: number;
  channelLabel: string;
  lang: UiLang;
  isPosting: boolean;
  onChange: (updated: PollDraft) => void;
  onRemove: () => void;
  onPostNow: () => void;
}

export function TelegramPollPreview({
  poll,
  index,
  channelLabel,
  lang,
  isPosting,
  onChange,
  onRemove,
  onPostNow,
}: TelegramPollPreviewProps) {
  const t = COPY[lang];
  const [isEditing, setIsEditing] = useState(false);
  const [previewSelected, setPreviewSelected] = useState<number | null>(null);

  const handleOptionChange = (optIndex: number, value: string) => {
    const next = [...poll.options];
    next[optIndex] = value.slice(0, 100);
    onChange({ ...poll, options: next });
  };

  const handleAddOption = () => {
    if (poll.options.length >= 10) return;
    onChange({ ...poll, options: [...poll.options, ""] });
  };

  const handleRemoveOption = (optIndex: number) => {
    if (poll.options.length <= 2) return;
    const next = poll.options.filter((_, idx) => idx !== optIndex);
    let nextCorrect = poll.correctOptionIndex ?? 0;
    if (optIndex < nextCorrect) {
      nextCorrect = nextCorrect - 1;
    } else if (optIndex === nextCorrect) {
      nextCorrect = Math.min(nextCorrect, next.length - 1);
    }
    onChange({ ...poll, options: next, correctOptionIndex: nextCorrect });
  };

  const handleShuffleOptions = () => {
    if (poll.options.length < 2) return;
    const tagged = poll.options.map((text, idx) => ({
      text,
      isCorrect: poll.type === "quiz" && poll.correctOptionIndex === idx,
    }));
    for (let i = tagged.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
    }
    const newCorrect =
      poll.type === "quiz" ? tagged.findIndex((t) => t.isCorrect) : undefined;
    onChange({
      ...poll,
      options: tagged.map((t) => t.text),
      correctOptionIndex:
        poll.type === "quiz" && newCorrect !== undefined && newCorrect >= 0
          ? newCorrect
          : poll.correctOptionIndex,
    });
  };

  const isTextPost = poll.type === "text";
  const isImagePost = poll.type === "image";
  const imageSrc = poll.imageBase64
    ? `data:${poll.imageMimeType || "image/jpeg"};base64,${poll.imageBase64}`
    : "";

  return (
    <div className="hacker-panel rounded-sm overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-emerald-500/20 bg-[#050A0F]/90">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span className="font-semibold text-emerald-400 tabular-nums">
            #{index + 1}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-cyan-300">
            {isImagePost
              ? t.imagePostLabel
              : isTextPost
                ? t.textPostLabel
                : poll.type === "quiz"
                  ? t.quizLabel
                  : t.regularPollLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate max-w-[180px] text-slate-300">
            {channelLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            {isEditing ? t.doneEditing : t.editPoll}
          </button>
          <button
            type="button"
            onClick={onPostNow}
            disabled={isPosting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {isPosting ? t.postingBtn : t.postNowBtn}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={t.deleteAction}
            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-sm hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isImagePost ? (
        isEditing ? (
          <div className="p-5 space-y-4">
            {imageSrc && (
              <img
                src={imageSrc}
                alt={poll.imageName || poll.question}
                referrerPolicy="no-referrer"
                className="w-full max-h-60 object-contain rounded-sm border border-slate-800 bg-[#06090D]"
              />
            )}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t.postTitleLabel}
              </label>
              <input
                type="text"
                maxLength={120}
                value={poll.question}
                onChange={(e) => onChange({ ...poll, question: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  {t.imageCaptionLabel}
                </label>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {(poll.postText ?? poll.caption ?? "").length}/1024
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={1024}
                value={poll.postText ?? poll.caption ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onChange({
                    ...poll,
                    postText: val,
                    caption: val,
                  });
                }}
                className="w-full px-3.5 py-2.5 text-sm bg-[#04080C] text-slate-100 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 resize-y"
              />
            </div>
          </div>
        ) : (
          <div className="p-5 bg-[#0A121B]/85">
            <div className="bg-[#121F2E] border border-emerald-500/30 rounded-sm overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80">
                <span className="text-xs font-mono font-medium text-cyan-400">
                  {channelLabel}
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {poll.imageName || t.imagePostLabel} ·{" "}
                  {(poll.postText || poll.caption || "").length}/1024
                </span>
              </div>
              {imageSrc && (
                <div className="bg-[#06090D]">
                  <img
                    src={imageSrc}
                    alt={poll.imageName || poll.question}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-80 object-contain"
                  />
                </div>
              )}
              {(poll.postText || poll.caption) && (
                <div className="p-4">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {poll.postText || poll.caption}
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      ) : isTextPost ? (
        isEditing ? (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t.postTitleLabel}
              </label>
              <input
                type="text"
                maxLength={120}
                value={poll.question}
                onChange={(e) => onChange({ ...poll, question: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  {t.postBodyLabel}
                </label>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {(poll.postText ?? poll.question).length}/4096
                </span>
              </div>
              <textarea
                rows={7}
                maxLength={4096}
                value={poll.postText ?? poll.question}
                onChange={(e) => {
                  const val = e.target.value;
                  const firstLine = val.split("\n")[0]?.trim() || val;
                  onChange({
                    ...poll,
                    postText: val,
                    question: (poll.question || firstLine).slice(0, 120),
                  });
                }}
                className="w-full px-3.5 py-2.5 text-sm bg-[#04080C] text-slate-100 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 resize-y"
              />
            </div>
          </div>
        ) : (
          <div className="p-5 bg-[#0A121B]/85">
            <div className="bg-[#121F2E] border border-emerald-500/30 rounded-sm p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-medium text-cyan-400">
                  {channelLabel}
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {(poll.postText || poll.question).length} chars
                </span>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {poll.postText || poll.question}
              </p>
            </div>
          </div>
        )
      ) : isEditing ? (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t.pollModeLabel}
              </label>
              <div className="flex items-center gap-1 p-1 bg-[#06090D] border border-slate-800 rounded-sm">
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...poll,
                      type: "regular",
                      correctOptionIndex: undefined,
                    })
                  }
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    poll.type === "regular"
                      ? "bg-[#121D29] text-emerald-300 border-emerald-500/40"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t.regularPollLabel}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...poll,
                      type: "quiz",
                      allowsMultipleAnswers: false,
                      correctOptionIndex: poll.correctOptionIndex ?? 0,
                    })
                  }
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    poll.type === "quiz"
                      ? "bg-[#121D29] text-emerald-300 border-emerald-500/40"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t.quizLabel}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {t.captionLabel}
              </label>
              <input
                type="text"
                value={poll.caption ?? ""}
                onChange={(e) => onChange({ ...poll, caption: e.target.value })}
                placeholder={t.captionPlaceholder}
                className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                Question
              </label>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {poll.question.length}/300
              </span>
            </div>
            <textarea
              rows={2}
              maxLength={300}
              value={poll.question}
              onChange={(e) => onChange({ ...poll, question: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-slate-300">
                Options ({poll.options.length}/10)
              </label>
              <button
                type="button"
                onClick={handleShuffleOptions}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                <Shuffle className="w-3 h-3" />
                {lang === "bn" ? "অপশন এলোমেলো করুন" : "Shuffle options"}
              </button>
            </div>
            {poll.options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {poll.type === "quiz" && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...poll, correctOptionIndex: idx })
                    }
                    title={t.correctAnswerLabel}
                    className={`p-1.5 rounded-sm border transition-colors cursor-pointer ${
                      poll.correctOptionIndex === idx
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-slate-800 bg-[#06090D] text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                <input
                  type="text"
                  maxLength={100}
                  value={opt}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-[#04080C] text-slate-100 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
                />
                {poll.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    className="p-2 text-slate-500 hover:text-rose-400 rounded-sm hover:bg-rose-950/40 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            {poll.options.length < 10 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 py-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addOption}
              </button>
            )}
          </div>

          {poll.type === "quiz" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  {t.explanationLabel}
                </label>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {(poll.explanation ?? "").length}/200
                </span>
              </div>
              <input
                type="text"
                maxLength={200}
                value={poll.explanation ?? ""}
                onChange={(e) =>
                  onChange({ ...poll, explanation: e.target.value })
                }
                placeholder={t.explanationPlaceholder}
                className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-5 pt-2 border-t border-slate-800">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={poll.isAnonymous}
                onChange={(e) =>
                  onChange({ ...poll, isAnonymous: e.target.checked })
                }
                className="rounded border-slate-700 bg-[#06090D] accent-emerald-500"
              />
              {t.anonymousLabel}
            </label>
            {poll.type === "regular" && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={poll.allowsMultipleAnswers}
                  onChange={(e) =>
                    onChange({
                      ...poll,
                      allowsMultipleAnswers: e.target.checked,
                    })
                  }
                  className="rounded border-slate-700 bg-[#06090D] accent-emerald-500"
                />
                {t.multiAnswerLabel}
              </label>
            )}
          </div>
        </div>
      ) : (
        /* Realistic Dark Telegram Channel Preview */
        <div className="p-5 bg-[#0A121B]/85">
          {poll.caption && poll.caption.trim() && (
            <div className="mb-3 px-4 py-2.5 bg-[#121F2E] border border-emerald-500/30 rounded-sm text-sm text-slate-200">
              {poll.caption}
            </div>
          )}
          <div className="bg-[#121F2E] border border-emerald-500/30 rounded-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-mono font-medium text-cyan-400">
                  {channelLabel}
                </div>
                <h4 className="text-base font-semibold text-slate-100 leading-snug">
                  {poll.question}
                </h4>
              </div>
              {poll.type === "quiz" && poll.explanation && (
                <span
                  title={poll.explanation}
                  className="text-slate-500 hover:text-cyan-400 shrink-0"
                >
                  <HelpCircle className="w-4 h-4" />
                </span>
              )}
            </div>

            <div className="text-xs text-slate-400 font-mono">
              {poll.isAnonymous ? t.anonymousVotesNote : "Public Poll"}
              {poll.type === "quiz" ? ` · ${t.quizLabel}` : ""}
              {poll.type === "regular" && poll.allowsMultipleAnswers
                ? " · Multi-choice"
                : ""}
            </div>

            <div className="space-y-2 pt-1">
              {poll.options.map((opt, idx) => {
                const isCorrect =
                  poll.type === "quiz" && poll.correctOptionIndex === idx;
                const isPicked = previewSelected === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPreviewSelected(idx)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm rounded-sm border transition-colors cursor-pointer ${
                      isPicked
                        ? poll.type === "quiz"
                          ? isCorrect
                            ? "border-emerald-500 bg-emerald-950/50 text-emerald-200"
                            : "border-rose-500/60 bg-rose-950/40 text-rose-200"
                          : "border-cyan-500/60 bg-cyan-950/35 text-cyan-100"
                        : "border-slate-700/80 bg-[#0B1520] hover:border-emerald-400/50 text-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                      <span>{opt}</span>
                    </span>
                    {isPicked && (
                      <span className="text-xs font-mono tabular-nums text-emerald-400">
                        100%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {poll.type === "quiz" && poll.explanation && (
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-400">
                <span className="font-medium text-emerald-400">
                  {t.explanationLabel}:{" "}
                </span>
                {poll.explanation}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
