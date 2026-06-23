# Ward documentation tooling.
#
# Two single-binary Rust tools, installed via `make install`:
#   - dprint  deterministic markdown formatting   (config: dprint.json)
#   - lychee  offline broken-link checking         (config: lychee.toml)
#
# All rules read their config from those files, so your editor, the CLI, and
# CI stay in lockstep. Day to day you want `make format`; CI wants `make check`.

.DEFAULT_GOAL := help

.PHONY: help install format format-check links check

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

install: ## Install the toolchain (dprint, lychee) via Homebrew
	brew install dprint lychee

format: ## Format all markdown in place
	dprint fmt

format-check: ## Check formatting without writing changes
	dprint check

links: ## Check markdown links offline
	lychee .

check: format-check links ## Run all checks without modifying files (CI gate)
