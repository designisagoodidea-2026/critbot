---
{
  "id": "presenter-onboarding",
  "label": "Sarah's presenter lens — Onboarding v3",
  "domain": "Presenter",
  "description": "The presenter's own lens for the onboarding redesign crit.",
  "audience": "presenter-private",
  "extends": "ux-product-design",
  "faculties": { "score": { "enabled": true }, "coach": { "enabled": true } },
  "scoring": [
    { "id": "intent-stated", "label": "I kept my intent in view", "description": "Did I frame the problem, audience, and goal before pixels — and hold to it?" },
    { "id": "evidence-based", "label": "Feedback was evidence-based", "description": "Did concerns cite research/testing rather than taste?" },
    { "id": "actionable", "label": "I captured next steps", "description": "Did each concern resolve to a concrete change I can make next iteration?" }
  ],
  "coachingCues": [
    { "trigger": "no-design-intent-stated", "nudge": "Open by restating your intent — problem, audience, goal — before the screens.", "kind": "reminder" },
    { "trigger": "concern-without-next-step", "nudge": "A concern just landed without a fix — note how you'll resolve it before you move on.", "kind": "question" }
  ]
}
---
# My perspective on this crit

I'm presenting the onboarding flow redesign (v3). My design intent: cut the number of steps and reduce overwhelm with progressive disclosure. I already know contrast on the secondary buttons is shaky — I don't need to be told it's a problem, I need help deciding the fix.

What I most want from this crit: whether the step reduction actually reads as simpler to people who aren't me, and whether anyone has evidence — testing, analytics, prior crits — for or against progressive disclosure in onboarding specifically.

Coach me privately. If a concern lands and I don't say how I'll resolve it, remind me to capture it. If I drift from my stated intent, pull me back to it. These nudges are for me, not the room — they should never surface to the other participants.
