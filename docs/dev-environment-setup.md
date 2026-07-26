# Task 1.2 - Dev Environment Setup

This task happens on your local machine, so this doc is a checklist for you
to run through rather than something Claude can execute directly (no local
Mindustry client or device access from here).

## 1. Locate your Mindustry mods folder

In-game: **Settings -> Mods -> Open Folder** (or similar, varies slightly by
version) opens it directly - this is the most reliable way to find it,
since exact paths vary by install method (Steam/itch/APK/source build).

Typical default locations if you want to check manually:
- **Linux:** `~/.local/share/Mindustry/mods/`
- **Windows:** `%appdata%\Mindustry\mods\`
- **macOS:** `~/Library/Application Support/Mindustry/mods/`

*(Confirm this against your actual install - some distributions and the
Steam version in particular can differ.)*

## 2. Link this repo into the mods folder

Rather than copying files back and forth, symlink the repo directory
straight into the mods folder so edits here are picked up immediately:

```bash
# Linux/macOS example - adjust paths to match your setup
ln -s /home/fady/projects/skitter-mod ~/.local/share/Mindustry/mods/skitter-mod
```

On Windows, an equivalent is a directory junction:
```powershell
mklink /D "%appdata%\Mindustry\mods\skitter-mod" "C:\path\to\skitter-mod"
```

## 3. Reloading changes without a full restart

Mindustry has some support for reloading mod content while the game is
running, but **how much reloads live vs. requires a restart depends on
what you changed and your game version**:
- JS script changes (`scripts/*.js`) are the most likely to support
  in-game reload - check the **Mods** screen in Settings for a reload/
  refresh option.
- JSON/Hjson content changes (units, blocks) and sprite changes have
  historically been more likely to need a full restart to take effect.
- **Action item:** confirm exactly what your installed version supports
  before assuming hot-reload works - test with a trivial change (e.g. a
  log message in `main.js`) first, rather than discovering the limitation
  midway through Phase 2 work.

If live reload doesn't work reliably for your version, the fallback loop
is: edit -> close game -> reopen -> check console (`F8` opens the in-game
console on desktop) for `Log.info` output and errors.

## 4. Low-end test device/VM

Needed for Task 5.1 (TPS testing), so worth setting up now rather than
right before that task:
- **Desktop:** easiest option is throttling a VM (VirtualBox/VMware) to
  2 cores / limited RAM to simulate low-end hardware, or using an actual
  older machine if you have one.
- **Android:** an older/budget physical device, or an emulator (Android
  Studio's AVD) with reduced allocated resources. Physical device is
  more representative of real TPS behavior than an emulator, if available.
- Install the same mod (via symlink or manual copy) on this second
  environment so Phase 5 testing is just "run the existing setup," not a
  fresh setup task at that point.

## 5. Checklist

- [ ] Confirmed local mods folder path
- [ ] Symlinked/junctioned repo into mods folder
- [ ] Verified whether JS reload works in-game for your version (tested
      with a trivial main.js change)
- [ ] Low-end test device or throttled VM set up and mod installed there
- [ ] Confirmed console access (F8 on desktop) for reading `Log.info` /
      error output

Once this checklist is done, Task 1.2 is complete and Phase 2 (noise
system) can start.
