-- =====================================================================
-- PlannifierMonArbitrage / OrganiseTonArbitrage
-- Schéma complet de la base de données
-- Moteur : MySQL 5.7+ / MariaDB 10.2+
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Table : users
-- Comptes utilisateurs (joueurs, coachs, admins)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email`       VARCHAR(190) NOT NULL,
    `password`    VARCHAR(255) NOT NULL,
    `nom`         VARCHAR(100) NOT NULL,
    `prenom`      VARCHAR(100) NOT NULL,
    `age`         TINYINT UNSIGNED NULL,
    `telephone`   VARCHAR(30) NULL,
    `categorie`   VARCHAR(100) NULL,
    `role`        ENUM('admin','coach','joueur') NOT NULL DEFAULT 'joueur',
    `status`      ENUM('active','inactive') NOT NULL DEFAULT 'active',
    `commentaire` TEXT NULL,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_users_email` (`email`),
    KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Table : presences
-- Inscription d'un joueur pour arbitrer un samedi/dimanche donné
-- (modèle "présence par date" utilisé par l'application actuelle)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `presences` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `date`           DATE NOT NULL,
    `user_id`        INT UNSIGNED NOT NULL,
    `reminder_sent`  TINYINT(1) NOT NULL DEFAULT 0,
    `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_presence_date_user` (`date`, `user_id`),
    KEY `idx_presences_date` (`date`),
    CONSTRAINT `fk_presences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Table : session_dates
-- Samedis (ou autres jours) ouverts à l'inscription pour l'arbitrage,
-- gérés dynamiquement par l'admin (ajout/suppression)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `session_dates` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `date`       DATE NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_session_dates_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Table : matches
-- Matchs du club (API legacy, conservée pour compatibilité)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `matches` (
    `id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `date`      DATE NOT NULL,
    `time`      TIME NOT NULL,
    `opponent`  VARCHAR(150) NOT NULL,
    `location`  ENUM('Domicile','Exterieur') NOT NULL DEFAULT 'Domicile',
    `category`  VARCHAR(100) NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_matches_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Table : bookings
-- Réservation d'arbitrage sur un match précis (API legacy)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bookings` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `match_id`   INT UNSIGNED NOT NULL,
    `user_id`    INT UNSIGNED NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_booking_match_user` (`match_id`, `user_id`),
    KEY `idx_bookings_match` (`match_id`),
    KEY `idx_bookings_user` (`user_id`),
    CONSTRAINT `fk_bookings_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_bookings_user`  FOREIGN KEY (`user_id`)  REFERENCES `users` (`id`)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Compte admin de démarrage (à adapter puis à SUPPRIMER/changer le mot
-- de passe une fois connecté). Mot de passe généré ci-dessous : "admin123"
-- Hash valable pour PASSWORD_DEFAULT (bcrypt) au moment de la rédaction.
-- Si le hash ne correspond pas à votre version de PHP, recréez un compte
-- via le formulaire d'inscription avec le code CODE_ADMIN du .env.
-- =====================================================================
-- INSERT INTO `users` (`email`, `password`, `nom`, `prenom`, `role`, `status`)
-- VALUES ('admin@example.com', '$2y$10$examplehashexamplehashexamplehashexamplehashe', 'Admin', 'Club', 'admin', 'active');
