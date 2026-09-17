<?php
require 'config.php';

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents("php://input"), true);

// --- INSCRIPTION ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'register') {
    $required = ['email', 'password', 'nom', 'prenom'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            echo json_encode(['success' => false, 'message' => 'Champs obligatoires manquants']);
            exit;
        }
    }
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'message' => 'Email invalide']);
        exit;
    }
    if (strlen($data['password']) < 6) {
        echo json_encode(['success' => false, 'message' => 'Mot de passe trop court (6 caractères min.)']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$data['email']]);
    if ($stmt->fetch()) {
        echo json_encode(['success' => false, 'message' => 'Email déjà utilisé']);
        exit;
    }

    // Rôle attribué selon le code d'inscription saisi (staff), sinon simple joueur
    $code = trim($data['code'] ?? '');
    $role = 'joueur';
    if ($code !== '' && !empty($_ENV['CODE_ADMIN']) && hash_equals($_ENV['CODE_ADMIN'], $code)) {
        $role = 'admin';
    } elseif ($code !== '' && !empty($_ENV['CODE_COACH']) && hash_equals($_ENV['CODE_COACH'], $code)) {
        $role = 'coach';
    }

    $hash = password_hash($data['password'], PASSWORD_DEFAULT);

    $categorie = $data['cat'];

    $sql = "INSERT INTO users (email, password, nom, prenom, age, telephone, categorie, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);

    if ($stmt->execute([$data['email'], $hash, $data['nom'], $data['prenom'], $data['age'], $data['tel'], $categorie, $role])) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Erreur SQL']);
    }
    exit;
}

// --- CONNEXION ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'login') {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$data['email']]);
    $user = $stmt->fetch();

    if ($user && password_verify($data['password'], $user['password'])) {
        unset($user['password']);
        session_regenerate_id(true);
        $_SESSION['user'] = $user;
        echo json_encode(['success' => true, 'user' => $user]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Identifiants incorrects']);
    }
    exit;
}

// --- LOGOUT ---
if ($action === 'logout') {
    session_destroy();
    echo json_encode(['success' => true]);
    exit;
}

// --- ME ---
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'me') {
    if (isset($_SESSION['user'])) {
        $stmt = $pdo->prepare("SELECT id, email, nom, prenom, age, telephone, categorie, role FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user']['id']]);
        $user = $stmt->fetch();
        echo json_encode(['success' => true, 'user' => $user]);
    } else {
        echo json_encode(['success' => false, 'user' => null]);
    }
    exit;
}
?>