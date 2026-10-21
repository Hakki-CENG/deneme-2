#!/usr/bin/env python3
"""
Rendered-page worker — the external half of Aurora's `web.render` capability.

Backed by crawl4ai, which drives a real headless Chromium. This exists because
Aurora already has `web.fetch`, and `web.fetch` is plain HTTP: it returns the
bytes a server sent. It cannot execute JavaScript, so a page that builds its
content in the browser comes back as an empty shell. This worker returns what
the page looks like **after** it has run.

Protocol
    stdin : {"url": "...", "maxBytes": n, "timeoutMs": n}
    stdout: {"url": "...", "markdown": "...", "truncated": bool,
             "statusCode": n, "success": bool}

Security, and the part that is NOT this file's job:

  The SSRF check is not done here. `capabilities/web.ts` exposes
  `assertSafeUrl`, which is tested, rejects non-HTTP(S) schemes, rejects
  credentials in the URL and blocks private-network targets. The TypeScript
  layer runs that before this process is ever spawned, so the check lives in
  one tested place rather than being reimplemented in a second language where
  nobody would notice it drifting.

  What this file does about redirects is weaker, and is stated plainly rather
  than dressed up: crawl4ai exposes no redirect cap, so one cannot be set here.
  Chromium follows redirects on its own and a public URL may redirect to an
  internal one. The mitigation actually available is to report the FINAL url
  back, so the TypeScript layer can check where the request ended up and reject
  a result that landed somewhere internal. That is a post-check, not a
  prevention — the request has already been made by the time it runs.
"""

import asyncio
import json
import sys


def fail(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.stderr.flush()
    sys.exit(1)


async def run(request: dict) -> None:
    url = request.get("url")
    if not isinstance(url, str) or not url.strip():
        fail("request.url must be a non-empty string")
        return

    max_bytes = request.get("maxBytes", 200_000)
    if not isinstance(max_bytes, int) or max_bytes < 1 or max_bytes > 5_000_000:
        fail("request.maxBytes must be an integer between 1 and 5000000")
        return

    timeout_ms = request.get("timeoutMs", 30_000)
    if not isinstance(timeout_ms, int) or timeout_ms < 1000 or timeout_ms > 180_000:
        fail("request.timeoutMs must be an integer between 1000 and 180000")
        return

    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    except ImportError as err:
        fail(f"crawl4ai is not installed in this interpreter: {err}")
        return

    # --no-sandbox is required when the process runs as root, which is how this
    # executes in containerised CI. --disable-dev-shm-usage stops Chromium from
    # filling a small /dev/shm, which is the usual cause of a browser that
    # launches and then vanishes.
    browser_config = BrowserConfig(
        headless=True,
        extra_args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    )
    # No redirect cap: CrawlerRunConfig does not expose one. The final URL is
    # reported instead, and the caller decides what to do about it.
    run_config = CrawlerRunConfig(
        page_timeout=timeout_ms,
        word_count_threshold=10,
        verbose=False,
    )

    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)
    except Exception as err:
        fail(f"crawl failed: {type(err).__name__}: {str(err)[:400]}")
        return

    markdown = ""
    if result is not None and getattr(result, "markdown", None) is not None:
        raw = getattr(result.markdown, "raw_markdown", None)
        if isinstance(raw, str):
            markdown = raw

    truncated = len(markdown) > max_bytes
    payload = {
        "url": getattr(result, "url", url) if result is not None else url,
        "markdown": markdown[:max_bytes],
        "truncated": truncated,
        "statusCode": getattr(result, "status_code", None) if result is not None else None,
        "success": bool(getattr(result, "success", False)) if result is not None else False,
    }
    json.dump(payload, sys.stdout, default=str)
    sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> None:
    try:
        request = json.load(sys.stdin)
    except Exception as err:
        fail(f"invalid JSON request: {err}")
        return
    try:
        asyncio.run(run(request))
    except SystemExit:
        raise
    except Exception as err:
        fail(f"unexpected failure: {type(err).__name__}: {str(err)[:400]}")


if __name__ == "__main__":
    main()
