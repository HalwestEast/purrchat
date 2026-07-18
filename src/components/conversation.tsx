import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import { tv, type VariantProps } from "tailwind-variants";
import ConversationList from "./conversation-list";
import type { Id } from "../../convex/_generated/dataModel";
import { AnimatePresence, motion } from "motion/react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Message as MessageRow,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

export interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName?: string;
  timestamp: number;
  isEdited?: boolean;
  isDeleted?: boolean;
  replyToId?: string;
  replyToPreview?: {
    content: string;
    senderId: string;
    senderName?: string;
  } | null;
}

interface ReplyingTo {
  id: Id<"messages">;
  content: string;
  senderId: string;
  senderName: string;
}

interface Editing {
  id: Id<"messages">;
  original: string;
}

interface MessageGroupData {
  id: string;
  senderId: string;
  senderName?: string;
  side: "sent" | "received";
  messages: Message[];
  showTimestamp: boolean;
  timestampLabel?: string;
  /** True when this group starts after a long pause (time-based break). */
  timeSeparated: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GROUP_BREAK_MS = 5 * 60 * 1000;
const TIMESTAMP_GAP_MS = 30 * 60 * 1000;

function formatTimestamp(ts: number): string {
  return dayjs(ts).fromNow();
}

function formatBubbleTime(ts: number): string {
  const diffMins = dayjs().diff(dayjs(ts), "minute");
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = dayjs().diff(dayjs(ts), "hour");
  if (diffHours < 24) return `${diffHours}h ago`;
  return dayjs(ts).fromNow();
}

function groupMessages(
  messages: Message[],
  currentUserId: string,
  groupBreakMs = GROUP_BREAK_MS,
): MessageGroupData[] {
  if (!messages.length) return [];
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const groups: MessageGroupData[] = [];
  let current: MessageGroupData | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];
    const prev = sorted[i - 1];
    const gap = prev ? msg.timestamp - prev.timestamp : Infinity;
    const senderChanged = !prev || prev.senderId !== msg.senderId;
    const longPause = gap > groupBreakMs;
    const showTimestamp = gap > TIMESTAMP_GAP_MS;

    if (!current || senderChanged || longPause) {
      current = {
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        side: msg.senderId === currentUserId ? "sent" : "received",
        messages: [],
        showTimestamp,
        timestampLabel: showTimestamp
          ? formatTimestamp(msg.timestamp)
          : undefined,
        timeSeparated: Boolean(prev) && longPause,
      };
      groups.push(current);
    }
    current.messages.push(msg);
  }
  return groups;
}

// ─── Styling ──────────────────────────────────────────────────────────────────

// Our signature corner treatment, kept from the original design: radii change
// based on the bubble's position in its group. This is applied on top of
// shadcn's BubbleContent via className, overriding its default radius.
const bubbleRadii = tv({
  base: ["[--r:0.6rem]", "[--r-soft:3px]"],
  variants: {
    position: { first: "", middle: "", last: "", solo: "" },
    side: { sent: "", received: "" },
  },
  compoundVariants: [
    {
      position: "first",
      side: "sent",
      class:
        "rounded-tl-[var(--r)] rounded-tr-[var(--r)] rounded-bl-[var(--r)] rounded-br-[var(--r-soft)]",
    },
    {
      position: "middle",
      side: "sent",
      class:
        "rounded-tl-[var(--r)] rounded-tr-[var(--r-soft)] rounded-bl-[var(--r)] rounded-br-[var(--r-soft)]",
    },
    {
      position: "last",
      side: "sent",
      class:
        "rounded-tl-[var(--r)] rounded-tr-[var(--r-soft)] rounded-bl-[var(--r)] rounded-br-[var(--r)]",
    },
    { position: "solo", side: "sent", class: "rounded-[var(--r)]" },
    {
      position: "first",
      side: "received",
      class:
        "rounded-tl-[var(--r)] rounded-tr-[var(--r)] rounded-bl-[var(--r-soft)] rounded-br-[var(--r)]",
    },
    {
      position: "middle",
      side: "received",
      class:
        "rounded-tl-[var(--r-soft)] rounded-tr-[var(--r)] rounded-bl-[var(--r-soft)] rounded-br-[var(--r)]",
    },
    {
      position: "last",
      side: "received",
      class:
        "rounded-tl-[var(--r-soft)] rounded-tr-[var(--r)] rounded-bl-[var(--r)] rounded-br-[var(--r)]",
    },
    { position: "solo", side: "received", class: "rounded-[var(--r)]" },
  ],
  defaultVariants: { position: "solo", side: "sent" },
});

type BubbleVariants = VariantProps<typeof bubbleRadii>;

