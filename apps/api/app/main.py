from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.account.routes import router as account_router
from app.ai.latency import PracticeLatencyTrace, bind_trace, reset_trace
from app.api.health import router as health_router
from app.auth.routes import router as auth_router
from app.conversations.routes import router as conversations_router
from app.core.config import settings
from app.goals.routes import router as goals_router
from app.memory.routes import router as memory_router
from app.profiles.routes import router as profiles_router
from app.progress.routes import router as progress_router
from app.realtime.routes import router as realtime_router
from app.session_summaries.routes import router as session_summaries_router

app = FastAPI(
    title="DevStride API",
    version="0.1.0",
    debug=settings.app_env == "development",
)

cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_latency_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Attach a safe correlation ID and timing trace to every API request."""
    trace = PracticeLatencyTrace("http", f"{request.method} {request.url.path}")
    trace_token = bind_trace(trace)
    trace.mark("request_received")
    try:
        response = await call_next(request)
    except BaseException:
        trace.complete()
        raise
    else:
        trace.complete(response.status_code)
        response.headers["X-Request-ID"] = str(trace.correlation_id)
        return response
    finally:
        reset_trace(trace_token)


app.include_router(health_router)
app.include_router(account_router)
app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(profiles_router)
app.include_router(progress_router)
app.include_router(realtime_router)
app.include_router(session_summaries_router)
app.include_router(memory_router)
app.include_router(goals_router)
