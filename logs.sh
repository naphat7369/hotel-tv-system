#!/usr/bin/env bash
# ==============================================================================
# Hotel TV System - Log Viewer & Diagnostic Tool
# S31 Sukhumvit Hotel
#
# Usage:
#   ./logs.sh               # Watch real-time logs from all TV boxes
#   ./logs.sh errors        # Watch only ERROR logs from TV boxes
#   ./logs.sh room <ROOM>   # Filter logs for a specific room (e.g. ./logs.sh room 1101)
#   ./logs.sh box <SERIAL>  # Filter logs for a specific box (e.g. ./logs.sh box BOX-866814EC)
#   ./logs.sh server        # Watch PM2 backend server logs
#   ./logs.sh status        # Show log files status and disk usage
# ==============================================================================

LOG_FILE="/home/itadmin/hotel-tv-system/server/logs/devices.log"

case "$1" in
  errors|error)
    echo "🔍 Watching ERROR logs from all TV boxes (Ctrl+C to exit)..."
    grep --line-buffered "\[ERROR\]" "$LOG_FILE" 2>/dev/null || true
    tail -f -n 20 "$LOG_FILE" 2>/dev/null | grep --line-buffered "\[ERROR\]"
    ;;
  room)
    if [ -z "$2" ]; then
      echo "❌ Usage: ./logs.sh room <ROOM_NUMBER>"
      exit 1
    fi
    echo "🔍 Filtering logs for Room $2 (Ctrl+C to exit)..."
    grep --line-buffered "\[Room:$2\]" "$LOG_FILE" 2>/dev/null || true
    tail -f -n 20 "$LOG_FILE" 2>/dev/null | grep --line-buffered "\[Room:$2\]"
    ;;
  box)
    if [ -z "$2" ]; then
      echo "❌ Usage: ./logs.sh box <BOX_SERIAL>"
      exit 1
    fi
    echo "🔍 Filtering logs for Box $2 (Ctrl+C to exit)..."
    grep --line-buffered "\[$2\]" "$LOG_FILE" 2>/dev/null || true
    tail -f -n 20 "$LOG_FILE" 2>/dev/null | grep --line-buffered "\[$2\]"
    ;;
  server)
    echo "🖥️  Watching Hotel Server PM2 logs (Ctrl+C to exit)..."
    pm2 logs hotel_server
    ;;
  status)
    echo "=========================================================="
    echo "📊 Hotel TV System - Log Status & Storage"
    echo "=========================================================="
    echo ""
    echo "📁 Device Log File:"
    ls -lh "$LOG_FILE" 2>/dev/null || echo "No device logs yet"
    echo ""
    echo "📁 PM2 Log Files (~/.pm2/logs):"
    ls -lh ~/.pm2/logs/
    echo ""
    echo "⚙️  PM2 Logrotate Config:"
    pm2 conf pm2-logrotate 2>/dev/null | grep -E "max_size|retain|compress|rotateInterval" || true
    echo "=========================================================="
    ;;
  *)
    echo "📺 Watching real-time logs from all TV boxes (Ctrl+C to exit)..."
    if [ ! -f "$LOG_FILE" ]; then
      touch "$LOG_FILE"
    fi
    tail -f -n 30 "$LOG_FILE"
    ;;
esac