// ─── Own-bubble color themes ──────────────────────────────────────────────────
// Only YOUR bubbles change color; received bubbles stay gray. Each theme also
// covers the edit UI, the reply tint inside your bubbles, the reply bar
// accent, and the highlighted state of your own reaction chips.

const BUBBLE_THEMES = {
  emerald: {
    hex: "#059669", // emerald-600
    swatch: "bg-emerald-600",
    bubble: "bg-emerald-600 text-white",
    replyTint: "bg-emerald-500/70 border-emerald-200/80",
    edit: "bg-emerald-600",
    editButton: "bg-emerald-600 hover:bg-emerald-700",
    accentBorder: "border-emerald-500",
    accentText: "text-emerald-600",
    chipActive: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  sky: {
    hex: "#0284c7", // sky-600
    swatch: "bg-sky-600",
    bubble: "bg-sky-600 text-white",
    replyTint: "bg-sky-500/70 border-sky-200/80",
    edit: "bg-sky-600",
    editButton: "bg-sky-600 hover:bg-sky-700",
    accentBorder: "border-sky-500",
    accentText: "text-sky-600",
    chipActive: "border-sky-300 bg-sky-50 text-sky-700",
  },
  violet: {
    hex: "#7c3aed", // violet-600
    swatch: "bg-violet-600",
    bubble: "bg-violet-600 text-white",
    replyTint: "bg-violet-500/70 border-violet-200/80",
    edit: "bg-violet-600",
    editButton: "bg-violet-600 hover:bg-violet-700",
    accentBorder: "border-violet-500",
    accentText: "text-violet-600",
    chipActive: "border-violet-300 bg-violet-50 text-violet-700",
  },
  rose: {
    hex: "#e11d48", // rose-600
    swatch: "bg-rose-600",
    bubble: "bg-rose-600 text-white",
    replyTint: "bg-rose-500/70 border-rose-200/80",
    edit: "bg-rose-600",
    editButton: "bg-rose-600 hover:bg-rose-700",
    accentBorder: "border-rose-500",
    accentText: "text-rose-600",
    chipActive: "border-rose-300 bg-rose-50 text-rose-700",
  },
  amber: {
    hex: "#d97706", // amber-600
    swatch: "bg-amber-600",
    bubble: "bg-amber-600 text-white",
    replyTint: "bg-amber-500/70 border-amber-200/80",
    edit: "bg-amber-600",
    editButton: "bg-amber-600 hover:bg-amber-700",
    accentBorder: "border-amber-500",
    accentText: "text-amber-600",
    chipActive: "border-amber-300 bg-amber-50 text-amber-700",
  },
  stone: {
    hex: "#292524", // stone-800
    swatch: "bg-stone-800",
    bubble: "bg-stone-800 text-white",
    replyTint: "bg-stone-600/70 border-stone-400/80",
    edit: "bg-stone-800",
    editButton: "bg-stone-800 hover:bg-stone-700",
    accentBorder: "border-stone-700",
    accentText: "text-stone-700",
    chipActive: "border-stone-300 bg-stone-100 text-stone-800",
  },
} as const;

type ThemeKey = keyof typeof BUBBLE_THEMES;

const RECEIVED_BUBBLE = "bg-gray-500 text-white";
const RECEIVED_HEX = "#6b7280"; // gray-500

/** Quick swatch picker for the own-bubble color theme. */
function ThemePicker({
  theme,
  onChange,
  className,
}: {
  theme: ThemeKey;
  onChange: (t: ThemeKey) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {open && (
        <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1 shadow-sm">
          {(Object.keys(BUBBLE_THEMES) as ThemeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              aria-label={`Use ${key} bubble color`}
              className={cn(
                "size-5 rounded-full transition-transform hover:scale-110",
                BUBBLE_THEMES[key].swatch,
                theme === key && "ring-2 ring-stone-400 ring-offset-1",
              )}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change bubble color"
        title="Change bubble color"
        className="flex size-8 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
      >
        <span
          className={cn("size-4 rounded-full", BUBBLE_THEMES[theme].swatch)}
        />
      </button>
    </div>
  );
}

function resolvePosition(i: number, total: number): BubbleVariants["position"] {
  if (total === 1) return "solo";
  if (i === 0) return "first";
  if (i === total - 1) return "last";
  return "middle";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BubbleReplyPreview({
  replyPreview,
  side,
  theme,
  onClick,
}: {
  replyPreview: NonNullable<Message["replyToPreview"]>;
  side: "sent" | "received";
  theme: ThemeKey;
  onClick?: () => void;
}) {
  // A lighter tint of the bubble's own colour, so the quote reads as nested.
  const tint =
    side === "sent"
      ? BUBBLE_THEMES[theme].replyTint
      : "bg-gray-400/70 border-gray-200/80";
  return (
    <div
      onClick={onClick}
      className={cn(
        "mb-1.5 max-w-[220px] rounded-md border-l-2 px-2 py-1",
        tint,
        onClick && "cursor-pointer",
      )}
    >
      {replyPreview.senderName && (
        <p className="truncate text-[11px] font-semibold text-white/95">
          {replyPreview.senderName}
        </p>
      )}
      <p className="truncate text-[11px] text-white/80">
        {replyPreview.content}
      </p>
    </div>
  );
}

// ─── Reactions ────────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢"];

// Optimistic messages carry a client-generated UUID (which contains hyphens);
// real Convex document ids never do. Skip reaction queries for those.
function isOptimisticId(id: string) {
  return id.includes("-");
}

/**
 * Committed reactions, rendered in normal flow below the bubble so they
 * reserve vertical space (the next bubble shifts down), with a slight
 * upward tuck against the bubble's bottom edge.
 */
function MessageReactionsRow({
  messageId,
  theme,
  currentUserId,
  onToggle,
}: {
  messageId: string;
  theme: ThemeKey;
  currentUserId: string;
  onToggle: (emoji: string) => void;
}) {
  const reactions = useQuery(
    api.reactions.getReactions,
    isOptimisticId(messageId)
      ? "skip"
      : { messageId: messageId as Id<"messages"> },
  );

  if (!reactions || reactions.length === 0) return null;

  // Collapse into one chip per emoji, tracking whether the current user is in it.
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.userId === currentUserId) entry.mine = true;
    grouped.set(r.emoji, entry);
  }

  return (
    // In normal flow (not absolutely positioned), so the row takes real
    // layout height and pushes the next bubble down — while the negative
    // top margin tucks the chips against the bubble's bottom edge.
    // self-start keeps them on the left for both sent and received.
    <div className="z-10 -mt-1.5 flex w-fit flex-wrap gap-1 self-start pl-2">
      {[...grouped.entries()].map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          aria-label={`${mine ? "Remove your" : "Add"} ${emoji} reaction`}
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none shadow-sm transition-colors",
            mine
              ? BUBBLE_THEMES[theme].chipActive
              : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
          )}
        >
          <span>{emoji}</span>
          <span className="text-[11px] font-medium tabular-nums">{count}</span>
        </button>
      ))}
    </div>
  );
}

