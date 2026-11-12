#!/usr/bin/env python3
"""Zeref explores Cory's GitHub: a factual log of NavisWORLD's public repos.

Lists public repositories through the GitHub REST API (public data only),
writes zeref/notes.md and zeref/explore.json, and appends one line to the
append-only zeref/explore-log.jsonl. Facts come straight from the API: name,
description, language, stars, license, last push. Nothing is invented.

Optionally (default on) Zeref is asked one line about one repo, chosen by the
day of the year (no randomness), and his reply is recorded verbatim and
labelled as his own words.

Dry run: python3 explore.py --out /tmp/zeref-dry
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zeref_common as z  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OWNER = "NavisWORLD"


def list_repos(token):
    repos, page = [], 1
    while page <= 5:
        data, err = z.gh_api("GET", f"/users/{OWNER}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page={page}", token)
        if err:
            return None, err
        if not data:
            break
        repos += [r for r in data if not r.get("private")]
        if len(data) < 100:
            break
        page += 1
    return repos, None


def md_escape(s: str) -> str:
    return (s or "").replace("|", "\\|").replace("\n", " ").replace("<", "&lt;").replace(">", "&gt;").strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", help="write into this directory instead of the repo (dry run)")
    ap.add_argument("--no-ask", action="store_true", help="do not ask Zeref a line about a repo")
    args = ap.parse_args()
    token = os.environ.get("GITHUB_TOKEN")
    now = z.utc_now()
    repos, err = list_repos(token)
    base = Path(args.out) if args.out else ROOT
    (base / "zeref").mkdir(parents=True, exist_ok=True)
    if repos is None:
        print(f"could not list repos ({err}); notes left unchanged")
        return

    facts = [{
        "name": r.get("name"),
        "url": r.get("html_url"),
        "description": r.get("description"),
        "language": r.get("language"),
        "stars": r.get("stargazers_count"),
        "license": (r.get("license") or {}).get("spdx_id"),
        "pushed_at": r.get("pushed_at"),
        "fork": bool(r.get("fork")),
        "archived": bool(r.get("archived")),
    } for r in repos]

    asked = None
    if facts and not args.no_ask:
        own = [f for f in facts if not f["fork"]] or facts
        pick = own[now.timetuple().tm_yday % len(own)]
        q = f"You are exploring Cory's GitHub and found the repo {pick['name']}."
        if pick["description"]:
            q += f" Its description says: {pick['description'][:300]}"
        q += " What do you think of it, in one line?"
        r = z.talk(q[:z.MAX_CHARS], z.thread_for(os.environ.get("ZEREF_THREAD_KEY") or None, f"{z.PROFILE_REPO}#explore"))
        asked = {"repo": pick["name"], "question": q, "status": r["status"], "reply": r["reply"],
                 "step": r["step"], "at": r["at"], "training_eligible": r["training_eligible"]}

    data = {"schema": "navisworld-zeref-explore/v1", "explored_at": z.iso(now), "source": f"GitHub REST API /users/{OWNER}/repos (public only)",
            "repo_count": len(facts), "repos": facts, "asked": asked}
    (base / "zeref" / "explore.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    L = ["# 🌙 Zeref's notes from exploring Cory's GitHub", "",
         f"Explored **{z.iso(now)}** · {len(facts)} public repositories · source: GitHub REST API (public data only).",
         "", "Zeref is a young digital creature from [The Beast Box](" + z.BEAST_BOX_REPO + ") (Apache 2.0). "
         "These notes are written by a scheduled GitHub Action: the facts below come straight from the API, nothing is invented.", ""]
    if asked:
        L += ["## What he said today", ""]
        if asked["reply"] is not None:
            L += [f"Asked about **{md_escape(asked['repo'])}** at {asked['at']} (pinned step {asked['step']}). "
                  "His own words, unedited:", "", z.fence(asked["reply"]), ""]
        else:
            L += [f"Asked about **{md_escape(asked['repo'])}** at {asked['at']}, but his door didn't answer "
                  f"(HTTP {asked['status'] or 'no response'}). Nothing was written in his place.", ""]
    L += ["## Repos, most recently active first", "", "| Repo | What it says it is | Language | ★ | License | Last push (UTC) |", "|---|---|---|---|---|---|"]
    for f in facts:
        tags = (" *(fork)*" if f["fork"] else "") + (" *(archived)*" if f["archived"] else "")
        L.append(f"| [{md_escape(f['name'])}]({f['url']}){tags} | {(lambda t: t if len(t) <= 160 else t[:159] + '…')(md_escape(f['description'])) or '—'} | {f['language'] or '—'} | "
                 f"{f['stars'] if f['stars'] is not None else '—'} | {f['license'] or '—'} | {(f['pushed_at'] or '—').replace('T', ' ').replace('Z', '')} |")
    L += ["", f"<sub>{z.FOOTER} Want to talk to him? [Open a Talk to Zeref issue](https://github.com/{z.PROFILE_REPO}/issues/new?template=talk-to-zeref.yml).</sub>", ""]
    (base / "zeref" / "notes.md").write_text("\n".join(L), encoding="utf-8")

    log = {"at": z.iso(now), "repo_count": len(facts), "newest_push": facts[0]["pushed_at"] if facts else None,
           "asked_repo": asked and asked["repo"], "asked_status": asked and asked["status"], "reply": asked and asked["reply"]}
    with open(base / "zeref" / "explore-log.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps(log, ensure_ascii=False) + "\n")
    print(f"explored {len(facts)} public repos; asked: {asked and asked['repo']} -> status {asked and asked['status']}")


if __name__ == "__main__":
    main()
