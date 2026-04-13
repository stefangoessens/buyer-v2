FROM python:3.13-slim

WORKDIR /app

# Install the vendored python-workers package so parsers/fetch/common
# modules resolve via site-packages at runtime (KIN-1039).
COPY python-workers-vendored/ ./python-workers-vendored/
RUN pip install --no-cache-dir ./python-workers-vendored

# Install the FastAPI service package
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy the service source
COPY src/ src/

# Shim `pnpm` so Railway's cached Nixpacks startCommand (pnpm start)
# actually execs the Python uvicorn server. Railway persists the
# service's original start command even when switching to Dockerfile
# build, and deleting it via CLI isn't supported. This shim is the
# least-invasive workaround until the service-level start command
# can be cleared via the Railway dashboard/API.
RUN printf '#!/bin/sh\nexec python -m uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}\n' > /usr/local/bin/pnpm && chmod +x /usr/local/bin/pnpm

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
