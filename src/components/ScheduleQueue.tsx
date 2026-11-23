import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { COPY } from "../i18n";
import type { JobStatus, ScheduledPollJob, UiLang } from "../types";

interface ScheduleQueueProps {
  lang: UiLang;
  jobs: ScheduledPollJob[];
  onRefresh: () => void;
  onNotify: (type: "success" | "error", message: string) => void;
  onGoToStudio: () => void;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleQueue({
  lang,
  jobs,
  onRefresh,
  onNotify,
  onGoToStudio,
}: ScheduleQueueProps) {
  const t = COPY[lang];
  const [statusFilter, setStatusFilter] = useState<"all" | JobStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const counts = useMemo(() => {
    return {
      all: jobs.length,
      pending: jobs.filter((j) => j.status === "pending").length,
      paused: jobs.filter((j) => j.status === "paused").length,
      posted: jobs.filter((j) => j.status === "posted").length,
      failed: jobs.filter((j) => j.status === "failed").length,
    };
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (!q) return true;
      return (
        job.question.toLowerCase().includes(q) ||
        (job.postText || "").toLowerCase().includes(q) ||
        job.channelId.toLowerCase().includes(q) ||
        job.options.some((o) => o.toLowerCase().includes(q))
      );
    });
  }, [jobs, statusFilter, searchQuery]);

  const handlePatch = async (
    id: string,
    payload: Record<string, unknown>,
    successMsg?: string
  ) => {
    setBusyJobId(id);
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      if (successMsg) onNotify("success", successMsg);
      onRefresh();
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Could not update schedule"
      );
    } finally {
      setBusyJobId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyJobId(id);
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete schedule");
      onRefresh();
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Could not delete job"
      );
    } finally {
      setBusyJobId(null);
    }
  };

  const renderStatus = (status: JobStatus) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-amber-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {t.statusPending}
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-slate-400">
            <Pause className="w-3.5 h-3.5 shrink-0" />
            {t.statusPaused}
          </span>
        );
      case "posted":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {t.statusPosted}
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-rose-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {t.statusFailed}
          </span>
        );
    }
  };

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang === "bn" ? "bn-BD" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            {t.queueTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{t.queueSubtitle}</p>
        </div>

        {/* Clean Unboxed Summary Metrics */}
        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
          <span>
            <strong className="text-amber-400">{counts.pending}</strong>{" "}
            {t.statusPending}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-emerald-400">{counts.posted}</strong>{" "}
            {t.statusPosted}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-rose-400">{counts.failed}</strong>{" "}
            {t.statusFailed}
          </span>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#080C12] border border-slate-800 rounded-sm overflow-x-auto">
          {(
            [
              ["all", t.filterAll, counts.all],
              ["pending", t.filterPending, counts.pending],
              ["paused", t.filterPaused, counts.paused],
              ["posted", t.filterPosted, counts.posted],
              ["failed", t.filterFailed, counts.failed],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === key
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}{" "}
              <span className="ml-1 font-mono tabular-nums text-slate-500">
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
          />
        </div>
      </div>

      {/* Queue List */}
      {filtered.length === 0 ? (
        <div className="hacker-panel rounded-sm p-12 text-center space-y-3">
          <CalendarClock className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-100">
            {t.emptyQueueTitle}
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {t.emptyQueueBody}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onGoToStudio}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] transition-colors cursor-pointer"
            >
              {t.goToStudioBtn}
            </button>
          </div>
        </div>
      ) : (
        <div className="hacker-panel rounded-sm divide-y divide-slate-800/80 overflow-hidden">
          {filtered.map((job) => {
            const isBusy = busyJobId === job.id;
            const isEditingTime = editingJobId === job.id;

            return (
              <div
                key={job.id}
                className="p-4 sm:px-5 hover:bg-[#101925]/70 transition-colors space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {renderStatus(job.status)}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {formatTimestamp(job.scheduledAt)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-cyan-400">
                        {job.channelId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {job.type === "image"
                          ? t.imagePostLabel
                          : job.type === "text"
                            ? t.textPostLabel
                            : `${
                                job.type === "quiz" ? t.quizLabel : t.regularPollLabel
                              } (${job.options.length} opts)`}
                      </span>
                    </div>

                    <div className="flex items-start gap-3">
                      {job.type === "image" && job.imageBase64 && (
                        <img
                          src={`data:${job.imageMimeType || "image/jpeg"};base64,${job.imageBase64}`}
                          alt={job.imageName || job.question}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-sm object-cover border border-slate-700 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold text-slate-100 leading-snug">
                          {job.question}
                        </p>

                        <p className="text-xs text-slate-400 truncate">
                          {job.type === "image"
                            ? job.postText || job.caption || job.imageName || t.imagePostLabel
                            : job.type === "text"
                              ? job.postText || job.question
                              : job.options.join(" · ")}
                        </p>
                      </div>
                    </div>

                    {job.status === "failed" && job.errorMessage && (
                      <p className="text-xs text-rose-400">{job.errorMessage}</p>
                    )}

                    {job.status === "posted" && job.telegramMessageId && (
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        Message ID: {job.telegramMessageId}
                        {job.postedAt
                          ? ` · Sent ${formatTimestamp(job.postedAt)}`
                          : ""}
                      </p>
                    )}
                  </div>

                  {/* Row Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {job.status !== "posted" && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handlePatch(
                              job.id,
                              { action: "post_now" },
                              lang === "bn"
                                ? "পোলটি চ্যানেলে পোস্ট করা হয়েছে।"
                                : "Poll posted to channel."
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {t.postNowBtn}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            if (isEditingTime) {
                              setEditingJobId(null);
                            } else {
                              setEditingJobId(job.id);
                              setRescheduleValue(
                                toLocalInputValue(job.scheduledAt)
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          {t.rescheduleAction}
                        </button>
                      </>
                    )}

                    {job.status === "pending" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handlePatch(job.id, { status: "paused" })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-slate-500 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        {t.pauseAction}
                      </button>
                    )}

                    {job.status === "paused" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handlePatch(job.id, { status: "pending" })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/40 border border-emerald-500/40 rounded-sm hover:bg-emerald-950/70 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {t.resumeAction}
                      </button>
                    )}

                    {job.status === "failed" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handlePatch(job.id, {
                            status: "pending",
                            scheduledAt: new Date().toISOString(),
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/40 border border-amber-500/40 rounded-sm hover:bg-amber-950/70 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t.retryAction}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDelete(job.id)}
                      aria-label={t.deleteAction}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-sm hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Inline Reschedule Bar */}
                {isEditingTime && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
                    <input
                      type="datetime-local"
                      value={rescheduleValue}
                      onChange={(e) => setRescheduleValue(e.target.value)}
                      className="px-3 py-1.5 text-xs font-mono tabular-nums bg-[#06090D] text-slate-100 border border-slate-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!rescheduleValue) return;
                        handlePatch(
                          job.id,
                          {
                            scheduledAt: new Date(rescheduleValue).toISOString(),
                            status: "pending",
                          },
                          lang === "bn"
                            ? "সময়সূচী আপডেট হয়েছে।"
                            : "Schedule updated."
                        );
                        setEditingJobId(null);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.28)] cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingJobId(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
