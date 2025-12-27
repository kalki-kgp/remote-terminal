# Distribution Guide

This document outlines the various ways to distribute Remote Terminal to users.

## Distribution Options

### 1. Homebrew (Recommended)

The most user-friendly option for macOS users.

#### Setup Requirements

1. **GitHub Repository** - Public repo with releases
2. **Homebrew Formula** - Ruby file describing the package
3. **Tap or homebrew-core** - Where to host the formula

#### Create a Homebrew Tap

```bash
# Create a new repo: homebrew-remote-terminal
# Add formula file: Formula/remote-terminal.rb
```

**Formula template (`Formula/remote-terminal.rb`):**

```ruby
class RemoteTerminal < Formula
  desc "Browser-based remote terminal access for macOS"
  homepage "https://github.com/anthropics/remote-terminal"
  url "https://github.com/anthropics/remote-terminal/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "SHA256_OF_TARBALL"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", "--production"
    libexec.install Dir["*"]

    # Create launcher script
    (bin/"remote-terminal").write <<~EOS
      #!/bin/bash
      cd "#{libexec}"
      exec node src/server.js "$@"
    EOS
  end

  def caveats
    <<~EOS
      To start remote-terminal:
        remote-terminal

      To enable auto-start on login:
        brew services start remote-terminal
    EOS
  end

  service do
    run [opt_bin/"remote-terminal"]
    keep_alive true
    log_path var/"log/remote-terminal.log"
    error_log_path var/"log/remote-terminal.log"
  end

  test do
    system "#{bin}/remote-terminal", "--help"
  end
end
```

#### User Installation

```bash
# Add tap
brew tap anthropics/remote-terminal

# Install
brew install remote-terminal

# Start
remote-terminal

# Or run as service
brew services start remote-terminal
```

---

### 2. One-liner Install Script

Quick installation via curl.

#### Host the Script

Upload `install.sh` to a public URL (GitHub raw, your domain, etc.)

#### User Installation

```bash
curl -fsSL https://raw.githubusercontent.com/anthropics/remote-terminal/main/install.sh | bash
```

#### Considerations

- Users should review scripts before running
- Provide checksum for verification
- Consider signed scripts for security

---

### 3. npm Global Package

For users who already have Node.js.

#### Setup

1. Update `package.json`:

```json
{
  "name": "remote-terminal",
  "version": "1.0.0",
  "bin": {
    "remote-terminal": "./bin/remote-terminal.js"
  }
}
```

2. Create `bin/remote-terminal.js`:

```javascript
#!/usr/bin/env node
import('../src/server.js');
```

3. Publish to npm:

```bash
npm login
npm publish
```

#### User Installation

```bash
npm install -g remote-terminal
remote-terminal
```

---

### 4. GitHub Releases

Direct download for power users.

#### Setup

1. Create release on GitHub
2. Attach tarball/zip of the project
3. Include install instructions in release notes

#### Create Release

```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Create tarball
tar -czvf remote-terminal-1.0.0.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  .
```

#### User Installation

```bash
# Download
curl -LO https://github.com/anthropics/remote-terminal/releases/download/v1.0.0/remote-terminal-1.0.0.tar.gz

# Extract
tar -xzf remote-terminal-1.0.0.tar.gz
cd remote-terminal

# Install
./install.sh
```

---

### 5. DMG Installer (Advanced)

Native macOS installer experience.

#### Requirements

- Apple Developer account (for signing)
- create-dmg or similar tool
- Notarization for Gatekeeper

#### Steps

1. Create app bundle structure
2. Sign the application
3. Create DMG with create-dmg
4. Notarize with Apple
5. Staple the ticket

```bash
# Install create-dmg
brew install create-dmg

# Create DMG
create-dmg \
  --volname "Remote Terminal" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --app-drop-link 425 178 \
  "RemoteTerminal-1.0.0.dmg" \
  "build/Remote Terminal.app"
```

---

## Comparison

| Method | Ease of Use | Auto-update | Dependencies | Signing Required |
|--------|-------------|-------------|--------------|------------------|
| Homebrew | Easy | Yes (brew upgrade) | Managed | No |
| curl script | Easy | Manual | Manual check | No |
| npm | Easy | npm update | Node.js | No |
| GitHub Release | Medium | Manual | Manual | No |
| DMG | Easiest | Manual | Bundled | Yes (recommended) |

## Recommended Approach

1. **Start with:** Homebrew tap + GitHub releases
2. **Add later:** npm package for developers
3. **Eventually:** DMG for non-technical users (requires Apple Developer account)

## Checklist Before Release

- [ ] Version number updated in package.json
- [ ] CHANGELOG.md updated
- [ ] README.md reflects current features
- [ ] All tests passing
- [ ] install.sh tested on fresh system
- [ ] uninstall.sh tested
- [ ] LaunchAgent tested
- [ ] GitHub release created with notes

## Auto-update Mechanism

For future consideration:

1. **Version check endpoint** - Server checks for updates on start
2. **Self-update script** - `remote-terminal update` command
3. **Homebrew** - Users run `brew upgrade`

Example version check:

```javascript
// On server start
async function checkForUpdates() {
  const response = await fetch('https://api.github.com/repos/anthropics/remote-terminal/releases/latest');
  const latest = await response.json();

  if (semver.gt(latest.tag_name, currentVersion)) {
    console.log(`Update available: ${latest.tag_name}`);
    console.log(`Run: brew upgrade remote-terminal`);
  }
}
```

## Support Channels

Consider setting up:

- GitHub Issues for bug reports
- GitHub Discussions for Q&A
- Documentation site (GitHub Pages)
