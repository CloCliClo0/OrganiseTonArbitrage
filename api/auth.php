<?php
require 'config.php';

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents("php://input"), true);

// --- INSCRIPTION ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'register') {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$data['email']]);
    if ($stmt->fetch()) {
        echo json_encode(['success' => false, 'message' => 'Email déjà utilisé']);
        exit;
    }

    $role = 'joueur'; // Rôle par défaut

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