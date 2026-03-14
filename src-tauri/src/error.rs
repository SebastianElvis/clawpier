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

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
