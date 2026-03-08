<?php
session_start();
// --- CONFIGURATION ---
$USER = 'your_secure_username';       // CHANGE THIS
$PASS = 'your_secure_password'; // CHANGE THIS
$DB_FILE = 'tasks.db';
$UPLOAD_DIR = 'your_hidden_upload_folder/';

if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > 3600)) {
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

if ($_GET['action'] == 'logout') { session_destroy(); exit; }
if (!isset($_SESSION['auth'])) { http_response_code(403); exit; }

$db = new PDO("sqlite:$DB_FILE");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// --- DATABASE SETUP & AUTO-MIGRATION ---
$db->exec("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, custom_fields TEXT)");
$db->exec("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, category_id INTEGER, status TEXT DEFAULT 'open', due_date DATE, description TEXT, custom_data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
$db->exec("CREATE TABLE IF NOT EXISTS task_history (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, status TEXT, comment TEXT, file_name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

// NEW: Settings table to store cross-device preferences
$db->exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, setting_key TEXT UNIQUE, setting_value TEXT)");

$columns = $db->query("PRAGMA table_info(tasks)")->fetchAll(PDO::FETCH_ASSOC);
$cols = array_column($columns, 'name');
if (!in_array('recurrence', $cols)) $db->exec("ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT 'none'");
if (!in_array('updated_at', $cols)) $db->exec("ALTER TABLE tasks ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
if (!in_array('mini_due_date', $cols)) $db->exec("ALTER TABLE tasks ADD COLUMN mini_due_date DATE");

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

$action = $_GET['action'] ?? '';

if ($action == 'get_data') {
    $tasks = $db->query("SELECT t.*, c.name as cat_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id ORDER BY due_date ASC")->fetchAll(PDO::FETCH_ASSOC);
    $cats = $db->query("SELECT * FROM categories")->fetchAll(PDO::FETCH_ASSOC);
    
    $settings_query = $db->query("SELECT * FROM settings")->fetchAll(PDO::FETCH_ASSOC);
    $settings = [];
    foreach ($settings_query as $row) { $settings[$row['setting_key']] = $row['setting_value']; }
    
    echo json_encode(['tasks' => $tasks, 'categories' => $cats, 'settings' => $settings]);
}

if ($action == 'save_settings') {
    $data = json_decode(file_get_contents('php://input'), true);
    $key = $data['key'];
    $val = $data['value'];
    
    $stmt = $db->prepare("SELECT id FROM settings WHERE setting_key = ?");
    $stmt->execute([$key]);
    if ($stmt->fetch()) {
        $db->prepare("UPDATE settings SET setting_value = ? WHERE setting_key = ?")->execute([$val, $key]);
    } else {
        $db->prepare("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)")->execute([$key, $val]);
    }
    echo json_encode(['status' => 'success']);
}

if ($action == 'add_task') {
    $data = json_decode($_POST['data'], true);
    $filesJson = handleFileUploads($UPLOAD_DIR);
    
    $status = $data['status'] ?? 'open';
    
    $stmt = $db->prepare("INSERT INTO tasks (title, category_id, status, due_date, description, custom_data, recurrence, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
    $stmt->execute([$data['title'], $data['category_id'], $status, $data['due_date'], $data['description'], json_encode($data['custom_fields']), $data['recurrence'] ?? 'none']);
    
    $taskId = $db->lastInsertId();
    $db->prepare("INSERT INTO task_history (task_id, status, comment, file_name) VALUES (?, ?, 'Initial Entry Created.', ?)")->execute([$taskId, $status, $filesJson]);
    
    echo json_encode(['status' => 'success']);
}

if ($action == 'get_task_details') {
    $id = $_GET['id'];
    $task = $db->prepare("SELECT t.*, c.name as cat_name FROM tasks t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = ?");
    $task->execute([$id]);
    $history = $db->prepare("SELECT * FROM task_history WHERE task_id = ? ORDER BY created_at DESC");
    $history->execute([$id]);
    echo json_encode(['task' => $task->fetch(PDO::FETCH_ASSOC), 'history' => $history->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($action == 'update_status') {
    $data = json_decode($_POST['data'], true);
    $taskId = $data['task_id'];
    $newStatus = $data['status'];
    $comment = $data['comment'];
    $miniDueDate = !empty($data['mini_due_date']) ? $data['mini_due_date'] : null;
    $filesJson = handleFileUploads($UPLOAD_DIR);
    
    $oldStmt = $db->prepare("SELECT status FROM tasks WHERE id = ?");
    $oldStmt->execute([$taskId]);
    $oldTaskData = $oldStmt->fetch(PDO::FETCH_ASSOC);
    $oldStatus = $oldTaskData['status'];
    
    $db->prepare("UPDATE tasks SET status = ?, mini_due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$newStatus, $miniDueDate, $taskId]);
    $db->prepare("INSERT INTO task_history (task_id, status, comment, file_name) VALUES (?, ?, ?, ?)")->execute([$taskId, $newStatus, $comment, $filesJson]);

    if ($newStatus === 'closed' && $oldStatus !== 'closed') {
        $stmt = $db->prepare("SELECT * FROM tasks WHERE id = ?");
        $stmt->execute([$taskId]);
        $t = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($t['recurrence'] && $t['recurrence'] !== 'none') {
            $currentDue = !empty($t['due_date']) ? $t['due_date'] : date('Y-m-d');
            $nextDue = date('Y-m-d', strtotime($currentDue . " +1 " . $t['recurrence']));
            $newStmt = $db->prepare("INSERT INTO tasks (title, category_id, due_date, description, custom_data, recurrence, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
            $newStmt->execute([$t['title'], $t['category_id'], $nextDue, $t['description'], $t['custom_data'], $t['recurrence']]);
            $newTaskId = $db->lastInsertId();
            
            $startState = (strpos($t['custom_data'], '"task_type":"shop_order"') !== false) ? 'order_received' : 'open';
            $db->prepare("INSERT INTO task_history (task_id, status, comment, file_name) VALUES (?, ?, 'Recurring task auto-generated.', '[]')")->execute([$newTaskId, $startState]);
        }
    }
    echo json_encode(['status' => 'success']);
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
}

if ($action == 'add_category') {
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $db->prepare("INSERT INTO categories (name, custom_fields) VALUES (?, ?)");
    $stmt->execute([$data['name'], json_encode($data['fields'])]);
    echo json_encode(['id' => $db->lastInsertId()]);
}

if ($action == 'backup') {
    if (file_exists($DB_FILE)) {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="backup_' . date('Ymd') . '.db"');
        readfile($DB_FILE); exit;
    }
}
?>