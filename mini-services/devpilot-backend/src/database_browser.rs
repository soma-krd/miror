// Database Browser — connect to PostgreSQL, MySQL, and SQLite databases
// running in your services. Browse tables, view schema, run SQL queries.
//
// Supports:
//   - PostgreSQL via tokio-postgres
//   - SQLite via rusqlite (already a dependency)
//   - MySQL via mysql_async (optional — added if needed)
//
// Connection strings are provided per-service via the PORT env or a
// DATABASE_URL env var. The browser auto-detects the database type from
// the URL scheme.

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use rusqlite::Connection as SqliteConn;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub db_type: String,        // "postgres", "sqlite", "mysql"
    pub database: String,
    pub tables: Vec<TableInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
    pub schema: String,         // "public" for postgres, "main" for sqlite
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub truncated: bool,
}

const MAX_ROWS: usize = 500;

/// Detect database type from a connection URL
pub fn detect_db_type(url: &str) -> String {
    if url.starts_with("postgres://") || url.starts_with("postgresql://") {
        "postgres".to_string()
    } else if url.starts_with("mysql://") {
        "mysql".to_string()
    } else if url.ends_with(".db") || url.ends_with(".sqlite") || url.ends_with(".sqlite3") {
        "sqlite".to_string()
    } else {
        "unknown".to_string()
    }
}

/// List tables and their row counts for a SQLite database
pub fn sqlite_list_tables(path: &str) -> Result<DatabaseInfo> {
    let conn = SqliteConn::open(path)?;
    let db_name = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("database")
        .to_string();

    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )?;
    let table_names: Vec<String> = stmt.query_map([], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);

    let mut tables = Vec::new();
    for name in table_names {
        let count: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM \"{}\"", name), [], |r| r.get(0)
        ).unwrap_or(0);
        tables.push(TableInfo { name, row_count: count, schema: "main".to_string() });
    }

    Ok(DatabaseInfo { db_type: "sqlite".to_string(), database: db_name, tables })
}

/// Run a SQL query against a SQLite database
pub fn sqlite_query(path: &str, sql: &str) -> Result<QueryResult> {
    let conn = SqliteConn::open(path)?;

    // For SELECT queries, return rows; for others, return affected count
    let sql_trimmed = sql.trim().to_lowercase();
    if sql_trimmed.starts_with("select") || sql_trimmed.starts_with("with") || sql_trimmed.starts_with("pragma") {
        let mut stmt = conn.prepare(sql)?;
        let col_count = stmt.column_count();
        let columns: Vec<String> = (0..col_count)
            .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
            .collect();

        let mut rows = Vec::new();
        let mut iter = stmt.query([])?;
        while let Some(row) = iter.next()? {
            if rows.len() >= MAX_ROWS { break; }
            let mut values = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val: serde_json::Value = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                    Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::json!(n),
                    Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::json!(f),
                    Ok(rusqlite::types::ValueRef::Text(t)) => {
                        serde_json::json!(String::from_utf8_lossy(t).to_string())
                    }
                    Ok(rusqlite::types::ValueRef::Blob(b)) => {
                        serde_json::json!(format!("<blob {} bytes>", b.len()))
                    }
                    Err(_) => serde_json::Value::Null,
                };
                values.push(val);
            }
            rows.push(values);
        }

        let truncated = rows.len() >= MAX_ROWS;
        let row_count = rows.len(); Ok(QueryResult { columns, rows, row_count, truncated })
    } else {
        let affected = conn.execute(sql, [])?;
        Ok(QueryResult {
            columns: vec!["affected_rows".to_string()],
            rows: vec![vec![serde_json::json!(affected)]],
            row_count: 1,
            truncated: false,
        })
    }
}

/// Get the schema (CREATE statement) for a SQLite table
pub fn sqlite_table_schema(path: &str, table: &str) -> Result<String> {
    let conn = SqliteConn::open(path)?;
    let sql: String = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table], |r| r.get(0)
    ).map_err(|e| anyhow!("table not found: {}", e))?;
    Ok(sql)
}

