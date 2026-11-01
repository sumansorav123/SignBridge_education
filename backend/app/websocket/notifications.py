from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NotificationSubscriber:
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[dict[str, Any]]


class NotificationHub:
    """Best-effort per-user WebSocket events; REST remains the source of truth."""

    def __init__(self) -> None:
        self._subscribers: dict[int, set[NotificationSubscriber]] = {}
        self._lock = threading.Lock()

    def subscribe(self, user_id: int) -> NotificationSubscriber:
        subscriber = NotificationSubscriber(
            loop=asyncio.get_running_loop(),
            queue=asyncio.Queue(maxsize=64),
        )
        with self._lock:
            self._subscribers.setdefault(user_id, set()).add(subscriber)
        return subscriber

    def unsubscribe(self, user_id: int, subscriber: NotificationSubscriber) -> None:
        with self._lock:
            connections = self._subscribers.get(user_id)
            if connections is None:
                return
            connections.discard(subscriber)
            if not connections:
                self._subscribers.pop(user_id, None)

    def publish(self, user_id: int, event: dict[str, Any]) -> None:
        with self._lock:
            subscribers = tuple(self._subscribers.get(user_id, ()))
        for subscriber in subscribers:
            try:
                subscriber.loop.call_soon_threadsafe(
                    self._enqueue, subscriber.queue, event
                )
            except RuntimeError:
                logger.debug("Notification event loop has already stopped")

    @staticmethod
    def _enqueue(queue: asyncio.Queue[dict[str, Any]], event: dict[str, Any]) -> None:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("Join notification queue is full; REST refresh will recover state")


_notification_hub: NotificationHub | None = None


def get_notification_hub() -> NotificationHub:
    global _notification_hub
    if _notification_hub is None:
        _notification_hub = NotificationHub()
    return _notification_hub
