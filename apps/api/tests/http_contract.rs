use axum::{
    body::Body,
    extract::OriginalUri,
    http::{HeaderMap, Method, Request, StatusCode},
    routing::{any, get},
    Json, Router,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

#[tokio::test]
async fn health_identifies_the_rust_backend() {
    let response = reppit_api::app()
        .oneshot(
            Request::builder()
                .uri("/api/v1/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(
        body,
        json!({ "ok": true, "backend": "rust", "version": "v1" })
    );
}

#[tokio::test]
async fn search_relays_the_versioned_contract_to_the_catalog() {
    let legacy = Router::new().route(
        "/api/search",
        get(
            |OriginalUri(uri): OriginalUri, headers: HeaderMap| async move {
                Json(json!({
                    "query": uri.query(),
                    "authorization": headers
                        .get("authorization")
                        .and_then(|value| value.to_str().ok()),
                    "results": [],
                    "notIndexed": true,
                    "cached": false
                }))
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, legacy).await.unwrap() });

    let response = reppit_api::app_with_legacy(format!("http://{address}"))
        .oneshot(
            Request::builder()
                .uri("/api/v1/search?q=cinematic+video&kind=skill&limit=3")
                .header("authorization", "Bearer test-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["query"], "q=cinematic+video&kind=skill&limit=3");
    assert_eq!(body["authorization"], "Bearer test-token");
    assert_eq!(body["notIndexed"], true);
}

#[tokio::test]
async fn item_actions_relay_method_path_body_and_auth() {
    let legacy =
        Router::new().route(
            "/api/items/by-slug/{*path}",
            any(
                |method: Method,
                 OriginalUri(uri): OriginalUri,
                 headers: HeaderMap,
                 body: String| async move {
                    (
                        StatusCode::CREATED,
                        Json(json!({
                            "method": method.as_str(),
                            "path": uri.path(),
                            "authorization": headers
                                .get("authorization")
                                .and_then(|value| value.to_str().ok()),
                            "body": serde_json::from_str::<Value>(&body).unwrap()
                        })),
                    )
                },
            ),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, legacy).await.unwrap() });

    let response = reppit_api::app_with_legacy(format!("http://{address}"))
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/items/by-slug/acme/video-skill/vote")
                .header("authorization", "Bearer test-token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"direction":"up"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["method"], "POST");
    assert_eq!(body["path"], "/api/items/by-slug/acme/video-skill/vote");
    assert_eq!(body["authorization"], "Bearer test-token");
    assert_eq!(body["body"], json!({ "direction": "up" }));
}
