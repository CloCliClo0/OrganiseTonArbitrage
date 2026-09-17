<?php
/**
 * Client SMTP minimaliste (sans dépendance externe / composer).
 * Configuré via les variables SMTP_* du .env (voir config.php -> $SMTP_CONFIG).
 */

class SmtpMailer {
    private $host, $port, $secure, $user, $pass, $timeout;
    private $socket;

    public function __construct(array $config, int $timeout = 15) {
        $this->host    = $config['host'];
        $this->port    = $config['port'];
        $this->secure  = strtolower($config['secure'] ?? '');
        $this->user    = $config['user'];
        $this->pass    = $config['pass'];
        $this->timeout = $timeout;
    }

    private function readResponse() {
        $data = '';
        while (($line = fgets($this->socket, 515)) !== false) {
            $data .= $line;
            // Une ligne de fin de réponse SMTP a un espace (pas un tiret) en 4e position
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    }

    private function command($cmd, $expectedCode = null) {
        fwrite($this->socket, $cmd . "\r\n");
        $response = $this->readResponse();
        if ($expectedCode !== null && strpos($response, (string)$expectedCode) !== 0) {
            throw new Exception("Réponse SMTP inattendue pour [$cmd] : $response");
        }
        return $response;
    }

    public function send($toEmail, $toName, $subject, $htmlBody, $fromEmail, $fromName) {
        $prefix = ($this->secure === 'ssl') ? 'ssl://' : '';
        $this->socket = @stream_socket_client(
            "{$prefix}{$this->host}:{$this->port}",
            $errno, $errstr, $this->timeout,
            STREAM_CLIENT_CONNECT,
            stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]])
        );
        if (!$this->socket) {
            throw new Exception("Connexion SMTP impossible: $errstr ($errno)");
        }
        stream_set_timeout($this->socket, $this->timeout);

        $this->readResponse(); // bannière serveur
        $localHost = $_SERVER['SERVER_NAME'] ?? 'localhost';
        $this->command("EHLO $localHost", 250);

        if ($this->secure === 'tls') {
            $this->command('STARTTLS', 220);
            if (!stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new Exception('Échec de la négociation TLS (STARTTLS)');
            }
            $this->command("EHLO $localHost", 250);
        }

        if (!empty($this->user)) {
            $this->command('AUTH LOGIN', 334);
            $this->command(base64_encode($this->user), 334);
            $this->command(base64_encode($this->pass), 235);
        }

        $this->command("MAIL FROM:<$fromEmail>", 250);
        $this->command("RCPT TO:<$toEmail>", 250);
        $this->command('DATA', 354);

        $safeToName = str_replace(['"', "\r", "\n"], '', $toName ?: $toEmail);
        $safeFromName = str_replace(['"', "\r", "\n"], '', $fromName);
        $safeSubject = str_replace(["\r", "\n"], '', $subject);

        $headers = [];
        $headers[] = "From: \"$safeFromName\" <$fromEmail>";
        $headers[] = "To: \"$safeToName\" <$toEmail>";
        $headers[] = "Subject: =?UTF-8?B?" . base64_encode($safeSubject) . "?=";
        $headers[] = "MIME-Version: 1.0";
        $headers[] = "Content-Type: text/html; charset=UTF-8";
        $headers[] = "Content-Transfer-Encoding: 8bit";
        $headers[] = "Date: " . date('r');

        // Échapper les lignes commençant par un point seul (fin de DATA)
        $body = preg_replace('/^\./m', '..', $htmlBody);

        $message = implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.";
        $this->command($message, 250);
        $this->command('QUIT');

        fclose($this->socket);
        return true;
    }
}

/**
 * Envoie un email via SMTP. Ne lève jamais d'exception vers l'appelant :
 * une erreur d'envoi ne doit jamais faire échouer une inscription/réservation.
 * Retourne true si l'envoi a réussi, false sinon (et log l'erreur).
 */
function sendMail(string $toEmail, string $toName, string $subject, string $htmlBody): bool {
    global $SMTP_CONFIG;

    if (empty($SMTP_CONFIG['host']) || empty($toEmail)) {
        error_log("sendMail: SMTP non configuré ou destinataire manquant, envoi ignoré ($toEmail)");
        return false;
    }

    try {
        $mailer = new SmtpMailer($SMTP_CONFIG);
        $mailer->send(
            $toEmail,
            $toName,
            $subject,
            $htmlBody,
            $SMTP_CONFIG['from_email'],
            $SMTP_CONFIG['from_name']
        );
        return true;
    } catch (Throwable $e) {
        error_log('sendMail error: ' . $e->getMessage());
        return false;
    }
}

function emailLayout(string $title, string $bodyHtml): string {
    return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">'
        . '<div style="background:#1e3a8a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">'
        . '<h1 style="margin:0;font-size:18px;">🏐 PlannifierMonArbitrage</h1>'
        . '</div>'
        . '<div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">'
        . "<h2 style=\"margin-top:0;font-size:16px;color:#111827;\">" . htmlspecialchars($title) . '</h2>'
        . $bodyHtml
        . '<p style="margin-top:24px;font-size:12px;color:#9ca3af;">Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>'
        . '</div></div>';
}

/**
 * Notifie les admins/coachs quand un joueur s'inscrit comme arbitre pour une date.
 */
function notifyStaffNewRegistration(PDO $pdo, array $player, string $date): void {
    try {
        $stmt = $pdo->prepare("SELECT email, nom, prenom FROM users WHERE role IN ('admin','coach') AND COALESCE(status,'active') = 'active'");
        $stmt->execute();
        $staff = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('notifyStaffNewRegistration: ' . $e->getMessage());
        return;
    }

    if (!$staff) return;

    $dateFmt = (new DateTime($date))->format('d/m/Y');
    $subject = "Nouvelle inscription arbitre - $dateFmt";
    $body = "<p><strong>{$player['prenom']} {$player['nom']}</strong> vient de s'inscrire comme arbitre pour le "
        . "<strong>$dateFmt</strong>.</p>"
        . "<p>Email du joueur : {$player['email']}</p>";
    $html = emailLayout('Nouvelle inscription arbitre', $body);

    foreach ($staff as $s) {
        sendMail($s['email'], trim($s['prenom'] . ' ' . $s['nom']), $subject, $html);
    }
}

/**
 * Envoie un rappel à un joueur pour une inscription à venir.
 */
function sendPlayerReminder(array $player, string $date): bool {
    $dateFmt = (new DateTime($date))->format('l d F Y');
    $subject = "Rappel : vous arbitrez le $dateFmt";
    $body = "<p>Bonjour {$player['prenom']},</p>"
        . "<p>Petit rappel : vous êtes inscrit(e) pour arbitrer le <strong>$dateFmt</strong>.</p>"
        . "<p>Merci de contacter un responsable si vous ne pouvez finalement pas être présent(e).</p>";
    $html = emailLayout('Rappel d\'inscription', $body);

    return sendMail($player['email'], trim($player['prenom'] . ' ' . $player['nom']), $subject, $html);
}
