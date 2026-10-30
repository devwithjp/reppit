use clap::{Args, Parser, Subcommand, ValueEnum};
use reqwest::{Method, Url};
use serde_json::{json, Map, Value};
use std::{
    error::Error,
    io,
    path::PathBuf,
    process::{Command, Output},
};

const DEFAULT_API_URL: &str = "https://api.reppit.dev";
type Result<T> = std::result::Result<T, Box<dyn Error>>;

#[derive(Parser)]
#[command(
    name = "reppit",
    version,
    about = "Community-ranked repos and agent skills"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Get {
        #[command(subcommand)]
        command: GetCommands,
    },
    /// Find repos, skills, or MCP servers for a problem.
    Find(FindArgs),
    /// Show one indexed item.
    Show {
        slug: String,
        #[arg(long)]
        json: bool,
    },
    /// Print an install command and optionally run it for a skill.
    Add {
        slug: String,
        #[arg(long, short = 'y')]
        yes: bool,
    },
    /// Vote on an indexed item.
    Vote {
        slug: String,
        direction: VoteDirection,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Report whether an item works in an agent.
    Compat {
        slug: String,
        agent: String,
        status: CompatStatus,
        #[arg(long)]
        note: Option<String>,
    },
}

#[derive(Subcommand)]
enum GetCommands {
    /// Recommend skills for a task, with optional selection or installation.
    Skills(GetSkillsArgs),
}

#[derive(Args)]
struct GetSkillsArgs {
    #[arg(required = true)]
    task: Vec<String>,
    #[arg(long, default_value_t = 5, value_parser = clap::value_parser!(u8).range(1..=10))]
    limit: u8,
    #[arg(long)]
    json: bool,
    #[arg(long)]
    instructions: bool,
    #[arg(long)]
    select: Option<String>,
    #[arg(long)]
    install: bool,
    #[arg(long, conflicts_with_all = ["select", "install"])]
    install_top: bool,
}

#[derive(Args)]
struct FindArgs {
    #[arg(required = true)]
    problem: Vec<String>,
    #[arg(long)]
    lang: Option<String>,
    #[arg(long)]
    kind: Option<ItemKind>,
    #[arg(short = 'n', long, value_parser = clap::value_parser!(u8).range(1..=10))]
    limit: Option<u8>,
    #[arg(long)]
    json: bool,
}

#[derive(Clone, Copy, ValueEnum)]
enum ItemKind {
    Repo,
    Skill,
    Mcp,
}

impl ItemKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Repo => "repo",
            Self::Skill => "skill",
            Self::Mcp => "mcp",
        }
    }
}

#[derive(Clone, Copy, ValueEnum)]
enum VoteDirection {
    Up,
    Down,
}

impl VoteDirection {
    fn as_str(self) -> &'static str {
        match self {
            Self::Up => "up",
            Self::Down => "down",
        }
    }
}

#[derive(Clone, Copy, ValueEnum)]
enum CompatStatus {
    Works,
    Broken,
}

impl CompatStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Works => "works",
            Self::Broken => "broken",
        }
    }
}

struct Client {
    base_url: String,
    api_key: Option<String>,
    http: reqwest::Client,
}

impl Client {
    fn from_env() -> Self {
        let base_url = std::env::var("REPPIT_API_URL")
            .or_else(|_| std::env::var("GITIT_API_URL"))
            .unwrap_or_else(|_| DEFAULT_API_URL.to_owned());
        let api_key = std::env::var("REPPIT_API_KEY")
            .or_else(|_| std::env::var("GITIT_API_KEY"))
            .ok();
        Self {
            base_url: base_url.trim_end_matches('/').to_owned(),
            api_key,
            http: reqwest::Client::new(),
        }
    }

    async fn request(&self, method: Method, path: &str, body: Option<Value>) -> Result<Value> {
        let mut request = self
            .http
            .request(method, format!("{}{path}", self.base_url))
            .header(
                "user-agent",
                concat!("reppit-cli/", env!("CARGO_PKG_VERSION")),
            );
        if let Some(key) = &self.api_key {
            request = request.bearer_auth(key);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await?;
        let status = response.status();
        let text = response.text().await?;
        if !status.is_success() {
            let message = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|value| value.get("error")?.as_str().map(str::to_owned))
                .unwrap_or(text);
            return Err(io::Error::other(format!("reppit API {status}: {message}")).into());
        }
        Ok(serde_json::from_str(&text)?)
    }

