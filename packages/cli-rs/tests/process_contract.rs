use axum::{extract::OriginalUri, routing::get, Json, Router};
use serde_json::{json, Value};
use std::{
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn get_skills_returns_ranked_recommendations_as_json() {
    let app = Router::new().route(
        "/api/v1/search",
        get(|OriginalUri(uri): OriginalUri| async move {
            assert_eq!(uri.query(), Some("q=cinematic+video&kind=skill&limit=5"));
            Json(json!({
                "results": [{
                    "item": {
                        "id": "skill-1",
                        "kind": "skill",
                        "slug": "acme/cinematic-video",
                        "url": "https://github.com/acme/cinematic-video/tree/0123456789abcdef0123456789abcdef01234567/skills/cinematic-video",
                        "description": "Plan and edit cinematic videos",
                        "language": null,
                        "stars": 42,
                        "installs": 9,
                        "healthScore": 91,
                        "upvotes": 12,
                        "downvotes": 1,
                        "license": "MIT"
                    },
                    "score": 0.96,
                    "semantic": 0.92,
                    "why": "Matches cinematic video editing",
                    "downvoteReasons": {},
                    "compat": {}
                }],
                "notIndexed": false,
                "cached": false
            }))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let output = Command::new(env!("CARGO_BIN_EXE_reppit"))
        .args(["get", "skills", "for", "cinematic", "video", "--json"])
        .env("REPPIT_API_URL", format!("http://{address}"))
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let body: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(body["task"], "cinematic video");
    assert_eq!(body["results"][0]["item"]["slug"], "acme/cinematic-video");
    assert_eq!(body["installed"], false);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn get_skills_can_select_a_result_and_fetch_its_instructions() {
    let app = Router::new()
        .route(
            "/api/v1/search",
            get(|| async {
                Json(json!({
                    "results": [skill("acme/first"), skill("acme/second")],
                    "notIndexed": false,
                    "cached": false
                }))
            }),
        )
        .route(
            "/api/v1/items/by-slug/acme/second",
            get(|| async { Json(json!({ "readme": "Use a 24 fps timeline." })) }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let output = Command::new(env!("CARGO_BIN_EXE_reppit"))
        .args([
            "get",
            "skills",
            "cinematic",
            "video",
            "--select",
            "2",
            "--instructions",
            "--json",
        ])
        .env("REPPIT_API_URL", format!("http://{address}"))
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let body: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(body["selected"], "acme/second");
    assert_eq!(body["instructions"], "Use a 24 fps timeline.");
    assert_eq!(body["installed"], false);
}

#[cfg(unix)]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn install_top_runs_the_reviewed_skill_installer_source() {
    use std::os::unix::fs::PermissionsExt;

    let app = Router::new().route(
        "/api/v1/search",
        get(|| async {
            Json(json!({
                "results": [skill("acme/cinematic-video")],
                "notIndexed": false,
                "cached": false
            }))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let bin_dir = std::env::temp_dir().join(format!("reppit-cli-{unique}"));
    std::fs::create_dir(&bin_dir).unwrap();
    let npx = bin_dir.join("npx");
    let git = bin_dir.join("git");
    let log = bin_dir.join("install.log");
    let git_log = bin_dir.join("git.log");
    std::fs::write(
        &npx,
        "#!/bin/sh\ntest -f \"$4/SKILL.md\" || exit 91\nprintf '%s\\n' \"$@\" > \"$INSTALL_LOG\"\nprintf '%s\\n' 'installer progress that must not pollute JSON'\n",
    )
    .unwrap();
    std::fs::write(
        &git,
        r#"#!/bin/sh
printf '%s\n' "$@" >> "$GIT_LOG"
case "$1" in
  init)
    mkdir -p "$3/skills/cinematic-video"
    printf '%s\n' '---' 'name: cinematic-video' 'description: test' '---' > "$3/skills/cinematic-video/SKILL.md"
    ;;
  -C)
    if [ "$3" = "rev-parse" ]; then
      printf '%s\n' '0123456789abcdef0123456789abcdef01234567'
    fi
    ;;
esac
"#,
    )
    .unwrap();
    let mut permissions = std::fs::metadata(&npx).unwrap().permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(&npx, permissions).unwrap();
    let mut permissions = std::fs::metadata(&git).unwrap().permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(&git, permissions).unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_reppit"))
        .args([
            "get",
            "skills",
            "cinematic",
            "video",
            "--install-top",
            "--json",
        ])
        .env("REPPIT_API_URL", format!("http://{address}"))
        .env("INSTALL_LOG", &log)
        .env("GIT_LOG", &git_log)
        .env(
            "PATH",
            format!(
                "{}:{}",
                bin_dir.display(),
                std::env::var("PATH").unwrap_or_default()
            ),
        )
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let body: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(body["selected"], "acme/cinematic-video");
    assert_eq!(body["installed"], true);
    let install_args = std::fs::read_to_string(&log).unwrap();
    let install_args = install_args.lines().collect::<Vec<_>>();
    assert_eq!(&install_args[..3], &["--yes", "skills", "add"]);
    assert!(install_args[3].ends_with("/repo/skills/cinematic-video"));
    assert_eq!(install_args[4], "--yes");

    let git_args = std::fs::read_to_string(&git_log).unwrap();
    assert!(git_args
        .contains("fetch\n--quiet\n--depth\n1\norigin\n0123456789abcdef0123456789abcdef01234567"));
    assert!(git_args.contains("rev-parse\nHEAD"));
    std::fs::remove_dir_all(bin_dir).unwrap();
}

fn skill(slug: &str) -> Value {
    json!({
        "item": {
            "id": slug,
            "kind": "skill",
            "slug": slug,
            "url": format!("https://github.com/{slug}/tree/0123456789abcdef0123456789abcdef01234567/skills/cinematic-video"),
            "description": "Plan and edit cinematic videos",
            "stars": 42,
            "installs": 9,
            "healthScore": 91,
            "upvotes": 12,
            "downvotes": 1
        },
        "score": 0.96,
        "semantic": 0.92,
        "why": "Matches cinematic video editing",
        "downvoteReasons": {},
        "compat": {}
    })
}
