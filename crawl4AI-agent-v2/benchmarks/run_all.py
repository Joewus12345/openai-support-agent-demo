#!/usr/bin/env python3
"""
Benchmark harness for Crawl4AI example scripts.

- Activates (or prepends) a provided virtualenv for subprocess execution.
- Runs a set of crawler scripts via asyncio.create_subprocess_exec.
- Measures duration, URLs processed (based on new/changed Markdown outputs), and output sizes.
- Emits JSON and CSV reports to crawl4AI-agent/crawl4AI-examples/output/benchmarks/.

CLI examples:
    python crawl4AI-agent-v2/benchmarks/run_all.py
    python crawl4AI-agent-v2/benchmarks/run_all.py --script sitemap-parallel --domain automationghana.com
    python crawl4AI-agent-v2/benchmarks/run_all.py --venv ./crawl4AI-agent-v2/venv
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARK_DIR = REPO_ROOT / "crawl4AI-agent" / "crawl4AI-examples" / "output" / "benchmarks"


@dataclass
class ScriptJob:
    key: str
    script_path: Path
    output_dir: Path
    description: str
    default_args: Sequence[str]
    domain_hint: str | None = None


@dataclass
class BenchmarkResult:
    script: str
    script_path: str
    output_dir: str
    start_time: str
    end_time: str
    duration_seconds: float
    urls_processed: int
    total_bytes: int
    throughput_pages_per_min: float
    total_output_files: int
    total_output_bytes: int
    status: str
    return_code: int | None
    error: str | None


def resolve_python(venv_path: Path | None) -> str:
    """Return a python executable, preferring the provided virtualenv when it exists."""
    candidates: List[Path] = []
    if venv_path:
        candidates.append(venv_path / "bin" / "python")
        candidates.append(venv_path / "Scripts" / "python.exe")
    env_python = os.environ.get("PYTHON")
    if env_python:
        candidates.append(Path(env_python))
    env_venv = os.environ.get("VIRTUAL_ENV")
    if env_venv:
        candidates.append(Path(env_venv) / "bin" / "python")
    candidates.append(Path("python"))
    for candidate in candidates:
        if candidate and candidate.exists():
            return str(candidate)
    return "python"


def snapshot_markdown(output_dir: Path) -> Dict[Path, int]:
    """Return a mapping of markdown file path to size for the given directory."""
    if not output_dir.exists():
        return {}
    return {p: p.stat().st_size for p in output_dir.glob("*.md") if p.is_file()}


def diff_outputs(before: Dict[Path, int], after: Dict[Path, int]) -> Dict[Path, int]:
    """Return files that are new or size-changed since the snapshot."""
    changed: Dict[Path, int] = {}
    for path, size in after.items():
        previous = before.get(path)
        if previous is None or previous != size:
            changed[path] = size
    return changed


def ensure_benchmark_dir() -> None:
    BENCHMARK_DIR.mkdir(parents=True, exist_ok=True)


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_job(job: ScriptJob, python_cmd: str, env: Dict[str, str]) -> BenchmarkResult:
    before_snapshot = snapshot_markdown(job.output_dir)
    start_ts = iso_now()
    start_time = datetime.now(timezone.utc)
    try:
        process = await asyncio.create_subprocess_exec(
            python_cmd,
            str(job.script_path),
            *job.default_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=REPO_ROOT,
            env=env,
        )
    except FileNotFoundError as exc:
        end_ts = iso_now()
        return BenchmarkResult(
            script=job.key,
            script_path=str(job.script_path),
            output_dir=str(job.output_dir),
            start_time=start_ts,
            end_time=end_ts,
            duration_seconds=0.0,
            urls_processed=0,
            total_bytes=0,
            throughput_pages_per_min=0.0,
            total_output_files=len(before_snapshot),
            total_output_bytes=sum(before_snapshot.values()),
            status="error",
            return_code=None,
            error=str(exc),
        )

    stdout, stderr = await process.communicate()
    end_time = datetime.now(timezone.utc)
    end_ts = end_time.isoformat()

    after_snapshot = snapshot_markdown(job.output_dir)
    changed = diff_outputs(before_snapshot, after_snapshot)
    duration = max((end_time - start_time).total_seconds(), 0.0)
    urls_processed = len(changed)
    total_bytes = sum(changed.values())
    throughput = (urls_processed / (duration / 60.0)) if duration > 0 else 0.0
    total_output_bytes = sum(after_snapshot.values())

    status = "success" if process.returncode == 0 else "failed"
    error_message = None
    if process.returncode != 0:
        error_message = stderr.decode("utf-8", errors="ignore")[:2000] or stdout.decode("utf-8", errors="ignore")[:2000]

    return BenchmarkResult(
        script=job.key,
        script_path=str(job.script_path),
        output_dir=str(job.output_dir),
        start_time=start_ts,
        end_time=end_ts,
        duration_seconds=duration,
        urls_processed=urls_processed,
        total_bytes=total_bytes,
        throughput_pages_per_min=throughput,
        total_output_files=len(after_snapshot),
        total_output_bytes=total_output_bytes,
        status=status,
        return_code=process.returncode,
        error=error_message,
    )


def write_reports(results: Iterable[BenchmarkResult], timestamp: str) -> None:
    ensure_benchmark_dir()
    json_path = BENCHMARK_DIR / f"benchmarks_{timestamp}.json"
    csv_path = BENCHMARK_DIR / f"benchmarks_{timestamp}.csv"

    data = [asdict(r) for r in results]
    json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    if data:
        fieldnames = list(data[0].keys())
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)


def build_jobs() -> List[ScriptJob]:
    kb_dir = REPO_ROOT / "public" / "knowledge_base"
    return [
        ScriptJob(
            key="docs-sequential-v1",
            script_path=REPO_ROOT / "crawl4AI-agent" / "crawl4AI-examples" / "2-crawl_docs_sequential.py",
            output_dir=kb_dir,
            description="Legacy sequential crawler (v1)",
            default_args=[],
            domain_hint="automationghana.com",
        ),
        ScriptJob(
            key="docs-fast-v1",
            script_path=REPO_ROOT / "crawl4AI-agent" / "crawl4AI-examples" / "3-crawl_docs_FAST.py",
            output_dir=kb_dir,
            description="Legacy parallel crawler (v1)",
            default_args=[],
            domain_hint="automationghana.com",
        ),
        ScriptJob(
            key="woocommerce",
            script_path=REPO_ROOT / "crawl4AI-agent" / "crawl4AI-examples" / "crawl_woocommerce_products.py",
            output_dir=kb_dir,
            description="WooCommerce product crawler",
            default_args=[],
            domain_hint="store.automationghana.com",
        ),
        ScriptJob(
            key="docs-sequential-v2",
            script_path=REPO_ROOT / "crawl4AI-agent-v2" / "crawl4AI-examples" / "2-crawl_docs_sequential.py",
            output_dir=kb_dir,
            description="Sequential crawler (v2)",
            default_args=[],
            domain_hint="automationghana.com",
        ),
        ScriptJob(
            key="sitemap-parallel",
            script_path=REPO_ROOT / "crawl4AI-agent-v2" / "crawl4AI-examples" / "3-crawl_sitemap_in_parallel.py",
            output_dir=kb_dir,
            description="Parallel sitemap crawler (v2)",
            default_args=[],
            domain_hint="automationghana.com",
        ),
        ScriptJob(
            key="llms-txt",
            script_path=REPO_ROOT / "crawl4AI-agent-v2" / "crawl4AI-examples" / "4-crawl_llms_txt.py",
            output_dir=kb_dir,
            description="LLMs.txt / Markdown crawler (v2)",
            default_args=[],
            domain_hint="automationghana.com",
        ),
        ScriptJob(
            key="recursive-v2",
            script_path=REPO_ROOT / "crawl4AI-agent-v2" / "crawl4AI-examples" / "5-crawl_site_recursively.py",
            output_dir=kb_dir,
            description="Recursive site crawler (v2)",
            default_args=[],
            domain_hint="automationghana.com",
        ),
    ]


def filter_jobs(jobs: List[ScriptJob], script_keys: Sequence[str], domain_filter: str | None) -> List[ScriptJob]:
    filtered = jobs
    if script_keys:
        wanted = {k.lower() for k in script_keys}
        filtered = [job for job in filtered if job.key.lower() in wanted]
    if domain_filter:
        filtered = [job for job in filtered if job.domain_hint and domain_filter.lower() in job.domain_hint.lower()]
    return filtered


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Crawl4AI benchmark scripts")
    parser.add_argument(
        "--script",
        action="append",
        help="Limit to specific script key (e.g., sitemap-parallel). Can be repeated.",
    )
    parser.add_argument(
        "--domain",
        help="Filter scripts whose domain hint contains this substring (e.g., automationghana.com)",
    )
    parser.add_argument(
        "--venv",
        type=Path,
        help="Path to a virtualenv to use for subprocess execution.",
    )
    return parser.parse_args()


def build_env(venv: Path | None) -> Dict[str, str]:
    env = os.environ.copy()
    if venv:
        bin_path = venv / "bin"
        scripts_path = venv / "Scripts"
        if bin_path.exists():
            env["PATH"] = f"{bin_path}{os.pathsep}" + env.get("PATH", "")
            env["VIRTUAL_ENV"] = str(venv)
        elif scripts_path.exists():
            env["PATH"] = f"{scripts_path}{os.pathsep}" + env.get("PATH", "")
            env["VIRTUAL_ENV"] = str(venv)
    return env


async def main() -> None:
    args = parse_args()
    jobs = filter_jobs(build_jobs(), args.script or [], args.domain)
    if not jobs:
        raise SystemExit("No scripts matched the provided filters.")

    python_cmd = resolve_python(args.venv)
    env = build_env(args.venv)

    results: List[BenchmarkResult] = []
    for job in jobs:
        print(f"Running {job.key} via {python_cmd}...")
        result = await run_job(job, python_cmd, env)
        results.append(result)
        print(
            f"Completed {job.key}: status={result.status}, urls={result.urls_processed}, "
            f"bytes={result.total_bytes}, throughput={result.throughput_pages_per_min:.2f} pages/min"
        )

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    write_reports(results, timestamp)
    print(f"Reports written to {BENCHMARK_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
