import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

import type { Id } from "../../convex/_generated/dataModel";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  onSelect: (conversationId: Id<"conversations">) => void;
  selectedId?: Id<"conversations">;
};

export default function ConversationList({ onSelect, selectedId }: Props) {
  const conversations = useQuery(api.conversations.listConversations);
  const users = useQuery(api.users.getUsers);
  const createConversation = useMutation(api.conversations.createConversation);
  const markConversationAsRead = useMutation(
    api.messages.markConversationAsRead,
  );

  useEffect(() => {
    if (!selectedId || !conversations) return;

    const selectedConversation = conversations.find(
      (c) => c._id === selectedId,
    );

    if (!selectedConversation) return;

    const hasUnread =
      selectedConversation.lastMessageAt &&
      (!selectedConversation.lastReadAt ||
        selectedConversation.lastMessageAt > selectedConversation.lastReadAt);

    if (hasUnread) {
      markConversationAsRead({
        conversationId: selectedId,
      });
    }
  }, [selectedId, conversations, markConversationAsRead]);

  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Id<"users">[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const isGroup = selectedUsers.length > 1;

  const filteredUsers = users?.filter((u) =>
    u.name?.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleUser(userId: Id<"users">) {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  async function handleCreate() {
    if (selectedUsers.length === 0) return;
    setCreating(true);
    try {
      const conversationId = await createConversation({
        type: isGroup ? "group" : "dm",
        participantIds: selectedUsers,
        title: isGroup ? groupTitle || "New Group" : undefined,
      });
      onSelect(conversationId);
      handleClose();
    } finally {
      setCreating(false);
    }
  }

  function handleClose() {
    setShowModal(false);
    setSearch("");
    setSelectedUsers([]);
    setGroupTitle("");
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800">Messages</h2>
          <Button
            size="icon"
            onClick={() => setShowModal(true)}
            aria-label="New conversation"
            className="size-8 rounded-full bg-stone-800 hover:bg-stone-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </Button>
        </div>

        {/* List */}
        {conversations === undefined ? (
          <div className="flex flex-col gap-1 p-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-stone-400 p-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              className="lucide lucide-message-square-icon lucide-message-square"
            >
              <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">No conversations yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-3 overflow-y-auto">
            {conversations.map((conversation) => {
              if (!conversation) return null;
              const isDm = conversation.type === "dm";
              const name = isDm
                ? (conversation.otherUser?.name ?? "Unknown User")
                : (conversation.title ?? "Unnamed Group");
              const image = isDm
                ? conversation.otherUser?.image
                : conversation.image;
              const isSelected = selectedId === conversation._id;
              const hasUnread =
                conversation.lastMessageAt &&
                (!conversation.lastReadAt ||
                  conversation.lastMessageAt > conversation.lastReadAt);

              return (
                <button
                  key={conversation._id}
                  onClick={() => onSelect(conversation._id)}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left transition-colors w-full
                    ${isSelected ? "bg-gray-200 text-black" : "hover:bg-gray-100 text-black"}`}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-11 w-11">
                      {image && (
                        <AvatarImage
                          src={image}
                          alt={name}
                          className="object-cover"
                        />
                      )}
                      <AvatarFallback className="bg-stone-300 text-black">
                        {isDm ? (
                          <span className="text-sm font-medium">
                            {name[0]?.toUpperCase()}
                          </span>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <path d="M16 3.128a4 4 0 0 1 0 7.744" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <circle cx="9" cy="7" r="4" />
                          </svg>
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {hasUnread && (
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {name}
                      </span>
                      {conversation.lastMessageAt && (
                        <span
                          className={`text-xs shrink-0 ${isSelected ? "text-stone-800" : "text-stone-800"}`}
                        >
                          {formatTime(conversation.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    {conversation.lastMessagePreview && (
                      <p
                        className={`text-xs truncate mt-0.5 ${isSelected ? "text-stone-600" : "text-stone-900"}`}
                      >
                        {conversation.lastMessagePreview}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => (open ? setShowModal(true) : handleClose())}
      >
        <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-stone-100 px-4 py-3 text-left">
            <DialogTitle className="text-stone-800">
              New Conversation
            </DialogTitle>
          </DialogHeader>

          {/* Group title input (shown when multiple selected) */}
          {isGroup && (
            <div className="px-4 pt-3">
              <Input
                placeholder="Group name (optional)"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
              />
            </div>
          )}

          {/* Search */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 rounded-lg bg-stone-100 px-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-stone-400"
              >
                <path d="m21 21-4.34-4.34" />
                <circle cx="11" cy="11" r="8" />
              </svg>
              <Input
                placeholder="Search people..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="border-0 bg-transparent px-0 text-stone-800 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* User list */}
          <div className="max-h-64 overflow-y-auto px-2 pb-2">
            {filteredUsers?.map((user) => {
              const isSelected = selectedUsers.includes(user._id);
              return (
                <button
                  key={user._id}
                  onClick={() => toggleUser(user._id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                    isSelected
                      ? "bg-stone-800 text-white"
                      : "text-stone-800 hover:bg-stone-100",
                  )}
                >
                  <Avatar className="h-9 w-9">
                    {user.image && (
                      <AvatarImage
                        src={user.image}
                        alt={user.name ?? ""}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-stone-300 text-stone-600">
                      {user.name?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">
                    {user.name}
                  </span>
                  {isSelected && (
                    <div className="ml-auto flex size-5 items-center justify-center rounded-full bg-white">
                      <div className="size-2.5 rounded-full bg-stone-800" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-stone-100 px-4 py-3">
            <Button
              onClick={handleCreate}
              disabled={selectedUsers.length === 0 || creating}
              className="w-full rounded-xl bg-stone-800 hover:bg-stone-700"
            >
              {creating
                ? "Creating..."
                : isGroup
                  ? `Create Group (${selectedUsers.length})`
                  : "Start Conversation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
