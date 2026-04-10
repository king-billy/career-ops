# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

### [Impact] CUDA Forensic Processing Pipeline
**Source:** Report #001 — Glean — Software Engineer, University Grad
**S (Situation):** Existing serial hash set tools at the AG's Office couldn't handle large evidence volumes — analysts were bottlenecked during high-volume device reviews.
**T (Task):** Cut throughput bottleneck by building a faster processing system that could integrate into the existing Cellebrite Physical Analyzer workflow.
**A (Action):** Built a CUDA-accelerated parallel processing pipeline for iOS filesystem hash set management, integrating GPU-parallelized processing into Cellebrite Physical Analyzer via Python.
**R (Result):** Reduced analysis time by 50%; saved 12 analyst-hours per evidence item. Deployed to production for active criminal investigations.
**Reflection:** Would have added a formal test harness earlier — discovered several edge cases late in integration. Now I build test coverage in parallel with feature development, not after.
**Best for questions about:** most impactful project, shipping real systems, technical problem-solving, performance optimization, taking ownership end-to-end

### [Systems Building] Air-Gapped Research Server Deployment
**Source:** Report #001 — Glean — Software Engineer, University Grad
**S (Situation):** Three UMass research departments needed shared high-speed compute for data collection and processing — no central system existed and each dept had different requirements.
**T (Task):** Design, procure, and deploy an air-gapped high-speed processing server that could serve all three departments.
**A (Action):** Gathered requirements from each department stakeholder, handled full procurement, and deployed the server solo — including network configuration, software stack, and ongoing management.
**R (Result):** Server went live serving all 3 departments. Also automated software deployment across 100+ lab systems using Python/Bash, saving ~1 work week/month of manual admin.
**Reflection:** Stakeholder alignment up front is the hardest part. I spent more time in requirements gathering than I expected, but it prevented rework downstream. Would do it the same way again.
**Best for questions about:** cross-functional collaboration, owning a project end-to-end, systems design, working with non-technical stakeholders, automation

### [Systems Building] Secure Network Management System (MA AG's Office)
**Source:** Direct experience — full-time DFIR Analyst / Network Engineer role
**S (Situation):** The AG's Office had an airgapped server holding network management data with no visibility pipeline — no way to centralize device inventory, monitor infrastructure health, or alert admin staff without manually accessing the isolated machine.
**T (Task):** Design and build a secure network management system that could pull telemetry from the airgapped server, provide monitoring dashboards, and push alerts out to admin staff over the internet — without compromising the airgap security model.
**A (Action):** Integrated LibreNMS for automated network discovery and device inventory off the airgapped server. Deployed Prometheus for metrics collection and Grafana for dashboarding. Architected a controlled, one-way outbound alerting pipeline that allowed notifications to reach admin staff over the internet while maintaining the security posture of the isolated environment.
**R (Result):** Production system now in use at a law enforcement agency — admins have real-time visibility into network health and receive alerts without any manual intervention or security compromise.
**Reflection:** Working within airgap constraints forced me to think carefully about data flow direction and trust boundaries. The hardest part wasn't the tech stack — it was designing the pipeline so that outbound alerting never created an inbound attack surface. I'd apply that same threat-modeling-first approach to any infrastructure project.
**Best for questions about:** building systems from scratch, security-conscious engineering, infrastructure ownership, working under compliance constraints, designing for reliability, network monitoring

### [Reliability] Forensic Infrastructure 99.9% Uptime
**Source:** Report #001 — Glean — Software Engineer, University Grad
**S (Situation):** Forensic infrastructure supporting active criminal investigations needed to be available when analysts and attorneys needed it — downtime has real legal consequences.
**T (Task):** Administer and harden forensic servers and storage platforms to maximize reliability under CJIS compliance constraints.
**A (Action):** Implemented access controls, retention policies, audit logging, and operational security hardening. Built structured intake and triage workflows for forensic requests from 100+ stakeholders.
**R (Result):** Improved platform reliability to 99.9% uptime; reduced analyst downtime by 25%.
**Reflection:** High-stakes users (AAGs, investigators on court deadlines) taught me to communicate technical constraints in plain language and set realistic expectations clearly. That skill transfers to any customer-facing engineering role.
**Best for questions about:** reliability engineering, working under pressure, production systems, stakeholder communication, technical ownership
