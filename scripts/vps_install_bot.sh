#!/bin/bash
# Установка бота на VPS (Ubuntu). Запуск: bash vps_install_bot.sh
set -eu

BOT_DIR="$HOME/telegram-booking/bot"
REPO="$HOME/telegram-booking"

echo "==> Node..."
node -v

echo "==> Код..."
cd "$REPO/bot"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

echo "==> .env..."
if [ ! -f .env ]; then
  echo "Нет .env в $BOT_DIR"
  exit 1
fi
chmod 600 .env

echo "==> systemd..."
NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/booking-bot.service <<EOF
[Unit]
Description=Telegram booking bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$BOT_DIR
Environment=NODE_ENV=production
ExecStart=$NODE_BIN index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable booking-bot
systemctl restart booking-bot
sleep 2
systemctl status booking-bot --no-pager || true
echo ""
echo "Готово. Проверь бота: /start"
