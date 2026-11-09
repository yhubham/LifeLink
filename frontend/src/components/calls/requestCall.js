export const CALL_EVENT = 'lifelink:call'

/**
 * Ask the global CallCenter to start a voice call for an incident.
 *
 * The caller must be an authorized participant (control room or the crew that
 * is actually assigned to the incident). The backend re-checks this.
 */
export function requestCall(incidentId) {
  window.dispatchEvent(new CustomEvent(CALL_EVENT, { detail: { incidentId } }))
}
