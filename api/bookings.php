<?php
require 'config.php';

$action = $_GET['action'] ?? '';

// GET USERS (Pour Admin Stats)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'users') {
    if (!isset($_SESSION['user']) || $_SESSION['user']['role'] !== 'admin') {
        echo json_encode([]); exit;
    }
    $stmt = $pdo->query("SELECT id, email, nom, prenom, age, telephone, role, categorie, COALESCE(status,'active') as status FROM users ORDER BY nom ASC");
    echo json_encode($stmt->fetchAll());
    exit;
}

// GET PRESENCES (liste des présences pour admin/coach)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'presences') {
    if (!isset($_SESSION['user']) || !in_array($_SESSION['user']['role'], ['admin','coach','joueur'])) {
        // allow logged users to see their own presences; admin/coach see all
        echo json_encode([]); exit;
    }
    try {
        $sql = "SELECT p.id, p.date, p.user_id, u.nom, u.prenom, u.email FROM presences p JOIN users u ON p.user_id = u.id ORDER BY p.date ASC";
        $stmt = $pdo->query($sql);
        $rows = $stmt->fetchAll();
        echo json_encode($rows);
    } catch (\Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erreur lors de la récupération des présences', 'error' => $e->getMessage()]);
    }
    exit;
}

// GET BOOKINGS: Récupérer toutes les réservations avec les noms des utilisateurs
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $sql = "SELECT b.id, b.match_id, b.user_id, u.nom, u.prenom 
                FROM bookings b 
                JOIN users u ON b.user_id = u.id";
        $stmt = $pdo->query($sql);
        $bookings = $stmt->fetchAll();
        
        // Formater pour le frontend
        $formatted = array_map(function($b) {
            return [
                'id' => $b['id'],
                'matchId' => $b['match_id'],
                'userId' => $b['user_id'],
                'userName' => $b['prenom'] . ' ' . $b['nom']
            ];
        }, $bookings);

        echo json_encode($formatted);
    } catch (\Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erreur lors de la récupération des réservations', 'error' => $e->getMessage()]);
    }
    exit;
}

