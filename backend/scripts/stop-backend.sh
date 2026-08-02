#!/usr/bin/env bash
# Scales the ECS Express Mode service to 0 tasks so it stops incurring
# Fargate compute charges while not in active use. Does NOT delete the
# service, task definition, or the Express Mode gateway ALB — see the
# "Cost management" section of the root README for what this does and
# doesn't save.
set -euo pipefail

CLUSTER="${ECS_CLUSTER:-default}"
SERVICE="${ECS_SERVICE:-sec-chatbot-api}"
REGION="${AWS_REGION:-us-east-1}"

echo "Scaling '$SERVICE' (cluster '$CLUSTER', region '$REGION') to 0 tasks..."

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --desired-count 0 \
  --region "$REGION" \
  --query 'service.{desiredCount:desiredCount,runningCount:runningCount}' \
  --output table

echo "Waiting for the running task to stop..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION"

echo "Done — backend is stopped. /health will be unreachable until you run start-backend.sh."
echo "Note: the Express Mode gateway ALB is still up (its own small fixed hourly cost applies regardless of task count) — this only stops Fargate compute billing."
