<?php
require __DIR__ . '/env.php';

date_default_timezone_set('Europe/Paris');

$appEnv = $_ENV['APP_ENV'] ?? 'production';
if ($appEnv === 'development') {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
}

// Récupération des variables (avec valeurs par défaut au cas où)
$host = $_ENV['DB_HOST'] ?? 'localhost';
$db   = $_ENV['DB_NAME'] ?? '';
$user = $_ENV['DB_USER'] ?? '';
$pass = $_ENV['DB_PASS'] ?? '';

// Configuration SMTP centralisée, utilisée par api/mailer.php
$SMTP_CONFIG = [
    'host'       => $_ENV['SMTP_HOST'] ?? '',
    'port'       => (int)($_ENV['SMTP_PORT'] ?? 587),
    'secure'     => $_ENV['SMTP_SECURE'] ?? 'tls', // 'tls', 'ssl' ou ''
    'user'       => $_ENV['SMTP_USER'] ?? '',
    'pass'       => $_ENV['SMTP_PASS'] ?? '',
    'from_email' => $_ENV['SMTP_FROM_EMAIL'] ?? ($_ENV['SMTP_USER'] ?? 'no-reply@example.com'),
    'from_name'  => $_ENV['SMTP_FROM_NAME'] ?? 'PlannifierMonArbitrage',
];

$charset = 'utf8mb4';
$dsn = "mysql:host=$host;dbname=$db;charset=$charset";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

// Headers CORS
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur de connexion BDD']);
    exit();
}

// Cookies de session durcis (à définir avant session_start)
// Forme "legacy" (5 arguments positionnels) volontairement utilisée pour rester
// compatible avec toutes les versions de PHP, y compris < 7.3 (hébergement mutualisé).
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params(0, '/; samesite=Lax', '', $isHttps, true);

session_start();
?>
