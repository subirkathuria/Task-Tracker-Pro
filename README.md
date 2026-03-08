# 📋 Task & Order Tracker Pro (PWA)

A powerful, lightweight, and highly responsive Progressive Web Application (PWA) built with PHP, Vanilla JavaScript, and SQLite. 

Designed for freelancers, boutique shops, and small businesses, this app bridges the gap between a simple To-Do list and a heavy Enterprise Resource Planning (ERP) system. It features a highly customizable workflow, automated daily backups, and a native mobile-app feel—all without requiring a complex database server.

## ✨ Key Features

### 🔄 Dual-Mode Architecture
* **General Tasks:** Track standard to-do items with custom categories, file attachments, and due dates. Auto-generates tracking IDs (e.g., `TSK-0042`).
* **Shop Orders (POS Style):** Auto-generates sequential Order IDs (e.g., `ORD-001`). Includes built-in fields for customer details, dynamic product lists (Qty × Price = Total), and automatic balance calculation.
* **Global Toggle:** Don't need the Shop features? Easily disable them via a single global variable (`ENABLE_SHOP_FEATURE = false`) to deploy a pure task-tracking app.

### 📊 Advanced Data Management
* **Dual-Dropdown Matrix Filter:** Cross-filter your database instantly. Select a Category and a Status to see exactly how many tasks match your criteria in real-time.
* **Dynamic Status & Category Managers:** Create custom workflow statuses (e.g., "Awaiting Parts", "In Review") and map them to General Tasks, Shop Orders, or both. You can safely "Retire" old categories/statuses without breaking historical data.
* **Smart Search:** Start typing, and the app automatically searches the *entire* database across titles, descriptions, custom fields, and IDs. 
* **Archived Isolation:** Closed tasks and completed orders are hidden from the main view to keep your workspace clean, but automatically appear grouped under a `📦 Closed / Completed Matches` banner when using the search bar.

### ⏱️ Automated Workflows
* **Recurring Tasks:** Set tasks to repeat Daily, Weekly, Monthly, or Yearly. When you click the "✅ Close Task" button, the system automatically clones the task and sets the correct future due date.
* **Lifecycle Tracking:** Every update, status change, and comment is permanently logged with a timestamp in the task's visual history timeline.
* **Smart Timezones:** Uses your local device timezone for date inputs and server-side strict timezone enforcement to ensure logs are always perfectly synced.

### 📱 Progressive Web App (PWA) & Media
* **Installable:** Functions as a standalone app on iOS, Android, and Windows. Add it to your home screen for a full-screen, native app experience.
* **Inline Image Lightbox:** Click on attached images to view them instantly in a sleek pop-up overlay without downloading them to your phone's gallery (unless you click the dedicated Download button).
* **Extended Sessions:** Secure 72-hour auto-login sessions so you don't get logged out over the weekend.

### 🛡️ Zero-Config Database & Auto-Backups
* **SQLite Powered:** No need to install MySQL. The app automatically creates and manages its own database file (`tasks.db`).
* **Background SMTP Backups:** Configure your Gmail App Password securely in the UI. The app will quietly email you a copy of your database once every 24 hours automatically while you work. No CRON jobs required!
* **1-Click Purge:** Safely bulk-delete tasks and files older than a specific date to save server space.

---

## 🚀 Installation & Setup

Because this app uses SQLite, installation is incredibly simple. It can run on almost any standard shared hosting environment (cPanel, XAMPP, etc.).

1. **Upload the Files:**
   Place the following files in your `public_html` or `www` directory:
   * `index.html`
   * `app.js`
   * `style.css`
   * `api.php`
   * `manifest.json`
   * `sw.js`
   * `icon-192.png` & `icon-512.png` *(Your app logos)*

2. **Configure Security (CRITICAL):**
   Open `api.php` in a text editor and change the default login credentials:
   ```php
   $USER = 'your_secure_username'; 
   $PASS = 'your_secure_password'; 
   $UPLOAD_DIR = 'your_hidden_upload_folder/';

3. Set Permissions: Ensure your web server has write permissions (CHMOD 755 or 777 depending on your host) for the root folder so PHP can generate the tasks.db      file and the uploads directory automatically on first run.

4. Force HTTPS (Required for PWA):
   To install the app to your phone's home screen, your website must be served over a secure https:// connection.

5. ⚙️ Configuration
   Disabling Shop Mode
   This will instantly hide all Shop Order forms, balance calculations, and specific shop statuses.
   If you want to use the app strictly as a Personal Task Tracker, open app.js and change the very first line to:
   '''bash
   const ENABLE_SHOP_FEATURE = false;

7. Setting Up Auto-Backups
   Log into the app and click the Backup button in the top navigation bar.
   Enter your Gmail address, a generated Google App Password (you must enable 2FA on your Google account to generate one of these), and the destination email        address.
   Click Save Configuration. The app will now silently email you a backup of your database every 24 hours.

🛠️ Tech Stack
   Frontend: HTML5, Vanilla JavaScript (app.js), Tailwind CSS (via CDN)
   Backend: PHP 7.4+ (api.php)
   Database: SQLite3 (Auto-migrating)
   Libraries: FullCalendar.js

🤝 Contributing
   Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

📄 License
   This project is open-source and available under the MIT License.
