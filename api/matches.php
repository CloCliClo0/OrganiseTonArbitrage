<?php
require 'config.php';

// GET: Récupérer tous les matchs
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query("SELECT * FROM matches ORDER BY date ASC, time ASC");
    $matches = $stmt->fetchAll();
    echo json_encode($matches);
    exit;
}

// POST: Ajouter un match (Admin/Dirigeant seulement)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_GET['action'] ?? '';
    // Update match
    if ($action === 'update') {
        if (!isset($_SESSION['user']) || !in_array($_SESSION['user']['role'], ['admin', 'dirigeant'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Non autorisé']); exit;
        }
        $data = json_decode(file_get_contents("php://input"), true);
        $id = (int)($data['id'] ?? 0);
        if ($id <= 0) { echo json_encode(['success' => false, 'message' => 'ID manquant']); exit; }
        $sql = "UPDATE matches SET date = ?, time = ?, opponent = ?, location = ?, category = ? WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        if ($stmt->execute([$data['date'], $data['time'], $data['opponent'], $data['location'], $data['category'], $id])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erreur SQL']);
        }
        exit;
    }
    if (!isset($_SESSION['user']) || !in_array($_SESSION['user']['role'], ['admin', 'dirigeant'])) {
        http_response_code(403);
        echo json_encode(['error' => 'Non autorisé']);
        exit;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    
    $sql = "INSERT INTO matches (date, time, opponent, location, category) VALUES (?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    
    if ($stmt->execute([$data['date'], $data['time'], $data['opponent'], $data['location'], $data['category']])) {
        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false]);
    }
    exit;
}

// DELETE: supprimer un match (Admin only)
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!isset($_SESSION['user']) || $_SESSION['user']['role'] !== 'admin') {
        http_response_code(403); echo json_encode(['error' => 'Non autorisé']); exit;
    }
    $id = $_GET['id'] ?? 0;
    $id = (int)$id;
    if ($id <= 0) { echo json_encode(['success' => false, 'message' => 'ID manquant']); exit; }
    $stmt = $pdo->prepare("DELETE FROM matches WHERE id = ?");
    if ($stmt->execute([$id])) echo json_encode(['success' => true]); else echo json_encode(['success' => false]);
    exit;
}
?>