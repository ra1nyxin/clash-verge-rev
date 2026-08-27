#!/usr/bin/env python3

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a command with a timeout and bounded retries.",
    )
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--delay-seconds", type=int, default=15)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()

    if args.command[:1] == ["--"]:
        args.command = args.command[1:]
    if not args.command:
        parser.error("a command is required after --")
    if args.attempts < 1 or args.timeout_seconds < 1 or args.delay_seconds < 0:
        parser.error("attempts and timeout must be positive; delay cannot be negative")

    return args


def resolve_command(command: list[str]) -> list[str]:
    executable = shutil.which(command[0])
    if executable is None:
        return command

    resolved = [executable, *command[1:]]
    if os.name == "nt" and Path(executable).suffix.lower() in {".bat", ".cmd"}:
        return ["cmd.exe", "/d", "/s", "/c", subprocess.list2cmdline(resolved)]
    return resolved


def main() -> int:
    args = parse_args()
    command = resolve_command(args.command)

    for attempt in range(1, args.attempts + 1):
        print(
            f"Running attempt {attempt}/{args.attempts}: {' '.join(args.command)}",
            file=sys.stderr,
            flush=True,
        )
        try:
            result = subprocess.run(command, timeout=args.timeout_seconds, check=False)
            return_code = result.returncode
        except subprocess.TimeoutExpired:
            return_code = 124
            print(
                f"::warning::Command timed out after {args.timeout_seconds} seconds",
                file=sys.stderr,
                flush=True,
            )

        if return_code == 0:
            return 0
        if attempt == args.attempts:
            return return_code

        delay = args.delay_seconds * attempt
        print(
            f"::warning::Attempt {attempt} failed with exit code {return_code}; "
            f"retrying in {delay} seconds",
            file=sys.stderr,
            flush=True,
        )
        time.sleep(delay)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
