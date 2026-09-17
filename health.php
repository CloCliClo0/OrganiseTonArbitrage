<?php
/**
 * Point de contrôle santé de l'application (accessible sans session/cookie).
 * Volontairement indépendant de api/config.php : il ne doit jamais planter
 * même si le reste du backend a un problème, sinon il ne sert à rien.
 *
 * URL par défaut : /health.php
 * Pour avoir l'URL /health (sans extension), ajoutez à votre .htaccess existant :
 *   RewriteEngine On
 *   RewriteRule ^health$ health.php [L]
 */

header('Content-Type: application/json; charset=UTF-8');

$checks = [
    'php_version' => PHP_VERSION,
];

// --- Chargement du .env ---
$envOk = false;
try {
    require __DIR__ . '/api/env.php';
    $envOk = isset($_ENV['DB_HOST']);
} catch (Throwable $e) {
    $envOk = false;
}
$checks['env_loaded'] = $envOk;

// --- Connexion base de données ---
$dbOk = false;
$dbError = null;
try {
    $host = $_ENV['DB_HOST'] ?? 'localhost';
    $db   = $_ENV['DB_NAME'] ?? '';
    $user = $_ENV['DB_USER'] ?? '';
    $pass = $_ENV['DB_PASS'] ?? '';
    $dsn  = "mysql:host=$host;dbname=$db;charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 3,
    ]);
    $pdo->query('SELECT 1');
    $dbOk = true;
} catch (Throwable $e) {
    $dbError = $e->getMessage();
}
$checks['database'] = $dbOk ? 'ok' : 'error';
if (!$dbOk && ($_ENV['APP_ENV'] ?? '') === 'development') {
    $checks['database_error'] = $dbError;
}

// --- Configuration SMTP présente (sans tester la connexion réseau) ---
$checks['smtp_configured'] = !empty($_ENV['SMTP_HOST'] ?? '');

$overallOk = $envOk && $dbOk;
http_response_code($overallOk ? 200 : 503);

echo json_encode([
    'status'  => $overallOk ? 'ok' : 'degraded',
    'time'    => date('c'),
    'checks'  => $checks,
], JSON_PRETTY_PRINT);