/** Icon shown next to bubbles that are replies; clicking jumps to the original. */
function ReplyJumpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Go to the replied message"
      title="Go to the replied message"
      className="flex size-6 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        <path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />
      </svg>
    </button>
  );
}

/** Normal chat bubble — shadcn Bubble surface + our positional radii on top */
function ChatBubble({
  children,
  position,
  side,
  theme,
  className,
  isRead,
  isEdited,
  timestamp,
  replyPreview,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onJumpToReply,
  messageId,
  currentUserId,
  onToggleReaction,
}: {
  children: React.ReactNode;
  theme: ThemeKey;
  className?: string;
  isRead?: boolean;
  isEdited?: boolean;
  timestamp: number;
  replyPreview?: Message["replyToPreview"];
  isOwn?: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onJumpToReply?: () => void;
  messageId: string;
  currentUserId: string;
  onToggleReaction?: (emoji: string) => void;
} & BubbleVariants) {
  const showMeta = position === "last" || position === "solo";
  const showChecks = side === "sent" && isRead !== undefined;
  const bubbleSide = side ?? "sent";
  const canReact = Boolean(onToggleReaction);
  const hasActions =
    canReact || Boolean(onReply || onDelete || (isOwn && onEdit));

  return (
    <div
      className={cn(
        "relative flex w-full flex-col",
        // Lift the active message above neighbouring rows so the toolbar
        // and reaction chips paint on top of the next bubble, not under it.
        "hover:z-20 focus-within:z-20",
        bubbleSide === "sent" ? "items-end" : "items-start",
      )}
    >
      {/* Row so the reply-jump icon can sit beside the bubble */}
      <div
        className={cn(
          "flex w-full items-center gap-1.5",
          bubbleSide === "sent" ? "justify-end" : "justify-start",
        )}
      >
        {bubbleSide === "sent" && onJumpToReply && (
          <ReplyJumpButton onClick={onJumpToReply} />
        )}

        <Bubble
          align={bubbleSide === "sent" ? "end" : "start"}
          // The bubble itself is the hover zone for the toolbar, and
          // focusable so a tap opens it on touch devices.
          tabIndex={0}
          className="group/msg relative max-w-[85%] outline-none sm:max-w-[75%]"
        >
          <BubbleContent
            className={cn(
              "w-fit px-3 py-1 text-sm leading-relaxed shadow-sm break-words",
              bubbleSide === "sent"
                ? BUBBLE_THEMES[theme].bubble
                : RECEIVED_BUBBLE,
              bubbleRadii({ position, side: bubbleSide }),
              className,
            )}
            // Inline style outranks the variant's own bg/text classes shipped
            // inside the shadcn BubbleContent, which were overriding our
            // utility classes depending on stylesheet order.
            style={{
              backgroundColor:
                bubbleSide === "sent" ? BUBBLE_THEMES[theme].hex : RECEIVED_HEX,
              color: "#ffffff",
            }}
          >
            {replyPreview && (
              <BubbleReplyPreview
                replyPreview={replyPreview}
                side={bubbleSide}
                theme={theme}
                onClick={onJumpToReply}
              />
            )}

            <div
              className={
                showMeta ? "flex items-end gap-2.5" : "flex justify-center"
              }
            >
              <div className={showMeta ? "flex-1" : ""}>{children}</div>

              {showMeta && (
                <div className="shrink-0 flex items-end gap-1 text-[10px] text-white/60">
                  {isEdited && <span className="italic">edited</span>}
                  <span>{formatBubbleTime(timestamp)}</span>
                  {showChecks &&
                    (isRead ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 7 17l-5-5" />
                        <path d="m22 10-7.5 7.5L13 16" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ))}
                </div>
              )}
            </div>
          </BubbleContent>

          {/* Committed reactions, anchored to the bubble's bottom edge */}
          {onToggleReaction && (
            <MessageReactionsRow
              messageId={messageId}
              theme={theme}
              currentUserId={currentUserId}
              onToggle={onToggleReaction}
            />
          )}
          {/* Hover / tap toolbar: quick reactions + actions */}
          {hasActions && (
            <div
              className={cn(
                // Small -my/py bridge keeps the pointer on the hover surface on
                // its way down to the buttons, without blanketing the next bubble.
                "absolute top-full z-50 flex -my-2 py-2 px-2",
                "opacity-0 pointer-events-none transition-opacity duration-150",
                "group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto",
                "focus-within:opacity-100 focus-within:pointer-events-auto",
                bubbleSide === "sent" ? "right-1" : "left-1",
              )}
            >
              <div className="flex translate-y-1 items-center gap-0.5 rounded-full border border-stone-200 bg-white p-1 shadow-sm transition-transform duration-150 group-hover/msg:translate-y-0">
                {canReact &&
                  QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onToggleReaction?.(emoji)}
                      aria-label={`React with ${emoji}`}
                      className="flex size-7 items-center justify-center rounded-full text-[15px] leading-none transition-transform hover:scale-110 hover:bg-stone-100 group-hover/msg:pointer-events-auto"
                    >
                      {emoji}
                    </button>
                  ))}

                {canReact && (onReply || onDelete || (isOwn && onEdit)) && (
                  <span className="mx-0.5 h-4 w-px shrink-0 bg-stone-200" />
                )}

                {onReply && (
                  <BubbleAction label="Reply" onClick={onReply}>
                    <IconReply />
                  </BubbleAction>
                )}
                {isOwn && onEdit && (
                  <BubbleAction label="Edit" onClick={onEdit}>
                    <IconEdit />
                  </BubbleAction>
                )}
                {onDelete && (
                  <BubbleAction label="Delete for me" onClick={onDelete} danger>
                    <IconDelete />
                  </BubbleAction>
                )}
              </div>
            </div>
          )}
        </Bubble>

        {bubbleSide === "received" && onJumpToReply && (
          <ReplyJumpButton onClick={onJumpToReply} />
        )}
      </div>
    </div>
  );
}

