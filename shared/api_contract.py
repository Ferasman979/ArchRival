"""
Shared contract between frontend and backend.
Keep this in sync — update both sides when the API changes.

POST /analyze/
  Request:  { session_id, xml, screenshot_b64? }
  Response: { has_changes, change_summary, mermaid, critique?, vision_labels[] }

DELETE /analyze/session/{session_id}
  Response: { cleared: true }

WS /ws/session
  Client→Server: { text: "critique text" }
  Server→Client: <binary audio chunks>
  Server→Client: { done: true }

GET /health
  Response: { status: "ok" }
"""
