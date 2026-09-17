<?php
// Fonction simple pour parser le fichier .env
function loadEnv($path) {
    if (!file_exists($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue; // Ignorer lignes vides / commentaires
        if (strpos($line, '=') === false) continue;
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        // Retirer les guillemets englobants ("valeur" ou 'valeur')
        if (strlen($value) >= 2 && (
            ($value[0] === '"' && substr($value, -1) === '"') ||
            ($value[0] === "'" && substr($value, -1) === "'")
        )) {
            $value = substr($value, 1, -1);
        }
        $_ENV[$name] = $value;
    }
}

// Charger les variables d'environnement depuis la racine (../.env)
loadEnv(__DIR__ . '/../.env');