/** Placeholder shown in place of a deleted message — shadcn muted bubble */
function DeletedBubble({ side }: { side: "sent" | "received" }) {
  return (
    <Bubble
      variant="muted"
      align={side === "sent" ? "end" : "start"}
      className="pointer-events-none w-full select-none"
    >
      <BubbleContent className="flex w-fit items-center gap-1.5 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs italic text-stone-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        Message removed
      </BubbleContent>
    </Bubble>
  );
}

/** Inline edit form replacing the bubble */
function EditBubble({
  value,
  onChange,
  onSave,
  onCancel,
  side,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  side: "sent" | "received";
  theme: ThemeKey;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
  }, []);

  return (
    <div
      className={`flex flex-col gap-1 ${side === "sent" ? "items-end" : "items-start"}`}
    >
      <div
        className={cn("rounded-2xl px-3 py-2 w-64", BUBBLE_THEMES[theme].edit)}
      >
        <textarea
          ref={ref}
          value={value}
          rows={1}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSave();
            }
            if (e.key === "Escape") onCancel();
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          className="w-full resize-none bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none leading-relaxed"
          style={{ height: "auto" }}
        />
      </div>
      <div className="flex gap-1.5 px-1">
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          className={cn(
            "h-7 rounded-full px-3 text-[11px]",
            BUBBLE_THEMES[theme].editButton,
          )}
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="h-7 rounded-full px-3 text-[11px] text-stone-500 hover:text-stone-700"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Action button icons ───────────────────────────────────────────────────────

