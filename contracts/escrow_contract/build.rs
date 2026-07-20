use std::path::Path;

fn main() {
    // Tell Cargo to re-run this script when spec.json changes.
    println!("cargo:rerun-if-changed=spec.json");

    let spec_path = Path::new("spec.json");
    if !spec_path.exists() {
        panic!(
            "spec.json is missing — run `node sdk/scripts/generate.js --spec-only` to regenerate"
        );
    }

    // Validate the spec is valid JSON.
    let content = std::fs::read_to_string(spec_path).expect("failed to read spec.json");
    serde_json::from_str::<serde_json::Value>(&content).expect("spec.json is not valid JSON");
}
