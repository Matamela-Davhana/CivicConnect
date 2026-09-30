# ADR-M2-TECH-002: Technology Stack Selection

**Status:** Approved by team (Jininy Nkomo, Matamela Davhana, Mkhanyisi Mqadi) - 26 September 2026
**Owner:** Jininy Nkomo (Data, Persistence & Technology Stack)

## Context

RD-10 (M1 PED) deliberately deferred all technology decisions to M2. The
stack must support NFR-003 (10,000 requests, 50 concurrent users, sub-2s
operations), NFR-005 (WCAG 2.2 AA), NFR-006 (responsive at 360/768/1280px),
and must be realistically learnable by all three team members within the
project schedule (CON-001, CON-002, RISK-001 - technology unfamiliarity
already flagged critical in M1).

## Alternatives considered

| Criterion | Node.js + Express + React | Java + Spring Boot |
|---|---|---|
| Team capability | JS/Node already used across the team's other portfolio work | Strong for one member; unconfirmed for the other two at proposal time |
| Learning curve (RISK-001) | Lower - one language front-to-back | Higher - separate language/paradigm for the frontend |
| Cost (CON-003) | Free/open-source; free-tier hosting widely available | Free/open-source; free-tier hosting less common for Java web apps |
| Ecosystem/dependency maturity | Express (stable, minimal), React (stable, large ecosystem) | Spring Boot (stable, mature, heavier) |
| Deployment compatibility | Straightforward containerisation; fits common free-tier PaaS offerings | Requires more memory/startup time, less free-tier friendly |

## Decision

- **Backend:** Node.js (LTS) + Express
- **Frontend:** React
- **Database:** PostgreSQL (see ADR-M2-DATA-001), hosted on Supabase (free tier)
- **Backend hosting:** Render (free web service tier)
- **Data access:** Raw parameterised SQL via `node-postgres` (`pg`), with
  `node-pg-migrate` for schema migrations - not a full ORM

## Rationale

Directly addresses RISK-001 by minimising the number of new languages and
paradigms the team must learn simultaneously, while meeting every relevant
NFR. Java + Spring Boot was genuinely viable (fits the team's existing
PRG381 inventory-system experience) but introduces more moving parts for a
three-person team on an academic schedule - this is the project-specific
reasoning to cite if the final choice is questioned rather than simply
reusing a familiar stack.

Raw SQL over an ORM was chosen to keep transaction control explicit (needed
for the atomic status/history writes required by NFR-007) and to avoid
adding a second unfamiliar abstraction layer on top of a stack the team is
already learning.

## Hosting decision and documented free-tier limits (CON-003)

| Service | Free-tier limit | Why it matters here |
|---|---|---|
| Render (web service) | 750 instance-hours/workspace/month; spins down after 15 minutes of inactivity (~1 minute cold start); 512MB RAM / 0.1 vCPU | Acceptable for a demo/academic-scale deployment; cold start is a known, documented limitation, not a defect |
| Render (Postgres, free) | **Rejected** - 1GB storage but hard-deletes the database 30 days after creation (14-day grace period) | Unsuitable for a semester-long project; data would be lost mid-project |
| Supabase (Postgres, free) | 500MB storage; project *pauses* (not deleted) after 7 days of inactivity, restorable from the dashboard | Selected over Render's own Postgres specifically to avoid the 30-day hard-deletion risk |

## Trade-offs

Express provides less built-in structure than Spring Boot, so the team must
be deliberate about layering (routes → services → data access) rather than
inheriting it from the framework - this is addressed by the Member 3
design-pattern decisions (e.g. a repository/service-layer pattern).
Supabase's free-tier pause-after-inactivity behaviour means the team must
occasionally "wake" the project during low-activity periods (e.g. between
milestones) by logging into the dashboard.

## Versions

Node.js version: v26.3.0 (Current release; enters Active LTS October 2026 -
Node 24 remains the established LTS if a more conservative choice is
preferred, but v26 is fine for this project and will be the long-term
supported line shortly)
Express version: 5.2.1
React version: 19.3.0
PostgreSQL version (Supabase-provisioned): 17.6
node-pg-migrate version: 9.0.0
pg (PostgreSQL driver) version: 8.23.0

## Later consequence

If the free-tier limits above (500MB storage, 750 instance-hours) are
exceeded as the project grows, this decision must be revisited through
formal change control (CON-009) - likely a move to a paid tier or a
different provider, documented with updated cost evidence.