function IconReply() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  );
}
function IconDelete() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function BubbleAction({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "size-7 rounded-full text-stone-500",
        danger
          ? "hover:bg-red-50 hover:text-red-600"
          : "hover:bg-stone-100 hover:text-stone-700",
      )}
    >
      {children}
    </Button>
  );
}

// ─── ChatGroup ────────────────────────────────────────────────────────────────

function ChatGroup({
  group,
  currentUserId,
  theme,
  showSenderName = false,
  isMessageRead,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
  editing,
  editInput,
  onEditInputChange,
  onSaveEdit,
  onCancelEdit,
  messageToGroup,
  flashGroupId,
  onJumped,
}: {
  group: MessageGroupData;
  currentUserId: string;
  theme: ThemeKey;
  showSenderName?: boolean;
  isMessageRead: (ts: number) => boolean;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onToggleReaction: (messageId: Id<"messages">, emoji: string) => void;
  editing: Editing | null;
  editInput: string;
  onEditInputChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  messageToGroup: Map<string, string>;
  flashGroupId: string | null;
  onJumped: (groupId: string) => void;
}) {
  const isOwn = group.senderId === currentUserId;
  const align = group.side === "sent" ? "end" : "start";

  // Inside MessageScrollerProvider, so the hooks are available here.
  const { scrollToMessage } = useMessageScroller();
  const { visibleMessageIds } = useMessageScrollerVisibility();

  function jumpToMessage(targetId: string) {
    // Scroller items are keyed by group id, so resolve the containing group.
    const groupId = messageToGroup.get(targetId);
    if (!groupId) return; // original was deleted/hidden — nothing to jump to

    // Already on screen → just flash it in place, don't move the reader.
    if (!visibleMessageIds.includes(groupId)) {
      scrollToMessage(groupId);
    }
    onJumped(groupId);
  }

  return (
    <>
      {group.showTimestamp && group.timestampLabel && (
        <div className="flex justify-center my-4">
          <div className="text-xs shadow-sm bg-yellow-100 rounded-full text-stone-800 text-center w-fit px-2 py-1 select-none">
            {group.timestampLabel}
          </div>
        </div>
      )}

      <MessageGroup
        className={cn(
          "gap-0.5 rounded-xl transition-colors duration-700",
          // Extra breathing room for groups split by a time pause. When the
          // pause is long enough to show the "x ago" divider, that divider's
          // own my-4 already provides the spacing.
          group.timeSeparated && !group.showTimestamp && "mt-3",
          // Brief highlight after jumping here from a reply.
          flashGroupId === group.id && "bg-amber-100/70",
        )}
      >
        {group.messages.map((msg, i) => {
          // Deleted (for me, or for everyone)
          if (msg.isDeleted) {
            return (
              <MessageRow
                key={msg.id}
                align={align}
                className="relative hover:z-20 focus-within:z-20"
              >
                <MessageContent className="w-full">
                  <DeletedBubble side={group.side} />
                </MessageContent>
              </MessageRow>
            );
          }
          // Being edited
          if (editing?.id === msg.id) {
            return (
              <MessageRow
                key={msg.id}
                align={align}
                className="relative hover:z-20 focus-within:z-20"
              >
                <MessageContent className="w-full">
                  <EditBubble
                    value={editInput}
                    onChange={onEditInputChange}
                    onSave={onSaveEdit}
                    onCancel={onCancelEdit}
                    side={group.side}
                    theme={theme}
                  />
                </MessageContent>
              </MessageRow>
            );
          }
          // Normal
          const isLast = i === group.messages.length - 1;
          const showName =
            showSenderName &&
            i === 0 &&
            group.side === "received" &&
            Boolean(group.senderName);

          return (
            <MessageRow
              key={msg.id}
              align={align}
              className="relative hover:z-20 focus-within:z-20"
            >
              <MessageContent className="w-full">
                {showName && (
                  <MessageHeader className="px-1 text-[11px] font-medium text-stone-400">
                    {group.senderName}
                  </MessageHeader>
                )}
                <ChatBubble
                  position={resolvePosition(i, group.messages.length)}
                  side={group.side}
                  theme={theme}
                  timestamp={msg.timestamp}
                  isEdited={msg.isEdited}
                  replyPreview={msg.replyToPreview}
                  isOwn={isOwn}
                  onReply={() => onReply(msg)}
                  onEdit={() => onEdit(msg)}
                  onDelete={() => onDelete(msg)}
                  onJumpToReply={
                    msg.replyToId
                      ? () => jumpToMessage(msg.replyToId as string)
                      : undefined
                  }
                  messageId={msg.id}
                  currentUserId={currentUserId}
                  onToggleReaction={(emoji) =>
                    onToggleReaction(msg.id as Id<"messages">, emoji)
                  }
                  isRead={
                    isLast && group.side === "sent"
                      ? isMessageRead(msg.timestamp)
                      : undefined
                  }
                >
                  {msg.content}
                </ChatBubble>
              </MessageContent>
            </MessageRow>
          );
        })}
      </MessageGroup>
    </>
  );
}

