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

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

interface MessageGroup {
  id: string;
  senderId: string;
  senderName?: string;
  side: "sent" | "received";
  messages: Message[];
  showTimestamp: boolean;
  timestampLabel?: string;
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
): MessageGroup[] {
  if (!messages.length) return [];
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const groups: MessageGroup[] = [];
  let current: MessageGroup | null = null;

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
      };
      groups.push(current);
    }
    current.messages.push(msg);
  }
  return groups;
}

// ─── Styling ──────────────────────────────────────────────────────────────────

const chatBubbleBase = tv({
  base: [
    "w-fit py-1 px-3 text-sm shadow-sm leading-relaxed break-words",
    "[--r:0.6rem]",
    "[--r-soft:3px]",
  ],
  variants: {
    position: { first: "", middle: "", last: "", solo: "" },
    side: { sent: "self-end", received: "self-start" },
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

const darkBubble = tv({
  extend: chatBubbleBase,
  base: "bg-emerald-600 text-white",
});
const lightBubble = tv({
  extend: chatBubbleBase,
  base: "bg-gray-500 text-white",
});

type BubbleVariants = VariantProps<typeof chatBubbleBase>;
type BubbleTheme = (v: BubbleVariants & { class?: string }) => string;

const chatGroupClasses = tv({
  slots: {
    root: "flex flex-col",
    bubbles: "flex flex-col gap-0.5",
    label: "text-[11px] text-stone-400 font-medium px-1 mb-0.5",
    divider:
      "text-xs shadow-sm bg-yellow-100 rounded-full text-stone-800 text-center w-fit px-2 py-1 select-none",
  },
  variants: {
    side: {
      sent: { root: "items-end", label: "text-right" },
      received: { root: "items-start", label: "text-left" },
    },
  },
  defaultVariants: { side: "sent" },
});

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
}: {
  replyPreview: NonNullable<Message["replyToPreview"]>;
  side: "sent" | "received";
}) {
  // A lighter tint of the bubble's own colour, so the quote reads as nested.
  const tint =
    side === "sent"
      ? "bg-emerald-500/70 border-emerald-200/80"
      : "bg-gray-400/70 border-gray-200/80";
  return (
    <div
      className={cn(
        "mb-1.5 max-w-[220px] rounded-md border-l-2 px-2 py-1",
        tint,
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

/** Count-chips shown under a bubble; tap to toggle your own reaction. */
function MessageReactions({
  messageId,
  side,
  currentUserId,
  onToggle,
}: {
  messageId: string;
  side: "sent" | "received";
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
    <div
      className={cn(
        "mt-1 flex flex-wrap gap-1",
        side === "sent" ? "justify-end" : "justify-start",
      )}
    >
      {[...grouped.entries()].map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none transition-colors",
            mine
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
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

/** Normal chat bubble */
function ChatBubble({
  children,
  position,
  side,
  theme = darkBubble,
  className,
  isRead,
  isEdited,
  timestamp,
  replyPreview,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  messageId,
  currentUserId,
  onToggleReaction,
}: {
  children: React.ReactNode;
  theme?: BubbleTheme;
  className?: string;
  isRead?: boolean;
  isEdited?: boolean;
  timestamp: number;
  replyPreview?: Message["replyToPreview"];
  isOwn?: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  messageId: string;
  currentUserId: string;
  onToggleReaction?: (emoji: string) => void;
} & BubbleVariants) {
  const showMeta = position === "last" || position === "solo";
  const showChecks = side === "sent" && isRead !== undefined;
  const bubbleSide = side ?? "sent";
  const canReact = Boolean(onToggleReaction);
  const hasActions =
    canReact || Boolean(onReply || (isOwn && (onEdit || onDelete)));

  return (
    <div
      className={cn(
        "relative flex flex-col group/msg",
        bubbleSide === "sent" ? "items-end" : "items-start",
      )}
    >
      {/* Coloured message bubble */}
      <div className={theme({ position, side, class: className })}>
        {replyPreview && (
          <BubbleReplyPreview replyPreview={replyPreview} side={bubbleSide} />
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
      </div>

      {/* Committed reactions, shown under the bubble */}
      {onToggleReaction && (
        <MessageReactions
          messageId={messageId}
          side={bubbleSide}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}

      {/* Hover toolbar: quick reactions + actions. top-full sits flush at the
          unit's bottom edge; the pt-2 padding is a transparent "bridge" so the
          pointer never leaves the hover surface on the way to the buttons. */}
      {hasActions && (
        <div
          className={cn(
            "absolute top-full z-20 flex pt-2",
            "opacity-0 pointer-events-none transition-opacity duration-150",
            "group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto",
            "focus-within:opacity-100 focus-within:pointer-events-auto",
            bubbleSide === "sent" ? "right-1" : "left-1",
          )}
        >
          <div className="flex translate-y-1 items-center gap-0.5 rounded-full border border-stone-200 bg-white p-0.5 shadow-sm transition-transform duration-150 group-hover/msg:translate-y-0">
            {canReact &&
              QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction?.(emoji)}
                  aria-label={`React with ${emoji}`}
                  className="flex size-7 items-center justify-center rounded-full text-[15px] leading-none transition-transform hover:scale-110 hover:bg-stone-100"
                >
                  {emoji}
                </button>
              ))}

            {canReact && (onReply || (isOwn && (onEdit || onDelete))) && (
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
            {isOwn && onDelete && (
              <BubbleAction label="Delete" onClick={onDelete} danger>
                <IconDelete />
              </BubbleAction>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Placeholder shown in place of a deleted message */
function DeletedBubble({ side }: { side: "sent" | "received" }) {
  return (
    <div
      className={`flex ${side === "sent" ? "justify-end" : "justify-start"}`}
    >
      <div className="flex items-center gap-1.5 text-xs italic text-stone-400 border border-stone-200 rounded-2xl px-3 py-1.5 bg-stone-50 select-none">
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
      </div>
    </div>
  );
}

/** Inline edit form replacing the bubble */
function EditBubble({
  value,
  onChange,
  onSave,
  onCancel,
  side,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  side: "sent" | "received";
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
      <div className="rounded-2xl bg-emerald-600 px-3 py-2 w-64">
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
          className="h-7 rounded-full bg-emerald-600 px-3 text-[11px] hover:bg-emerald-700"
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
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <Button
            {...props}
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClick}
            aria-label={label}
            className={cn(
              "size-7 rounded-full text-stone-500",
              danger
                ? "hover:bg-red-50 hover:text-red-600"
                : "hover:bg-stone-100 hover:text-stone-700",
            )}
          >
            {children}
          </Button>
        )}
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

// ─── ChatGroup ────────────────────────────────────────────────────────────────

function ChatGroup({
  group,
  currentUserId,
  sentTheme = darkBubble,
  receivedTheme = lightBubble,
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
}: {
  group: MessageGroup;
  currentUserId: string;
  sentTheme?: BubbleTheme;
  receivedTheme?: BubbleTheme;
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
}) {
  const { root, bubbles, label, divider } = chatGroupClasses({
    side: group.side,
  });
  const theme = group.side === "sent" ? sentTheme : receivedTheme;
  const isOwn = group.senderId === currentUserId;

  return (
    <>
      {group.showTimestamp && group.timestampLabel && (
        <div className="flex justify-center my-2">
          <div className={divider()}>{group.timestampLabel}</div>
        </div>
      )}

      <div className={root()}>
        {showSenderName && group.senderName && group.side === "received" && (
          <span className={label()}>{group.senderName}</span>
        )}
        <div className={bubbles()}>
          {group.messages.map((msg, i) => {
            // Deleted
            if (msg.isDeleted) {
              return <DeletedBubble key={msg.id} side={group.side} />;
            }
            // Being edited
            if (editing?.id === msg.id) {
              return (
                <EditBubble
                  key={msg.id}
                  value={editInput}
                  onChange={onEditInputChange}
                  onSave={onSaveEdit}
                  onCancel={onCancelEdit}
                  side={group.side}
                />
              );
            }
            // Normal
            const isLast = i === group.messages.length - 1;
            return (
              <ChatBubble
                key={msg.id}
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
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── ReplyBar ─────────────────────────────────────────────────────────────────

function ReplyBar({
  replyingTo,
  currentUserId,
  onCancel,
}: {
  replyingTo: ReplyingTo;
  currentUserId: string;
  onCancel: () => void;
}) {
  const isOwn = replyingTo.senderId === currentUserId;
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-stone-100 bg-stone-50/80">
      <div className="border-l-2 border-emerald-500 pl-2 flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-emerald-600 mb-0.5">
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
}: {
  conversationId: Id<"conversations">;
}) {
  const currentUser = useQuery(api.users.currentUser);
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
  const deleteMessageMutation = useMutation(api.messages.deleteMessage);
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rawMessages]);
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

  // ── Delete ──
  async function handleDelete(msg: Message) {
    await deleteMessageMutation({ messageId: msg.id as Id<"messages"> });
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
    <TooltipProvider>
      <div className="relative flex flex-col flex-1 h-full min-h-0 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-[0.04] bg-[url('/doodles.svg')] bg-repeat pointer-events-none" />

        {/* Messages */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
          {rawMessages === undefined ? (
            <div className="flex items-center justify-center flex-1 text-stone-400 text-sm">
              Loading…
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-stone-400">
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
            groups.map((group) => (
              <ChatGroup
                key={group.id}
                group={group}
                currentUserId={currentUser?._id ?? ""}
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
              />
            ))
          )}
          <div ref={bottomRef} />
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
                className="flex-1 resize-none bg-transparent px-4 py-3 pr-14 text-sm placeholder:text-stone-400 focus:outline-none max-h-32 leading-relaxed"
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
      </div>
    </TooltipProvider>
  );
}

// ─── ConversationContainer ────────────────────────────────────────────────────

export default function ConversationContainer() {
  const { signOut } = useAuthActions();
  const [selectedId, setSelectedId] = useState<
    Id<"conversations"> | undefined
  >();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50">
      <div className="w-80 shrink-0 border-r border-stone-200 bg-white flex flex-col">
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

      <div className="flex flex-1 flex-col min-w-0">
        {selectedId ? (
          <ConversationPanel key={selectedId} conversationId={selectedId} />
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
