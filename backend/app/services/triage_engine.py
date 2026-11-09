"""Educational demonstration triage engine (protocol: demo-sim-v1).

Rules loosely follow the START triage concept for teaching purposes only.
NOT a medical device. Not for real emergency decisions.
"""

from app.models import Patient

PROTOCOL = "demo-sim-v1"

# Priority labels with plain-language names
LABELS = {
    "L1": "Immediate (red)",
    "L2": "Urgent (yellow)",
    "L3": "Minor (green)",
    "L4": "Walking wounded (blue)",
}


def assess(patient: Patient, answers: dict | None = None) -> tuple[str, str]:
    """Return (priority_level, reason) from observations + assessment answers.

    Answers keys (all optional): airway, breathing_rate, circulation,
    ambulatory, pain_scale.
    """
    answers = answers or {}
    reasons: list[str] = []

    airway = str(answers.get("airway", "")).lower()
    breathing_rate = str(answers.get("breathing_rate", "")).lower()
    circulation = str(answers.get("circulation", "")).lower()
    ambulatory = str(answers.get("ambulatory", "")).lower() in ("yes", "true", "1")

    consciousness = (patient.consciousness or "").lower()
    breathing = (patient.breathing or "").lower()
    bleeding = (patient.bleeding or "").lower()

    # --- L1: immediate threats to life -------------------------------------
    if airway == "obstructed":
        return "L1", "Airway obstruction — cannot maintain a patent airway."
    if breathing_rate == "absent" or breathing == "not breathing":
        return "L1", "Not breathing / respiratory arrest — immediate action."
    if circulation in ("absent", "no pulse"):
        return "L1", "No palpable pulse — cardiovascular collapse."
    if consciousness == "unresponsive":
        return "L1", "Unresponsive — fails to respond to voice or pain."
    if bleeding == "uncontrolled":
        return "L1", "Uncontrolled hemorrhage."

    # --- L2: urgent --------------------------------------------------------
    if breathing_rate == "fast":
        reasons.append("Respiratory rate > 30/min")
    if breathing == "laboured":
        reasons.append("Laboured breathing")
    if consciousness == "confused":
        reasons.append("Altered mental status (confused)")
    if bleeding == "heavy":
        reasons.append("Heavy bleeding")
    if circulation == "weak":
        reasons.append("Weak peripheral pulse")

    if reasons:
        return "L2", "Urgent: " + "; ".join(reasons) + "."

    # --- L4: walking wounded ----------------------------------------------
    if ambulatory and bleeding in ("none", "minor") and consciousness == "responsive":
        return "L4", "Ambulatory with minor injuries — walking wounded."

    # --- L3: default minor -------------------------------------------------
    if consciousness == "responsive" and breathing == "normal" and bleeding == "none":
        return "L3", "Conscious, breathing normally, no significant bleeding."

    return "L3", "No immediate life threat identified by the demo rules."
