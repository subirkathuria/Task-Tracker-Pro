<?php
ini_set('session.gc_maxlifetime', 259200); // 72 Hours
session_set_cookie_params(259200);
session_start();

// Force the server to use Indian Standard Time for all operations
date_default_timezone_set('Asia/Kolkata');

// --- CONFIGURATION ---
$USER = 'username';       // CHANGE THIS
$PASS = 'password'; // CHANGE THIS
$DB_FILE = 'tasks.db';
$UPLOAD_DIR = 'uploads_directory/';

if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > 259200)) {
    session_unset(); session_destroy();
}
$_SESSION['last_activity'] = time();

if (isset($_GET['action']) && $_GET['action'] == 'login') {
    $data = json_decode(file_get_contents('php://input'), true);
    if ($data['username'] === $USER && $data['password'] === $PASS) {
        $_SESSION['auth'] = true; echo json_encode(['status' => 'success']);
    } else { http_response_code(401); }
    exit;
}

if (isset($_GET['action']) && $_GET['action'] == 'logout') { session_destroy(); exit; }
if (!isset($_SESSION['auth'])) { http_response_code(403); exit; }

$db = new PDO("sqlite:$DB_FILE");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$db->exec("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, custom_fields TEXT, active INTEGER DEFAULT 1)");
$db->exec("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, category_id INTEGER, status TEXT DEFAULT 'task_created', due_date DATE, description TEXT, custom_data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
$db->exec("CREATE TABLE IF NOT EXISTS task_history (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, status TEXT, comment TEXT, file_name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
$db->exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, setting_key TEXT UNIQUE, setting_value TEXT)");

$columns = $db->query("PRAGMA table_info(tasks)")->fetchAll(PDO::FETCH_ASSOC);
$cols = array_column($columns, 'name');
if (!in_array('recurrence', $cols)) $db->exec("ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT 'none'");
if (!in_array('updated_at', $cols)) $db->exec("ALTER TABLE tasks ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
if (!in_array('mini_due_date', $cols)) $db->exec("ALTER TABLE tasks ADD COLUMN mini_due_date DATE");

$columns_cat = $db->query("PRAGMA table_info(categories)")->fetchAll(PDO::FETCH_ASSOC);
$cols_cat = array_column($columns_cat, 'name');
if (!in_array('active', $cols_cat)) $db->exec("ALTER TABLE categories ADD COLUMN active INTEGER DEFAULT 1");

if (!file_exists($UPLOAD_DIR)) { mkdir($UPLOAD_DIR, 0777, true); }

function handleFileUploads($uploadDir) {
    $uploadedFiles = [];
    if (!empty($_FILES['files']['name'][0])) {
        foreach ($_FILES['files']['name'] as $key => $name) {
            if ($_FILES['files']['error'][$key] == UPLOAD_ERR_OK) {
                $safeName = time() . '_' . rand(100, 999) . '_' . preg_replace("/[^a-zA-Z0-9.-]/", "_", basename($name));
                move_uploaded_file($_FILES['files']['tmp_name'][$key], $uploadDir . $safeName);
                $uploadedFiles[] = $safeName;
            }
        }
    }
    return json_encode($uploadedFiles);
}

function setSetting($db, $key, $val) {
    $stmt = $db->prepare("SELECT id FROM settings WHERE setting_key = ?");
    $stmt->execute([$key]);
    if ($stmt->fetch()) {
        $db->prepare("UPDATE settings SET setting_value = ? WHERE setting_key = ?")->execute([$val, $key]);
    } else {
        $db->prepare("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)")->execute([$key, $val]);
    }
}

function sendGmailSMTP($to, $from, $pass, $dbFile) {
    $socket = @fsockopen('ssl://smtp.gmail.com', 465, $errno, $errstr, 10);
    if (!$socket) return "Connection Failed: $errstr";
    stream_set_timeout($socket, 10);

    function getServerResponse($socket) {
        $data = "";
        while($str = fgets($socket, 515)) {
            $data .= $str;
            if(substr($str, 3, 1) == " ") break;
        }
        return $data;
    }

    getServerResponse($socket); 
    fputs($socket, "EHLO localhost\r\n"); getServerResponse($socket); 
    fputs($socket, "AUTH LOGIN\r\n"); getServerResponse($socket); 
    fputs($socket, base64_encode($from) . "\r\n"); getServerResponse($socket); 
    fputs($socket, base64_encode($pass) . "\r\n");
    $res = getServerResponse($socket); 
    if (strpos($res, '235') === false) return "Auth Failed: Check App Password. Server says: $res";

    fputs($socket, "MAIL FROM: <$from>\r\n"); getServerResponse($socket); 
    fputs($socket, "RCPT TO: <$to>\r\n"); getServerResponse($socket); 
    fputs($socket, "DATA\r\n");
    $res = getServerResponse($socket); 
    if (strpos($res, '354') === false) return "Data Command Failed: $res";

    $boundary = md5(time());
    $content = chunk_split(base64_encode(file_get_contents($dbFile)));
    $filename = "TaskTracker_DB_Backup_" . date('Ymd_His') . ".db";

    $headers = "From: $from\r\nTo: $to\r\nSubject: TaskTracker DB Backup\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"$boundary\"\r\n\r\n";
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nAttached is your automated TaskTracker database backup.\r\n\r\n--$boundary\r\nContent-Type: application/octet-stream; name=\"$filename\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$filename\"\r\n\r\n$content\r\n--$boundary--\r\n";

    fputs($socket, $headers . $body . "\r\n.\r\n");
    $res = getServerResponse($socket);
    fputs($socket, "QUIT\r\n"); fclose($socket);

    if(strpos($res, '250') === false) return "Failed to send email: $res";
    return true;
}

$action = $_GET['action'] ?? '';

if ($action == 'check_auth') {
    echo json_encode(['status' => 'logged_in']);
    exit;
}

if ($action == 'get_data') {
    $tasks = $db->query("SELECT t.*, c.name as cat_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id ORDER BY due_date ASC")->fetchAll(PDO::FETCH_ASSOC);
    $cats = $db->query("SELECT * FROM categories")->fetchAll(PDO::FETCH_ASSOC);
    
    $settings_query = $db->query("SELECT * FROM settings")->fetchAll(PDO::FETCH_ASSOC);
    $settings = [];
    foreach ($settings_query as $row) { 
        if ($row['setting_key'] === 'backup_password' && !empty($row['setting_value'])) {
            $settings[$row['setting_key']] = '********';
        } else {
            $settings[$row['setting_key']] = $row['setting_value']; 
        }
    }
    
    echo json_encode(['tasks' => $tasks, 'categories' => $cats, 'settings' => $settings]);
    exit;
}

if ($action == 'save_settings') {
    $data = json_decode(file_get_contents('php://input'), true);
    setSetting($db, $data['key'], $data['value']);
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action == 'toggle_category') {
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $db->prepare("UPDATE categories SET active = ? WHERE id = ?");
    $stmt->execute([$data['active'], $data['id']]);
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action == 'save_backup_settings') {
    $data = json_decode(file_get_contents('php://input'), true);
    setSetting($db, 'backup_email', $data['backup_email']);
    setSetting($db, 'backup_receiver', $data['backup_receiver']);
    
    if ($data['backup_password'] !== '********' && !empty($data['backup_password'])) {
        setSetting($db, 'backup_password', $data['backup_password']);
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action == 'trigger_backup') {
    $settings_query = $db->query("SELECT * FROM settings")->fetchAll(PDO::FETCH_ASSOC);
    $s = []; foreach ($settings_query as $row) { $s[$row['setting_key']] = $row['setting_value']; }
    
    if (empty($s['backup_email']) || empty($s['backup_password']) || empty($s['backup_receiver'])) {
        echo json_encode(['status' => 'error', 'message' => 'Backup email credentials are incomplete.']); 
        exit;
    }
    
    $mailResult = sendGmailSMTP($s['backup_receiver'], $s['backup_email'], $s['backup_password'], $DB_FILE);
    
    if ($mailResult === true) {
        setSetting($db, 'last_backup_time', time());
        setSetting($db, 'last_backup_status', 'Success');
        echo json_encode(['status' => 'success']);
    } else {
        setSetting($db, 'last_backup_status', 'Error: ' . $mailResult);
        echo json_encode(['status' => 'error', 'message' => $mailResult]);
    }
    exit;
}

if ($action == 'add_task') {
    $data = json_decode($_POST['data'], true);
    $filesJson = handleFileUploads($UPLOAD_DIR);
    $status = $data['status'] ?? 'task_created';
    $now = date('Y-m-d H:i:s'); 
    
    $stmt = $db->prepare("INSERT INTO tasks (title, category_id, status, due_date, description, custom_data, recurrence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$data['title'], $data['category_id'], $status, $data['due_date'], $data['description'], json_encode($data['custom_fields']), $data['recurrence'] ?? 'none', $now, $now]);
    
    $taskId = $db->lastInsertId();
    
    $db->prepare("INSERT INTO task_history (task_id, status, comment, file_name, created_at) VALUES (?, ?, 'Initial Entry Created.', ?, ?)")->execute([$taskId, $status, $filesJson, $now]);
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action == 'get_task_details') {
    $id = $_GET['id'];
    $task = $db->prepare("SELECT t.*, c.name as cat_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = ?");
    $task->execute([$id]);
    $history = $db->prepare("SELECT * FROM task_history WHERE task_id = ? ORDER BY created_at DESC");
    $history->execute([$id]);
    echo json_encode(['task' => $task->fetch(PDO::FETCH_ASSOC), 'history' => $history->fetchAll(PDO::FETCH_ASSOC)]);
    exit;
}

if ($action == 'update_status') {
    $data = json_decode($_POST['data'], true);
    $taskId = $data['task_id'];
    $newStatus = $data['status'];
    $comment = $data['comment'];
    $miniDueDate = !empty($data['mini_due_date']) ? $data['mini_due_date'] : null;
    $filesJson = handleFileUploads($UPLOAD_DIR);
    $now = date('Y-m-d H:i:s'); 
    
    $oldStmt = $db->prepare("SELECT status FROM tasks WHERE id = ?");
    $oldStmt->execute([$taskId]);
    $oldTaskData = $oldStmt->fetch(PDO::FETCH_ASSOC);
    $oldStatus = $oldTaskData['status'];
    
    $db->prepare("UPDATE tasks SET status = ?, mini_due_date = ?, updated_at = ? WHERE id = ?")->execute([$newStatus, $miniDueDate, $now, $taskId]);
    $db->prepare("INSERT INTO task_history (task_id, status, comment, file_name, created_at) VALUES (?, ?, ?, ?, ?)")->execute([$taskId, $newStatus, $comment, $filesJson, $now]);

    // NEW LOGIC: Recognize multiple types of "Closed" statuses
    $closed_states = ['closed', 'closed_tasks', 'completed_orders'];

    if (in_array($newStatus, $closed_states) && !in_array($oldStatus, $closed_states)) {
        $stmt = $db->prepare("SELECT * FROM tasks WHERE id = ?");
        $stmt->execute([$taskId]);
        $t = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $isShopOrder = (strpos($t['custom_data'], '"task_type":"shop_order"') !== false);
        
        if (!$isShopOrder && $t['recurrence'] && $t['recurrence'] !== 'none') {
            $currentDue = !empty($t['due_date']) ? $t['due_date'] : date('Y-m-d');
            $nextDue = date('Y-m-d', strtotime($currentDue . " +1 " . $t['recurrence']));
            
            $newStmt = $db->prepare("INSERT INTO tasks (title, category_id, due_date, description, custom_data, recurrence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $newStmt->execute([$t['title'], $t['category_id'], $nextDue, $t['description'], $t['custom_data'], $t['recurrence'], $now, $now]);
            $newTaskId = $db->lastInsertId();
            
            $db->prepare("INSERT INTO task_history (task_id, status, comment, file_name, created_at) VALUES (?, ?, 'Recurring task auto-generated.', '[]', ?)")->execute([$newTaskId, 'task_created', $now]);
        }
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action == 'delete_task' || $action == 'purge') {
    if ($action == 'delete_task') {
        $data = json_decode(file_get_contents('php://input'), true);
        if ($data['password'] !== $PASS) { http_response_code(401); echo json_encode(['error' => 'Invalid password']); exit; }
        $stmt = $db->prepare("SELECT file_name FROM task_history WHERE task_id = ?");
        $stmt->execute([$data['id']]);
    } else {
        $date = $_GET['date']; if (!$date) exit;
        $stmt = $db->prepare("SELECT file_name FROM task_history WHERE created_at < ?");
        $stmt->execute([$date]);
    }
    
    $files = $stmt->fetchAll(PDO::FETCH_COLUMN);
    foreach ($files as $fileRecord) {
        if (empty($fileRecord) || $fileRecord === '[]') continue;
        $decoded = json_decode($fileRecord, true);
        if (is_array($decoded)) {
            foreach ($decoded as $f) { if (file_exists($UPLOAD_DIR . $f)) unlink($UPLOAD_DIR . $f); }
        } else {
            if (file_exists($UPLOAD_DIR . $fileRecord)) unlink($UPLOAD_DIR . $fileRecord);
        }
    }
    
    if ($action == 'delete_task') {
        $db->prepare("DELETE FROM task_history WHERE task_id = ?")->execute([$data['id']]);
        $db->prepare("DELETE FROM tasks WHERE id = ?")->execute([$data['id']]);
        echo json_encode(['status' => 'success']);
    } else {
        $db->prepare("DELETE FROM task_history WHERE created_at < ?")->execute([$date]);
        $db->prepare("DELETE FROM tasks WHERE created_at < ?")->execute([$date]);
        echo json_encode(['status' => 'success', 'deleted' => count($files)]);
    }
    exit;
}

if ($action == 'add_category') {
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $db->prepare("INSERT INTO categories (name, custom_fields) VALUES (?, ?)");
    $stmt->execute([$data['name'], json_encode($data['fields'])]);
    echo json_encode(['id' => $db->lastInsertId()]);
    exit;
}

if ($action == 'backup') {
    if (file_exists($DB_FILE)) {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="backup_' . date('Ymd') . '.db"');
        readfile($DB_FILE); 
        exit;
    }
}
?>