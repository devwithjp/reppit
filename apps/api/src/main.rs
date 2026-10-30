use std::net::Ipv4Addr;

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3000);
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, port))
        .await
        .expect("bind API listener");
    println!("reppit API listening on {port}");
    axum::serve(listener, reppit_api::app())
        .await
        .expect("serve API");
}
