from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class Participant:
    connection_id: str
    user_id: int
    role: str
    full_name: str
    websocket: WebSocket
    language: str = "en"
    original_language: str = "en"
    mode: str = "normal"
    sign_language: str = "isl"
    avatar_enabled: bool = True
    show_original: bool = False
    audio_enabled: bool = False
    video_enabled: bool = False
    joined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def public(self) -> dict[str, Any]:
        return {
            "connection_id": self.connection_id,
            "user_id": self.user_id,
            "full_name": self.full_name,
            "role": self.role,
            "mode": self.mode,
            "language": self.language,
            "sign_language": self.sign_language,
            "avatar_enabled": self.avatar_enabled,
            "audio_enabled": self.audio_enabled,
            "video_enabled": self.video_enabled,
        }


class ClassroomHub:
    def __init__(self) -> None:
        self._rooms: dict[int, dict[str, Participant]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, classroom_id: int, participant: Participant) -> None:
        async with self._lock:
            self._rooms.setdefault(classroom_id, {})[participant.connection_id] = participant

    async def disconnect(self, classroom_id: int, connection_id: str) -> Participant | None:
        async with self._lock:
            room = self._rooms.get(classroom_id)
            if not room:
                return None
            participant = room.pop(connection_id, None)
            if not room:
                self._rooms.pop(classroom_id, None)
            return participant

    def participants(self, classroom_id: int) -> list[Participant]:
        return list(self._rooms.get(classroom_id, {}).values())

    def connection_count(self, classroom_id: int) -> int:
        return len(self._rooms.get(classroom_id, {}))

    def participant_by_connection(self, classroom_id: int, connection_id: str) -> Participant | None:
        return self._rooms.get(classroom_id, {}).get(connection_id)

    def participant_by_user(self, classroom_id: int, user_id: int) -> list[Participant]:
        return [p for p in self.participants(classroom_id) if p.user_id == user_id]

    async def send(self, participant: Participant, message: dict[str, Any]) -> bool:
        try:
            await participant.websocket.send_json(message)
            return True
        except Exception:
            logger.debug("Failed to send message to %s", participant.user_id, exc_info=True)
            return False

    async def send_to_user(
        self,
        classroom_id: int,
        user_id: int,
        message: dict[str, Any],
        *,
        role: str | None = None,
    ) -> int:
        sent = 0
        for participant in self.participant_by_user(classroom_id, user_id):
            if role and participant.role != role:
                continue
            if await self.send(participant, message):
                sent += 1
        return sent

    async def broadcast(
        self,
        classroom_id: int,
        message: dict[str, Any],
        *,
        exclude_connection: str | None = None,
        roles: set[str] | None = None,
    ) -> int:
        sent = 0
        for participant in self.participants(classroom_id):
            if exclude_connection and participant.connection_id == exclude_connection:
                continue
            if roles and participant.role not in roles:
                continue
            if await self.send(participant, message):
                sent += 1
        return sent

    async def broadcast_presence(self, classroom_id: int) -> None:
        people = [participant.public() for participant in self.participants(classroom_id)]
        await self.broadcast(
            classroom_id,
            {
                "type": "presence",
                "participants": people,
                "count": len(people),
            },
        )

    async def close_room(self, classroom_id: int, reason: str) -> None:
        await self.broadcast(classroom_id, {"type": "class-ended", "reason": reason})
        async with self._lock:
            room = self._rooms.get(classroom_id)
            if room:
                for participant in list(room.values()):
                    try:
                        await participant.websocket.close(code=1000)
                    except Exception:
                        pass
                self._rooms.pop(classroom_id, None)


_hub: ClassroomHub | None = None


def get_hub() -> ClassroomHub:
    global _hub
    if _hub is None:
        _hub = ClassroomHub()
    return _hub


def new_connection_id() -> str:
    return uuid.uuid4().hex
