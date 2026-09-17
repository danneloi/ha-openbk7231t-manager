# Changelog

All notable changes to this add-on are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). More
detailed explanations for each change are in [DOCS.md](DOCS.md) (German).

## [1.3.3] - 2026-09-17

### Added
- The release badge in the top bar ("Release: x.y.z") is now clickable and
  shows the full release notes (highlights, published date) in a popup,
  with a link to the release on GitHub.
- A GitHub icon in the top bar links directly to the official
  [OpenBK7231T_App](https://github.com/openshwprojects/OpenBK7231T_App)
  repository.

## [1.3.2] - 2026-09-06

### Fixed
- The add-on's web server showed the warning "WARNING: This is a
  development server. Do not use it in a production deployment. Use a
  production WSGI server instead." on startup. It now uses
  [waitress](https://github.com/Pylons/waitress), a production-ready
  WSGI server, instead of Flask's built-in development server. This is
  purely an internal change - nothing about how the add-on works or
  looks changes.

## [1.3.1] - 2026-09-05

### Fixed
- The "Notifications" section stayed in German when switching the UI
  language. It's now translated consistently along with the rest of the
  UI.

### Changed
- Anonymized the example name in the notification channel form ("e.g.
  Alex's phone" instead of a real name).
- Repository is now GitHub-ready: added `repository.yaml`, a root
  `README.md`, a `LICENSE`, an add-on icon/logo, and a few preview
  screenshots, so it can be added directly as a Home Assistant add-on
  repository.

## [1.3.0] - 2026-09-05

### Added
- Multi-language UI (German, English, English (US), French, Spanish,
  Portuguese) with a language switcher in the top bar.
- Sensor detail view grouped into categories (Wi-Fi connection, power
  consumption, diagnostics, environment); both the device name and
  individual sensor labels can now be renamed.
- Button to open a device directly in a new browser tab.
- Color-coded RSSI signal quality (green/orange/red).

### Changed
- Sensor values are now rounded to 2 decimal places everywhere they're
  displayed.
- The Actions column now uses icons (sync/trash) instead of text buttons.
- Settings are now shown compactly side by side instead of as a stacked
  tile list.

### Fixed
- The "Update all" banner stayed visible due to a CSS conflict even after
  no update was pending anymore.

## [1.2.0] - 2026-09-05

### Changed
- Firmware updates are now pushed directly (`POST /api/ota`) instead of
  just telling the device a URL to download from; the previous
  `ota_http`-based mechanism is kept as a fallback.

### Fixed
- A real firmware bug on RTL87X0C ("Realtek Ameba") chips corrupted the
  target IP address during `ota_http` URL parsing, breaking reliable
  network updates.

## [1.1.4] - 2026-09-05

### Added
- The firmware URL used for an update is now logged when the update
  starts.

## [1.1.3] - 2026-09-05

### Added
- Tapping/clicking the "Timed out"/"Failed" status now also shows the
  exact error message as a popup (not just as a hover tooltip).
- More detailed log entries for update failures.

## [1.1.2] - 2026-09-05

### Fixed
- An update could end in "Timed out" even though the device had accepted
  the command but never actually started updating. The add-on now detects
  this within 45 seconds and fails fast with a clear error message
  instead of waiting the full 4 minutes.

## [1.1.1] - 2026-09-05

### Fixed
- "Could not load sensor data: HTTP 400" on some devices, by switching to
  the firmware's more reliable `/cm` endpoint.
- Sensor data was looked up in the wrong place for some responses and
  incorrectly reported as "not available".

## [1.1.0] - 2026-09-05

### Added
- Dark mode (follows the system setting, with a manual toggle).
- Device detail view with live sensor data.
- Notification channels: Home Assistant, Telegram, WhatsApp.

### Fixed
- The "Firmware update" button appeared disabled/unresponsive when no
  newer version was known.

## [1.0.1] - 2026-09-05

### Fixed
- The web UI port is now assigned automatically by the Supervisor instead
  of being hardcoded to 8099 (avoided port conflicts with
  `host_network: true`).
- Removed deprecated 32-bit architectures from the add-on configuration.

## [1.0.0] - 2026-09-05

### Added
- Initial release: device list, network scan, manual add, OTA firmware
  updates, Home Assistant notification on new releases.
