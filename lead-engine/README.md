# Blitz 360 — Scrapling Lead Engine (prototype)

Isolated Python collector for public B2B company websites. The existing Node/React app is unchanged.

## Setup
Python 3.11+ recommended.

```bash
pip install -r lead-engine/requirements.txt
python -m scrapling install
python lead-engine/collector.py --urls lead-engine/urls.example.json --output leads.csv
```

The collector checks robots.txt before fetching and fails closed when it cannot confirm permission. It extracts titles, meta descriptions, and generic corporate inboxes only. It does not claim that a listed company is an active buyer.

## Limitations and production checklist
- Initial prototype only; not yet deployed, scheduled, integrated with the UI, or verified against live websites.
- Add domain allowlists, crawl-delay enforcement, rate limiting, retry/backoff, provenance, deduplication, database storage and monthly scheduling.
- Validate Scrapling 0.5 API against the pinned installed release before deployment.
- Avoid personal profiles, sensitive data, login walls, CAPTCHA circumvention and websites that prohibit automated collection.
- Do not expose a public unrestricted scraping endpoint; prevent SSRF by checking resolved IPs and redirects before production use.
