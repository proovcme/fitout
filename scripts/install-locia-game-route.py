#!/usr/bin/env python3
"""Build an idempotent Caddy candidate that exposes FITOUT on locia.work/game."""

from __future__ import annotations

import argparse
from pathlib import Path


START = "\t# BEGIN managed FITOUT route"
END = "\t# END managed FITOUT route"
ANCHOR = "\tredir /lemma /lemma/ 308"
SNIPPET = r'''
	# BEGIN managed FITOUT route
	handle_path /fg-api/* {
		reverse_proxy 127.0.0.1:4188
	}

	redir /game /game/ 308
	handle_path /game/* {
		header {
			-Server
			Strict-Transport-Security "max-age=31536000; includeSubDomains"
			Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
			X-Content-Type-Options "nosniff"
			Referrer-Policy "no-referrer"
			X-Frame-Options "DENY"
			Permissions-Policy "camera=(), microphone=(), geolocation=()"
			Cross-Origin-Resource-Policy "same-origin"
		}
		@fitout_assets path /assets/*
		header @fitout_assets Cache-Control "public, max-age=31536000, immutable"
		@fitout_documents not path /assets/*
		header @fitout_documents Cache-Control "no-store"
		root * /var/www/fitout/current
		try_files {path} /index.html
		file_server
	}
	# END managed FITOUT route
'''.strip("\n")


def render(source: str) -> str:
    if START in source:
        start = source.index(START)
        end = source.index(END, start) + len(END)
        return source[:start] + SNIPPET + source[end:]
    if ANCHOR not in source:
        raise SystemExit("Could not locate the locia.work public-route anchor")
    return source.replace(ANCHOR, f"{SNIPPET}\n\n{ANCHOR}", 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.input.read_text(encoding="utf-8")
    candidate = render(source)
    if candidate.count(START) != 1 or candidate.count(END) != 1:
        raise SystemExit("FITOUT route marker is not unique")
    args.output.write_text(candidate, encoding="utf-8")


if __name__ == "__main__":
    main()
