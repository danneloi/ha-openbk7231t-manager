#!/command/with-contenv bash
# The shebang above (s6-overlay's with-contenv) re-exports the container's
# environment (SUPERVISOR_TOKEN, any options passed via -e, etc.) before
# this script runs - without it, s6-overlay's init starts services with an
# almost empty environment.
set -e

echo "[openbk7231t_manager] Starting OpenBK7231T Manager add-on..."

exec python3 /app/main.py
