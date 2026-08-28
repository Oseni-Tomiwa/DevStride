# DevStride Accessibility Standard

Status: Active  
Target: WCAG 2.2 Level AA  
Applies to: DevStride web application and future client applications  
Last updated: August 28, 2026

## 1. Purpose

Accessibility is a product and engineering requirement for DevStride.

DevStride should be usable by people with disabilities, including users who
navigate with keyboards, screen readers, magnification, voice control, or
other assistive technologies.

Accessibility must be considered during design and implementation rather than
added only after a feature has been completed.

Our current target is WCAG 2.2 Level AA.

## 2. Scope

These requirements apply to all user-facing DevStride functionality, including
authentication, onboarding, Dashboard, conversations, Mentor Mode, interviews,
Video and voice interviews, Team Practice, reports, Progress, Memory, settings,
forms, dialogs, notifications, navigation, and loading, error, and empty states.

New functionality must meet this standard before being considered complete.

## 3. Semantic HTML

Prefer native semantic HTML whenever possible. Use buttons for actions, links
for navigation, labels with form controls, a correct heading hierarchy, and
appropriate landmarks such as `main`, `nav`, `header`, and `footer`.

Do not recreate native controls with generic elements without a justified
accessibility requirement. ARIA supplements semantic HTML; it does not replace
it.

## 4. Keyboard Accessibility

Every interactive feature must work without a mouse. Users must be able to
navigate controls, activate actions, enter and leave dialogs predictably,
navigate forms logically, and complete critical workflows by keyboard.

Custom keyboard interactions must follow established accessibility patterns.

## 5. Focus Management

Interactive elements must have a clearly visible focus state. When dialogs,
menus, or similar components open, focus should move appropriately into them,
remain within modal dialogs when required, and normally return to the opener
when they close.

Route changes and dynamic content must leave keyboard and screen-reader users
with meaningful context.

## 6. Forms

Every input must have an accessible name, preferably through a visible label.
Placeholder text must not be the only label. Required fields must be conveyed
programmatically.

Validation errors must explain the problem, identify the affected field, be
available to assistive technology, not rely only on color, and explain how to
correct the problem where practical. Forms should preserve input on recoverable
validation errors.

## 7. Color and Contrast

Text and important interface elements must meet WCAG 2.2 AA contrast
requirements. Color must not be the only way DevStride communicates errors,
success, warnings, scores, progress, selected states, or performance changes.

## 8. Typography, Zoom and Responsive Layout

Core functionality should remain usable with increased browser zoom or text
size. Layouts should reflow instead of forcing unnecessary horizontal scrolling,
and important information must not disappear solely because the viewport is
small.

## 9. Images and Icons

Meaningful images need useful alternative text. Decorative images should be
hidden from assistive technology where appropriate. Icon-only controls need an
accessible name.

## 10. Dynamic and AI-Generated Content

Dynamic content includes streamed AI responses, interview questions and
feedback, notifications, Progress updates, reports, and loading states.
Important changes should be communicated appropriately to assistive technology.
Streaming output should not repeatedly interrupt screen readers for every
token; meaningful completed updates are preferred. Completed generated content
must remain available through standard navigation and reading mechanisms.

## 11. Conversations

Conversation interfaces must distinguish user messages, assistant messages,
system states, errors, and loading/generation states. Controls such as Send,
Stop generation, Retry, Copy, Delete, and Start new conversation must be
keyboard accessible and understandable without relying only on icons or color.

## 12. Interviews and Simulations

Interview experiences should not unnecessarily require a specific input method.
Where practical, activities should be completable with keyboard-accessible
controls. Instructions, timers, progress, state, scores, and evaluations need
textual meaning rather than relying exclusively on visual presentation.

## 13. Audio, Video and Realtime Features

Where applicable, provide accessible microphone and camera controls, clear
permission states, textual status, mute/unmute controls, camera controls,
transcripts for spoken AI content where technically available, and text
alternatives to important audio-only information.

Users should not lose access to the rest of DevStride because they cannot or
choose not to use audio/video functionality.

## 14. Motion and Animation

Avoid unnecessary motion. Animations must not prevent interaction and should
respect `prefers-reduced-motion` where appropriate. Do not introduce flashing
content that could create accessibility or safety problems.

## 15. Errors, Loading and Empty States

Accessibility applies to loading, empty, success, validation, network,
permission, authentication, and AI/provider failure states. Status messages
that affect the current task should be available to assistive technology.
Errors should be understandable and actionable where possible.

## 16. Component Requirements

Prefer accessible components from the existing DevStride component system.
When using an accessible primitive, developers remain responsible for labels,
descriptions, focus behavior, keyboard behavior, semantic structure, contrast,
and application-specific interactions.

## 17. Testing Requirements

Accessibility testing combines automated and manual checks. Where supported,
automated tests should cover common issues such as missing accessible names,
invalid ARIA, and form-labeling problems.

Critical workflows should be manually testable by keyboard and periodically
tested with representative screen-reader/browser combinations, including sign
up/login, onboarding, conversations, interviews, reports, Dashboard, and
Account/settings. Automated checks do not replace manual testing.

## 18. Accessibility and Definition of Done

A user-facing feature is not complete merely because it works visually.
Verify semantic HTML, accessible names, keyboard operation, visible focus,
focus management, labels, accessible errors, contrast, dynamic states, and
loading, empty, and failure states. Critical accessibility failures should
block release of the affected feature.

## 19. Codex Instructions

When modifying user-facing functionality, inspect existing accessibility
patterns, preserve or improve semantics, keyboard and focus behavior, provide
accessible names, avoid color-only communication, consider dynamic states, add
relevant tests, and report known limitations.

## 20. Accessibility Bugs

Accessibility defects are product bugs. Issues should document the affected
page or feature, expected and actual behavior, reproduction steps, input method
or assistive technology, severity, and proposed or implemented resolution.

## 21. Known Limitations

Known limitations must be documented, their impact assessed, an alternative
workflow provided where practical, and a tracked issue created for resolution.

## 22. Continuous Improvement

Review this standard when major UI architecture changes occur, new interaction
types are introduced, mobile applications are added, voice/video changes
significantly, accessibility issues reveal missing standards, or the targeted
WCAG version changes.

Accessibility is an ongoing engineering responsibility, not a one-time
compliance task.
