use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Docker is not available: {0}")]
    DockerUnavailable(String),

    #[error("Docker error: {0}")]
    Docker(#[from] bollard::errors::Error),

    #[error("Bot not found: {0}")]
    BotNotFound(String),

    #[error("Duplicate bot name: {0}")]
    DuplicateName(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Redact potentially sensitive details from errors shown to the frontend.
        // Docker and IO errors may contain file paths, tokens, or internal state.
        let safe_msg = match self {
            AppError::DockerUnavailable(_) => "Docker is not available".to_string(),
            AppError::Docker(_) => "A Docker operation failed".to_string(),
            AppError::BotNotFound(id) => format!("Bot not found: {}", id),
            AppError::DuplicateName(name) => format!("Duplicate bot name: {}", name),
            AppError::Io(_) => "An I/O error occurred".to_string(),
            AppError::Json(_) => "A data format error occurred".to_string(),
            AppError::Validation(msg) => format!("Validation error: {}", msg),
            AppError::Other(msg) => msg.clone(),
        };
        serializer.serialize_str(&safe_msg)
    }
}
