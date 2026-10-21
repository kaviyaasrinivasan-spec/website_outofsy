#!/bin/bash
# OOS deployment / update script.  Run ON THE SERVER from the OOS directory:
#     cd ~/website_outofsy/OOS && bash deploy.sh
#
# Safe to re-run. It never touches backend/.env -- edit that by hand.

set -e

OOS_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$OOS_DIR/venv"
PORT="${BACKEND_PORT:-8001}"

echo "========================================"
echo "OOS deploy"
echo "  directory: $OOS_DIR"
echo "========================================"
echo

# --- 0. sanity ---------------------------------------------------------------
if [ ! -f "$OOS_DIR/package.json" ] || [ ! -d "$OOS_DIR/backend" ]; then
    echo "ERROR: run this from the OOS directory (needs package.json and backend/)."
    exit 1
fi

if [ ! -f "$OOS_DIR/backend/.env" ]; then
    echo "ERROR: backend/.env is missing."
    echo "Create it first -- see the production template in the deploy notes."
    exit 1
fi

# Refuse to deploy with localhost values still in place; Google SSO and cookies
# would silently break in ways that are painful to debug.
if grep -qE '^(FRONTEND_URL|GOOGLE_REDIRECT_URI)=.*localhost' "$OOS_DIR/backend/.env"; then
    echo "ERROR: backend/.env still points at localhost."
    echo "  FRONTEND_URL must be        https://outofsyllabuss.org"
    echo "  GOOGLE_REDIRECT_URI must be https://outofsyllabuss.org/api/auth/google/callback"
    exit 1
fi

if ! grep -q '^COOKIE_SECURE=true' "$OOS_DIR/backend/.env"; then
    echo "WARNING: COOKIE_SECURE is not true. Sessions will not persist over HTTPS."
    echo "         Set it once SSL is active."
    echo
fi

# --- 1. backend dependencies -------------------------------------------------
echo "[1/6] Python environment"
if [ ! -d "$VENV" ]; then
    echo "      creating venv..."
    python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --upgrade pip --quiet
"$VENV/bin/pip" install -r "$OOS_DIR/backend/requirements.txt" --quiet
echo "      dependencies installed"
echo

# --- 2. database schema ------------------------------------------------------
echo "[2/6] Database schema"
cd "$OOS_DIR/backend"
"$VENV/bin/python" -m app.init_db
"$VENV/bin/python" -m app.sync_columns --apply
cd "$OOS_DIR"
echo

# --- 3. frontend build -------------------------------------------------------
echo "[3/6] Frontend build"
if [ ! -f "$OOS_DIR/.env.production" ]; then
    echo "VITE_API_URL=/api" > "$OOS_DIR/.env.production"
    echo "      created .env.production (VITE_API_URL=/api)"
fi
npm install --silent
npm run build
echo "      built to dist/"
echo

# --- 4. systemd service ------------------------------------------------------
echo "[4/6] systemd service"
SERVICE=/etc/systemd/system/oos-backend.service
if [ ! -f "$SERVICE" ]; then
    cat > "$SERVICE" <<EOF
[Unit]
Description=OOS Backend API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$OOS_DIR/backend
ExecStart=$VENV/bin/uvicorn app.main:app --host 127.0.0.1 --port $PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable oos-backend
    echo "      service created"
else
    echo "      service already exists"
fi

systemctl restart oos-backend
sleep 3
if systemctl is-active --quiet oos-backend; then
    echo "      backend running on 127.0.0.1:$PORT"
else
    echo "      ERROR: backend failed to start. Logs:"
    journalctl -u oos-backend -n 30 --no-pager
    exit 1
fi
echo

# --- 5. health check ---------------------------------------------------------
echo "[5/6] Health check"
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/health" || echo "000")
echo "      /health          -> $HEALTH"
INTERN=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/internships" || echo "000")
echo "      /internships     -> $INTERN"
GOOGLE=$(curl -s "http://127.0.0.1:$PORT/auth/google/status" || echo "unreachable")
echo "      google sso       -> $GOOGLE"
if [ "$HEALTH" != "200" ]; then
    echo "      ERROR: backend is not healthy."
    journalctl -u oos-backend -n 30 --no-pager
    exit 1
fi
echo

# --- 6. nginx ----------------------------------------------------------------
echo "[6/6] nginx"
if [ -f /etc/nginx/sites-enabled/outofsyllabuss.org ]; then
    if nginx -t 2>/dev/null; then
        systemctl reload nginx
        echo "      config valid, reloaded"
    else
        echo "      ERROR: nginx config invalid -- NOT reloading (other sites stay up)"
        nginx -t
        exit 1
    fi
else
    echo "      no site config yet -- create /etc/nginx/sites-available/outofsyllabuss.org"
    echo "      (see the nginx block in the deploy notes), then:"
    echo "        ln -s /etc/nginx/sites-available/outofsyllabuss.org /etc/nginx/sites-enabled/"
    echo "        nginx -t && systemctl reload nginx"
fi

echo
echo "========================================"
echo "Done."
echo "  logs:    journalctl -u oos-backend -f"
echo "  restart: systemctl restart oos-backend"
echo "========================================"
