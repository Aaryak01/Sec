#!/usr/bin/env bash
# Scales the ECS Express Mode service back up to 1 task and waits until
# /health responds, so you know exactly when it's actually reachable again
# (not just when ECS reports the task as "running" — the app also has to
# finish loading the TF-IDF matrix over the filing chunks before it can
# serve requests).
set -euo pipefail

CLUSTER="${ECS_CLUSTER:-default}"
SERVICE="${ECS_SERVICE:-sec-chatbot-api}"
REGION="${AWS_REGION:-us-east-1}"
HEALTH_URL="${BACKEND_HEALTH_URL:-https://se-18851167c6f94d97a132fa9a3e970fb4.ecs.us-east-1.on.aws/health}"
TIMEOUT_SECONDS="${START_TIMEOUT_SECONDS:-180}"

echo "Scaling '$SERVICE' (cluster '$CLUSTER', region '$REGION') to 1 task..."

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --desired-count 1 \
  --region "$REGION" \
  --query 'service.{desiredCount:desiredCount,runningCount:runningCount}' \
  --output table

echo "Waiting for the ECS task to reach steady state..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION"

echo "Task is running — waiting for /health to respond (app still needs to load the TF-IDF matrix)..."
start_time=$(date +%s)
while true; do
  if curl -sf -o /dev/null "$HEALTH_URL"; then
    elapsed=$(( $(date +%s) - start_time ))
    echo "Backend is up — /health responded after ${elapsed}s since the task reached steady state."
    exit 0
  fi
  elapsed=$(( $(date +%s) - start_time ))
  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    echo "Timed out after ${TIMEOUT_SECONDS}s waiting for /health. The task may still be starting up — check manually: curl $HEALTH_URL"
    exit 1
  fi
  printf "."
  sleep 3
done
