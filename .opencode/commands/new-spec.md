You are about to draft a new spec. Switch to the spec agent before proceeding.

Before drafting, do the following:

1. Load `forge/architecture/INDEX.md`
2. Load the architecture documents relevant to the requirements
3. Check `forge/active/` for any related in-progress specs
4. Determine the next available FS number by checking existing folders in `forge/active/` and `forge/completed/`

Then produce the planning package:

- `forge/active/FS-###/spec.md` using `forge/config/templates/SPEC_TEMPLATE.md`
- `forge/active/FS-###/tasks/T-01.md`, `T-02.md`, ... using `forge/config/templates/TASK_TEMPLATE.md`
- An initial architecture document in `forge/architecture/` if the spec introduces a new subsystem with no existing coverage

Draft immediately. Do not ask clarifying questions before producing the draft. Capture gaps in the `Open Questions` section.

---

Requirements:

[paste requirements here]