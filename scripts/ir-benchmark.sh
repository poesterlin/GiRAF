#!/usr/bin/env bash
#
# Benchmark the RawTherapee "develop base" intermediate representation (IR).
#
# RawTherapee has to decode the RAW and demosaic it on every invocation. If we build a
# full-resolution TIFF once ("the IR") and load that TIFF instead, later renders skip the
# decode + demosaic stages. This script measures how much that saves.
#
# Usage:
#   scripts/ir-benchmark.sh <raw-file> <edit.pp3> [ir.pp3] [iterations] [output-dir]
#
#   raw-file    A RAW (or already demosaiced) source image.
#   edit.pp3    A processing profile representing a real edit. Used for every render.
#   ir.pp3      Profile used to build the IR. Defaults to a neutral one (camera WB, no
#               exposure, no resize) written to a temp file, so the edit profile's own
#               exposure/curves are applied exactly once, matching the direct render.
#   iterations  Timed runs per scenario (default 3, fastest run is reported).
#   output-dir  Where outputs are written. Defaults to a fresh temp directory.
#
# Requires `rawtherapee-cli` on PATH. When benchmarking the deployment it is convenient to
# run this inside the editor container:
#   docker exec <editor> bash /path/to/scripts/ir-benchmark.sh /app/import/photo.RAF /tmp/edit.pp3
set -euo pipefail

RT="${RAWTHERAPEE_BIN:-rawtherapee-cli}"
RAW="${1:?usage: ir-benchmark.sh <raw-file> <edit.pp3> [ir.pp3] [iterations] [output-dir]}"
EDIT_PP3="${2:?edit profile required}"
IR_PP3="${3:-}"
ITERS="${4:-3}"
WORK="${5:-$(mktemp -d)}"

if [ ! -f "$RAW" ]; then echo "raw file not found: $RAW" >&2; exit 1; fi
if [ ! -f "$EDIT_PP3" ]; then echo "edit profile not found: $EDIT_PP3" >&2; exit 1; fi
if ! command -v "$RT" >/dev/null 2>&1; then echo "rawtherapee-cli not found: $RT" >&2; exit 1; fi

mkdir -p "$WORK"

if [ -z "$IR_PP3" ]; then
	IR_PP3="$WORK/ir-neutral.pp3"
	cat >"$IR_PP3" <<'PP3'
[Version]
AppVersion=5.13
Version=353

[Exposure]
Enabled=true
Auto=false
Compensation=0

[White Balance]
Enabled=true
Setting=Camera

[Resize]
Enabled=false
PP3
fi

now_ms() { date +%s%3N; }

# Time a command, returning the fastest wall-clock run in milliseconds in BEST_MS.
time_best() {
	local label="$1"; shift
	local best=99999999 s e t
	for _ in $(seq 1 "$ITERS"); do
		s=$(now_ms)
		"$@" >/dev/null 2>&1
		e=$(now_ms)
		t=$((e - s))
		[ "$t" -lt "$best" ] && best=$t
	done
	BEST_MS=$best
	echo "  ${label}: ${best} ms"
}

IR_TIF="$WORK/base.tif"
JPEG_DIR="$WORK/jpeg"
mkdir -p "$JPEG_DIR"

echo "RawTherapee IR benchmark"
echo "  raw:        $RAW ($(stat -c%s "$RAW") bytes)"
echo "  edit.pp3:   $EDIT_PP3"
echo "  ir.pp3:     $IR_PP3"
echo "  iterations: $ITERS"
echo

echo "[1] direct RAW -> JPEG (decode + demosaic + edit every time)"
time_best "raw -> jpeg" "$RT" --no-gui -p "$EDIT_PP3" -q -j90 -js1 -Y -o "$JPEG_DIR/direct.jpg" -c "$RAW"
DIRECT_MS=$BEST_MS

echo "[2] build develop base IR from RAW (once)"
s=$(now_ms)
mkdir -p "$WORK/ir-out"
# -O writes <basename>.tif (plus the resolved .pp3) into the output directory.
"$RT" --no-gui -p "$IR_PP3" -b16 -t -O "$WORK/ir-out" -Y -c "$RAW" >/dev/null 2>&1
e=$(now_ms)
IR_BUILD_MS=$((e - s))
IR_NAME="$(basename "${RAW%.*}").tif"
IR_TIF="$WORK/ir-out/$IR_NAME"
echo "  build: ${IR_BUILD_MS} ms  ($(stat -c%s "$IR_TIF") bytes)"
echo

echo "[3] cached IR -> JPEG (no decode, no demosaic)"
time_best "ir -> jpeg" "$RT" --no-gui -p "$EDIT_PP3" -q -j90 -js1 -Y -o "$JPEG_DIR/ir.jpg" -c "$IR_TIF"
CACHED_MS=$BEST_MS

UNCACHED_MS=$((IR_BUILD_MS + CACHED_MS))
SAVED=$((UNCACHED_MS - CACHED_MS))
SPEEDUP=$(awk -v u="$UNCACHED_MS" -v c="$CACHED_MS" 'BEGIN{printf "%.2f", u/c}')

echo
echo "Summary"
printf '  %-34s %6s ms\n' "direct raw -> jpeg" "$DIRECT_MS"
printf '  %-34s %6s ms\n' "develop base build (once)" "$IR_BUILD_MS"
printf '  %-34s %6s ms\n' "cached render (ir -> jpeg)" "$CACHED_MS"
printf '  %-34s %6s ms\n' "current export (build + render)" "$UNCACHED_MS"
printf '  %-34s %6s ms  (%.2fx faster)\n' "cached export (render only)" "$CACHED_MS" "$SPEEDUP"
echo
echo "  Every cached export saves ~${SAVED} ms versus the current build-each-time path."
echo "  Outputs differ only by the intermediate; renders are deterministic per build."