/// List tables for PostgreSQL (requires tokio-postgres — but to avoid adding
/// a new dependency, we shell out to `psql` if available)
pub async fn postgres_list_tables(connection_string: &str) -> Result<DatabaseInfo> {
    let output = tokio::process::Command::new("psql")
        .args([
            &connection_string,
            "-t", "-A", "-F\t",
            "-c", "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname"
        ])
        .output().await
        .map_err(|e| anyhow!("psql not available or connection failed: {}. Is PostgreSQL client installed?", e))?;

    if !output.status.success() {
        return Err(anyhow!("psql failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let db_name = connection_string.split('/').last().unwrap_or("postgres").to_string();

    let mut tables = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            tables.push(TableInfo {
                name: parts[1].to_string(),
                row_count: parts[2].parse().unwrap_or(0),
                schema: parts[0].to_string(),
            });
        }
    }

    Ok(DatabaseInfo { db_type: "postgres".to_string(), database: db_name, tables })
}

/// Run a SQL query against PostgreSQL via psql
pub async fn postgres_query(connection_string: &str, sql: &str) -> Result<QueryResult> {
    // Use psql with JSON output for reliable parsing
    let wrapped = format!("SELECT row_to_json(t) FROM ({}) t LIMIT {}", sql, MAX_ROWS);
    let output = tokio::process::Command::new("psql")
        .args([&connection_string, "-t", "-A", "-c", &wrapped])
        .output().await
        .map_err(|e| anyhow!("psql failed: {}", e))?;

    if !output.status.success() {
        return Err(anyhow!("psql query failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();
    let mut columns: Vec<String> = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() { continue; }
        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(obj) = json_val.as_object() {
                if columns.is_empty() {
                    columns = obj.keys().cloned().collect();
                }
                let row: Vec<serde_json::Value> = columns.iter()
                    .map(|c| obj.get(c).cloned().unwrap_or(serde_json::Value::Null))
                    .collect();
                rows.push(row);
            }
        }
    }

    let truncated = rows.len() >= MAX_ROWS;
    let row_count = rows.len(); Ok(QueryResult { columns, rows, row_count, truncated })
}

// --- MySQL support via mysql CLI ------------------------------------------

pub async fn mysql_list_tables(connection_string: &str) -> Result<DatabaseInfo> {
    // Parse mysql://user:pass@host:port/db
    let db_name = connection_string.split('/').last().unwrap_or("mysql").to_string();

    let output = tokio::process::Command::new("mysql")
        .args([
            &connection_string,
            "-t", "-A", "-B", "-e",
            "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
        ])
        .output().await
        .map_err(|e| anyhow!("mysql client not available: {}. Is MySQL client installed?", e))?;

    if !output.status.success() {
        return Err(anyhow!("mysql failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut tables = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            let count: i64 = parts[1].parse().unwrap_or(0);
            tables.push(TableInfo {
                name: parts[0].to_string(),
                row_count: count,
                schema: "public".to_string(),
            });
        }
    }

    Ok(DatabaseInfo { db_type: "mysql".to_string(), database: db_name, tables })
}

pub async fn mysql_query(connection_string: &str, sql: &str) -> Result<QueryResult> {
    // Use mysql with batch mode and tab-separated output
    let output = tokio::process::Command::new("mysql")
        .args([&connection_string, "-B", "-e", sql])
        .output().await
        .map_err(|e| anyhow!("mysql failed: {}", e))?;

    if !output.status.success() {
        return Err(anyhow!("mysql query failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();
    let mut columns: Vec<String> = Vec::new();
    let mut rows: Vec<Vec<serde_json::Value>> = Vec::new();

    // First line is the header (column names)
    if let Some(header) = lines.next() {
        columns = header.split('\t').map(|s| s.to_string()).collect();
    }

    for line in lines {
        if rows.len() >= MAX_ROWS { break; }
        let values: Vec<serde_json::Value> = line.split('\t')
            .map(|v| serde_json::json!(v))
            .collect();
        rows.push(values);
    }

    let truncated = rows.len() >= MAX_ROWS;
    let row_count = rows.len();
    Ok(QueryResult { columns, rows, row_count, truncated })
}

// --- Redis support via redis-cli ------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: String,      // string, list, hash, set, zset, stream
    pub size: i64,             // length for lists/hashes/sets, byte size for strings
    pub ttl: i64,              // -1 = no expiry, -2 = key doesn't exist
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisScanResult {
    pub keys: Vec<RedisKeyInfo>,
    pub total_scanned: usize,
    pub cursor: String,
}

pub async fn redis_scan(connection_string: &str, pattern: &str, count: usize) -> Result<RedisScanResult> {
    // Use redis-cli SCAN with MATCH pattern
    let count_str = count.to_string();
    let output = tokio::process::Command::new("redis-cli")
        .args([
            "-u", connection_string,
            "--scan", "--pattern", pattern,
            "--count", &count_str,
        ])
        .output().await
        .map_err(|e| anyhow!("redis-cli not available: {}. Is Redis client installed?", e))?;

    if !output.status.success() {
        return Err(anyhow!("redis-cli failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut keys = Vec::new();
    for line in stdout.lines() {
        if line.is_empty() { continue; }
        let key = line.to_string();
        // Get type and TTL for each key
        let key_type = redis_key_type(connection_string, &key).await.unwrap_or_else(|_| "unknown".to_string());
        let ttl = redis_key_ttl(connection_string, &key).await.unwrap_or(-1);
        let size = redis_key_size(connection_string, &key, &key_type).await.unwrap_or(0);
        keys.push(RedisKeyInfo { key, key_type, size, ttl });
    }

    Ok(RedisScanResult {
        total_scanned: keys.len(),
        cursor: "0".to_string(),
        keys,
    })
}

async fn redis_key_type(conn: &str, key: &str) -> Result<String> {
    let output = tokio::process::Command::new("redis-cli")
        .args(["-u", conn, "TYPE", key])
        .output().await?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn redis_key_ttl(conn: &str, key: &str) -> Result<i64> {
    let output = tokio::process::Command::new("redis-cli")
        .args(["-u", conn, "TTL", key])
        .output().await?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().parse().unwrap_or(-1))
}

async fn redis_key_size(conn: &str, key: &str, key_type: &str) -> Result<i64> {
    let cmd = match key_type {
        "string" => vec!["STRLEN", key],
        "list" => vec!["LLEN", key],
        "hash" => vec!["HLEN", key],
        "set" => vec!["SCARD", key],
        "zset" => vec!["ZCARD", key],
        "stream" => vec!["XLEN", key],
        _ => return Ok(0),
    };
    let output = tokio::process::Command::new("redis-cli")
        .args(["-u", conn])
        .args(&cmd)
        .output().await?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().parse().unwrap_or(0))
}

pub async fn redis_get_key(connection_string: &str, key: &str) -> Result<serde_json::Value> {
    // First get the type, then use the appropriate command
    let key_type = redis_key_type(connection_string, key).await?;

    let (cmd, args): (&str, Vec<&str>) = match key_type.as_str() {
        "string" => ("GET", vec![key]),
        "list" => ("LRANGE", vec![key, "0", "-1"]),
        "hash" => ("HGETALL", vec![key]),
        "set" => ("SMEMBERS", vec![key]),
        "zset" => ("ZRANGE", vec![key, "0", "-1", "WITHSCORES"]),
        _ => return Ok(serde_json::json!({
            "type": key_type,
            "value": "<unsupported type>"
        })),
    };

    let mut full_args = vec!["-u", connection_string, cmd];
    full_args.extend(args);
    let output = tokio::process::Command::new("redis-cli")
        .args(&full_args)
        .output().await?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let lines: Vec<&str> = stdout.lines().collect();

    let value = match key_type.as_str() {
        "string" => serde_json::json!(stdout.trim()),
        "list" | "set" => serde_json::json!(lines),
        "hash" => {
            let mut map = serde_json::Map::new();
            let mut i = 0;
            while i + 1 < lines.len() {
                map.insert(lines[i].to_string(), serde_json::json!(lines[i + 1]));
                i += 2;
            }
            serde_json::Value::Object(map)
        }
        "zset" => {
            let mut arr = Vec::new();
            let mut i = 0;
            while i + 1 < lines.len() {
                arr.push(serde_json::json!({"member": lines[i], "score": lines[i + 1]}));
                i += 2;
            }
            serde_json::Value::Array(arr)
        }
        _ => serde_json::json!(stdout),
    };

    Ok(serde_json::json!({
        "key": key,
        "type": key_type,
        "value": value
    }))
}

pub async fn redis_set_key(connection_string: &str, key: &str, value: &str) -> Result<()> {
    let output = tokio::process::Command::new("redis-cli")
        .args(["-u", connection_string, "SET", key, value])
        .output().await?;
    if !output.status.success() {
        return Err(anyhow!("redis SET failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

pub async fn redis_delete_key(connection_string: &str, key: &str) -> Result<()> {
    let output = tokio::process::Command::new("redis-cli")
        .args(["-u", connection_string, "DEL", key])
        .output().await?;
    if !output.status.success() {
        return Err(anyhow!("redis DEL failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

pub async fn redis_execute(connection_string: &str, command: &str) -> Result<String> {
    // Execute an arbitrary redis-cli command
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err(anyhow!("empty command"));
    }
    let mut args = vec!["-u", connection_string];
    args.extend(parts);
    let output = tokio::process::Command::new("redis-cli")
        .args(&args)
        .output().await?;
    if !output.status.success() {
        return Err(anyhow!("redis command failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
