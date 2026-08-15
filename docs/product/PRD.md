# DevStride Product Requirements

## Product statement

DevStride is a personalized AI software-engineering mentor and communication
coach for developers who want to learn, practise, interview, communicate, and
grow professionally.

This document describes product intent. The canonical implementation status and
work order live in [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Primary users

- junior software engineers
- self-taught developers
- bootcamp graduates
- computer-science students
- developers preparing for technical or behavioral interviews
- developers who want structured technical-communication practice

## Core outcomes

Users should be able to:

- understand technical concepts at an appropriate level;
- practise technical and behavioral interviews;
- rehearse workplace engineering communication;
- receive structured, clearly qualified practice feedback;
- review session history, recurring weaknesses, and progress;
- control the durable context DevStride uses to personalize practice;
- build real projects with guided support in a future release.

## Current v0.1 product

The implemented product includes:

- Supabase sign-up, confirmation callback, login, logout, and protected routes;
- onboarding, an editable coaching Profile, and a separate Account view;
- a personalized Dashboard in a shared authenticated AppShell;
- persistent General, Mentor, Interview, and Team conversations;
- complete and SSE-streamed assistant generation with cancellation and retry;
- technical/behavioral Interview and scenario/difficulty Team configuration;
- Text, Live, and local-preview Video Interview formats; Video Interview keeps
  camera media in the browser and uses the existing realtime audio flow;
- automatic Interview and Team kickoff without fake user messages;
- structured Mentor, Interview, and Team session summaries;
- a simple Progress overview and session history;
- bounded, user-controlled Long-Term Memory v1;
- safe assistant Markdown rendering and responsive accessibility basics.

The current product does not claim hiring outcomes, professional certification,
verified competency, or comprehensive analytics. Practice ratings are coaching
signals only.

## Current experience

An authenticated user can complete onboarding, edit their Profile, start a
conversation in a supported mode, receive a persisted assistant response, stop
or retry failed streaming generation, complete supported practice sessions,
review summaries and Progress, and inspect/edit/archive saved memory. Account
information remains separate from coaching preferences.

## Next product direction

The next direction is richer Dashboard and Progress intelligence, recommended
next practice, explicit Goals / Development Plans, and evidence-based skill and
recurring-weakness tracking. These capabilities are not yet implemented.

## Planned capabilities

- guided project-building
- stronger interview reports and scoring with transparent rubrics
- skill trends and richer session/report views
- conversation/history search and filtering
- product feedback and support
- account privacy and data controls
- stable AI evaluation datasets

## Later or separately approved

- Live Conversation/realtime voice
- RAG/document learning
- GitHub repository ingestion
- code execution
- additional model providers or autonomous agents
- distributed infrastructure before demonstrated scale
- billing and gamification unless product direction requires them

The detailed Live Conversation intent is preserved in
[`PROJECT_STATUS.md`](PROJECT_STATUS.md); its architecture has not been designed.
