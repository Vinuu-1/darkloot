CREATE TABLE IF NOT EXISTS wallpapers (
  slug VARCHAR(64) NOT NULL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  game VARCHAR(160) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description TEXT NULL,
  keywords TEXT NOT NULL,
  tags_json TEXT NULL,
  image_path VARCHAR(512) NOT NULL,
  file_name VARCHAR(180) NOT NULL,
  width INT UNSIGNED NOT NULL DEFAULT 0,
  height INT UNSIGNED NOT NULL DEFAULT 0,
  aspect_ratio VARCHAR(24) NOT NULL DEFAULT '16:9',
  status ENUM('pending','draft','published','deleted') NOT NULL DEFAULT 'draft',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX wallpapers_active_created (is_active, created_at),
  INDEX wallpapers_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(90) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket VARCHAR(64) NOT NULL PRIMARY KEY,
  window_started_at BIGINT UNSIGNED NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX auth_rate_limits_window_started (window_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_users (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  google_sub VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  picture_url VARCHAR(700) NULL,
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  first_login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX site_users_activity (status, last_activity_at),
  INDEX site_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallpaper_favorites (
  user_id CHAR(36) NOT NULL,
  wallpaper_slug VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, wallpaper_slug),
  INDEX favorites_wallpaper (wallpaper_slug),
  CONSTRAINT favorites_user_fk FOREIGN KEY (user_id) REFERENCES site_users(user_id) ON DELETE CASCADE,
  CONSTRAINT favorites_wallpaper_fk FOREIGN KEY (wallpaper_slug) REFERENCES wallpapers(slug) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_events (
  event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('view','download') NOT NULL,
  wallpaper_slug VARCHAR(64) NOT NULL,
  user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX events_type_date (event_type, created_at),
  INDEX events_user_date (user_id, created_at),
  INDEX events_wallpaper_date (wallpaper_slug, created_at),
  CONSTRAINT events_wallpaper_fk FOREIGN KEY (wallpaper_slug) REFERENCES wallpapers(slug) ON DELETE CASCADE,
  CONSTRAINT events_user_fk FOREIGN KEY (user_id) REFERENCES site_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS google_login_nonces (
  nonce_hash CHAR(64) NOT NULL PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX google_nonce_expiry (expires_at, consumed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
