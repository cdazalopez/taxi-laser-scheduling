import "server-only";

const BASE = "https://services.leadconnectorhq.com";

function headers() {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("Missing GHL_API_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Returns the contact's current assigned GHL user id (empty string if unassigned). */
export async function getContactAssignedTo(contactId: string): Promise<string> {
  const res = await fetch(`${BASE}/contacts/${contactId}`, { headers: headers() });
  if (!res.ok) throw new Error(`GHL get contact failed ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.contact?.assignedTo || "";
}

/** Assign a contact to a GHL user (sets the contact owner → routes the conversation). */
export async function assignContact(contactId: string, ghlUserId: string): Promise<void> {
  const res = await fetch(`${BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ assignedTo: ghlUserId }),
  });
  if (!res.ok) throw new Error(`GHL assign failed ${res.status}: ${await res.text()}`);
}

export interface ConvState {
  conversationId: string | null;
  lastDirection: string | null; // 'inbound' (client) | 'outbound' (dispatcher)
  lastDate: number | null; // epoch ms
  lastBody: string | null; // text of the last message
  unreadCount: number; // unread messages (0 = dispatcher has read it)
}

/** Latest conversation state for a contact (to detect if the dispatcher replied). */
export async function getContactConversation(contactId: string): Promise<ConvState> {
  const loc = process.env.GHL_LOCATION_ID;
  const res = await fetch(
    `${BASE}/conversations/search?locationId=${loc}&contactId=${contactId}`,
    { headers: { ...headers(), Version: "2021-04-15" } }
  );
  if (!res.ok) throw new Error(`GHL conv search ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const c = (body.conversations ?? [])[0];
  if (!c) return { conversationId: null, lastDirection: null, lastDate: null, lastBody: null, unreadCount: 0 };
  return { conversationId: c.id ?? null, lastDirection: c.lastMessageDirection ?? null, lastDate: c.lastMessageDate ?? null, lastBody: c.lastMessageBody ?? null, unreadCount: c.unreadCount ?? 0 };
}

/** Add tags to a contact (used to flag conversations with no active dispatcher). */
export async function addContactTags(contactId: string, tags: string[]): Promise<void> {
  const res = await fetch(`${BASE}/contacts/${contactId}/tags`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error(`GHL add tags failed ${res.status}: ${await res.text()}`);
}
