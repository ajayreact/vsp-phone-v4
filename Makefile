# VSP Phone v4 — Phase 1 task runner
# Requires: Docker Compose v2, Node 20+, npm

COMPOSE ?= docker compose
ENV_FILE ?= .env
PROFILE_EXTRAS ?=

.PHONY: help env up down build logs ps health core extras restart prune validate-compose smoke-api certs certs-validate certs-rotate kamailio-validate rtpengine-validate telecom-validate telecom-validate-phase6 telecom-validate-phase7 telecom-validate-phase8 telecom-validate-phase9 telecom-validate-phase10 telecom-validate-phase11 telecom-validate-phase12

help:
	@echo "VSP Phone v4 — Phase 1–4 targets"
	@echo "  make env                 Copy .env.example -> .env if missing"
	@echo "  make up                  Build and start full stack"
	@echo "  make core                Start postgres + redis only"
	@echo "  make extras              Start stack including MinIO"
	@echo "  make down                Stop stack (keep volumes)"
	@echo "  make prune               Stop stack and delete volumes"
	@echo "  make logs                Tail compose logs"
	@echo "  make ps                  Show compose status"
	@echo "  make health              Curl API/Admin health endpoints"
	@echo "  make validate-compose    docker compose config"
	@echo "  make certs               Generate development CA + leaf certs"
	@echo "  make certs-validate      Validate TLS live material + HTTPS smoke"
	@echo "  make certs-rotate        Backup + regenerate leaf certificates"
	@echo "  make kamailio-validate   Static Phase 3 Kamailio checks"
	@echo "  make rtpengine-validate  Static Phase 4 RTPengine checks"
	@echo "  make telecom-validate    Static Phase 5 telecom API checks"
	@echo "  make telecom-validate-phase6  Phase 6 SIP auth/registration checks"
	@echo "  make telecom-validate-phase7  Phase 7 routing/CallSession checks"
	@echo "  make telecom-validate-phase8  Phase 8 Telnyx carrier checks"
	@echo "  make telecom-validate-phase9  Phase 9 RTPengine media checks"
	@echo "  make telecom-validate-phase10 Phase 10 WebRTC browser checks"
	@echo "  make telecom-validate-phase11 Phase 11 Grandstream provisioning checks"
	@echo "  make telecom-validate-phase12 Phase 12 recording & presence checks"
	@echo "  make smoke-api           Host-side NestJS health (nx serve)"

env:
	@if [ ! -f $(ENV_FILE) ]; then cp .env.example $(ENV_FILE); echo "Created $(ENV_FILE)"; else echo "$(ENV_FILE) exists"; fi

up: env
	$(COMPOSE) --env-file $(ENV_FILE) up -d --build

core: env
	$(COMPOSE) --env-file $(ENV_FILE) up -d postgres redis

extras: env
	$(COMPOSE) --env-file $(ENV_FILE) --profile extras up -d --build

down:
	$(COMPOSE) --env-file $(ENV_FILE) --profile extras down

prune:
	$(COMPOSE) --env-file $(ENV_FILE) --profile extras down -v

build: env
	$(COMPOSE) --env-file $(ENV_FILE) build

logs:
	$(COMPOSE) --env-file $(ENV_FILE) logs -f --tail=200

ps:
	$(COMPOSE) --env-file $(ENV_FILE) ps

health:
	@curl -fsS http://127.0.0.1:3000/api/health | tee /dev/stderr | grep -q '"status":"ok"'
	@curl -fsS http://127.0.0.1:3000/api/ready | tee /dev/stderr | grep -q '"status":"ok"'
	@curl -fsS http://127.0.0.1:3001/api/health | tee /dev/stderr | grep -q '"status":"ok"'
	@echo "Health checks passed"

validate-compose: env
	$(COMPOSE) --env-file $(ENV_FILE) config >/dev/null
	@echo "compose config OK"

certs:
	node ./scripts/tls/generate-dev-certs.cjs

certs-validate:
	node ./scripts/tls/validate-certs.cjs

certs-rotate:
	node ./scripts/tls/generate-dev-certs.cjs --force

kamailio-validate:
	node ./scripts/kamailio/validate-phase3.cjs

rtpengine-validate:
	node ./scripts/rtpengine/validate-phase4.cjs

telecom-validate:
	node ./scripts/telecom/validate-phase5.cjs

telecom-validate-phase6:
	node ./scripts/telecom/validate-phase6.cjs

telecom-validate-phase7:
	node ./scripts/telecom/validate-phase7.cjs

telecom-validate-phase8:
	node ./scripts/telecom/validate-phase8.cjs

telecom-validate-phase9:
	node ./scripts/telecom/validate-phase9.cjs

telecom-validate-phase10:
	node ./scripts/telecom/validate-phase10.cjs

telecom-validate-phase11:
	node ./scripts/telecom/validate-phase11.cjs

telecom-validate-phase12:
	node ./scripts/telecom/validate-phase12.cjs

smoke-api:
	@npm run serve:api
