# Requirements: Multi-Tenant Pulse Surveys

## 1. Context

- The platform helps organisations drive behaviour adoption.
- It collects small weekly signals from people and turns them into simple insights.
- Build a small, production-quality slice of a multi-tenant SaaS.
- Show senior-level judgement in backend and data work.
- Add a very small React UI to test the key flows.
- Timebox the work. A clean, complete vertical slice is better than breadth.
- Expected time: about 4 hours. You may take longer.

## 2. General rules

1. You must use an AI coding tool (Claude Code, Codex, Cursor, GitHub Copilot or similar).
   - The role is AI-native. How you direct and check AI output is assessed, not only what you build.
   - Not using an AI tool counts against you.
2. Tech stack: TypeScript, NestJS, PostgreSQL, React.
3. Must run locally. No external identity providers. No paid cloud services.
4. Each user belongs to exactly one organisation.
5. Each user has exactly one of two roles: Manager or Member.
6. One organisation must never be able to access another organisation's data.
7. Keep scope tight. Build the smallest end-to-end "happy path" first.
8. In SOLUTION.md, write down trade-offs, known gaps, and next steps you would take with more time.

## 3. Choices you may make (state them in SOLUTION.md)

1. "This week" can be either:
   - a rolling 7-day window, or
   - a calendar week.
   State which one you chose.
2. Any tenant isolation approach is fine, for example:
   - scoping in the application layer, or
   - database row-level policies.
   State which one you chose and why.

## 4. Task 1: Backend (multi-tenant pulse surveys)

Build a backend service that supports weekly pulse surveys per organisation.

### 4.1 Business rules

1. An organisation can have pulse surveys.
2. A survey has at most 3 questions.
3. Question types:
   - rating from 1 to 5
   - yes/no
4. Managers can create and manage surveys for their own organisation only.
5. Members can submit one response per active week for a given survey.
6. Provide a 7-day (or weekly) summary for a survey. It must include:
   - completion count
   - completion rate (responses compared to the number of members in that organisation)
   - per-question rollups:
     - rating: average and count
     - yes/no: count for each option
7. Data must be strictly isolated between organisations.
8. Provide seed data with:
   - at least 2 organisations
   - a few users per role in each

### 4.2 Things you decide

1. How to model users, roles, organisations, surveys and responses.
2. A local-friendly way to identify the current user and organisation (for example a simple token, a session, or a header).
3. How surveys get created. Seed data, fixtures, a simple admin endpoint, or a CLI are all fine, to save UI time.

## 5. Task 2: Minimal React app

Build a small React app that uses the backend.

### 5.1 Member flows

1. See your organisation's active survey.
2. Submit your response.

### 5.2 Manager flows

1. See the 7-day (or weekly) summary for a survey.

### 5.3 Demo rules

1. The demo must use at least 2 organisations to clearly show data isolation.
2. Keep the UI minimal and focused on the flows above.
3. Simple local "log in" is fine (for example, pick a seeded user).

## 6. Task 3: Production readiness on AWS (design only, no code)

Write a short design note in SOLUTION.md that covers:

1. How you would deploy on AWS (for example a container service for the app, managed PostgreSQL, static hosting for the frontend).
2. How you would store and serve an organisation logo image in production.
   - Goal: keep backend bandwidth and cost low.
   - Access must stay secure.
3. The tenancy, security and scaling points you would handle first.

## 7. Task 4: AI-assisted delivery

Show how you worked with your AI tools, not only what they produced.

1. **Workflow** (in SOLUTION.md). Explain your AI workflow from start to end:
   - which tools you used
   - how you set up the task for them
   - how you broke the work down
   - what you gave to the AI and what you kept for yourself
   - how you reviewed and improved the output
   - what you would change next time
2. **Agent instructions.** Commit the instructions file you wrote for your tool (for example CLAUDE.md, AGENTS.md, .cursorrules). It must reflect this project's constraints.
3. **Spec before code.** Commit a short spec or plan before the implementation commits. Keep it brief. It must exist, and the code must follow it.
4. **Validation** (part of the workflow write-up). Describe:
   - what you checked
   - what you rejected or rewrote
   - how you knew the result was correct
5. **Session logs.** Export or copy your AI session transcripts into an `ai-logs/` folder in the repo.
   - Remove anything personal.
   - If your tool cannot export transcripts, say so in SOLUTION.md and describe the sessions instead.

## 8. Deliverables

### 8.1 One GitHub repository with

1. All source code.
2. `README.md` with steps to run locally.
3. `SOLUTION.md` with:
   - design and trade-offs
   - the AWS design note
   - the AI workflow, including how you validated AI output
4. `ai-logs/` folder with the AI session transcripts.
5. A commit history that shows how the work progressed. Do not squash into one commit.

### 8.2 Video demo (5 to 10 minutes, Loom or similar)

With a voice-over:

1. Show the working project.
2. Walk through the code architecture.
3. Explain key design decisions and trade-offs.
4. Explain your AI workflow and show it in action, including at least one place where you corrected or rejected the AI's output.
