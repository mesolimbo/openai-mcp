.PHONY: help test build synth diff deploy clean install

help:
	@echo "Available targets:"
	@echo "  make install    - Install dependencies"
	@echo "  make test       - Run tests"
	@echo "  make build      - Build TypeScript code"
	@echo "  make synth      - Synthesize CDK stack"
	@echo "  make diff       - Show differences between deployed stack and local"
	@echo "  make deploy     - Deploy to AWS"
	@echo "  make clean      - Clean build artifacts"

install:
	npm install

test:
	npm test

build:
	npm run build

synth:
	npx cdk synth

diff:
	npx cdk diff

deploy:
	npm run deploy

clean:
	rm -rf dist/ build/ node_modules/ cdk.out/
