#!/usr/bin/env sh
set -eu

ENVIRONMENT="${1:-}"
APP="${2:-ecargo-analytics}"

if [ "$ENVIRONMENT" != "hml" ] && [ "$ENVIRONMENT" != "prd" ]; then
  echo "Uso: ./scripts/deploy-app.sh <hml|prd> [ecargo-analytics]" >&2
  exit 1
fi

if [ "$APP" != "ecargo-analytics" ]; then
  echo "Aplicacao invalida: $APP" >&2
  exit 1
fi

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VARS_FILE="$ROOT_DIR/k8s/vars.$ENVIRONMENT.env"
MANIFEST_FILE="$ROOT_DIR/k8s/$APP/$APP.yaml"

if [ ! -f "$VARS_FILE" ]; then
  echo "Arquivo de variaveis nao encontrado: $VARS_FILE" >&2
  exit 1
fi

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "Manifesto nao encontrado: $MANIFEST_FILE" >&2
  exit 1
fi

set -a
. "$VARS_FILE"
set +a

kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"
envsubst < "$MANIFEST_FILE" | kubectl apply -f -