    async fn search(
        &self,
        query: &str,
        language: Option<&str>,
        kind: Option<&str>,
        limit: Option<u8>,
    ) -> Result<Value> {
        let mut url = Url::parse(&format!("{}/api/v1/search", self.base_url))?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("q", query);
            if let Some(language) = language {
                pairs.append_pair("language", language);
            }
            if let Some(kind) = kind {
                pairs.append_pair("kind", kind);
            }
            if let Some(limit) = limit {
                pairs.append_pair("limit", &limit.to_string());
            }
        }
        let path = match url.query() {
            Some(query) => format!("{}?{query}", url.path()),
            None => url.path().to_owned(),
        };
        self.request(Method::GET, &path, None).await
    }

    async fn item(&self, slug: &str) -> Result<Value> {
        self.request(Method::GET, &item_path(slug)?, None).await
    }

    async fn post_item(&self, slug: &str, action: &str, body: Value) -> Result<Value> {
        self.request(
            Method::POST,
            &format!("{}/{action}", item_path(slug)?),
            Some(body),
        )
        .await
    }
}

fn item_path(slug: &str) -> Result<String> {
    let segments: Vec<_> = slug.split('/').collect();
    if !(2..=12).contains(&segments.len())
        || !segments.iter().all(|segment| {
            !segment.is_empty()
                && segment.len() <= 100
                && segment
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
        })
    {
        return Err(io::Error::other("item must be owner/name[/path]").into());
    }
    Ok(format!("/api/v1/items/by-slug/{}", segments.join("/")))
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let cli = Cli::parse();
    let client = Client::from_env();
    match cli.command {
        Commands::Get {
            command: GetCommands::Skills(args),
        } => get_skills(&client, args).await?,
        Commands::Find(args) => find(&client, args).await?,
        Commands::Show { slug, json } => show(&client, &slug, json).await?,
        Commands::Add { slug, yes } => add(&client, &slug, yes).await?,
        Commands::Vote {
            slug,
            direction,
            reason,
        } => {
            client
                .post_item(
                    &slug,
                    "vote",
                    json!({ "direction": direction.as_str(), "reason": reason }),
                )
                .await?;
            println!("ok");
        }
        Commands::Compat {
            slug,
            agent,
            status,
            note,
        } => {
            client
                .post_item(
                    &slug,
                    "compat",
                    json!({ "agent": agent, "status": status.as_str(), "note": note }),
                )
                .await?;
            println!("ok");
        }
    }
    Ok(())
}

async fn get_skills(client: &Client, mut args: GetSkillsArgs) -> Result<()> {
    if args.task.first().map(String::as_str) == Some("for") {
        args.task.remove(0);
    }
    if args.task.is_empty() {
        return Err(io::Error::other("get skills needs a task").into());
    }
    if args.install && args.select.is_none() {
        return Err(io::Error::other(
            "--install needs --select <rank|slug>; use --install-top for the top recommendation",
        )
        .into());
    }
    let task = args.task.join(" ");
    let answer = client
        .search(&task, None, Some("skill"), Some(args.limit))
        .await?;
    let results = answer
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|result| item_string(result, "kind") == Some("skill"))
        .collect::<Vec<_>>();
    let selected = select_result(&results, args.select.as_deref())?;
    let installing = args.install || args.install_top;
    if (installing || args.instructions) && selected.is_none() {
        return Err(io::Error::other(
            "No matching skill in the index; nothing fetched or installed",
        )
        .into());
    }
    let instructions = if args.instructions {
        let slug = item_string(selected.unwrap(), "slug").unwrap();
        Some(
            client
                .item(slug)
                .await?
                .get("readme")
                .cloned()
                .unwrap_or(Value::Null),
        )
    } else {
        None
    };
    let mut installed = false;
    if installing {
        install_skill(selected.unwrap(), args.json)?;
        installed = true;
    }
    if args.json {
        let mut output = Map::new();
        output.insert("task".into(), Value::String(task));
        output.insert("results".into(), Value::Array(results.clone()));
        output.insert("notIndexed".into(), Value::Bool(selected.is_none()));
        if args.select.is_some() || installing || args.instructions {
            output.insert(
                "selected".into(),
                selected
                    .and_then(|value| item_string(value, "slug"))
                    .map(|value| Value::String(value.to_owned()))
                    .unwrap_or(Value::Null),
            );
        }
        if let Some(instructions) = instructions {
            output.insert("instructions".into(), instructions);
        }
        output.insert("installed".into(), Value::Bool(installed));
        println!("{}", serde_json::to_string(&Value::Object(output))?);
    } else {
        print_results(&results);
        if let Some(instructions) = instructions {
            println!(
                "{}",
                instructions
                    .as_str()
                    .unwrap_or("No skill instructions stored yet.")
            );
        }
        if installed {
            println!(
                "Installed {}",
                item_string(selected.unwrap(), "slug").unwrap()
            );
        }
    }
    Ok(())
}

