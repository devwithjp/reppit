use axum::{
    body::Body,
    extract::{OriginalUri, State},
    http::{header, HeaderName, Request, Response, StatusCode},
    response::IntoResponse,
    routing::{any, get},
    Json, Router,
};
use serde_json::{json, Value};

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    legacy_base_url: String,
}

pub fn app() -> Router {
    app_with_legacy(
        std::env::var("LEGACY_API_URL").unwrap_or_else(|_| "https://reppit.dev".to_owned()),
    )
}

pub fn app_with_legacy(legacy_base_url: String) -> Router {
    let state = AppState {
        client: reqwest::Client::new(),
        legacy_base_url: legacy_base_url.trim_end_matches('/').to_owned(),
    };
    Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/search", get(proxy))
        .route("/api/v1/items/by-slug/{*path}", any(proxy))
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "backend": "rust", "version": "v1" }))
}

async fn proxy(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    request: Request<Body>,
) -> Response<Body> {
    let path_and_query = uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("");
    let Some(suffix) = path_and_query.strip_prefix("/api/v1") else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let url = format!("{}/api{suffix}", state.legacy_base_url);
    let (parts, body) = request.into_parts();
    let body = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("API request body failed: {error}");
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Invalid request body" })),
            )
                .into_response();
        }
    };

    let mut outbound = state.client.request(parts.method, url).body(body);
    for name in [
        header::AUTHORIZATION,
        header::CONTENT_TYPE,
        header::USER_AGENT,
        HeaderName::from_static("x-forwarded-for"),
    ] {
        if let Some(value) = parts.headers.get(&name) {
            outbound = outbound.header(name, value);
        }
    }

    let upstream = match outbound.send().await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("catalog request failed: {error}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Search catalog is unavailable" })),
            )
                .into_response();
        }
    };
    let status = upstream.status();
    let content_type = upstream.headers().get(header::CONTENT_TYPE).cloned();
    let cache_control = upstream.headers().get(header::CACHE_CONTROL).cloned();
    let body = match upstream.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("catalog response failed: {error}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Search catalog is unavailable" })),
            )
                .into_response();
        }
    };

    let mut response = Response::builder().status(status);
    if let Some(value) = content_type {
        response = response.header(header::CONTENT_TYPE, value);
    }
    if let Some(value) = cache_control {
        response = response.header(header::CACHE_CONTROL, value);
    }
    response
        .body(Body::from(body))
        .expect("valid upstream response")
}
