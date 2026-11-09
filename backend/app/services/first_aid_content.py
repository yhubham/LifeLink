"""First-aid guidance content (educational simulation).

Static, instructor-reviewable step lists keyed by triage priority and
optionally narrowed by incident type. Never real medical advice.
"""

DISCLAIMER = (
    "Educational simulation for a college demonstration. "
    "For real emergencies call your local emergency number."
)

# Core steps per priority level (START-inspired teaching content)
CORE_STEPS: dict[str, list[dict]] = {
    "L1": [
        {"step": 1, "title": "Ensure scene safety", "detail": "Check for traffic, fire or other dangers before approaching."},
        {"step": 2, "title": "Check response", "detail": "Shout and tap the person. If unresponsive, call for help."},
        {"step": 3, "title": "Open the airway", "detail": "Tilt the head back, lift the chin. Remove visible obstructions."},
        {"step": 4, "title": "Control severe bleeding", "detail": "Press firmly on the wound with a cloth; keep pressure constant."},
        {"step": 5, "title": "Monitor continuously", "detail": "Stay with the person, watch breathing until help arrives."},
    ],
    "L2": [
        {"step": 1, "title": "Ensure scene safety", "detail": "Approach only when the area is safe."},
        {"step": 2, "title": "Check response and breathing", "detail": "Talk to the person; confirm normal breathing."},
        {"step": 3, "title": "Stop bleeding", "detail": "Apply direct pressure with a clean cloth or dressing."},
        {"step": 4, "title": "Keep them still and warm", "detail": "Prevent movement of suspected injuries; cover with a blanket."},
        {"step": 5, "title": "Reassure and re-check", "detail": "Keep talking to them; re-check breathing every minute."},
    ],
    "L3": [
        {"step": 1, "title": "Ensure scene safety", "detail": "Check the surroundings before helping."},
        {"step": 2, "title": "Clean and dress wounds", "detail": "Rinse minor wounds with clean water and cover."},
        {"step": 3, "title": "Rest and observe", "detail": "Let the person sit or lie comfortably; watch for changes."},
        {"step": 4, "title": "Note what happened", "detail": "Record time, symptoms and any changes for responders."},
    ],
    "L4": [
        {"step": 1, "title": "Direct to a safe area", "detail": "Guide walking wounded away from danger to a collection point."},
        {"step": 2, "title": "Basic dressing", "detail": "Cover cuts and scrapes with clean bandages."},
        {"step": 3, "title": "Account for everyone", "detail": "Note names and complaints for the triage list."},
    ],
}

# Incident-type specific additions (prepended context)
TYPE_HINTS: dict[str, str] = {
    "Road Accident": "Watch for spinal injury — do not move the neck or back.",
    "Fire": "Move away from smoke; check for burns and cool them with clean water.",
    "Medical": "Note when symptoms started; loosen tight clothing.",
    "Building Collapse": "Expect dust inhalation and crush injuries; do not re-enter structures.",
    "Other": "Follow the core steps for the person's condition.",
}


def guidance_for(priority: str, incident_type: str | None = None) -> dict:
    priority = priority if priority in CORE_STEPS else "L3"
    steps = list(CORE_STEPS[priority])
    hint = TYPE_HINTS.get((incident_type or "").strip(), TYPE_HINTS["Other"])
    return {
        "priority": priority,
        "label": {
            "L1": "Immediate (red)",
            "L2": "Urgent (yellow)",
            "L3": "Minor (green)",
            "L4": "Walking wounded (blue)",
        }[priority],
        "incident_hint": hint,
        "steps": steps,
        "disclaimer": DISCLAIMER,
    }
