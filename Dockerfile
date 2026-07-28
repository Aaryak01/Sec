# syntax=docker/dockerfile:1

# Matches .python-version — App Runner builds this image directly from the
# GitHub repo via its own Docker build step (no separate Nixpacks/buildpack
# auto-detection to keep in sync, unlike the Railway setup this replaces).
FROM python:3.12-slim

WORKDIR /app

# Installed before the rest of the app is copied in, so this layer only
# rebuilds when requirements.txt actually changes, not on every code edit.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# .dockerignore keeps checkpoints/, tokenizer/, and gemini-for-claude-code/
# (~580MB combined, confirmed unused by app.py/api.py via grep) out of the
# build context, so this doesn't pull them into the image.
COPY . .

# App Runner routes traffic to a single port set in its own service config
# (Console → your service → Configuration → Port), not via an env var — that
# setting MUST be 8000 to match what's hardcoded here.
EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
