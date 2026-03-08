# 📋 Task & Order Tracker Pro

A powerful, lightweight, and highly responsive web application built with PHP, Vanilla JavaScript, and SQLite. 

Designed for freelancers, boutique shops, and small businesses, this app bridges the gap between a simple To-Do list and a heavy Enterprise Resource Planning (ERP) system. It features a unique **Dual-Mode UI**, allowing you to seamlessly switch between creating a "General Task" and a full-fledged "Shop Order" complete with financial tracking.

## ✨ Key Features

* **Dual-Mode Data Entry:**
    * **General Tasks:** Track standard to-do items with custom categories, recurrence (daily, weekly, monthly, yearly), and due dates.
    * **Shop Orders (POS Style):** Auto-generates sequential Order IDs (e.g., `ORD-001`). Includes fields for customer details, dynamic product lists (Qty × Price = Total), and automatic balance calculation.
* **Custom Lifecycle & History Tracking:** Every task/order maintains a timestamped history log. Track orders from *Received* -> *Sent to Karigar* -> *Delivered* with mini-due dates for intermediate steps.
* **Advanced Multi-File Management:** Queue up multiple files before submitting. Files are securely uploaded, linked to specific lifecycle steps, and fully viewable/downloadable.
* **Smart Search & Filtering:** Instantly search across titles, descriptions, categories, and custom fields. The UI automatically groups tasks into Kanban-style status tabs.
* **Responsive Calendar View:** Powered by FullCalendar. Displays traditional grids on desktops and automatically switches to a clean, scrollable Agenda List on mobile devices.
* **Native-App Feel on Mobile:** Features custom-built modals with fixed headers, hidden scrollbars, and a custom in-app dialog system (replacing clunky browser `alert()` and `confirm()` prompts).
* **Cross-Device Preferences:** Tab visibility settings are saved directly to the database, ensuring your UI layout stays consistent across your phone, tablet, and PC.
* **Zero-Config Database:** Uses SQLite. No need to set up MySQL or heavy database servers. Just upload and go! Includes 1-click database backups and purging.

## 🎯 Ideal Use Cases

1.  **Boutiques & Tailors:** Perfect for tracking fabric orders, assigning jobs to *Karigars* (craftsmen), tracking delivery methods, and managing outstanding balances.
2.  **Freelancers & Agencies:** Keep track of client projects, attach invoices/briefs directly to timeline steps, and set mini-milestones (e.g., "Draft due on Thursday").
3.  **Personal Productivity:** Manage recurring yearly events (birthdays/anniversaries) and daily habits using the built-in recurrence engine.

## 🛠️ Tech Stack

* **Frontend:** HTML5, Vanilla JavaScript (`app.js`), Tailwind CSS (via CDN)
* **Backend:** PHP 7.4+ (`api.php`)
* **Database:** SQLite3 (Auto-migrating)
* **Libraries:** FullCalendar.js

## 🚀 Installation & Setup

Because this app uses SQLite, installation is incredibly simple. It can run on almost any standard shared hosting environment (cPanel, XAMPP, etc.).

1. **Clone or Download the Repository:**
   ```bash
   git clone [https://github.com/yourusername/task-order-tracker.git](https://github.com/yourusername/task-order-tracker.git)

2. Upload to your Server: Place the files in your public_html or www directory.

3. Configure Security (CRITICAL): 
   Open api.php and change the default login credentials and upload directory:
   ```bash
   $USER = 'your_secure_username';
   $PASS = 'your_secure_password';
   $UPLOAD_DIR = 'your_hidden_upload_folder/';

5. Set Permissions: Ensure the server has write permissions (CHMOD 755 or 777 depending on your host) for the root folder so PHP can create the tasks.db file and    the uploads directory automatically on first run.

🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

📄 License
This project is open-source and available under the MIT License.
