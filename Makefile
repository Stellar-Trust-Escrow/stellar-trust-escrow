.PHONY: bench coverage

bench:
	cargo bench -p escrow_contract

coverage:
	cargo tarpaulin --config tarpaulin.toml --out Html --out Xml --output-dir target/tarpaulin
