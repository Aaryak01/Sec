// Thin client for the FastAPI backend built in api.py (see the "sec chatbot"
// Python folder). Mirrors its Pydantic models exactly — see ChatResponse /
// SourceInfo in api.py — rather than inventing a different shape here.

export type ChatSource = {
  company: string | null;
  form: string | null;
  date: string | null;
  section: string | null;
  raw: string;
};

export type ChatApiResponse = {
  response: string;
  chart: string | null; // base64 PNG, no data: prefix
  sources: ChatSource[] | null;
};

export type HistoryTurn = { role: "user" | "assistant"; content: string };

// Local dev default. Override via NEXT_PUBLIC_API_URL once there's a real
// deployed backend — matches the TODO already in api.py's CORS config on
// the other side of this same local/deployed split.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function sendChatMessage(
  message: string,
  conversationHistory: HistoryTurn[],
): Promise<ChatApiResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
    }),
  });
  if (!res.ok) {
    throw new Error(`Chat API returned ${res.status}`);
  }
  return res.json();
}

// --- Conversation persistence (DynamoDB-backed, api.py's /conversations) ---
// Every call here requires the caller's Cognito access token (fetched via
// fetchAuthSession() in ChatInterface.tsx) — api.py's get_current_user_id
// dependency rejects anything else with a 401.

export type ConversationSummary = {
  id: string;
  title: string;
  updated_at: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: HistoryTurn[];
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function listConversations(
  token: string,
): Promise<ConversationSummary[]> {
  const res = await fetch(`${API_URL}/conversations`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Failed to list conversations: ${res.status}`);
  }
  return res.json();
}

export async function getConversation(
  token: string,
  conversationId: string,
): Promise<ConversationDetail> {
  const res = await fetch(`${API_URL}/conversations/${conversationId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Failed to load conversation: ${res.status}`);
  }
  return res.json();
}

export async function saveConversation(
  token: string,
  conversationId: string,
  title: string,
  messages: HistoryTurn[],
): Promise<void> {
  const res = await fetch(`${API_URL}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({
      conversation_id: conversationId,
      title,
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save conversation: ${res.status}`);
  }
}

export async function deleteConversation(
  token: string,
  conversationId: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/conversations/${conversationId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete conversation: ${res.status}`);
  }
}
