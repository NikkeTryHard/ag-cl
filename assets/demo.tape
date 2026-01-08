# VHS Demo Tape for ag-cl TUI
# Install: go install github.com/charmbracelet/vhs@latest
# Run: vhs assets/demo.tape
# Output: assets/demo.gif

Output assets/demo.gif

Set FontSize 14
Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"

# Start the TUI
Type "ag-cl"
Enter
Sleep 2s

# Show the dashboard
Sleep 2s

# Open accounts modal
Type "a"
Sleep 2s

# Close accounts
Escape
Sleep 1s

# Open port modal
Type "p"
Sleep 1.5s

# Close port modal
Escape
Sleep 1s

# Toggle server (start)
Type "s"
Sleep 2s

# Open logs
Type "l"
Sleep 2s

# Close logs
Escape
Sleep 1s

# Open command palette
Type ":"
Sleep 2s

# Close command palette
Escape
Sleep 1s

# Quit
Type "q"
Sleep 500ms
