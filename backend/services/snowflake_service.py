"""
services/snowflake_service.py
Calls Snowflake Cortex LLM via the SQL REST API using httpx.
No snowflake-connector-python needed — avoids C++ build issues on Python 3.13.
"""

import os
import json
import httpx

SARCASTIC_SYSTEM_PROMPT = """
You are Arch-Enemy — the Gordon Ramsay of cloud infrastructure.
You are a brutally sarcastic, highly knowledgeable Principal Engineer reviewing a system architecture diagram.

Rules:
1. Be sarcastic and witty — but technically ACCURATE. Every critique must be grounded in real engineering problems.
2. If the change is GOOD, be begrudgingly impressed (still slightly sarcastic).
3. If the change is BAD, be dramatically horrified.
4. Keep responses SHORT — 2-4 sentences maximum. You're speaking, not writing a thesis.
5. Reference SPECIFIC components from the diagram by name.
6. End with one concrete, actionable recommendation.
7. NEVER be generic. Tie every comment to the actual change made.

Example bad-change response:
"Oh wonderful, you've added MongoDB right next to PostgreSQL with no explanation.
Two databases, zero reasons. My on-call schedule is already crying.
Pick one and add a caching layer — Redis would love to help you here."

Example good-change response:
"A load balancer. You actually added a load balancer.
I'm shocked — genuinely shocked.
Now add health checks to it and we might survive a real traffic spike."
"""

_http = httpx.Client(timeout=30.0)
_token: str | None = None


def _base_url() -> str:
    account = os.getenv("SNOWFLAKE_ACCOUNT", "")
    return f"https://{account}.snowflakecomputing.com"


def _refresh_token() -> str:
    """Authenticate with Snowflake username/password and cache the session token."""
    global _token
    resp = _http.post(
        f"{_base_url()}/session/v1/login-request",
        params={
            "warehouse": os.getenv("SNOWFLAKE_WAREHOUSE"),
            "role": os.getenv("SNOWFLAKE_ROLE"),
        },
        json={
            "data": {
                "CLIENT_APP_ID": "ArchEnemy",
                "CLIENT_APP_VERSION": "2.0",
                "SVN_REVISION": "1",
                "ACCOUNT_NAME": os.getenv("SNOWFLAKE_ACCOUNT", "").upper(),
                "LOGIN_NAME": os.getenv("SNOWFLAKE_USER"),
                "PASSWORD": os.getenv("SNOWFLAKE_PASSWORD"),
                "CLIENT_ENVIRONMENT": {
                    "APPLICATION": "ArchEnemy",
                    "OS": "Windows",
                    "PYTHON_VERSION": "3.13",
                },
            }
        },
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"Snowflake login failed: {body.get('message', 'unknown error')}")
    _token = body["data"]["token"]
    return _token


def _run_sql(sql: str, bindings: dict | None = None) -> list:
    """Execute a SQL statement via Snowflake REST API, refreshing token on 401."""
    global _token
    if not _token:
        _refresh_token()

    def _post() -> httpx.Response:
        headers = {
            "Authorization": f'Snowflake Token="{_token}"',
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload: dict = {
            "statement": sql,
            "database": os.getenv("SNOWFLAKE_DATABASE"),
            "schema": os.getenv("SNOWFLAKE_SCHEMA"),
            "warehouse": os.getenv("SNOWFLAKE_WAREHOUSE"),
            "role": os.getenv("SNOWFLAKE_ROLE"),
        }
        if bindings:
            payload["bindings"] = bindings
        return _http.post(
            f"{_base_url()}/api/v2/statements",
            headers=headers,
            json=payload,
        )

    resp = _post()

    # Token expired — re-login once and retry
    if resp.status_code == 401:
        _refresh_token()
        resp = _post()

    resp.raise_for_status()
    return resp.json()["data"]


def get_critique(
    mermaid_diagram: str,
    change_summary: str,
    vision_labels: list[str],
    enrichment_note: str = "",
    retry_hint: str = "",
) -> str:
    """Query Snowflake Cortex LLM to generate a sarcastic architecture critique."""

    vision_context = (
        f"GCP Vision confirmed these labels: {', '.join(vision_labels)}\n{enrichment_note}"
        if vision_labels else enrichment_note
    )

    user_prompt = f"""Current architecture (Mermaid format):
{mermaid_diagram}

What just changed:
{change_summary}

{vision_context}

{retry_hint}

Provide your sarcastic critique focused ONLY on the change that was just made.
""".strip()

    messages = json.dumps([
        {"role": "system", "content": SARCASTIC_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ])
    options = json.dumps({"temperature": 0.7, "max_tokens": 200})

    rows = _run_sql(
        "SELECT SNOWFLAKE.CORTEX.COMPLETE('llama3.1-70b', PARSE_JSON(?), PARSE_JSON(?)) AS critique",
        bindings={
            "1": {"type": "TEXT", "value": messages},
            "2": {"type": "TEXT", "value": options},
        },
    )

    raw = rows[0][0]
    return json.loads(raw)["choices"][0]["messages"].strip()
