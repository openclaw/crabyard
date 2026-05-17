.PHONY: docs-site
docs-site:
	@node scripts/build-docs-site.mjs

.PHONY: docs-check
docs-check: docs-site
	@echo "Docs built successfully"
