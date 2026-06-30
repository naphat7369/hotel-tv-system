#!/bin/bash

echo "====================================="
echo "Hotel TV System - Deployment Fixer"
echo "====================================="

# 1. Pull latest code
echo "[1/6] Pulling latest code..."
cd ~/hotel-tv-system
git fetch origin
git reset --hard origin/main

# 2. Rebuild CMS Frontend
echo "[2/6] Rebuilding CMS Frontend..."
cd ~/hotel-tv-system/cms-frontend
rm -rf node_modules
npm install
npm run build

# 3. Rebuild Portal Frontend
echo "[3/6] Rebuilding Portal Frontend..."
cd ~/hotel-tv-system/portal-frontend
rm -rf node_modules
npm install
npm run build

# 4. Rebuild Server
echo "[4/6] Rebuilding Server..."
cd ~/hotel-tv-system/server
rm -rf node_modules
npm install
npm run build

# 5. Nuke and Recreate PM2 Processes
echo "[5/6] Recreating PM2 Processes..."
pm2 delete all

cd ~/hotel-tv-system/server
pm2 start dist/index.js --name hotel_server

cd ~/hotel-tv-system/cms-frontend
pm2 serve dist 5173 --name cms_frontend --spa

cd ~/hotel-tv-system/portal-frontend
pm2 serve dist 5174 --name portal_frontend --spa

pm2 save

echo "[6/6] Done! PM2 has been fully reset."
echo "====================================="
echo "ALL DONE! Please go to CMS -> Device Management and click Clear Cache + Reload UI for your TV."
