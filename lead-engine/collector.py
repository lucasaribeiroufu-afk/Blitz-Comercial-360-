"""Public website B2B lead discovery. Respect site policies and avoid personal data."""
import argparse
import csv
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from scrapling.fetchers import Fetcher

USER_AGENT = "BlitzLeadResearch/0.1 (+contact: configure-before-production)"
EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

def allowed(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    robots = RobotFileParser()
    robots.set_url(f"{parsed.scheme}://{parsed.netloc}/robots.txt")
    try:
        response = requests.get(robots.url, timeout=10, headers={"User-Agent": USER_AGENT})
        if response.status_code != 200:
            return False  # fail closed when policy cannot be confirmed
        robots.parse(response.text.splitlines())
        return robots.can_fetch(USER_AGENT, url)
    except requests.RequestException:
        return False

def collect(url: str) -> dict:
    if not allowed(url):
        return {"url": url, "status": "blocked_or_unverified"}
    try:
        page = Fetcher.get(url, timeout=20)
        title = page.css("title::text").get() or ""
        description = page.css('meta[name="description"]::attr(content)').get() or ""
        text = " ".join(page.css("body").get_all())[:100000]
        # Only generic company inboxes; do not harvest personal email addresses.
        emails = sorted({e.lower() for e in EMAIL.findall(text)
                         if e.split("@")[0].lower() in {"contato", "comercial", "vendas", "sales", "info"}})
        return {"url": url, "domain": urlparse(url).hostname, "title": title.strip(),
                "description": description.strip(), "emails": ";".join(emails),
                "status": "collected", "checked_at": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        return {"url": url, "status": "fetch_error", "error_type": type(exc).__name__}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--urls", required=True, help="JSON file containing an array of public URLs")
    parser.add_argument("--output", default="leads.csv")
    args = parser.parse_args()
    with open(args.urls, encoding="utf-8") as handle:
        urls = json.load(handle)
    if not isinstance(urls, list) or len(urls) > 100:
        raise ValueError("Provide an array of at most 100 URLs per batch")
    records = [collect(url) for url in dict.fromkeys(urls)]
    columns = ["url", "domain", "title", "description", "emails", "status", "checked_at", "error_type"]
    with open(args.output, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(records)

if __name__ == "__main__":
    main()