fn select_result<'a>(results: &'a [Value], pick: Option<&str>) -> Result<Option<&'a Value>> {
    let selected = match pick {
        Some(pick) if pick.chars().all(|c| c.is_ascii_digit()) => pick
            .parse::<usize>()
            .ok()
            .and_then(|rank| rank.checked_sub(1))
            .and_then(|index| results.get(index)),
        Some(pick) => results
            .iter()
            .find(|result| item_string(result, "slug") == Some(pick)),
        None => results.first(),
    };
    if pick.is_some() && selected.is_none() {
        return Err(
            io::Error::other("Selected skill is not in the returned recommendations").into(),
        );
    }
    Ok(selected)
}

async fn find(client: &Client, args: FindArgs) -> Result<()> {
    let answer = client
        .search(
            &args.problem.join(" "),
            args.lang.as_deref(),
            args.kind.map(ItemKind::as_str),
            args.limit,
        )
        .await?;
    if args.json {
        println!("{}", serde_json::to_string(&answer)?);
    } else {
        let results = answer
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        print_results(&results);
        if answer.get("cached").and_then(Value::as_bool) == Some(true) {
            eprintln!("(cached)");
        }
    }
    Ok(())
}

async fn show(client: &Client, slug: &str, as_json: bool) -> Result<()> {
    let item = client.item(slug).await?;
    if as_json {
        println!("{}", serde_json::to_string(&item)?);
        return Ok(());
    }
    println!(
        "{} ({}) — {}\n{}\n{}\nvotes +{}/-{} · ★{}{}{}\ninstall: {}",
        value_string(&item, "slug").unwrap_or(slug),
        value_string(&item, "kind").unwrap_or("unknown"),
        value_string(&item, "url").unwrap_or(""),
        value_string(&item, "description").unwrap_or(""),
        trust_line(&item),
        value_number(&item, "upvotes"),
        value_number(&item, "downvotes"),
        value_number(&item, "stars"),
        fact_line("flags", flag_facts(&item, &item)),
        fact_line("agents", compat_facts(&item)),
        install_command(&item)
    );
    Ok(())
}

async fn add(client: &Client, slug: &str, yes: bool) -> Result<()> {
    let item = client.item(slug).await?;
    println!("{}", install_command(&item));
    if value_string(&item, "kind") == Some("skill") {
        if !yes {
            return Err(io::Error::other(
                "Skill not installed. Re-run with --yes after reviewing the command.",
            )
            .into());
        }
        install_skill(&json!({ "item": item }), false)?;
    }
    Ok(())
}

