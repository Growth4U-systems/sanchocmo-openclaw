#!/bin/bash
# meeting-intelligence Scheduler Setup
# Configures launchd to run meeting-intelligence daily at 7am

PLIST_PATH="$HOME/Library/LaunchAgents/com.growth4u.meeting-intelligence.plist"

cat > "$PLIST_PATH" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.growth4u.meeting-intelligence</string>

    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/claude</string>
        <string>-p</string>
        <string>Run meeting-intelligence for yesterday</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>7</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/alfonsosb/.claude/logs/meeting-intelligence-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/alfonsosb/.claude/logs/meeting-intelligence-stderr.log</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

# Load the job
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ meeting-intelligence scheduler installed"
echo "   Runs: Daily at 7:00 AM"
echo "   Logs: ~/.claude/logs/meeting-intelligence-*.log"
echo ""
echo "To test: launchctl start com.growth4u.meeting-intelligence"
