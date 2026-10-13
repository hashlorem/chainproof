# ChainProof API. Data (SQLite DB, evidence files, server keys) lives in /data: mount a volume there.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.31 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH" \
    CHAINPROOF_STORAGE_DIR=/data \
    CHAINPROOF_DATABASE_URL=sqlite:////data/chainproof.db \
    PORT=8000
VOLUME /data
EXPOSE 8000

RUN useradd --create-home --uid 1000 chainproof && mkdir -p /data && chown chainproof /data
USER chainproof

# --proxy-headers: behind a host's load balancer, so the login limiter sees real client IPs.
CMD ["sh", "-c", "if [ \"$CHAINPROOF_SEED_DEMO\" = true ]; then python -m scripts.seed; fi; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips '*'"]
