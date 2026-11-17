#!/bin/sh
# One attempt before JVM startup; Flutter's internal retry cannot relaunch Gradle.
set -eu
requested=false
for argument do
    if [ "$argument" = assembleDevDebug ]; then requested=true; fi
done
if [ "$requested" != true ]; then
    printf '%s\n' B3_REJECT_REQUEST >&2
    exit 1
fi
mkdir /b3/state/attempt 2>/dev/null || { printf '%s\n' B3_REJECT_RETRY >&2; exit 1; }
exec /bin/sh /b3/gradlew "$@"
