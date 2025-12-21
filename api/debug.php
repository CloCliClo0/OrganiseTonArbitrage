<?php
require 'config.php';

// Endpoint de debug - à supprimer après diagnostic
header('Content-Type: application/json; charset=utf-8');

session_start();

$out = ['ok' => true, 'env' => [], 'session' => null, 'counts' => []];

// Vérifier clés .env présentes (sans afficher les valeurs)
$keys = ['DB_HOST','DB_NAME','DB_USER','DB_PASS','SUPER_ADMIN_EMAIL','CODE_ADMIN','CODE_DIRIGEANT','CODE_JOUEUR'];
foreach($keys as $k) {
    $out['env'][$k] = isset($_ENV[$k]);
}

$out['session'] = isset($_SESSION['user']) ? ['id' => $_SESSION['user']['id'], 'email' => $_SESSION['user']['email'] ?? null, 'role' => $_SESSION['user']['role'] ?? null] : null;

try {
    $stmt = $pdo->query('SELECT COUNT(*) FROM users');
    $out['counts']['users'] = (int)$stmt->fetchColumn();
    $stmt = $pdo->query('SELECT COUNT(*) FROM matches');
    $out['counts']['matches'] = (int)$stmt->fetchColumn();
    $stmt = $pdo->query('SELECT COUNT(*) FROM bookings');
    $out['counts']['bookings'] = (int)$stmt->fetchColumn();
} catch (Exception $e) {
    $out['ok'] = false;
    $out['error'] = $e->getMessage();
}

echo json_encode($out, JSON_PRETTY_PRINT);
