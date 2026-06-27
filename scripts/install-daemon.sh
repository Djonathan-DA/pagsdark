#!/bin/bash
# Instala o PagsDark como servico de segundo plano (LaunchAgent do macOS).
# Depois disso o servidor + agendador ficam SEMPRE rodando: os posts disparam
# mesmo com o navegador/app fechado. Inicia sozinho ao ligar/logar no Mac.
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LABEL="com.pagsdark.server"
AGENTS="$HOME/Library/LaunchAgents"
PLIST="$AGENTS/$LABEL.plist"

if [ -z "$NODE" ]; then echo "Node nao encontrado no PATH."; exit 1; fi
mkdir -p "$AGENTS" "$DIR/data"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/src/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/daemon.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/daemon.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_NO_WARNINGS</key><string>1</string>
  </dict>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 1
echo "✅ PagsDark instalado como servico (label: $LABEL)."
echo "   Rodando em segundo plano e inicia sozinho ao logar."
echo "   Logs: $DIR/data/daemon.log"
echo "   Abra a interface em: http://localhost:4310"
echo "   Para remover:  npm run daemon:uninstall"
