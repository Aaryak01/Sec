"""Conversation history storage.

This uses SQLite for local development. To swap to DynamoDB (or any other
backend) for deployment, reimplement this same interface — save_conversation,
get_conversations, get_conversation_messages, delete_conversation,
enforce_limit — using boto3/DynamoDB calls. app.py only ever calls these
five functions and never touches SQL directly, so it requires no changes
when the backend is swapped.
"""

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent / "chat_history.db"
DEFAULT_MAX_CONVERSATIONS = 5


class ChatStorage:
    """SQLite-backed implementation of the conversation storage interface."""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY NOT NULL,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    messages TEXT NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_conversations_user "
                "ON conversations (user_id, updated_at DESC)"
            )

    def save_conversation(self, user_id: str, conversation_id: str, title: str, messages: list) -> None:
        """Creates or overwrites a conversation, then enforces the per-user cap."""
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO conversations (id, user_id, title, messages, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    messages = excluded.messages,
                    updated_at = excluded.updated_at
                """,
                (conversation_id, user_id, title, json.dumps(messages), time.time()),
            )
        self.enforce_limit(user_id)

    def get_conversations(self, user_id: str) -> list:
        """Returns [{id, title, updated_at}, ...] for this user, newest first."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, title, updated_at FROM conversations "
                "WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC",
                (user_id,),
            ).fetchall()
        return [{"id": r["id"], "title": r["title"], "updated_at": r["updated_at"]} for r in rows]

    def get_conversation_messages(self, user_id: str, conversation_id: str) -> list:
        """Returns the full stored message list, or [] if not found."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT messages FROM conversations WHERE user_id = ? AND id = ?",
                (user_id, conversation_id),
            ).fetchone()
        return json.loads(row["messages"]) if row else []

    def delete_conversation(self, user_id: str, conversation_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM conversations WHERE user_id = ? AND id = ?",
                (user_id, conversation_id),
            )

    def enforce_limit(self, user_id: str, max: int = DEFAULT_MAX_CONVERSATIONS) -> None:
        """Deletes the oldest conversations for this user beyond `max`."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id FROM conversations WHERE user_id = ? "
                "ORDER BY updated_at DESC, rowid DESC",
                (user_id,),
            ).fetchall()
            stale_ids = [r["id"] for r in rows[max:]]
            if stale_ids:
                conn.executemany(
                    "DELETE FROM conversations WHERE id = ?", [(i,) for i in stale_ids]
                )


_default_storage = ChatStorage()


def save_conversation(user_id: str, conversation_id: str, title: str, messages: list) -> None:
    _default_storage.save_conversation(user_id, conversation_id, title, messages)


def get_conversations(user_id: str) -> list:
    return _default_storage.get_conversations(user_id)


def get_conversation_messages(user_id: str, conversation_id: str) -> list:
    return _default_storage.get_conversation_messages(user_id, conversation_id)


def delete_conversation(user_id: str, conversation_id: str) -> None:
    _default_storage.delete_conversation(user_id, conversation_id)


def enforce_limit(user_id: str, max: int = DEFAULT_MAX_CONVERSATIONS) -> None:
    _default_storage.enforce_limit(user_id, max)
