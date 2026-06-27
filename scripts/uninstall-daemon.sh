#!/bin/bash
# Remove o servico de segundo plano do PagsDark.
LABEL="com.pagsdark.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "🛑 Servico do PagsDark removido. (O agendador so roda quando voce abrir o app.)"
