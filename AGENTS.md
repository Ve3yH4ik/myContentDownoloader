# Project guidance

Read README.md and docs/implementation-plan.md before changing this project. The user's original requirements are in docs/requirements.uk.md.

Keep core independent from Electron. Do not add UI controls without working handlers and validation. Describe incomplete features and CDX1 compatibility honestly. No protected code/assets from the original product. Do not infer undocumented CDX1 grammar.

Work in verified stages. Run npm test, npm run build, and npm run test:ui for relevant core/desktop changes. Add behavioral tests for new parsing/execution semantics. Preserve order and intermediate trace values. Do not commit node_modules, dist, data, credentials, downloaded documents, or local test results. The user authorized committing and pushing created files and changes to this repository.
