// Event bus — broadcasts WsEvents to all connected WebSocket subscribers.
// Uses tokio::sync::broadcast for fan-out. Each subscriber gets its own
// receiver; if a receiver falls behind (slow consumer), oldest events
// are dropped (matching the backpressure strategy in the PRD discussion).

use std::sync::Arc;
use tokio::sync::broadcast;
use crate::models::*;

pub struct EventBus {
    tx: broadcast::Sender<WsEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<WsEvent> {
        self.tx.subscribe()
    }

    pub fn emit_log(&self, service_id: String, log_type: LogType, message: String) {
        let log = LogEntry {
            id: format!("log_{}_{}", uuid::Uuid::new_v4().simple(), chrono::Utc::now().timestamp_millis()),
            service_id: service_id.clone(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            log_type,
            message,
        };
        let _ = self.tx.send(WsEvent::LogBatch {
            service_id,
            logs: vec![log],
        });
    }

    pub fn emit_log_batch(&self, service_id: String, logs: Vec<LogEntry>) {
        let _ = self.tx.send(WsEvent::LogBatch { service_id, logs });
    }

    pub fn emit_status(&self, service_id: String, status: ServiceStatus, pid: Option<u32>) {
        let _ = self.tx.send(WsEvent::StatusChange { service_id, status, pid });
    }

    pub fn emit_telemetry(&self, service_id: String, cpu: f32, memory_mb: f32) {
        let _ = self.tx.send(WsEvent::Telemetry { service_id, cpu, memory_mb });
    }

    pub fn emit_notification(&self, notification: Notification) {
        let _ = self.tx.send(WsEvent::Notification { notification });
    }
}
