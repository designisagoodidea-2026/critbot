---
{
  "id": "presenter-onboarding-mcp",
  "label": "Sarah's lens + retrieved context",
  "domain": "Presenter",
  "description": "The presenter's onboarding lens, augmented with prior-crit and design-system context (M14).",
  "audience": "presenter-private",
  "extends": "ux-product-design",
  "faculties": { "score": { "enabled": true }, "coach": { "enabled": true } },
  "context": [
    { "id": "prior-onboarding-crits", "source": "priorCrits", "query": "onboarding progressive disclosure" },
    { "id": "ds-secondary-buttons", "source": "designSystem", "query": "secondary button contrast" }
  ],
  "coachingCues": [
    { "trigger": "concern-without-next-step", "nudge": "A concern landed — check the retrieved context for a known fix before you move on.", "kind": "question" }
  ]
}
---
# My perspective, with the context I want pulled in

Same intent as my onboarding lens — cut steps, reduce overwhelm with progressive disclosure. But don't make the room re-derive what's already on record: pull in how progressive disclosure tested in our last crit, and the exact design-system token that fixes the secondary-button contrast. Reason from that history, not from scratch.
