import json
import logging
from uuid import UUID, uuid4

import httpx

REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls"
REALTIME_REQUEST_TIMEOUT_SECONDS = 30.0
logger = logging.getLogger(__name__)


class RealtimeInitializationError(Exception):
    pass


def build_realtime_session(instructions: str, model: str) -> dict[str, object]:
    return {
        "type": "realtime",
        "model": model,
        "instructions": instructions,
        "output_modalities": ["audio"],
        "audio": {
            "input": {
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": "low",
                    "create_response": True,
                    "interrupt_response": True,
                },
                "transcription": {"model": "gpt-4o-mini-transcribe"},
            }
        },
    }


async def create_realtime_session(
    api_key: str,
    model: str,
    instructions: str,
    sdp_offer: str,
) -> tuple[UUID, str]:
    files = {
        "sdp": ("offer.sdp", sdp_offer, "application/sdp"),
        "session": (
            None,
            json.dumps(build_realtime_session(instructions, model)),
            "application/json",
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=REALTIME_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                REALTIME_CALLS_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files=files,
            )
    except httpx.HTTPError as exc:
        logger.warning(
            "Realtime provider initialization failed",
            extra={"error_type": type(exc).__name__},
        )
        raise RealtimeInitializationError from exc

    if response.status_code not in {200, 201} or not response.text.lstrip().startswith("v=0"):
        logger.warning(
            "Realtime provider initialization rejected",
            extra={"status_code": response.status_code},
        )
        raise RealtimeInitializationError

    return uuid4(), response.text
