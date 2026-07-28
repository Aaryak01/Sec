# syntax=docker/dockerfile:1

# Matches .python-version. Unlike App Runner (which could build straight
# from a connected GitHub repo), ECS Express Mode only accepts an
# already-built image URI — this image is built and pushed to ECR by the
# GitHub Actions workflow in .github/workflows/deploy.yml, which then points
# an Express Mode service at it. Nothing about the image itself changes
# between hosting platforms — same base, same layers, same CMD.
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

# ECS Express Mode routes traffic to a single "Container port" set on the
# service (defaults to 80 if unset!) — the deploy workflow passes
# container-port: 8000 explicitly to the deploy action so it matches what's
# hardcoded here; if configuring a service by hand in the console instead,
# set Container port to 8000 there too.
EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
