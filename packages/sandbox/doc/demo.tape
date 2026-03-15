# Prerequisites
# export PATH="$PATH:~/dev/s/forked/pi-mono/packages/coding-agent/dist"

# ─────────────────────────────────────────────────────────────
# Settings
# ─────────────────────────────────────────────────────────────

Output demo.gif
Output demo.mp4

Require pi
Require cat

Set FontSize 18
Set Width 1200
Set Height 800

Set TypingSpeed 5ms
Set Framerate 24
Set PlaybackSpeed 1.0

Env PROMPT_COMMAND ""
Hide
Type "unset PROMPT_COMMAND"
Enter
Sleep 100ms
Show

# ─────────────────────────────────────────────────────────────
# Create .pi/sandbox.json
# ─────────────────────────────────────────────────────────────

Type "cat > .pi/sandbox.json << 'EOF'"
Enter
Type "{"
Enter
Type '  "enabled": true,'
Enter
Type '  "network": {'
Enter
Type '    "allowedDomains": [],'
Enter
Type '    "deniedDomains": []'
Enter
Type "  },"
Enter
Type '  "filesystem": {'
Enter
Type '    "denyRead": [".env", "~/.ssh"],'
Enter
Type '    "allowWrite": ["."],'
Enter
Type '    "denyWrite": [".env", "*.secret"]'
Enter
Type "  }"
Enter
Type "}"
Enter
Type "EOF"
Enter

Sleep 1s

# ─────────────────────────────────────────────────────────────
# Open pi
# ─────────────────────────────────────────────────────────────

Type@50ms "pi --extension ~/dev/s/public/pi-extensions/packages/sandbox"
Enter

Sleep 3s

# ─────────────────────────────────────────────────────────────
# Network block → allow for this session only
# ─────────────────────────────────────────────────────────────

Type@50ms "Fetch https://sysid.github.io/about/ with curl and show me the <content>"
Enter

Sleep 6s

# Select menu: Down once → "Allow for this session only"
Down
Sleep 2s
Enter
Sleep 6s

# ─────────────────────────────────────────────────────────────
# Read block → hard fail, no prompt
# ─────────────────────────────────────────────────────────────

Type "Read the .env file and show me its contents"
Enter

Sleep 6s

# ─────────────────────────────────────────────────────────────
# exit pi
# ─────────────────────────────────────────────────────────────

Ctrl+D

Sleep 5s
