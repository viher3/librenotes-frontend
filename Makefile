.PHONY: help

help:
	@echo "########################"
	@echo "## Available commands ##"
	@echo "########################"
	@echo ""
	@echo "· npm/dev"
	@echo "· npm/build"
	@echo ""
	@echo "· deploy/master"
	@echo ""
	@echo "########################"

npm/dev:
	npm run dev

npm/build:
	npm run build

deploy/master:
	git pull origin master && npm run build
