import json
import logging
from typing import cast

import httpx

REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls"
REALTIME_REQUEST_TIMEOUT_SECONDS = 30.0
logger = logging.getLogger(__name__)


class RealtimeInitializationError(Exception):
    pass


def _provider_error_category(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except (TypeError, ValueError):
        return "invalid_or_non_json"
    if not isinstance(payload, dict):
        return "invalid_error_shape"
    payload_dict = cast(dict[str, object], payload)
    error = payload_dict.get("error")
    if not isinstance(error, dict):
        return "missing_error_object"
    error_dict = cast(dict[str, object], error)
    code = error_dict.get("code")
    error_type = error_dict.get("type")
    if isinstance(code, str) and code:
        return code[:80]
    if isinstance(error_type, str) and error_type:
        return error_type[:80]
    return "unknown_provider_error"


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
                    # DevStride validates finalized transcript evidence before
                    # asking the provider to advance the conversation.
                    "create_response": False,
                    "interrupt_response": True,
                },
                "transcription": {"model": "gpt-4o-mini-transcribe"},
            }
        },
    }


async def create_realtime_client_secret(
    api_key: str,
    model: str,
    instructions: str,
) -> tuple[str, int | None]:
    request_body = {"session": build_realtime_session(instructions, model)}
    try:
        async with httpx.AsyncClient(timeout=REALTIME_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                REALTIME_CLIENT_SECRETS_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=request_body,
            )
    except httpx.HTTPError as exc:
        logger.warning(
            "Realtime provider initialization failed",
            extra={"error_type": type(exc).__name__},
        )
        raise RealtimeInitializationError from exc

    if response.status_code not in {200, 201}:
        logger.warning(
            "Realtime provider initialization rejected",
            extra={"status_code": response.status_code},
        )
        raise RealtimeInitializationError

    try:
        payload_value = response.json()
    except ValueError as exc:
        logger.warning("Realtime provider returned an invalid session response")
        raise RealtimeInitializationError from exc
    if not isinstance(payload_value, dict):
        logger.warning("Realtime provider returned an invalid session response")
        raise RealtimeInitializationError
    payload = cast(dict[str, object], payload_value)

    client_secret = payload.get("value")
    if not isinstance(client_secret, str):
        nested_secret = payload.get("client_secret")
        nested = cast(dict[str, object], nested_secret) if isinstance(nested_secret, dict) else {}
        client_secret = nested.get("value")
    expires_at = payload.get("expires_at")
    if not isinstance(expires_at, int):
        nested_secret = payload.get("client_secret")
        nested = cast(dict[str, object], nested_secret) if isinstance(nested_secret, dict) else {}
        expires_at = nested.get("expires_at")
    if not isinstance(client_secret, str) or not client_secret.strip():
        logger.warning("Realtime provider response omitted a client secret")
        raise RealtimeInitializationError
    return client_secret, expires_at if isinstance(expires_at, int) else None


async def create_realtime_call(
    api_key: str,
    offer_sdp: str,
    model: str,
    instructions: str,
) -> bytes:
    if not offer_sdp or not offer_sdp.startswith("v=0"):
        raise RealtimeInitializationError
    session = json.dumps(build_realtime_session(instructions, model))
    sdp_bytes = offer_sdp.encode("utf-8")
    session_bytes = session.encode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=REALTIME_REQUEST_TIMEOUT_SECONDS) as client:
            request = client.build_request(
                "POST",
                REALTIME_CALLS_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files={
                    "sdp": (None, sdp_bytes, "application/sdp"),
                    "session": (None, session_bytes, "application/json"),
                },
            )
            multipart_body = request.read()
            response = await client.send(request)
    except httpx.HTTPError as exc:
        logger.warning(
            "Realtime provider call negotiation failed",
            extra={"error_type": type(exc).__name__},
        )
        raise RealtimeInitializationError from exc

    if response.status_code not in {200, 201}:
        logger.warning(
            "Realtime provider call negotiation rejected status=%s category=%s "
            "sdp_chars=%s sdp_bytes=%s starts_with_v0=%s multipart_sdp_bytes=%s "
            "multipart_body_bytes=%s",
            response.status_code,
            _provider_error_category(response),
            len(offer_sdp),
            len(sdp_bytes),
            offer_sdp.startswith("v=0"),
            len(sdp_bytes),
            len(multipart_body),
        )
        raise RealtimeInitializationError
    answer = response.content
    if not answer.startswith(b"v=0"):
        logger.warning(
            "Realtime provider returned an invalid SDP answer",
            extra={"status_code": response.status_code},
        )
        raise RealtimeInitializationError
    return answer
