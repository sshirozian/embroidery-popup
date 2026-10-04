# Embroidery Pop-Up Kiosk

A self-contained, offline-friendly web app for running an onsite embroidery pop-up on an iPad. No server, no database, no internet required — everything (logo, option images, form configuration, and customer submissions) is stored locally in the iPad's browser (IndexedDB).

## Pages

- **`index.html`** — the customer-facing kiosk screen: collects name/phone/email (configurable), lets the customer pick a font/style option from images you upload, then collects their embroidery initials and saves the order.
- **`admin.html`** — staff-only screen (PIN protected) with two tabs:
  - **Configuration** — upload a logo, add/remove/edit the customer info fields, add/remove font/style options and upload an image for each, set the max initials length.
  - **Submissions** — view every order taken, refresh, export everything to a CSV file (opens fine in Excel/Numbers/Google Sheets), or clear all data.

## Running it

The app only works correctly when loaded over a real `http://` or `https://` address — iOS Safari does not run local files reliably (it blocks persistent storage for `file://` pages, and Files-app taps only open a restricted preview, not full Safari). So it needs to be hosted somewhere, even though it has no backend.

### Recommended: GitHub Pages (free, permanent link, works offline after first load)

This repo includes a service worker (`sw.js`) that caches every file on first visit. Once the iPad has loaded the page one time and you've added it to the Home Screen, it keeps working with **zero internet connection** for the rest of the event — same as a native app.

One-time setup from your Mac:
```bash
cd embroidery-popup
git init
git add .
git commit -m "Initial commit"
```
Then on github.com: create a new empty repository (no README/gitignore), and push:
```bash
git remote add origin https://github.com/<your-username>/embroidery-popup.git
git branch -M main
git push -u origin main
```
In the repo on github.com, go to **Settings → Pages**, set Source to the `main` branch, root folder, and save. After a minute or two your app is live at `https://<your-username>.github.io/embroidery-popup/`.

On the iPad, open that URL in Safari **once** (needs WiFi/cellular for this one visit only), then Share icon → **Add to Home Screen**. From then on it launches full-screen from the Home Screen icon and needs no internet at all.

If you ever update the code (new fields, styling, etc.), bump the `CACHE_NAME` version string at the top of `sw.js` before re-pushing, otherwise the iPad will keep using its cached copy.

### Alternative: a computer on the same WiFi as the iPad

If you'd rather not use GitHub, any computer on the same network as the iPad can serve the folder and the iPad can just browse to it:
```bash
cd embroidery-popup
python3 -m http.server 8080
# or, if python3 isn't set up on the Mac:
ruby -run -e httpd . -p 8080
```
Then on the iPad's Safari, go to `http://<that computer's local IP>:8080`. Find the IP with `ipconfig getifaddr en0` (Mac) while both devices are on the same WiFi. This needs that computer running for the whole event, unlike the GitHub Pages option above.

### Make it feel like a real app on the iPad
1. Open the site in Safari (via whichever method above).
2. Tap the Share icon → **Add to Home Screen**.
3. Launch it from the home screen icon — it runs full-screen without Safari's address bar.
4. Optionally turn on **Guided Access** (Settings → Accessibility → Guided Access) before handing the iPad to customers, so they can't swipe away from the app or reach Safari/Settings. Triple-click the side/home button to start/stop it.

## First-time setup

1. Open `admin.html` (or tap the small "staff" link at the bottom of the customer page).
2. You'll be asked to set a staff PIN the first time — this protects the configuration and submissions screens.
3. In the **Configuration** tab:
   - Upload your logo.
   - Edit the customer fields if needed (defaults: First Name, Last Name, Phone Number, Email).
   - Add/remove font or style options and upload an image for each — you can have as few or as many as you like.
   - Set the max number of letters allowed for initials (default 3).
   - Click **Save Configuration**.
4. Go to `index.html` and test the full flow once yourself.

## Important: back up your data

Submissions are stored in the browser's local storage on that specific device/browser. If someone clears Safari's website data, or you switch devices, the submissions will be lost. **Export to CSV regularly during the event** (the Submissions tab) and save that file somewhere safe (email it to yourself, AirDrop it, etc.).

## Notes

- The "staff" link on the customer page and PIN gate on `admin.html` keep customers out of configuration/data, but anyone with the PIN and access to the iPad can reach it — physical security of the device still matters.
- Works fully offline once loaded; no data ever leaves the device.
