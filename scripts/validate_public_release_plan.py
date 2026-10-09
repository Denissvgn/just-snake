#!/usr/bin/env python3
"""Validate the autonomous release plan, dependencies and acceptance references."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)

def read_json(relative: str) -> dict:
    try:
        return json.loads((ROOT / relative).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{relative}: {exc}")
        return {}

plan = read_json("plans/public-release.plan.json")
catalog = read_json("plans/public-release.acceptance.json")
backlog_path = ROOT / "PUBLIC_RELEASE_BACKLOG.md"
runbook_path = ROOT / "plans/public-release-agent.md"
backlog = backlog_path.read_text(encoding="utf-8") if backlog_path.exists() else ""
require(bool(backlog), "Backlog file is missing or empty")
require(runbook_path.exists(), "Agent runbook is missing")
require(plan.get("kind") == "autonomous-development-backlog", "Wrong plan kind")
require(plan.get("schema_version") == 1, "Unsupported plan schema")
require(catalog.get("schema_version") == 1, "Unsupported acceptance schema")
require(plan.get("plan_id") == catalog.get("plan_id"), "Plan/catalog identity mismatch")
require(plan.get("plan_id") == "just-snake-public-v1", "Unexpected release plan name")
naming = plan.get("naming", {})
for field in ("repository", "page_title", "product_name"):
    require(naming.get(field) == "just-snake", f"Unexpected public name: {field}")
require(naming.get("project_base_path") == "/just-snake/", "Unexpected project base path")
require(naming.get("name_conflict_policy") == "blocked_external_no_alternative_slug",
        "Explicit repository naming conflict policy missing")

tasks = plan.get("tasks", [])
cases = catalog.get("cases", [])
task_ids = [task.get("id") for task in tasks]
case_ids = [case.get("id") for case in cases]
require(len(task_ids) == len(set(task_ids)), "Duplicate task IDs")
require(len(case_ids) == len(set(case_ids)), "Duplicate acceptance IDs")
task_map = {task.get("id"): task for task in tasks}
case_map = {case.get("id"): case for case in cases}
allowed_states = {"pending", "ready", "in_progress", "in_review", "accepted",
                  "blocked_external", "deferred"}
allowed_scopes = {"release", "external", "post_release"}
for task in tasks:
    ident = task.get("id")
    require(isinstance(ident, str) and bool(re.fullmatch(r"[A-F][0-9]{2}", ident)),
            f"Invalid task ID: {ident}")
    require(task.get("status") in allowed_states, f"{ident}: invalid state")
    require(task.get("scope") in allowed_scopes, f"{ident}: invalid scope")
    for field in ("title", "owner", "locks", "paths", "steps", "accept", "evidence"):
        require(bool(task.get(field)), f"{ident}: missing {field}")
    require(task.get("review_required") is True, f"{ident}: no independent review")
    if "snake-three.html" in task.get("paths", []):
        require("game-source" in task.get("locks", []),
                f"{ident}: game source write has no lock")
    require(f"### {ident} " in backlog, f"{ident}: absent from backlog")
    for dependency in task.get("deps", []):
        require(dependency in task_map, f"{ident}: unknown dependency {dependency}")
        require(dependency != ident, f"{ident}: self dependency")
        if dependency in task_map:
            require(task_map[dependency].get("order", 0) < task.get("order", 0),
                    f"{ident}: dependency order is not topological")
            if task.get("scope") == "release":
                require(task_map[dependency].get("scope") == "release",
                        f"{ident}: local release depends on nonlocal task")
    listed = task.get("acceptance_cases", [])
    actual = [case["id"] for case in cases if case.get("task") == ident]
    require(set(listed) == set(actual), f"{ident}: case ownership mismatch")
    for case_id in listed:
        require(case_id in case_map, f"{ident}: unknown case {case_id}")

visited: set[str] = set()
active: set[str] = set()
def visit(ident: str) -> None:
    if ident in active:
        errors.append(f"Dependency cycle at {ident}")
        return
    if ident in visited or ident not in task_map:
        return
    active.add(ident)
    for dependency in task_map[ident].get("deps", []):
        visit(dependency)
    active.remove(ident)
    visited.add(ident)
for ident in task_ids:
    visit(ident)

for case in cases:
    ident = case.get("id")
    require(isinstance(ident, str) and bool(re.fullmatch(r"ACC-[A-Z0-9]+-[0-9]{2}", ident)),
            f"Invalid case ID: {ident}")
    require(case.get("task") in task_map, f"{ident}: unknown owner")
    for field in ("type", "stimulus", "expected", "evidence"):
        require(bool(case.get(field)), f"{ident}: missing {field}")
    owner = task_map.get(case.get("task"), {})
    expected_gate = "live_publication" if owner.get("scope") == "external" else "local_qualification"
    require(case.get("gate") == expected_gate, f"{ident}: wrong gate")
    require(case.get("release_required") is True, f"{ident}: missing release requirement")

for prefix in re.findall(r"ACC-[A-Z0-9]+-[0-9]{2}", backlog):
    require(prefix in case_map, f"Backlog refers to unknown case {prefix}")
decision_ids = {item.get("id") for item in plan.get("decisions", [])}
require(decision_ids == {f"DEC{i:02d}" for i in range(1, 13)}, "Incomplete decision catalog")
require(not decision_ids.intersection(task_map), "Task/decision namespace collision")
for ident in decision_ids:
    require(f"### {ident} " in backlog, f"Decision {ident} absent from backlog")
scope = plan.get("scope", {})
for key, kind in (("local_release_tasks", "release"),
                  ("conditional_external_tasks", "external"),
                  ("deferred_post_release_tasks", "post_release")):
    require(scope.get(key) == sum(task.get("scope") == kind for task in tasks),
            f"Scope count mismatch: {key}")
require(plan.get("runtime_policy", {}).get("docker_platform") == "linux/arm64",
        "ARM64 Docker policy missing")
require(plan.get("runtime_policy", {}).get("external_publish_requires_existing_authorization") is True,
        "Publication authorization boundary missing")
require(plan.get("scheduler", {}).get("max_game_source_writers") == 1,
        "Monolithic game source writer lock missing")
if errors:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    sys.exit(1)
local_count = sum(case["gate"] == "local_qualification" for case in cases)
live_count = sum(case["gate"] == "live_publication" for case in cases)
print(f"PASS: {len(tasks)} tasks, {len(decision_ids)} decisions, "
      f"{len(cases)} cases ({local_count} local / {live_count} publication); "
      "dependencies and ownership valid")
