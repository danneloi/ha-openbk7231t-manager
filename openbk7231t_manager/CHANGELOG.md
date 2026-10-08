# Changelog

All notable changes to this add-on are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). More
detailed explanations for each change are in [DOCS.md](DOCS.md) (German).

## [1.7.1] - 2026-09-30

### Added
- The device detail popup's "Diagnose" section now also shows "Zuletzt
  gesehen" (when the add-on last successfully reached the device) and
  "Neustarts (geschätzt)" (a best-effort reboot counter). OpenBK7231T_App
  doesn't track its own reboot count, so this is approximated by noticing
  whenever the device's reported uptime drops compared to the last check -
  it can only catch reboots that happen between two checks, so treat it as
  a lower bound, not an exact count.

## [1.7.0] - 2026-09-30

### Added
- New "Configuration backups" panel on the main page. Before every
  firmware update, the add-on now automatically saves the device's GPIO
  pin/channel mapping and startup command script ("autoexec" script) to
  a backup, so an update that resets or corrupts the configuration can
  be undone. You can also trigger a backup manually at any time from a
  device's row (the new save icon) or from the panel itself.
  - Each device keeps its 20 most recent backups; older ones are
    removed automatically.
  - Restore a backup back to the device with one click, download it as
    a JSON file, or delete it.
  - A failed backup attempt (e.g. the device is offline) never blocks
    or fails the update itself - it's purely a best-effort safety net.
