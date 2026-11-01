"""Real-time classroom pub/sub hub."""

from app.websocket.manager import ClassroomHub, get_hub

__all__ = ["ClassroomHub", "get_hub"]
