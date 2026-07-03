# Ward tooling — one entry point for humans, editors, and CI, kept in lockstep.
#
# Every check reads its config from a committed file, so your editor, the CLI,
# and CI agree. Day to day you want `make format`; CI wants `make check`.
#
# Single-binary, opinionated tools (CONTRIBUTING.md — "opinionated on everything"):
#   - dprint  deterministic Markdown formatting        (config: dprint.json)
#   - lychee  offline broken-link checking             (config: lychee.toml)
#   - biome   TypeScript/JS formatting + linting        (config: biome.json)
#   - tsc     strict type checking                      (config: tsconfig.json)
#   - node    the test runner (node:test, no framework) (package.json)
#
# Markdown was covered from day one; v2 wired code into the same gate — `make
# check` now fails on an unformatted file, a lint violation, a type error, or a
# failing test, for Markdown *and* code alike.

.DEFAULT_GOAL := help

BIOME := node_modules/.bin/biome

.PHONY: help install format format-check lint typecheck test walkthrough links check

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

install: ## Install the toolchain (dprint, lychee via Homebrew; npm deps + biome)
	brew install dprint lychee
	npm install

format: ## Format everything in place (Markdown + code) and apply safe fixes
	dprint fmt
	$(BIOME) check --write .

format-check: ## Check Markdown formatting without writing (CI)
	dprint check

lint: ## Check code formatting + lint + import order without writing (CI)
	$(BIOME) ci .

typecheck: ## Strict type check, no emit
	npm run --silent typecheck

test: ## Run the test suite (node:test)
	npm test --silent

walkthrough: ## Drive the intent walkthrough §0–§10 end-to-end (acceptance test)
	bash test/acceptance/walkthrough.sh

links: ## Check Markdown links offline
	lychee .

check: format-check lint typecheck test walkthrough links ## Full CI gate — no writes; covers Markdown AND code

