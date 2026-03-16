# How to Install the newsarchive Chrome Extension

This guide walks you through every step needed to get the newsarchive Chrome extension up and running on your computer. No programming knowledge is required.

---

## What Does This Extension Do?

newsarchive lets you save a complete copy of any web page (especially news articles) with a single click. The saved copy includes all images, fonts, and styling — and works even without an internet connection. Think of it as a personal version of archive.is that runs entirely in your browser.

It also:
- Removes ads, trackers, and pop-ups from the saved copy
- Strips away paywall overlays (if you're already logged in to the site)
- Lets you download the saved article as a single `.html` file you can open anytime

---

## What You'll Need

- **Google Chrome** browser (version 88 or newer — any recent version will work)
- An internet connection (just for the initial download)

That's it. No other software, accounts, or technical setup is needed.

---

## Step 1: Download the Files from GitHub

The extension files are hosted on GitHub, a website where developers share code. You need to download these files to your computer.

### Option A: Download as a ZIP file (Recommended)

1. Go to the GitHub repository page: `https://github.com/Loumeister/newsarchiver`
2. Look for the green button that says **"<> Code"** near the top-right of the file list
3. Click that green button
4. In the dropdown menu that appears, click **"Download ZIP"**
5. Your browser will download a file called something like `newsarchiver-main.zip`
6. Wait for the download to finish

### Option B: If someone sent you the files directly

If someone shared the files with you (for example, on a USB drive or via email), simply make sure you have the complete folder and skip to Step 2.

---

## Step 2: Extract (Unzip) the Downloaded File

The downloaded file is compressed (like a digital envelope). You need to extract it before Chrome can use it.

### On Windows:
1. Open your **Downloads** folder (or wherever the ZIP file was saved)
2. Find the file called `newsarchiver-main.zip`
3. Right-click on it
4. Click **"Extract All..."**
5. Choose where you want to save the extracted folder (your Desktop works fine)
6. Click **"Extract"**
7. A new folder called `newsarchiver-main` will appear

### On Mac:
1. Open **Finder** and go to your **Downloads** folder
2. Find the file called `newsarchiver-main.zip`
3. Double-click on it
4. A new folder called `newsarchiver-main` will appear right next to the ZIP file

### On Linux:
1. Open your file manager and navigate to your Downloads folder
2. Right-click the ZIP file and select **"Extract Here"**
3. A new folder called `newsarchiver-main` will appear

**Important:** Remember where this extracted folder is located — you'll need to find it again in Step 5.

---

## Step 3: Open Chrome's Extensions Page

1. Open **Google Chrome**
2. In the address bar at the top of the window (where you normally type website addresses), type exactly:
   ```
   chrome://extensions
   ```
3. Press **Enter**
4. You should see the **Extensions** management page

If that doesn't work, you can also get there by:
1. Clicking the **three-dot menu** (⋮) in the top-right corner of Chrome
2. Hovering over **"Extensions"** in the menu
3. Clicking **"Manage Extensions"**

---

## Step 4: Enable Developer Mode

Chrome requires "Developer mode" to be turned on before you can install extensions that aren't from the Chrome Web Store.

1. On the Extensions page, look at the **top-right corner**
2. You'll see a toggle switch labeled **"Developer mode"**
3. Click the toggle to turn it **ON** (it should turn blue)
4. Three new buttons will appear at the top of the page: "Load unpacked", "Pack extension", and "Update"

---

## Step 5: Load the Extension

This is the step where most people run into trouble, so read carefully.

1. Click the **"Load unpacked"** button (top-left of the Extensions page)
2. A file browser window will open
3. Navigate to the `newsarchiver-main` folder you extracted in Step 2
4. You will see several items inside it. **You must open the folder called `extension` and select that folder.** Do NOT select the outer `newsarchiver-main` folder itself.

   Here is what the folder structure looks like — you need to select the one marked with the arrow:

   ```
   newsarchiver-main/
   ├── src/
   ├── tests/
   ├── data/
   ├── extension/       <-- SELECT THIS FOLDER
   │   ├── manifest.json
   │   ├── background.js
   │   ├── content.js
   │   ├── popup/
   │   ├── options/
   │   ├── viewer/
   │   ├── lib/
   │   └── icons/
   ├── README.md
   └── package.json
   ```

   **How to do this:** Double-click `newsarchiver-main` to go inside it. Then double-click `extension` to go inside that folder. You should now see files like `manifest.json` and `background.js`. Now click **"Select Folder"** (Windows/Linux) or **"Open"** (Mac).

5. The extension should now appear on the Extensions page with the name **"newsarchive"** and its icon

> **If you see the error "Manifest file is missing or unreadable"** (or in Dutch: "Manifestbestand ontbreekt of is onleesbaar"), it means you selected the wrong folder. Go back and make sure you are inside the `extension` folder — the one that directly contains the file `manifest.json`. An easy way to verify: when the file browser is open, you should be able to see `manifest.json` listed among the files before you click "Select Folder".

---

## Step 6: Pin the Extension to Your Toolbar

By default, the extension might be hidden behind Chrome's puzzle-piece icon. To make it easy to access:

1. Click the **puzzle piece icon** (🧩) in the top-right corner of Chrome, next to the address bar
2. Find **"newsarchive"** in the list of extensions
3. Click the **pin icon** (📌) next to it
4. The newsarchive icon will now be permanently visible in your toolbar

---

## How to Use the Extension

### Archiving an Article

1. Go to the web page you want to save
2. Click the **newsarchive icon** in your toolbar
3. A small popup window will appear
4. Click the **"Archive this page"** button
5. Wait 15–30 seconds — the extension is downloading and processing the page
6. When it's done, you'll see a success message and the saved article will appear in the list below

### Viewing a Saved Article

1. Click the newsarchive icon to open the popup
2. Find the article you want to view in the **"Saved Snapshots"** list
3. Click the **"View"** button next to it
4. The saved article will open in a new tab with a toolbar at the top showing when it was archived

### Downloading a Saved Article

1. Open the popup and find the article in the list
2. Click the **"Download"** button
3. Chrome will ask you where to save the file
4. The file is saved as a single `.html` file that you can open in any browser, on any computer, even without an internet connection

### Viewing the Screenshot

1. Click the **"Screenshot"** button next to any saved article
2. A screenshot of the page (as it appeared when you archived it) will open in a new tab

### Deleting a Saved Article

1. Click the **"Delete"** button next to the article
2. The article and all its associated data will be permanently removed from your browser

### Accessing Settings

1. Open the popup and click the **"Settings"** link at the bottom
2. The only setting available is **"Keep inline scripts"** — leave this **OFF** (the default) unless you have a specific reason to turn it on. Turning it on may cause ads, trackers, or paywalls to reappear in your saved articles.

---

## Troubleshooting

### "Load unpacked" button is missing
Make sure **Developer mode** is turned on (Step 4). The toggle should be blue.

### Error: "Manifest file is missing or unreadable"
This is the most common error. It means you selected the wrong folder. You need to select the `extension` folder that is *inside* the `newsarchiver-main` folder — not the `newsarchiver-main` folder itself. Go back to Step 5 and follow the instructions carefully. When you have the right folder open in the file browser, you should be able to see a file called `manifest.json` listed before you click "Select Folder".

### The extension icon doesn't appear in the toolbar
Click the **puzzle piece icon** (🧩) in the top-right area of Chrome and pin the extension (Step 6).

### Archiving takes a very long time or fails
- Pages with many images can take longer. Wait at least 30 seconds before assuming it failed.
- If the page has hundreds of images, the process may time out. Try archiving a simpler page first to confirm the extension is working.
- Make sure you have a stable internet connection — the extension needs to download all images and other resources from the page.

### Saved articles are taking up a lot of space
Articles with many images can be large (10 MB or more each). To free up space, delete articles you no longer need using the **Delete** button.

### The saved article looks different from the original
Some websites use advanced techniques that may not be fully captured. The extension does its best to preserve the appearance, but some elements (like interactive features, videos, or dynamically loaded content) may not be included.

### Chrome says "This extension may have been corrupted"
This can happen if files were modified after loading. Re-download the ZIP file and repeat the process from Step 1.

---

## How to Update the Extension

When a new version of the extension is released:

1. Download the latest files from GitHub (repeat Step 1)
2. Extract the new ZIP file (repeat Step 2)
3. Go to `chrome://extensions`
4. Find the **newsarchive** extension
5. Click the **reload icon** (circular arrow ↻) on the extension's card — or remove the old version and load the new one using **"Load unpacked"** (Step 5)

---

## How to Remove the Extension

If you ever want to uninstall the extension:

1. Go to `chrome://extensions`
2. Find **newsarchive**
3. Click the **"Remove"** button
4. Confirm by clicking **"Remove"** in the popup dialog

This will remove the extension and all of its saved data from your browser.

---

## Privacy and Safety

- This extension does **not** send your data anywhere — everything stays on your computer
- It does **not** track you or collect any analytics
- It only accesses web pages when you explicitly click "Archive this page"
- All saved articles are stored locally in your browser

---

## Legal Note

This tool is intended for **personal archival and research purposes only**. Using it to bypass paywalls may violate the terms of service of the website. You are responsible for how you use this tool.