// ─── ReplyBar ─────────────────────────────────────────────────────────────────

function ReplyBar({
  replyingTo,
  currentUserId,
  theme,
  onCancel,
}: {
  replyingTo: ReplyingTo;
  currentUserId: string;
  theme: ThemeKey;
  onCancel: () => void;
}) {
  const isOwn = replyingTo.senderId === currentUserId;
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-stone-100 bg-stone-50/80">
      <div
        className={cn(
          "border-l-2 pl-2 flex-1 min-w-0",
          BUBBLE_THEMES[theme].accentBorder,
        )}
      >
        <p
          className={cn(
            "text-[11px] font-semibold mb-0.5",
            BUBBLE_THEMES[theme].accentText,
          )}
        >
          {isOwn
            ? "Replying to yourself"
            : `Replying to ${replyingTo.senderName}`}
        </p>
        <p className="text-xs text-stone-500 truncate">{replyingTo.content}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="size-6 shrink-0 rounded-full text-stone-400 hover:text-stone-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </Button>
    </div>
  );
}

// ─── ConversationPanel ────────────────────────────────────────────────────────

function ConversationPanel({
  conversationId,
  onBack,
  theme,
  onThemeChange,
}: {
  conversationId: Id<"conversations">;
  onBack: () => void;
  theme: ThemeKey;
  onThemeChange: (t: ThemeKey) => void;
}) {
  const currentUser = useQuery(api.users.currentUser);
  const conversationInfo = useQuery(api.conversations.getConversation, {
    conversationId,
  });
  const rawMessages = useQuery(api.messages.listMessages, { conversationId });
  const typingUsers = useQuery(api.messages.getTypingUsers, { conversationId });
  const readReceipts = useQuery(api.messages.getReadReceipts, {
    conversationId,
  });

  function isMessageRead(messageCreatedAt: number): boolean {
    if (!readReceipts?.length) return false;
    return readReceipts.every((r) => r.lastReadAt >= messageCreatedAt);
  }

  const sendMessage = useMutation(
    api.messages.sendMessage,
  ).withOptimisticUpdate((localStore, args) => {
    if (!currentUser) return;
    const existing = localStore.getQuery(api.messages.listMessages, {
      conversationId: args.conversationId,
    });
    if (existing === undefined) return;
    localStore.setQuery(
      api.messages.listMessages,
      { conversationId: args.conversationId },
      [
        ...existing,
        {
          _id: crypto.randomUUID() as Id<"messages">,
          _creationTime: args.createdAt,
          conversationId: args.conversationId,
          senderId: currentUser._id,
          content: args.content,
          type: "text" as const,
          createdAt: args.createdAt,
          senderName: currentUser.name ?? "You",
          senderImage: currentUser.image,
          replyToId: args.replyToId,
          replyToPreview: args.replyToPreview,
          replyToSenderName: undefined,
        },
      ],
    );
  });

  const editMessageMutation = useMutation(api.messages.editMessage);

  // "Delete for me" with an optimistic update: the message shows the
  // "Message removed" placeholder for ME instantly. Nothing changes for
  // the other participants.
  const deleteMessageMutation = useMutation(
    api.messages.deleteMessageForMe,
  ).withOptimisticUpdate((localStore, args) => {
    const existing = localStore.getQuery(api.messages.listMessages, {
      conversationId,
    });
    if (existing === undefined) return;
    localStore.setQuery(
      api.messages.listMessages,
      { conversationId },
      existing.map((m) =>
        m._id === args.messageId
          ? { ...m, content: "", isDeleted: true, replyToPreview: undefined }
          : m,
      ),
    );
  });

  const setTypingStatus = useMutation(api.messages.setTypingStatus);

  const toggleReaction = useMutation(
    api.reactions.toggleReaction,
  ).withOptimisticUpdate((localStore, { messageId, emoji }) => {
    if (!currentUser) return;
    const existing = localStore.getQuery(api.reactions.getReactions, {
      messageId,
    });
    if (existing === undefined) return;
    const mine = existing.find(
      (r) => r.userId === currentUser._id && r.emoji === emoji,
    );
    localStore.setQuery(
      api.reactions.getReactions,
      { messageId },
      mine
        ? existing.filter((r) => r._id !== mine._id)
        : [
            ...existing,
            {
              _id: crypto.randomUUID() as Id<"reactions">,
              _creationTime: Date.now(),
              messageId,
              userId: currentUser._id,
              emoji,
              createdAt: Date.now(),
            },
          ],
    );
  });

  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleTyping(value: string) {
    if (value.trim().length < 2) return;
    if (typingDebounce.current) clearTimeout(typingDebounce.current);
    typingDebounce.current = setTimeout(
      () => setTypingStatus({ conversationId }),
      300,
    );
  }

  const [now, setNow] = useState(() => Date.now());
  const activeTypingUsers =
    typingUsers?.filter((u) => now - u.updatedAt < 2000) ?? [];
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editInput, setEditInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  const messages: Message[] = (rawMessages ?? []).map((m) => ({
    id: m._id,
    content: m.content,
    senderId: m.senderId,
    senderName: m.senderName,
    timestamp: m.createdAt,
    isEdited: m.isEdited,
    isDeleted: m.isDeleted,
    replyToId: m.replyToId,
    replyToPreview: m.replyToPreview
      ? {
          content: m.replyToPreview.content,
          senderId: m.replyToPreview.senderId,
          senderName: m.replyToSenderName,
        }
      : null,
  }));

  const groups = currentUser ? groupMessages(messages, currentUser._id) : [];
  const isGroup = groups.some((g) => g.side === "received" && g.senderName);

  // Maps each message id to the id of its group (which is what the
  // scroller's items are keyed by), for reply-jump navigation.
  const messageToGroup = new Map<string, string>();
  for (const g of groups) {
    for (const m of g.messages) messageToGroup.set(m.id, g.id);
  }

  // Briefly highlight the group we jumped to.
  const [flashGroupId, setFlashGroupId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleJumped(groupId: string) {
    setFlashGroupId(groupId);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashGroupId(null), 1600);
  }

  // ── Reply ──
  function handleReply(msg: Message) {
    if (!currentUser) return;
    setReplyingTo({
      id: msg.id as Id<"messages">,
      content: msg.content,
      senderId: msg.senderId,
      senderName: msg.senderName ?? "Unknown",
    });
  }

  // ── Edit ──
  function handleEdit(msg: Message) {
    setEditing({ id: msg.id as Id<"messages">, original: msg.content });
    setEditInput(msg.content);
  }

  async function handleSaveEdit() {
    if (!editing || !editInput.trim()) return;
    const snap = editing;
    setEditing(null);
    await editMessageMutation({
      messageId: snap.id,
      content: editInput.trim(),
    });
  }

  function handleCancelEdit() {
    setEditing(null);
    setEditInput("");
  }

  // ── Delete (for me) ──
  function handleDelete(msg: Message) {
    setDeleteTarget(msg);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id as Id<"messages">;
    setDeleteTarget(null);
    await deleteMessageMutation({ messageId: id });
  }

  // ── Send ──
  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    const reply = replyingTo;
    setReplyingTo(null);
    try {
      await sendMessage({
        conversationId,
        content,
        createdAt: Date.now(),
        ...(reply
          ? {
              replyToId: reply.id,
              replyToPreview: {
                content: reply.content,
                senderId: reply.senderId as Id<"users">,
                type: "text",
              },
            }
          : {}),
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && replyingTo) setReplyingTo(null);
  }

  return (
    <div className="relative flex flex-col flex-1 h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-[0.04] bg-[url('/doodles.svg')] bg-repeat pointer-events-none" />

      {/* Mobile header: back button + conversation name (hidden on md+) */}
      <div className="relative z-10 flex items-center gap-1 border-b border-stone-200 bg-white/90 px-2 py-2 backdrop-blur-sm md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to conversations"
          className="size-9 shrink-0 rounded-full text-stone-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
        {conversationInfo?.image ? (
          <img
            src={conversationInfo.image}
            alt={conversationInfo.name}
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-300 text-sm font-medium text-black">
            {conversationInfo?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <span className="ml-1.5 min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
          {conversationInfo?.name ?? ""}
        </span>
        <ThemePicker theme={theme} onChange={onThemeChange} />
      </div>

      {/* Desktop theme picker, floating in the top-right of the panel */}
      <div className="absolute right-3 top-3 z-30 hidden md:block">
        <ThemePicker theme={theme} onChange={onThemeChange} />
      </div>

      {/* Messages — shadcn MessageScroller owns the scroll behavior */}
      <div className="relative z-10 flex-1 min-h-0">
        {rawMessages === undefined ? (
          <div className="flex h-full items-center justify-center text-stone-400 text-sm">
            Loading…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">No messages yet. Say hi!</p>
          </div>
        ) : (
          <MessageScrollerProvider autoScroll defaultScrollPosition="end">
            <MessageScroller className="h-full">
              <MessageScrollerViewport className="px-4 py-4">
                <MessageScrollerContent className="flex flex-col gap-1">
                  {groups.map((group) => (
                    <MessageScrollerItem
                      key={group.id}
                      messageId={group.id}
                      // The styled item ships content-visibility/containment
                      // for perf, but paint containment clips our hover
                      // toolbar and the overlapping reaction chips. Disable
                      // it so floating UI can escape the row's box.
                      className="relative overflow-visible [contain:none] [content-visibility:visible] hover:z-30 focus-within:z-30"
                    >
                      <ChatGroup
                        group={group}
                        currentUserId={currentUser?._id ?? ""}
                        theme={theme}
                        showSenderName={isGroup}
                        isMessageRead={isMessageRead}
                        onReply={handleReply}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleReaction={(messageId, emoji) =>
                          toggleReaction({ messageId, emoji })
                        }
                        editing={editing}
                        editInput={editInput}
                        onEditInputChange={setEditInput}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        messageToGroup={messageToGroup}
                        flashGroupId={flashGroupId}
                        onJumped={handleJumped}
                      />
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>

      {/* Typing indicator */}
      <div className="h-8 px-4 ml-2 mb-2 flex items-center">
        <AnimatePresence>
          {activeTypingUsers.length > 0 && (
            <motion.div
              className="relative flex gap-1.25 items-center px-3 py-2 rounded-2xl rounded-bl-sm bg-amber-50 shadow-sm"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block size-1 rounded-full bg-stone-500"
                  animate={{ y: [0, -4, 0] }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="relative z-10 border-t border-stone-200 bg-white/80 backdrop-blur-sm">
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <ReplyBar
                replyingTo={replyingTo}
                currentUserId={currentUser?._id ?? ""}
                theme={theme}
                onCancel={() => setReplyingTo(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-4 pb-3 pt-2">
          <div className="relative flex items-end rounded-2xl bg-stone-100 focus-within:ring-2 focus-within:ring-stone-300">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleTyping(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              className="flex-1 resize-none bg-transparent px-4 py-3 pr-14 text-base md:text-sm placeholder:text-stone-400 focus:outline-none max-h-32 leading-relaxed"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="absolute bottom-2 right-2 size-9 shrink-0 rounded-full bg-black text-white hover:bg-black/90 disabled:opacity-40"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 256 256"
                fill="currentColor"
              >
                <path d="M231.87,114l-168-95.89A16,16,0,0,0,40.92,37.34L71.55,128,40.92,218.67A16,16,0,0,0,56,240a16.15,16.15,0,0,0,7.93-2.1l167.92-96.05a16,16,0,0,0,.05-27.89ZM56,224a.56.56,0,0,0,0-.12L85.74,136H144a8,8,0,0,0,0-16H85.74L56.06,32.16A.46.46,0,0,0,56,32l168,95.83Z" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Delete-message confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this? It will only be removed for
              you — the other person will still see it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete for me
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── ConversationContainer ────────────────────────────────────────────────────

export default function ConversationContainer() {
  const { signOut } = useAuthActions();
  const [selectedId, setSelectedId] = useState<
    Id<"conversations"> | undefined
  >();

  const [theme, setTheme] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem("bubble-theme");
      if (saved && saved in BUBBLE_THEMES) return saved as ThemeKey;
    } catch {
      // localStorage unavailable (private mode, SSR) — fall through
    }
    return "emerald";
  });
  useEffect(() => {
    try {
      localStorage.setItem("bubble-theme", theme);
    } catch {
      // best effort only
    }
  }, [theme]);

  return (
    // h-dvh instead of h-screen: tracks the real visible height on mobile
    // browsers, where the URL bar collapses/expands.
    <div className="flex h-dvh w-full overflow-hidden bg-stone-50">
      {/* Sidebar: full-screen on mobile, hidden there once a chat is open */}
      <div
        className={cn(
          "w-full md:w-80 shrink-0 border-r border-stone-200 bg-white flex-col",
          selectedId ? "hidden md:flex" : "flex",
        )}
      >
        <ConversationList onSelect={setSelectedId} selectedId={selectedId} />
        <div className="mt-auto border-t border-stone-100 p-3">
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            </svg>
            Sign out
          </button>
        </div>
      </div>

      {/* Panel: full-screen on mobile when a chat is open */}
      <div
        className={cn(
          "flex-1 flex-col min-w-0",
          selectedId ? "flex" : "hidden md:flex",
        )}
      >
        {selectedId ? (
          <ConversationPanel
            key={selectedId}
            conversationId={selectedId}
            onBack={() => setSelectedId(undefined)}
            theme={theme}
            onThemeChange={setTheme}
          />
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-stone-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">Select a conversation to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
