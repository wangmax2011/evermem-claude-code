#!/bin/bash

# =============================================================================
# EverMem Claude Code Plugin Installation Script
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}▶ $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# =============================================================================
# Check Prerequisites
# =============================================================================
check_prerequisites() {
    log_step "Checking Prerequisites"

    # Check Claude Code
    if ! command -v claude &> /dev/null; then
        log_error "Claude Code is not installed"
        log_info "Install with: npm install -g @anthropic-ai/claude-code"
        exit 1
    fi
    log_success "Claude Code found: $(claude --version 2>/dev/null || echo 'installed')"

    # Check EverMemOS
    log_info "Checking EverMemOS connection..."
    if curl -s http://localhost:1995/health > /dev/null 2>&1; then
        log_success "EverMemOS is running on localhost:1995"
    else
        log_warn "EverMemOS is not running on localhost:1995"
        log_info "Please start EverMemOS first:"
        log_info "  cd /path/to/EverMemOS && ./install.sh"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# =============================================================================
# Install Dependencies
# =============================================================================
install_deps() {
    log_step "Installing Plugin Dependencies"

    cd "$SCRIPT_DIR"

    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Are you in the correct directory?"
        exit 1
    fi

    if [[ -d "node_modules" ]]; then
        log_info "Dependencies already installed"
    else
        log_info "Running npm install..."
        npm install
        log_success "Dependencies installed"
    fi
}

# =============================================================================
# Configure Plugin
# =============================================================================
configure_plugin() {
    log_step "Configuring Plugin"

    # Set environment variables
    log_info "Setting environment variables..."

    SHELL_PROFILE=""
    if [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_PROFILE="$HOME/.zshrc"
    elif [[ "$SHELL" == *"bash"* ]]; then
        SHELL_PROFILE="$HOME/.bashrc"
    else
        SHELL_PROFILE="$HOME/.profile"
    fi

    # Check if already configured
    if grep -q "EVERMEM_API_URL" "$SHELL_PROFILE" 2>/dev/null; then
        log_info "EVERMEM_API_URL already configured in $SHELL_PROFILE"
    else
        log_info "Adding EVERMEM_API_URL to $SHELL_PROFILE"
        echo "" >> "$SHELL_PROFILE"
        echo "# EverMem Plugin Configuration" >> "$SHELL_PROFILE"
        echo 'export EVERMEM_API_URL="http://localhost:1995"' >> "$SHELL_PROFILE"
        log_success "Configuration added to $SHELL_PROFILE"
        log_info "Please run: source $SHELL_PROFILE"
    fi

    export EVERMEM_API_URL="http://localhost:1995"
}

# =============================================================================
# Install to Claude Code
# =============================================================================
install_to_claude() {
    log_step "Installing to Claude Code"

    cd "$SCRIPT_DIR"

    log_info "Installing plugin..."
    if claude --plugin-dir . 2>&1 | tee /tmp/claude-plugin-install.log; then
        log_success "Plugin installed successfully"
    else
        log_warn "Plugin installation may have issues"
        cat /tmp/claude-plugin-install.log
    fi
}

# =============================================================================
# Test Installation
# =============================================================================
test_installation() {
    log_step "Testing Installation"

    log_info "Testing plugin commands..."

    # Test with node directly
    cd "$SCRIPT_DIR/hooks/scripts"

    TEST_RESULT=$(echo '{"prompt":"test query","cwd":"/test"}' | node inject-memories.js 2>&1 || true)

    if echo "$TEST_RESULT" | grep -q "continue"; then
        log_success "Plugin test passed"
    else
        log_warn "Plugin test returned: $TEST_RESULT"
    fi

    echo ""
    log_info "To verify in Claude Code, run:"
    log_info "  /evermem:help"
}

# =============================================================================
# Show Usage
# =============================================================================
show_usage() {
    cat << EOF

╔══════════════════════════════════════════════════════════════════════════════╗
║                   EverMem Plugin Installation Complete!                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

📋 Usage:

   1. Start Claude Code:
      claude

   2. Use EverMem commands:
      /evermem:help      - Show help message
      /evermem:hub       - Open Memory Hub dashboard
      /evermem:session   - Show current session memory
      /evermem:forget    - Clear current session memory

📁 Plugin Location:
   $SCRIPT_DIR

🔧 Configuration:
   Environment variable: EVERMEM_API_URL=http://localhost:1995

🐛 Troubleshooting:

   If plugin doesn't work:
   1. Check EverMemOS is running:
      curl http://localhost:1995/health

   2. Check environment variable:
      echo $EVERMEM_API_URL

   3. Reload shell configuration:
      source ~/.zshrc  # or ~/.bashrc

   4. Reinstall plugin:
      claude plugin uninstall evermem
      cd $SCRIPT_DIR && ./install-plugin.sh

📚 Documentation:
   See README.md for more information

EOF
}

# =============================================================================
# Uninstall
# =============================================================================
uninstall() {
    log_step "Uninstalling EverMem Plugin"

    log_info "Removing from Claude Code..."
    claude plugin uninstall evermem 2>/dev/null || true

    log_info "Cleaning up configuration..."
    # Remove from shell profile
    SHELL_PROFILE=""
    if [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_PROFILE="$HOME/.zshrc"
    elif [[ "$SHELL" == *"bash"* ]]; then
        SHELL_PROFILE="$HOME/.bashrc"
    else
        SHELL_PROFILE="$HOME/.profile"
    fi

    if [[ -f "$SHELL_PROFILE" ]]; then
        sed -i.bak '/EVERMEM_API_URL/d' "$SHELL_PROFILE" 2>/dev/null || true
        sed -i.bak '/EverMem Plugin Configuration/d' "$SHELL_PROFILE" 2>/dev/null || true
        log_success "Configuration removed from $SHELL_PROFILE"
    fi

    log_success "Uninstallation complete"
}

# =============================================================================
# Main
# =============================================================================
main() {
    cat << EOF

╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║          ███████╗██╗   ██╗███████╗██████╗ ███╗   ███╗███████╗                ║
║          ██╔════╝██║   ██║██╔════╝██╔══██╗████╗ ████║██╔════╝                ║
║          █████╗  ██║   ██║█████╗  ██████╔╝██╔████╔██║█████╗                  ║
║          ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝                  ║
║          ███████╗ ╚████╔╝ ███████╗██║  ██║██║ ╚═╝ ██║███████╗                ║
║          ╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝                ║
║                                                                              ║
║                    Claude Code Plugin Installer                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

EOF

    check_prerequisites
    install_deps
    configure_plugin
    install_to_claude
    test_installation
    show_usage
}

# Handle arguments
case "${1:-}" in
    --uninstall|-u)
        uninstall
        ;;
    --help|-h)
        cat << EOF
EverMem Claude Code Plugin Installation Script

Usage: $0 [OPTION]

Options:
    --help, -h       Show this help message
    --uninstall, -u  Uninstall the plugin

Examples:
    $0              # Install the plugin
    $0 --uninstall  # Remove the plugin

EOF
        ;;
    *)
        main
        ;;
esac
