param(
  [string]$WebhookUrl = "http://127.0.0.1:8000/ws/webhook/architecture-query"
)

$body = @{
  session_id = "test-session-1"
  question = "Is a single database instance a risk here?"
  diagram_mermaid = "graph TD; API[API] --> DB[(PostgreSQL)]"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri $WebhookUrl `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
