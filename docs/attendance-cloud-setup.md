# ZKTeco Cloud Attendance Setup (ADMS Push)

How to connect a ZKTeco fingerprint/ID scanner (including the **K40/ID**, and any
other ADMS-capable ZKTeco terminal) to s3vyaPOS **over the internet**, so punches
sync automatically. This is the **only** supported connection method — there is no
LAN/local-network mode.

---

## 1. Why cloud push, and why there's no LAN option

s3vyaPOS's API runs on a remote server, not inside the restaurant. A scanner sitting
on the restaurant's local network has no way for that remote server to reach it
directly — there's no local IP the internet can dial into without the restaurant
opening ports on their router, which isn't realistic to ask of restaurant owners.

Cloud push flips the direction: the **scanner** connects *out* to the API, the same
way any device on the internet reaches a website. This is a real, documented ZKTeco
firmware feature called **ADMS** ("Cloud Server" in the on-device menu) — the same
mechanism ZKTeco's own cloud attendance products use, confirmed present on the K40/ID
and the wider iClock/ZKTime/SilkBio device families.

Benefits:
- Works from any restaurant with internet access — no static IP, no port-forwarding,
  no VPN, nothing to configure on the restaurant's router.
- The scanner can be anywhere, even a different branch than the server.
- Continuous, not polled — the device pushes each punch immediately as it's
  scanned, and the Attendance page updates live to match.

---

## 2. How it works (architecture)

```
ZKTeco scanner  --HTTP-->  http://<your-restaurant>.s3vya.tech/iclock/*  -->  s3vyaPOS API
```

- The device makes plain HTTP GET/POST requests to a handful of fixed paths
  (`/iclock/cdata`, `/iclock/getrequest`) — this is hardcoded in the firmware, not
  configurable, so these routes live at the bare domain root (not under `/api`).
- **Tenant resolution** works exactly like every other request in s3vyaPOS: by the
  subdomain in the URL. Point the device at `<your-slug>.s3vya.tech` and punches
  land in your restaurant's own database automatically — no extra setup.
- **Continuous push**: the handshake tells the device `Realtime=1`, meaning it
  sends each punch to the server the moment it's scanned rather than batching or
  waiting on a timer. The Attendance page's Punch Log and Device tabs poll the API
  every few seconds while open, so new punches and device activity show up without
  a manual page reload.
- **Security / device approval**: the ADMS protocol has no real authentication (the
  device only sends its serial number). s3vyaPOS compensates with an allow-list —
  the first time a device connects it's auto-registered as **inactive**; go to
  **Attendance → Device** and click its status badge to approve it before its
  punches start being stored. An unapproved device is acknowledged (so it doesn't
  retry-storm) but its data is discarded, and a warning is logged server-side.
- **Idempotent ingestion**: punches are keyed by `(deviceUserId, timestamp)`, so a
  device re-sending a batch (e.g. after a brief network drop) never creates
  duplicates.
- **Error handling**: every `/iclock/*` request is wrapped so an unexpected server
  hiccup (e.g. a momentary database blip) still replies with a plain "OK" the
  device understands, instead of an HTML/JSON error page it can't parse — the
  device just retries normally and the failure is logged server-side for a human
  to notice, instead of the device getting confused and retry-storming.

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
3. Under **Menu → Comm. → Ethernet** (or Wi-Fi), confirm the device has a working
   internet connection — it needs outbound internet access, same as any smart
   device. DHCP is fine; a static IP works too if your network requires it.
4. Save. The device will attempt to connect within a minute or so.

**Finding your Server Address**: it's shown for you already on
**Attendance → Device** in the app — it's your tenant subdomain, e.g. if you sign
in at `cakezake.s3vya.tech`, the Server Address is `cakezake.s3vya.tech`.

> Devices are typically HTTP-only (no reliable TLS support in ZKTeco firmware), so
> use plain port 80, not 443 — the server accepts the ADMS protocol over both, so
> either works, but port 80 is the safer default for older firmware.

---

## 4. Approve the device

1. Go to **Attendance → Device** in s3vyaPOS.
2. The device should appear within a minute of saving the settings on the scanner
   — serial number, last-seen time, status **"⏳ Pending approval"**. This list
   updates live; you don't need to refresh the page.
3. Click the status badge to flip it to **"✓ Active"**. Optionally click **Rename**
   to give it a friendly name (e.g. "Front desk").
4. Punches scanned *after* approval flow into the **Punch Log** tab continuously —
   it also updates live. (Punches scanned before approval are not retroactively
   stored — the device doesn't resend history once it believes a batch was
   delivered.)

---

## 5. Map employees to the device

1. **Employees → Edit** each staff member → set **Fingerprint device ID** to the
   ID number they're enrolled under on the scanner.
2. If any punches came in before an employee was mapped, use
   **Attendance → Device → ↻ Re-link punches** to retroactively attach them.
3. Set each employee's **Monthly salary** for payroll calculations.

---

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Device never appears on the Device tab | No internet on the device, or Server Address/Port typed wrong. Double-check the device can reach the internet (try a different Wi-Fi/Ethernet if unsure), and that Server Mode is set to ADMS (not left on the default/off setting). |
| Device appears but stays "Pending approval" forever | That's expected until you approve it — click the status badge. |
| Approved device, but no punches show up | Check the device clock is roughly correct (wildly wrong timestamps can look like duplicates of old punches). Confirm staff are actually scanning (device screen should show a success beep/checkmark per scan). Check "Last seen" on the Device tab — if it's not updating at all, the device has stopped reaching the server (network dropped, or Cloud Server setting got reset). |
| Punches show under "(unmapped #123)" in the Punch Log | The `deviceUserId` (123) isn't linked to an employee yet — see step 5 above, then use Re-link punches. |
| Multiple restaurants, multiple scanners | Each scanner points at *its own* restaurant's subdomain — e.g. `cakezake.s3vya.tech` for one branch, `otherbranch.s3vya.tech` for another. Each tenant's Device tab only shows its own devices. |
| An error banner appears on the Attendance page | The page shows the exact error and a Retry button — the automatic live-refresh will also keep retrying in the background on its own. |
