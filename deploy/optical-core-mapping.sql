-- Submodul Manajemen Core Kabel Optik (non-breaking).
-- Tidak mengubah tabel existing. Jalankan sekali; CREATE IF NOT EXISTS aman diulang.

CREATE TABLE IF NOT EXISTS infrastructure_cable_cores (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cable_id INT NOT NULL COMMENT 'FK ke infrastructure_links.id',
  core_number INT NOT NULL,
  tube_number INT NOT NULL DEFAULT 1,
  tube_color VARCHAR(30) NULL,
  color_code VARCHAR(30) NOT NULL,
  hex_code VARCHAR(16) NULL,
  status ENUM('active','idle','damaged','reserved') NOT NULL DEFAULT 'idle',
  attenuation_db DECIMAL(5,2) NULL,
  notes TEXT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY unique_cable_core (cable_id, core_number),
  KEY idx_cores_status (status),
  CONSTRAINT fk_cores_cable FOREIGN KEY (cable_id) REFERENCES infrastructure_links(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS infrastructure_core_connections (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_core_id INT NOT NULL,
  target_core_id INT NULL,
  target_device_type VARCHAR(50) NULL,
  target_device_id INT NULL,
  target_port VARCHAR(40) NULL,
  connection_kind VARCHAR(30) NULL,
  spliced_by VARCHAR(100) NULL,
  splice_date DATE NULL,
  created_at DATETIME NULL,
  KEY idx_conn_source (source_core_id),
  KEY idx_conn_target (target_core_id),
  CONSTRAINT fk_conn_source FOREIGN KEY (source_core_id) REFERENCES infrastructure_cable_cores(id) ON DELETE CASCADE,
  CONSTRAINT fk_conn_target FOREIGN KEY (target_core_id) REFERENCES infrastructure_cable_cores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS infrastructure_subscriber_cores (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  core_id INT NOT NULL,
  subscriber_id INT NOT NULL COMMENT 'FK ke customers.id',
  odp_port_number INT NULL,
  assigned_at DATETIME NULL,
  UNIQUE KEY unique_active_core (core_id),
  KEY idx_sub_core_customer (subscriber_id),
  CONSTRAINT fk_sub_core FOREIGN KEY (core_id) REFERENCES infrastructure_cable_cores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
