# Distribution Guide

This document outlines the various ways to distribute Connect to users.

## Distribution Options

### 1. Homebrew (Recommended)

The most user-friendly option for macOS users.

#### Setup Requirements

1. **GitHub Repository** - Public repo with releases
2. **Homebrew Formula** - Ruby file describing the package
3. **Tap or homebrew-core** - Where to host the formula

#### Create a Homebrew Tap

```bash
# Create a new repo: homebrew-connect
# Add formula file: Formula/connect.rb
```

**Formula template (`Formula/connect.rb`):**

```ruby
class Connect < Formula
  desc "Browser-based remote terminal access for macOS"
  homepage "https://github.com/anthropics/connect"
  url "https://github.com/anthropics/connect/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "SHA256_OF_TARBALL"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", "--production"
    libexec.install Dir["*"]

    # Create launcher script
    (bin/"connect").write <<~EOS
      #!/bin/bash
      cd "#{libexec}"
      exec node src/server.js "$@"
    EOS
  end

  def caveats
    <<~EOS
      To start connect:
        connect

      To enable auto-start on login:
        brew services start connect
    EOS
  end

  service do
    run [opt_bin/"connect"]
    keep_alive true
    log_path var/"log/connect.log"
    error_log_path var/"log/connect.log"
  end

  test do
    system "#{bin}/connect", "--help"
  end
end
```

#### User Installation

```bash
# Add tap
brew tap anthropics/connect

# Install
brew install connect

# Start
connect

# Or run as service
brew services start connect
```

---

### 2. One-liner Install Script

Quick installation via curl.

#### Host the Script

Upload `install.sh` to a public URL (GitHub raw, your domain, etc.)

#### User Installation

```bash
curl -fsSL https://raw.githubusercontent.com/anthropics/connect/main/install.sh | bash
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
  "name": "connect",
  "version": "1.0.0",
  "bin": {
    "connect": "./bin/connect.js"
  }
}
```

2. Create `bin/connect.js`:

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
npm install -g connect
connect
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
tar -czvf connect-1.0.0.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  .
```

#### User Installation

```bash
# Download
curl -LO https://github.com/anthropics/connect/releases/download/v1.0.0/connect-1.0.0.tar.gz

# Extract
tar -xzf connect-1.0.0.tar.gz
cd connect

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
  --volname "Connect" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --app-drop-link 425 178 \
  "Connect-1.0.0.dmg" \
  "build/Connect.app"
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
2. **Self-update script** - `connect update` command
3. **Homebrew** - Users run `brew upgrade`

Example version check:

```javascript
// On server start
async function checkForUpdates() {
  const response = await fetch('https://api.github.com/repos/anthropics/connect/releases/latest');
  const latest = await response.json();

  if (semver.gt(latest.tag_name, currentVersion)) {
    console.log(`Update available: ${latest.tag_name}`);
    console.log(`Run: brew upgrade connect`);
  }
}
```

## Support Channels

Consider setting up:

- GitHub Issues for bug reports
- GitHub Discussions for Q&A
- Documentation site (GitHub Pages)
