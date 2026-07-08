# ADR-016: Monitoring and Observability

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved monitoring and observability architecture** for VSP Phone v4. It defines metrics, dashboards, logging, tracing, alerting, monitoring targets, logging rules, and health check requirements.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Cloud Native, High Availability, Security First
- [ADR-013](ADR-013-api-standards.md) — Request IDs, Correlation IDs
- [ADR-004](ADR-004-call-architecture.md) — Platform UUID for calls
- [ADR-002](ADR-002-tenant-domain-model.md) — `tenant_id` on all resources
- [ADR-015](ADR-015-deployment-architecture.md) — Approved infrastructure components

This ADR does **not** define monitoring configuration, dashboards, alert rules, or scrape targets.

---

## Table of Contents

### Observability Stack

1. [Metrics — Prometheus](#1-metrics--prometheus)
2. [Dashboards — Grafana](#2-dashboards--grafana)
3. [Logs — Loki](#3-logs--loki)
4. [Tracing — OpenTelemetry](#4-tracing--opentelemetry)
5. [Alerts — Alertmanager](#5-alerts--alertmanager)

### Monitoring Scope

6. [Monitoring Targets](#6-monitoring-targets)

### Logging

7. [Structured JSON Logs](#7-structured-json-logs)
8. [Correlation IDs in Logs](#8-correlation-ids-in-logs)
9. [Tenant IDs in Logs](#9-tenant-ids-in-logs)
10. [Call UUIDs in Logs](#10-call-uuids-in-logs)

### Health Checks

11. [Readiness Probes](#11-readiness-probes)
12. [Liveness Probes](#12-liveness-probes)

13. [Summary](#13-summary)
14. [References](#14-references)

---

## 1. Metrics — Prometheus

### Context

VSP Phone v4 requires quantitative monitoring of service health, performance, and capacity across all infrastructure components. Metrics must be collected consistently and made available for alerting and dashboards.

### Decision

**Prometheus is the approved metrics platform.**

### Reasoning

- Industry-standard cloud-native metrics collection and storage
- Aligns with **Cloud Native** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Native integration with Grafana dashboards and Alertmanager alerts
- Wide exporter ecosystem for PostgreSQL, Redis, and custom application metrics

### Consequences

- All platform metrics are collected by Prometheus
- Services expose Prometheus-compatible metrics endpoints
- Metrics retention and storage sizing are deferred to implementation
- Prometheus deployment topology is deferred to infrastructure ADRs

---

## 2. Dashboards — Grafana

### Context

Operations teams and engineers require visual dashboards for real-time and historical monitoring of platform health, call volume, and component performance.

### Decision

**Grafana is the approved dashboard platform.**

### Reasoning

- Native integration with Prometheus metrics and Loki logs
- Industry-standard observability dashboard for cloud-native stacks
- Supports operational dashboards for all approved monitoring targets
- Complements Alertmanager for alert visualization

### Consequences

- Operational dashboards are built in Grafana
- Grafana connects to Prometheus and Loki as data sources
- Specific dashboard definitions are deferred to implementation
- Dashboard access and RBAC are deferred to deployment configuration

---

## 3. Logs — Loki

### Context

Centralized log aggregation is required across NestJS, Kamailio, RTPengine, and infrastructure components for troubleshooting, audit support, and incident investigation.

### Decision

**Loki is the approved log aggregation platform.**

### Reasoning

- Cloud-native log aggregation designed for Kubernetes environments
- Native Grafana integration for log exploration alongside metrics
- Efficient label-based indexing suitable for high-volume telecom logs
- Complements structured JSON logging standard

### Consequences

- All platform logs are aggregated in Loki
- Log queries use Loki query language via Grafana
- Log retention and storage sizing are deferred to implementation
- Log shipping mechanism per component is deferred to implementation

---

## 4. Tracing — OpenTelemetry

### Context

Distributed requests traverse NestJS modules, Kamailio, RTPengine, and Carrier Adapter. End-to-end request tracing is required to diagnose latency and failure across service boundaries.

### Decision

**OpenTelemetry is the approved distributed tracing platform.**

### Reasoning

- Vendor-neutral standard for traces, metrics, and logs instrumentation
- Supports correlation across NestJS, Kamailio integration, and event bus
- Aligns with Correlation IDs in API standards ([ADR-013](ADR-013-api-standards.md))
- Industry direction for cloud-native observability

### Consequences

- NestJS application is instrumented with OpenTelemetry
- Traces correlate with Correlation IDs and Request IDs
- Trace backend and exporter configuration are deferred to implementation
- Kamailio and RTPengine tracing integration is deferred

---

## 5. Alerts — Alertmanager

### Context

Operational issues — service failures, high error rates, capacity thresholds — must trigger proactive notifications to operations teams before customer impact.

### Decision

**Alertmanager is the approved alerting platform.**

### Reasoning

- Native Prometheus alerting component
- Supports alert routing, grouping, silencing, and inhibition
- Standard cloud-native alerting for Prometheus metrics
- Complements Grafana dashboards for alert visualization

### Consequences

- Prometheus alert rules route through Alertmanager
- Alert notification channels (PagerDuty, Slack, email) are deferred to implementation
- Specific alert thresholds and rules are deferred to implementation
- On-call rotation integration is deferred to operations configuration

---

## 6. Monitoring Targets

### Context

Each infrastructure component has distinct operational metrics and failure modes. Monitoring scope must cover all critical platform components.

### Decision

**The following components are approved monitoring targets:**

| Component | Monitoring Scope |
|-----------|-----------------|
| **API** | NestJS application — request rate, latency, errors |
| **Kamailio** | SIP signaling — registrations, calls, errors |
| **RTPengine** | Media relay — sessions, packet loss, errors |
| **PostgreSQL** | Database — connections, query performance, replication |
| **Redis** | Cache — memory, hit rate, connections |

### Reasoning

- Covers all approved production infrastructure components ([ADR-015](ADR-015-deployment-architecture.md))
- API monitoring aligns with API standards security and performance requirements
- Telecom layer monitoring (Kamailio, RTPengine) is critical for call quality
- Data layer monitoring (PostgreSQL, Redis) supports capacity and availability goals

### Consequences

- Each component exposes metrics to Prometheus
- Component-specific dashboards are built in Grafana (definitions deferred)
- NGINX monitoring is implied via API ingress metrics (explicit NGINX exporter deferred)
- Monitoring agent deployment per component is deferred to implementation

---

## 7. Structured JSON Logs

### Context

Unstructured log output is difficult to query, correlate, and aggregate at scale. Structured logging enables efficient search and analysis in Loki.

### Decision

**All platform logs use structured JSON format.**

### Reasoning

- Required for efficient Loki label-based querying
- Supports automated log parsing and field extraction
- Industry standard for cloud-native application logging
- Enables consistent log field schema across NestJS modules

### Consequences

- NestJS application logs are JSON-formatted
- Kamailio and RTPengine logs are collected and normalized where possible
- Log field schema is defined per module (schema deferred)
- Plaintext unstructured logs are not permitted in application code

---

## 8. Correlation IDs in Logs

### Context

Distributed requests and event chains span multiple modules and services. Logs must be correlatable across components for end-to-end troubleshooting.

### Decision

**All logs include Correlation IDs.**

### Reasoning

- Approved in API standards — Correlation IDs ([ADR-013](ADR-013-api-standards.md))
- Links API requests to domain events and downstream operations ([ADR-014](ADR-014-event-driven-architecture.md))
- Enables end-to-end trace reconstruction in Loki
- Standard distributed systems observability practice

### Consequences

- Correlation ID is present in every log entry where a request context exists
- Correlation ID propagates from API through events to audit and notification modules
- Correlation ID field name in log schema is deferred to implementation
- OpenTelemetry traces share the same Correlation ID

---

## 9. Tenant IDs in Logs

### Context

Multi-tenant platform logs must be filterable by tenant for support investigations, billing disputes, and compliance requests without exposing other tenants' data.

### Decision

**All tenant-scoped logs include Tenant IDs.**

### Reasoning

- Aligns with `tenant_id` on every business entity ([ADR-002](ADR-002-tenant-domain-model.md), [ADR-006](ADR-006-database-design.md))
- Enables tenant-scoped log queries in Loki for support and audit
- Required for multi-tenant operational support
- Supports audit trail requirements ([ADR-003](ADR-003-telephony-platform-decisions.md))

### Consequences

- Tenant ID is included in all logs from tenant-scoped operations
- Platform Admin operations log target tenant context explicitly
- Tenant ID enables per-tenant log filtering without cross-tenant exposure
- Tenant ID field name in log schema is deferred to implementation

---

## 10. Call UUIDs in Logs

### Context

Call-related operations span Kamailio, RTPengine, NestJS, and Carrier Adapter. Logs for a single call must be correlatable across all components using the platform call identifier.

### Decision

**All call-related logs include Call UUIDs (Platform UUID).**

### Reasoning

- Every call has a Platform UUID ([ADR-004](ADR-004-call-architecture.md))
- Enables end-to-end call troubleshooting across signaling, media, and application layers
- Supports call quality investigation and billing dispute resolution
- Links application logs to CDR and recording metadata

### Consequences

- Platform UUID is included in all logs related to call operations
- Kamailio and RTPengine logs correlate to Platform UUID via mapping (mechanism deferred)
- Call UUID log field enables single-call log reconstruction in Loki
- Non-call logs do not require Call UUID

---

## 11. Readiness Probes

### Context

Orchestration platforms (Kubernetes) and load balancers must determine when a service instance is ready to receive traffic. Starting traffic routing before a service is ready causes errors.

### Decision

**All services expose readiness health checks.**

### Reasoning

- Required for Kubernetes Ready deployment architecture ([ADR-015](ADR-015-deployment-architecture.md))
- Supports rolling deployments and zero downtime goals
- NGINX and Kubernetes use readiness probes to gate traffic routing
- Prevents routing to instances still initializing database connections or dependencies

### Consequences

- NestJS, Kamailio, RTPengine, PostgreSQL, and Redis expose readiness endpoints or probes
- Readiness failure removes instance from load balancer rotation
- Readiness check criteria per component are deferred to implementation
- Readiness probe configuration in Kubernetes manifests is deferred

---

## 12. Liveness Probes

### Context

Orchestration platforms must detect hung or dead service instances and restart them automatically without manual intervention.

### Decision

**All services expose liveness health checks.**

### Reasoning

- Required for Kubernetes self-healing behavior
- Detects deadlocked or unresponsive instances
- Complements readiness probes for complete health check coverage
- Supports high availability without manual restart intervention

### Consequences

- All production services expose liveness endpoints or probes
- Liveness failure triggers container restart by Kubernetes
- Liveness check criteria per component are deferred to implementation
- Liveness vs readiness distinction is enforced: liveness restarts, readiness gates traffic

---

## 13. Summary

### Observability Stack

| Capability | Technology |
|------------|------------|
| Metrics | Prometheus |
| Dashboards | Grafana |
| Logs | Loki |
| Tracing | OpenTelemetry |
| Alerts | Alertmanager |

### Monitoring Targets

API, Kamailio, RTPengine, PostgreSQL, Redis

### Logging Rules

| Field | Required |
|-------|----------|
| Format | Structured JSON |
| Correlation ID | All request-scoped logs |
| Tenant ID | All tenant-scoped logs |
| Call UUID | All call-related logs |

### Health Checks

Readiness probes, Liveness probes

---

## 14. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-002: Tenant Domain Model](ADR-002-tenant-domain-model.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [ADR-013: API Standards](ADR-013-api-standards.md)
- [ADR-014: Event-Driven Architecture](ADR-014-event-driven-architecture.md)
- [ADR-015: Deployment Architecture](ADR-015-deployment-architecture.md)
- [ADR Index](./README.md)
