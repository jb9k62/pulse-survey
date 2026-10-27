#!/bin/sh
# `npm run start:dev`: the API in watch mode, with @pulse/contracts rebuilt on change.
#
# Two watchers run side by side:
# - `tsc --watch` rebuilds packages/contracts/dist when a contract source changes.
# - `nest start --watch` recompiles the API and restarts it. Its own compiler only sees the
#   contracts' .d.ts files, so a change that leaves the types alone (a `.max()` limit, say)
#   would not restart it. nest-cli.json therefore also watches the contracts' built .js as an
#   asset, and Nest restarts the app when one changes (the copy it makes under
#   dist/.contracts-watch is a side effect nothing loads).
#
# Stopping cleanly takes three things, each found by testing:
# - Both watchers run in the background and the shell polls, because a shell does not run a
#   trap while a foreground child is running.
# - The trap kills each watcher's whole process tree: on SIGTERM, `nest start --watch` exits
#   without stopping the app it started, which would keep the port.
# - The loop also exits when npm, the parent, is gone: npm exits on SIGTERM without passing
#   it on, so a process manager that signals only npm would otherwise orphan everything here.

kill_tree() {
  for child in $(pgrep -P "$1"); do
    kill_tree "$child"
  done
  kill "$1" 2>/dev/null
}

tsc -p ../../packages/contracts --watch --preserveWatchOutput &
contracts=$!
NODE_ENV=development nest start --watch &
api=$!
parent=$PPID
trap 'trap - EXIT; kill_tree "$contracts"; kill_tree "$api"; exit 0' INT TERM EXIT

while kill -0 "$api" 2>/dev/null && kill -0 "$parent" 2>/dev/null; do
  sleep 1
done
