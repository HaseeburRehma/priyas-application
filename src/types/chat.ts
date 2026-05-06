export type ChannelKind = "channel" | "direct" | "group";

export type Channel = {
  id: string;
  org_id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  is_direct: boolean;
  is_private?: boolean;
  kind?: ChannelKind;
  created_by: string | null;
  created_at: string;
  last_read_at: string | null;
  unread_count?: number;
  /** For DMs: the other participant's profile id (for presence dots). */
  counterpart_id?: string | null;
  last_message?: {
    body: string;
    created_at: string;
    user_id: string;
  } | null;
};

export type ReactionAggregate = {
  emoji: string;
  count: number;
  /** True when the current user is in the reactors list. */
  reacted_by_me: boolean;
};

/**
 * One attachment as stored in the chat_messages.attachments JSONB array.
 * `path` is the Storage object path (private bucket); the renderer signs
 * URLs lazily for display.
 */
export type ChatAttachment = {
  kind: "image" | "audio" | "file";
  path: string;
  name: string;
  mime: string;
  size: number;
  /** For audio attachments — duration in seconds, when known. */
  duration?: number;
};

export type Message = {
  id: string;
  org_id: string;
  channel_id: string;
  user_id: string;
  body: string;
  attachments: ChatAttachment[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Joined sender info (filled by the page layer). */
  sender?: { full_name: string | null; avatar_url: string | null } | null;
};