// POST: Créer une réservation
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Endpoint pour mettre à jour un utilisateur (profil)
    if ($action === 'updateUser') {
        if (!isset($_SESSION['user'])) {
            echo json_encode(['success' => false, 'message' => 'Non connecté']); exit;
        }
        $userId = (int)($data['userId'] ?? 0);
        if ($userId !== $_SESSION['user']['id'] && $_SESSION['user']['role'] !== 'admin') {
            echo json_encode(['success' => false, 'message' => 'Non autorisé']); exit;
        }

        $fields = [];
        $params = [];
        $allowed = ['email','telephone','age'];
        foreach ($allowed as $col) {
            if (isset($data[$col])) {
                $fields[] = "$col = ?";
                $params[] = $data[$col];
            }
        }
        if (empty($fields)) { echo json_encode(['success' => false, 'message' => 'Aucun champ']); exit; }

        $params[] = $userId;
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        if ($stmt->execute($params)) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erreur SQL']);
        }
        exit;
    }

    // Endpoint pour mettre à jour une présence
    if ($action === 'updatePresence') {
        if (!isset($_SESSION['user']) || !in_array($_SESSION['user']['role'], ['admin','coach'])) {
            echo json_encode(['success' => false, 'message' => 'Non autorisé']); exit;
        }
        $presenceId = (int)($data['presenceId'] ?? 0);
        $newDate = $data['date'] ?? '';
        if (!$presenceId || !$newDate) {
            echo json_encode(['success' => false, 'message' => 'Paramètres manquants']); exit;
        }
        // Check if new date has space
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM presences WHERE date = ?");
        $countStmt->execute([$newDate]);
        if ($countStmt->fetchColumn() >= 2) {
            echo json_encode(['success' => false, 'message' => 'Samedi complet']); exit;
        }
        $sql = "UPDATE presences SET date = ? WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        if ($stmt->execute([$newDate, $presenceId])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erreur SQL']);
        }
        exit;
    }

    if (!isset($_SESSION['user'])) {
        echo json_encode(['error' => 'Non connecté']); exit;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $userId = $_SESSION['user']['id'];

    // If presenceDate provided, handle presence insertion per day
    if (isset($data['presenceDate'])) {
        $date = $data['presenceDate'];
        // Count existing presences for this date
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM presences WHERE date = ?");
        $countStmt->execute([$date]);
        $current = (int)$countStmt->fetchColumn();
        if ($current >= 2) {
            echo json_encode(['success' => false, 'message' => 'Samedi complet']); exit;
        }

        // Check duplicate for same date
        $existsStmt = $pdo->prepare("SELECT COUNT(*) FROM presences WHERE date = ? AND user_id = ?");
        $existsStmt->execute([$date, $userId]);
        if ($existsStmt->fetchColumn() > 0) {
            echo json_encode(['success' => false, 'message' => 'Déjà inscrit ce samedi']); exit;
        }

        $ins = $pdo->prepare("INSERT INTO presences (date, user_id) VALUES (?, ?)");
        if ($ins->execute([$date, $userId])) {
            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erreur SQL']);
        }
        exit;
    }

    // If presenceDates array provided (multiple days)
    if (isset($data['presenceDates']) && is_array($data['presenceDates'])) {
        $results = [];
        foreach ($data['presenceDates'] as $date) {
            $date = trim($date);
            try { $dt = new DateTime($date); } catch (Exception $e) { $results[$date] = ['success'=>false,'message'=>'Date invalide']; continue; }
            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM presences WHERE date = ?");
            $countStmt->execute([$date]);
            $current = (int)$countStmt->fetchColumn();
            if ($current >= 2) { $results[$date] = ['success'=>false,'message'=>'Samedi complet']; continue; }
            $existsStmt = $pdo->prepare("SELECT COUNT(*) FROM presences WHERE date = ? AND user_id = ?");
            $existsStmt->execute([$date, $userId]);
            if ($existsStmt->fetchColumn() > 0) { $results[$date] = ['success'=>false,'message'=>'Déjà inscrit']; continue; }
            $ins = $pdo->prepare("INSERT INTO presences (date, user_id) VALUES (?, ?)");
            if ($ins->execute([$date, $userId])) { $results[$date] = ['success'=>true,'id'=>$pdo->lastInsertId()]; }
            else { $results[$date] = ['success'=>false,'message'=>'Erreur SQL']; }
        }
        // Update commentaire if provided
        if (isset($data['commentaire'])) {
            $stmt = $pdo->prepare("UPDATE users SET commentaire = ? WHERE id = ?");
            $stmt->execute([$data['commentaire'], $userId]);
        }
        echo json_encode(['success'=>true,'results'=>$results]); exit;
    }

    // Fallback: maintain legacy bookings-by-match behavior (if client still sends matchIds)
    $matchIds = [];
    if (isset($data['matchIds']) && is_array($data['matchIds'])) {
        $matchIds = $data['matchIds'];
    } elseif (isset($data['matchId'])) {
        $matchIds = [$data['matchId']];
    }
    if (!empty($matchIds)) {
        $results = [];
        $insertStmt = $pdo->prepare("INSERT INTO bookings (match_id, user_id) VALUES (?, ?)");
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM bookings WHERE match_id = ?");
        $existsStmt = $pdo->prepare("SELECT COUNT(*) FROM bookings WHERE match_id = ? AND user_id = ?");
        foreach ($matchIds as $mId) {
            $mId = (int)$mId;
            $countStmt->execute([$mId]);
            $current = (int)$countStmt->fetchColumn();
            if ($current >= 2) { $results[$mId] = ['success' => false, 'message' => 'Match complet']; continue; }
            $existsStmt->execute([$mId, $userId]);
            if ($existsStmt->fetchColumn() > 0) { $results[$mId] = ['success' => false, 'message' => 'Déjà inscrit']; continue; }
            if ($insertStmt->execute([$mId, $userId])) { $results[$mId] = ['success' => true, 'id' => $pdo->lastInsertId()]; }
            else { $results[$mId] = ['success' => false, 'message' => 'Erreur SQL']; }
        }
        echo json_encode(['success' => true, 'results' => $results]); exit;
    }

    // If no known payload
    echo json_encode(['success' => false, 'message' => 'Payload invalide']);
    exit;
}

// DELETE: Annuler une réservation
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!isset($_SESSION['user'])) exit;
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    $userId = $_SESSION['user']['id'];
    $role = $_SESSION['user']['role'];

    // If deleting a presence
    if (isset($_GET['type']) && $_GET['type'] === 'presence') {
        if ($id <= 0) { echo json_encode(['success' => false, 'message' => 'ID manquant']); exit; }
        if ($role === 'admin') {
            $stmt = $pdo->prepare("DELETE FROM presences WHERE id = ?");
            $stmt->execute([$id]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM presences WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $userId]);
        }
        echo json_encode(['success' => true]); exit;
    }

    // Otherwise delete booking
    if ($id <= 0) { echo json_encode(['success' => false, 'message' => 'ID manquant']); exit; }
    if ($role === 'admin') {
        $stmt = $pdo->prepare("DELETE FROM bookings WHERE id = ?");
        $stmt->execute([$id]);
    } else {
        $stmt = $pdo->prepare("DELETE FROM bookings WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $userId]);
    }
    echo json_encode(['success' => true]); exit;
}
?>