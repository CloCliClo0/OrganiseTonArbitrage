<?php
/**
 * Envoie un rappel par email aux joueurs inscrits pour une date à venir
 * (X jours avant, X = REMINDER_DAYS_BEFORE dans .env, 3 par défaut).
 *
 * À exécuter une fois par jour, par exemple :
 *   - Cron (Linux/hébergement mutualisé) : php /chemin/vers/api/cron_reminders.php
 *   - Planificateur de tâches Windows    : idem, ou appel HTTP avec ?token=CRON_SECRET
 *
 * Un appel HTTP sans le bon token est refusé pour éviter tout abus public.
 */

require __DIR__ . '/config.php';
require __DIR__ . '/mailer.php';

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    $token = $_GET['token'] ?? '';
    $expected = $_ENV['CRON_SECRET'] ?? '';
    if (empty($expected) || !hash_equals($expected, $token)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Non autorisé']);
        exit;
    }
}

$daysBefore = (int)($_ENV['REMINDER_DAYS_BEFORE'] ?? 3);
$targetDate = (new DateTime())->modify("+{$daysBefore} days")->format('Y-m-d');

$sql = "SELECT p.id, p.date, u.email, u.nom, u.prenom
        FROM presences p
        JOIN users u ON p.user_id = u.id
        WHERE p.date = ? AND COALESCE(p.reminder_sent, 0) = 0";
$stmt = $pdo->prepare($sql);
$stmt->execute([$targetDate]);
$rows = $stmt->fetchAll();

$sent = 0;
$failed = 0;
$markSent = $pdo->prepare("UPDATE presences SET reminder_sent = 1 WHERE id = ?");

foreach ($rows as $row) {
    $ok = sendPlayerReminder($row, $row['date']);
    if ($ok) {
        $markSent->execute([$row['id']]);
        $sent++;
    } else {
        $failed++;
    }
}

$result = ['success' => true, 'date_cible' => $targetDate, 'envoyes' => $sent, 'echecs' => $failed];

if ($isCli) {
    echo json_encode($result, JSON_PRETTY_PRINT) . PHP_EOL;
} else {
    echo json_encode($result);
}