fn install_skill(result: &Value, machine_readable: bool) -> Result<()> {
    let source = skill_source(result.get("item").unwrap_or(result))?;
    let temp = tempfile::tempdir()?;
    let repo_dir = temp.path().join("repo");

    checked_command(
        Command::new("git").args(["init", "--quiet"]).arg(&repo_dir),
        "initialize temporary skill repository",
    )?;
    checked_command(
        Command::new("git").arg("-C").arg(&repo_dir).args([
            "remote",
            "add",
            "origin",
            &source.repo_url,
        ]),
        "set skill repository origin",
    )?;
    checked_command(
        Command::new("git").arg("-C").arg(&repo_dir).args([
            "fetch",
            "--quiet",
            "--depth",
            "1",
            "origin",
            &source.revision,
        ]),
        "fetch pinned skill revision",
    )?;
    checked_command(
        Command::new("git").arg("-C").arg(&repo_dir).args([
            "-c",
            "advice.detachedHead=false",
            "checkout",
            "--quiet",
            "--detach",
            "FETCH_HEAD",
        ]),
        "check out pinned skill revision",
    )?;
    let resolved = checked_command(
        Command::new("git")
            .arg("-C")
            .arg(&repo_dir)
            .args(["rev-parse", "HEAD"]),
        "verify pinned skill revision",
    )?;
    let resolved = String::from_utf8(resolved.stdout)?.trim().to_owned();
    if !resolved.eq_ignore_ascii_case(&source.revision) {
        return Err(io::Error::other(format!(
            "Skill revision mismatch: expected {}, received {resolved}",
            source.revision
        ))
        .into());
    }

    let repo_dir = repo_dir.canonicalize()?;
    let skill_dir = repo_dir.join(&source.subpath).canonicalize()?;
    if !skill_dir.starts_with(&repo_dir) || !skill_dir.join("SKILL.md").is_file() {
        return Err(io::Error::other("Pinned skill directory is invalid").into());
    }

    let mut installer = Command::new("npx");
    installer
        .args(["--yes", "skills", "add"])
        .arg(&skill_dir)
        .arg("--yes");
    if machine_readable {
        let output = installer.output()?;
        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let detail = format!("{stdout}\n{stderr}");
            return Err(io::Error::other(format!(
                "Skill installer exited with {}: {}",
                output.status,
                detail.trim()
            ))
            .into());
        }
    } else {
        let status = installer.status()?;
        if !status.success() {
            return Err(io::Error::other(format!("Skill installer exited with {status}")).into());
        }
    }
    Ok(())
}

struct SkillSource {
    repo_url: String,
    revision: String,
    subpath: PathBuf,
}

fn skill_source(item: &Value) -> Result<SkillSource> {
    let raw =
        value_string(item, "url").ok_or_else(|| io::Error::other("Skill has no source URL"))?;
    let url = Url::parse(raw)?;
    let parts = url
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .unwrap_or_default();
    let safe = url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && parts.len() >= 5
        && parts.get(2) == Some(&"tree")
        && parts.get(3).is_some_and(|revision| {
            revision.len() == 40 && revision.chars().all(|c| c.is_ascii_hexdigit())
        })
        && parts.iter().all(|part| {
            !part.is_empty()
                && *part != "."
                && *part != ".."
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
        });
    if !safe {
        return Err(io::Error::other("Invalid skill source").into());
    }
    let owner = parts[0];
    let repo = parts[1];
    let revision = parts[3].to_owned();
    let subpath = parts[4..].iter().collect::<PathBuf>();
    Ok(SkillSource {
        repo_url: format!("https://github.com/{owner}/{repo}.git"),
        revision,
        subpath,
    })
}

fn checked_command(command: &mut Command, action: &str) -> Result<Output> {
    let output = command.output()?;
    if output.status.success() {
        return Ok(output);
    }
    let detail = String::from_utf8_lossy(&output.stderr);
    let detail = detail.trim();
    Err(io::Error::other(if detail.is_empty() {
        format!("Could not {action}: {}", output.status)
    } else {
        format!("Could not {action}: {detail}")
    })
    .into())
}

fn install_command(item: &Value) -> String {
    let kind = value_string(item, "kind").unwrap_or("");
    let slug = value_string(item, "slug").unwrap_or("");
    let url = value_string(item, "url").unwrap_or("");
    if kind == "skill" {
        return format!("npx reppit add {slug} --yes");
    }
    if kind == "mcp" {
        return format!("# add to your MCP config: see {url}");
    }
    if value_string(item, "installKind") == Some("app") {
        return format!("# an application, not a library: install it from {url}#readme");
    }
    match (
        value_string(item, "packageEcosystem"),
        value_string(item, "installPackage"),
    ) {
        (Some("npm"), Some(name)) => format!("npm install {name}"),
        (Some("PyPI"), Some(name)) => format!("pip install {name}"),
        (Some("crates.io"), Some(name)) => format!("cargo add {name}"),
        (Some("Go"), Some(name)) => format!("go get {name}"),
        _ => format!("# see the install docs at {url}#readme"),
    }
}

