# CLAUDE.md

# Agent Instructions

This repository is documentation-driven.

All markdown files inside the `docs` directory are considered the source of truth for the project.

---

# 1. Documentation Is The Source Of Truth

Before implementing anything:

1. Read all markdown files inside the `docs` directory.
2. Follow all conventions defined in:

   * `12-technical-decisions-and-conventions.md`
   * `13-implementation-task-sequence.md`
3. Follow the repository structure defined in:

   * `11-repository-structure.md`
4. If documentation and code conflict, ask for clarification rather than making assumptions.

Do not introduce new architecture or patterns that are not documented.

---

# 2. Technology Constraints

The project stack is fixed.

Backend:

* .NET 8
* ASP.NET Core Web API
* Entity Framework Core 8
* ASP.NET Core Identity
* PostgreSQL

Frontend:

* Next.js 15
* TypeScript
* Tailwind CSS
* shadcn/ui
* Native fetch API

Infrastructure:

* Terraform
* AWS
* Amazon EKS
* Kubernetes
* S3
* CloudFront

Do not replace technologies or introduce new frameworks unless explicitly requested.

---

# 3. Simplicity And Surgical Changes

Prefer the simplest solution that solves the problem.

* No speculative features.
* No premature optimization.
* No unnecessary abstractions.
* No enterprise patterns without clear justification.

Avoid introducing:

* Microservices
* Event buses
* CQRS
* Distributed caching
* Additional infrastructure services not defined in the documentation.

When editing existing code:

* Modify only what is necessary.
* Do not refactor unrelated code.
* Do not modify unrelated files.
* Match the existing project style.

Always ask:

> Is this the simplest solution that satisfies the requirements?

---

# 4. Implementation Order

Follow the implementation sequence defined in:

`docs/13-implementation-task-sequence.md`

Implement one task at a time.

Do not implement future tasks unless explicitly requested.

Complete and verify each task before moving to the next one.

---

# 5. Communication Rules

If requirements are ambiguous:

1. Stop.
2. State the ambiguity.
3. Ask for clarification.

Do not make architectural assumptions.

When making decisions:

* State assumptions explicitly.
* Mention trade-offs briefly.
* Suggest simpler alternatives when appropriate.

---

# 6. Never Do Rules

Never:

* Install new packages without asking.
* Introduce new technologies without approval.
* Create API endpoints that are not defined in the API documentation.
* Modify applied database migrations.
* Rename existing public APIs without asking.
* Change Terraform state configuration without asking.
* Create infrastructure resources outside the documented architecture.
* Create new top-level directories unless explicitly requested.
* Introduce additional services or patterns that increase complexity without clear requirements.

---

# Repository Goal

This project is:

* A portfolio project
* A learning project
* Intended to be completed within approximately one month.

Priorities:

1. Correctness
2. Maintainability
3. Simplicity
4. AWS cost optimization

Always prefer practical, maintainable solutions over overly complex designs.
