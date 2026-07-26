# ZKTeco Cloud Attendance Setup (ADMS Push)

How to connect a ZKTeco fingerprint/face scanner to s3vyaPOS **over the internet**, so
punches sync automatically without the scanner needing to be on the same network as
the server.

---

## 1. Why cloud push instead of the old "Sync from device" button

The original **Settings → Attendance → Device** flow connects *from the API server*
to the scanner's LAN IP (`192.168.x.x:4370`). That only works when the API and the
scanner are on the same local network — true for local development, but **not true
in production**, where the API runs on a remote VPS with no path into the
restaurant's router. Pressing "Sync from device" on the live site will fail or
time out.

Cloud push flips the direction: the **scanner** connects *out* to the API, the same
way any device on the internet reaches a website. This is a real, documented ZKTeco
firmware feature called **ADMS** ("Cloud Server" in the on-device menu), not a
workaround — the same mechanism ZKTeco's own cloud attendance products use.

Benefits:
- Works from any restaurant with internet access — no static IP, no port-forwarding,
  no VPN.
- The scanner can be anywhere; even at a different branch than the server.
- No polling — punches arrive within seconds of being scanned.

The old LAN pull (and the desktop till's LAN bridge) still work and remain as a
fallback for scanners whose firmware doesn't support Cloud Server / ADMS mode.

---

## 2. How it works (architecture)

```
ZKTeco scanner  --HTTP-->  https://<your-restaurant>.s3vya.tech/iclock/*  -->  s3vyaPOS API
```

- The device makes plain HTTP GET/POST requests to a handful of fixed paths
  (`/iclock/cdata`, `/iclock/getrequest`) — this is hardcoded in the firmware, not
  configurable, so these routes live at the bare domain root (not under `/api`).
- **Tenant resolution** works exactly like every other request in s3vyaPOS: by the
  subdomain in the URL. Point the device at `<your-slug>.s3vya.tech` and punches
  land in your restaurant's own database automatically — no extra setup.
- **Security / device approval**: the ADMS protocol has no real authentication (the
  device only sends its serial number). s3vyaPOS compensates with an allow-list —
  the first time a device connects it's auto-registered as **inactive**; go to
  **Attendance → Device** and click its status badge to approve it before its
  punches start being stored. An unapproved device is acknowledged (so it doesn't
  retry-storm) but its data is discarded.
- **Idempotent ingestion**: punches are keyed by `(deviceUserId, timestamp)`, so a
  device re-sending a batch (e.g. after a brief network drop) never creates
  duplicates.

---

## 3. Configure the device

On the scanner's own screen/keypad:

1. **Menu → Comm. (Comm. Settings) → Cloud Server Setting**
   (exact wording varies slightly by firmware — look for "ADMS" or "Cloud Server").
2. Set:
   | Field | Value |
   |---|---|
   | **Enable Cloud Server** / Server Mode | **ADMS** / **On** |
   | **Server Address** | `<your-slug>.s3vya.tech` (see below) |
   | **Server Port** | `80` |
   | **Enable Domain Name** | On (if the device asks — Server Address is a hostname, not an IP) |
   | **Enable Proxy Server** | Off |
3. Confirm the device has a working internet connection (Menu → Comm. → Ethernet
   or Wi‑Fi — it needs outbound internet access, same as any smart device).
4. Save. The device will attempt to connect within a minute or so.

**Finding your Server Address**: it's shown for you already on
**Attendance → Device** in the app — it's your tenant subdomain, e.g. if you sign
in at `cakezake.s3vya.tech`, the Server Address is `cakezake.s3vya.tech`.

> Devices are typically HTTP-only (no reliable TLS support in ZKTeco firmware), so
> use plain port 80, not 443 — the server accepts the ADMS protocol over both.

---

## 4. Approve the device

1. Go to **Attendance → Device** in s3vyaPOS.
2. Under **Cloud push**, the device should appear within a minute of saving the
   settings on the scanner — serial number, last-seen time, status
   **"⏳ Pending approval"**.
3. Click the status badge to flip it to **"✓ Active"**. Optionally click **Rename**
   to give it a friendly name (e.g. "Front desk").
4. Punches scanned *after* approval start flowing into the **Punch Log** tab
   automatically. (Punches scanned before approval are not retroactively stored —
   the device doesn't resend history once it believes a batch was delivered.)

---

## 5. Map employees to the device

Same as before — this step doesn't change with cloud push:

1. **Employees → Edit** each staff member → set **Fingerprint device ID** to the
   ID number they're enrolled under on the scanner.
2. If any punches came in before an employee was mapped, use
   **Attendance → Device → ↻ Re-link punches** to retroactively attach them.
3. Set each employee's **Monthly salary** for payroll calculations.

---

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Device never appears on the Device tab | No internet on the device, or Server Address/Port typed wrong. Double-check the device can reach the internet (try a different Wi-Fi/Ethernet if unsure). |
| Device appears but stays "Pending approval" forever | That's expected until you approve it — click the status badge. |
| Approved device, but no punches show up | Check the device clock is roughly correct (wildly wrong timestamps can look like duplicates of old punches). Confirm staff are actually scanning (device screen should show a success beep/checkmark per scan). |
| Punches show under "(unmapped #123)" in the Punch Log | The `deviceUserId` (123) isn't linked to an employee yet — see step 5 above, then use Re-link punches. |
| Multiple restaurants, multiple scanners | Each scanner points at *its own* restaurant's subdomain — e.g. `cakezake.s3vya.tech` for one branch, `otherbranch.s3vya.tech` for another. Each tenant's Device tab only shows its own devices. |

---

## 7. Legacy fallback — LAN pull

If a scanner's firmware genuinely has no Cloud Server / ADMS option (older
low-end models), it can still be used the old way:

1. Set the device's LAN IP under **Attendance → Device → Legacy LAN pull**.
2. This only works when whatever is running s3vyaPOS is on the *same local
   network* as the scanner — in practice this means the **desktop till app**
   (Electron), which bridges the scanner over the LAN and pushes punches up to the
   cloud API itself (`AttendanceBridge`, polls every 5 minutes). It will not work
   against the hosted API directly from a remote server.
3. Everything else (employee mapping, payroll) is identical either way — ingestion
   ends up in the same `AttendanceLog` table regardless of source.