fn print_results(results: &[Value]) {
    if results.is_empty() {
        println!("Not in the reppit index yet: nothing matched well enough to recommend.");
        return;
    }
    for (index, result) in results.iter().enumerate() {
        let item = result.get("item").unwrap_or(&Value::Null);
        let net = value_number(item, "upvotes") - value_number(item, "downvotes");
        println!(
            "{}. {} ({}) — {}\n   {}\n   why: {}\n   {}{}{}{}\n   votes {:+} · ★{}\n   install: {}{}",
            index + 1,
            value_string(item, "slug").unwrap_or("unknown"),
            value_string(item, "kind").unwrap_or("unknown"),
            value_string(item, "url").unwrap_or(""),
            value_string(item, "description").unwrap_or(""),
            value_string(result, "why").unwrap_or("community-ranked match"),
            trust_line(result),
            fact_line("maintenance", maintenance_facts(result)),
            fact_line("flags", flag_facts(item, result)),
            fact_line("agents", compat_facts(result)),
            net,
            value_number(item, "stars"),
            install_command(item),
            if index + 1 == results.len() { "" } else { "\n" }
        );
    }
}

fn trust_line(facts: &Value) -> String {
    let Some(trust) = facts.get("trust") else {
        return "trust not measured".to_owned();
    };
    let score = trust.get("score").and_then(Value::as_i64);
    let reason = value_string(trust, "reason");
    let measured = value_number(trust, "measured");
    let applicable = value_number(trust, "applicable");
    let score = score
        .map(|value| format!("trust {value}/100"))
        .unwrap_or_else(|| format!("trust {}", reason.unwrap_or("not measured")));
    let suffix = match reason {
        Some("too little measured") | None => String::new(),
        Some(value) => format!(" · {value}"),
    };
    format!("{score} · {measured} of {applicable} measured{suffix}")
}

fn maintenance_facts(facts: &Value) -> Vec<String> {
    facts
        .get("trust")
        .and_then(|trust| trust.get("cells"))
        .and_then(Value::as_array)
        .map(|cells| {
            cells
                .iter()
                .filter(|cell| matches!(value_string(cell, "key"), Some("push" | "release")))
                .filter(|cell| {
                    !matches!(
                        value_string(cell, "state"),
                        Some("unknown" | "not_applicable")
                    )
                })
                .filter_map(|cell| value_string(cell, "label").map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn flag_facts(item: &Value, facts: &Value) -> Vec<String> {
    let mut flags = Vec::new();
    if item.get("archived").and_then(Value::as_bool) == Some(true) {
        flags.push("archived".to_owned());
    }
    if item.get("deprecated").and_then(Value::as_bool) == Some(true) {
        flags.push("deprecated".to_owned());
    }
    let mut reasons = facts
        .get("downvoteReasons")
        .and_then(Value::as_object)
        .map(|reasons| {
            reasons
                .iter()
                .filter_map(|(reason, count)| {
                    let count = count.as_i64()?;
                    (count > 0).then_some((reason.as_str(), count))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    reasons.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    flags.extend(
        reasons
            .into_iter()
            .map(|(reason, count)| format!("{reason} {count}")),
    );
    flags
}

fn compat_facts(facts: &Value) -> Vec<String> {
    let mut agents = facts
        .get("compat")
        .and_then(Value::as_object)
        .map(|compat| {
            compat
                .iter()
                .filter_map(|(agent, counts)| {
                    let works = value_number(counts, "works");
                    let broken = value_number(counts, "broken");
                    let total = works + broken;
                    if total == 0 {
                        return None;
                    }
                    let (state, winning) = if works > broken {
                        ("works", works)
                    } else if broken > works {
                        ("breaks", broken)
                    } else {
                        ("unclear", works)
                    };
                    Some(format!("{agent} {state} {winning}/{total}"))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    agents.sort();
    agents
}

fn fact_line(label: &str, facts: Vec<String>) -> String {
    if facts.is_empty() {
        String::new()
    } else {
        format!("\n   {label}: {}", facts.join("; "))
    }
}

fn item_string<'a>(result: &'a Value, key: &str) -> Option<&'a str> {
    result.get("item").and_then(|item| value_string(item, key))
}

fn value_string<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn value_number(value: &Value, key: &str) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(0)
}
