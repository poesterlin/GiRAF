#!/bin/sh
# Starts GiRAF as an unprivileged user (PUID:PGID, default 1000:1000) so files it writes to mounted
# folders belong to that user on the host instead of root.
#
# Started as root, it first hands the folders GiRAF writes to over to that user, fixing only files
# that belong to someone else, then drops root for good. Extra import folders and the LUT folder are
# never changed: GiRAF only reads them.
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" != "0" ]; then
	exec "$@"
fi

for dir in "${IMPORT_DIR:-}" "${EXPORT_DIR:-}" "${TMP_DIR:-}" "${DATA_DIR:-/app/data}" "${DEVELOP_CACHE_DIR:-}"; do
	[ -n "$dir" ] || continue
	mkdir -p "$dir"
	# A shared, sticky folder such as /tmp is writable by everyone already and is not ours to take over
	if [ -k "$dir" ]; then
		continue
	fi
	find "$dir" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown -h "$PUID:$PGID" {} +
done

# RawTherapee keeps its settings in the home folder
export HOME=/home/giraf
mkdir -p "$HOME"
chown "$PUID:$PGID" "$HOME"

exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
